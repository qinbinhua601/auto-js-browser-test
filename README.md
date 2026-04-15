# Low Browser Syntax Gate Demo

This project is a minimal executable example of a production-friendly syntax
gate: fail CI when final JavaScript assets contain syntax above `es2019`.

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

## Demo Run

```bash
npm install
npm run build:minified
npm run check:syntax
```

Expected result:

- `dist/legacy-safe.js` is accepted.
- `dist/modern-broken.js` and `dist/modern-broken.min.js` fail because they
  contain a `static {}` block, which is above ES2019.

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
