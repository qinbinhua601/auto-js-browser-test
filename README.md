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
