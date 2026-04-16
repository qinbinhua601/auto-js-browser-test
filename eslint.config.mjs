import compat from "eslint-plugin-compat";

export default [
  {
    files: ["runtime-demo/**/*.js"],
    ...compat.configs["flat/recommended"],
  },
  {
    files: ["runtime-demo/api-polyfilled-demo.js"],
    settings: {
      polyfills: ["URL.canParse"],
    },
  },
];
