# Low Browser Syntax Gate Demo

This project is a minimal executable example of a production-friendly syntax
gate: fail CI when final JavaScript assets contain syntax above `es2019`.

It also includes a minimal runtime compatibility check using
`eslint-plugin-compat`.

## Files

- `scripts/build-demo.js`: creates a fake `dist/` folder with one ES2019-safe
  file and one intentionally broken modern bundle.
- `npm run build:minified`: creates minified `.min.js` files that simulate a
  compressed publish artifact.
- `npm run check:syntax`: runs `es-check es2019` against `dist/**/*.js` and
  fails when unsupported syntax is found.

## Minimal package.json

```bash
{
  "scripts": {
    "build": "your-real-build-command",
    "check:syntax": "es-check es2019 \"dist/**/*.js\"",
    "ci": "npm run build && npm run check:syntax"
  },
  "devDependencies": {
    "es-check": "8.0.2"
  }
}
```

## Current Repo Usage

Install dependencies:

```bash
npm install
```

Run the syntax demo:

```bash
npm run build:minified
npm run check:syntax
```

Run the runtime compatibility demo:

```bash
npm run lint:compat
npm run lint:compat:polyfilled
```

Expected runtime result:

- `runtime-demo/api-compat-demo.js` reports that `ResizeObserver` is not
  supported in `Safari 13`
- `runtime-demo/api-polyfilled-demo.js` uses `URL.canParse`, but because this
  demo declares it as polyfilled, `npm run lint:compat:polyfilled` should pass

Runtime demo files:

- `runtime-demo/api-compat-demo.js`: demonstrates an API that is not supported
  by the target browsers and is not declared as polyfilled, so ESLint reports
  an error
- `runtime-demo/api-polyfilled-demo.js`: demonstrates an API that may be
  unsupported in some targets, but this repo declares it as polyfilled in
  `eslint.config.mjs`, so the compatibility lint passes

Where the polyfill declaration lives:

```js
{
  files: ["runtime-demo/api-polyfilled-demo.js"],
  settings: {
    polyfills: ["URL.canParse"]
  }
}
```

This mirrors a real project scenario where:

- one API should still block CI because it is truly unsupported
- another API is acceptable because the project already ships a matching
  polyfill

## Demo Run

```bash
npm install
npm run build:minified
npm run check:syntax
npm run lint:compat
npm run lint:compat:polyfilled
```

Expected result:

- `dist/legacy-safe.js` is accepted.
- `dist/modern-broken.js` and `dist/modern-broken.min.js` fail because they
  contain a `static {}` block, which is above ES2019.
- `runtime-demo/api-compat-demo.js` reports an API compatibility issue for
  `ResizeObserver`.
- `runtime-demo/api-polyfilled-demo.js` passes because `URL.canParse` is marked
  as polyfilled in ESLint settings.

## CI Example

```bash
npm ci
npm run ci
```

If you later connect this to a real frontend project, keep the same pattern:

1. run the actual build
2. if you minify in your pipeline, check the final minified files
3. check `dist/**/*.js`
4. fail CI immediately when a modern syntax token leaks into the bundle

## iOS Simulator Runtime Check Demo

This repo now also includes a minimal `compat-check` runner that proves the
end-to-end browser automation flow on iOS Simulator:

1. boot a simulator with `simctl`
2. open a URL in Safari
3. let the page report runtime errors back to a local HTTP endpoint
4. write `PASS / FAIL / INFRA_FAIL` results into `artifacts/compat-check`

### Run It

Make sure Xcode and Simulator work from your shell, then run:

```bash
npm run compat:check
```

Default config lives in `compat-check.config.json`.

The default demo runs two pages:

- `demo-ok`: should pass without runtime errors
- `demo-runtime-error`: intentionally throws and should fail

There is also a fuller test suite config:

```bash
npm run compat:demo-suite
```

If you want to inspect the demo pages manually in a browser, start the
standalone demo server:

```bash
npm run compat:serve-demo
```

Then open:

```bash
http://127.0.0.1:4173/demo/catalog
```

It covers:

- `ok`: baseline pass
- `warning-only`: console warning only, should still pass
- `console-error`: `console.error`, should fail
- `runtime-error`: uncaught error, should fail
- `promise-rejection`: unhandled rejection, should fail
- `mixed-errors`: multiple error sources, should fail
- `async-runtime-error`: delayed error after initial load, should fail
- `missing-base-object`: base object is undefined, should fail
- `missing-method-call`: method does not exist, should fail
- `missing-nested-property-call`: missing nested property is dereferenced, should fail
- `missing-property-read-only`: missing property is only read, should still pass
- `caught-runtime-error`: error is swallowed in try/catch, should still pass
- `ready-never`: never reports back, should become `INFRA_FAIL`

Artifacts are written to:

```bash
artifacts/compat-check/results.json
artifacts/compat-check/report.md
```

### How Runtime Collection Works

The runner starts a local HTTP server and opens a page with these query params:

- `compat_mode=1`
- `compat_run_id=...`
- `compat_report_url=http://127.0.0.1:PORT/report`

When `compat_mode=1` is present, the demo page enables a client collector that
captures:

- `window.onerror`
- `unhandledrejection`
- `console.error`

It then POSTs a structured payload back to the local server so the runner can
judge the result without scraping Safari's Web Inspector.

### Demo Test URLs

The demo pages now live as separate source files under `demo-pages/`.

While the runner or the standalone demo server is serving them, these URL paths
are available:

- `/demo/catalog`
- `/demo/ok`
- `/demo/warning-only`
- `/demo/console-error`
- `/demo/runtime-error`
- `/demo/promise-rejection`
- `/demo/mixed-errors`
- `/demo/async-runtime-error`
- `/demo/missing-base-object`
- `/demo/missing-method-call`
- `/demo/missing-nested-property-call`
- `/demo/missing-property-read-only`
- `/demo/caught-runtime-error`
- `/demo/ready-never`

`/demo/catalog` renders a clickable index with each scenario's expected result.

### Reusing It For Real Pages

To adapt this to a real project later:

1. keep the `compat-check` runner
2. add the same client collector in a test-only build or query-flagged mode
3. change `targets` from `type: "demo"` to real `url` values

That lets you validate the automation chain today on the installed simulator
runtime, then swap to older runtimes later without redesigning the tool.
