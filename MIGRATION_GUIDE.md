# ES2019 兼容性迁移指南

## 目标

同时覆盖两类问题：

- 最终发布产物里的高版本 JS 语法
- 源码里使用了目标浏览器不支持的运行时 API

## 最小配置

把下面内容合并到目标项目的 `package.json`：

```json
{
  "scripts": {
    "build": "你的真实构建命令",
    "check:syntax": "es-check es2019 \"dist/**/*.js\"",
    "lint:compat": "eslint src --ext .js,.jsx,.ts,.tsx",
    "ci": "npm run build && npm run check:syntax && npm run lint:compat"
  },
  "devDependencies": {
    "es-check": "8.0.2",
    "eslint-plugin-compat": "^6.0.2"
  }
}
```

如果产物目录不是 `dist/`，改成实际目录。

## browserslist

在目标项目里补上真实兼容目标，例如：

```json
{
  "browserslist": [
    "Chrome 118",
    "Safari 13",
    "iOS >= 14.4"
  ]
}
```

`es-check` 负责检查最终产物语法，`eslint-plugin-compat` 会基于这里的
`browserslist` 检查运行时 API 兼容。

## ESLint 配置

如果项目使用 flat config，可以补：

```js
import compat from "eslint-plugin-compat";

export default [
  compat.configs["flat/recommended"]
];
```

如果项目已经有 polyfill，可以在 ESLint settings 里声明，避免重复报警。

## 迁移步骤

1. 安装依赖

```bash
npm install -D es-check@8.0.2 eslint-plugin-compat
```

2. 确认构建产物目录

只检查最终发布的 JS 文件，不检查源码目录。

3. 配置 `browserslist` 和 ESLint

4. 执行验证

```bash
npm run build
npm run check:syntax
npm run lint:compat
```

5. 接入 CI

```bash
npm ci
npm run build
npm run check:syntax
npm run lint:compat
```

## 验收

- `npm run build` 正常
- `npm run check:syntax` 正常
- `npm run lint:compat` 正常
- 人为引入一个 `es2020+` 语法后，检查会失败
- 人为使用一个低版本浏览器不支持的 API 后，`lint:compat` 会报警

## 常见坑

- 检查了源码，没有检查构建产物
- 线上发的是压缩文件，但只检查了未压缩文件
- 没锁定 `es-check` 版本
- 没有配置 `browserslist`
- 把语法检查当成 API 兼容检查
- 已经有 polyfill，但没有在 `eslint-plugin-compat` 里声明

## 说明

职责划分：

- `es-check`：检查最终产物语法
- `eslint-plugin-compat`：检查源码里的运行时 API 兼容性

这套方案仍然不等于完整兼容性保障。像 `Promise`、`fetch`、`Array.from`
这类能力，如果目标浏览器缺失，仍然需要 Babel、polyfill 或真实浏览器测试补齐。
