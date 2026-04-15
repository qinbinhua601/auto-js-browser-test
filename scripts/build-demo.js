const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
fs.mkdirSync(distDir, { recursive: true });

const modernBundle = `"use strict";

// This file intentionally includes a class static initialization block.
class BootProbe {
  static {
    this.ready = true;
  }
}

console.log(BootProbe.ready);
`;

const legacyBundle = `"use strict";

// This file stays ES5-compatible and should pass an es5 syntax gate.
var user = { profile: { nickname: "legacy-safe" } };
var nickname = user && user.profile && user.profile.nickname
  ? user.profile.nickname
  : "anonymous";

function format(value) {
  return "Hello, " + (value || nickname);
}

console.log(format());
`;

fs.writeFileSync(path.join(distDir, "modern-broken.js"), modernBundle);
fs.writeFileSync(path.join(distDir, "legacy-safe.js"), legacyBundle);

console.log("Demo build completed.");
console.log("Created dist/modern-broken.js with a class static initialization block.");
console.log("Created dist/legacy-safe.js with ES5-compatible syntax.");
