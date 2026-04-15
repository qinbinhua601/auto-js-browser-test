# ES2019 语法门禁迁移指南

## 目标

检查最终发布的 JS 产物，只要包含高于 `es2019` 的语法就失败。

## 最小配置

把下面内容合并到目标项目的 `package.json`：

```json
{
  "scripts": {
    "build": "你的真实构建命令",
    "check:syntax": "es-check es2019 \"dist/**/*.js\"",
    "ci": "npm run build && npm run check:syntax"
  },
  "devDependencies": {
    "es-check": "8.0.2"
  }
}
```

如果产物目录不是 `dist/`，改成实际目录。

## 迁移步骤

1. 安装依赖

```bash
npm install -D es-check@8.0.2
```

2. 确认构建产物目录

只检查最终发布的 JS 文件，不检查源码目录。

3. 执行验证

```bash
npm run build
npm run check:syntax
```

4. 接入 CI

```bash
npm ci
npm run build
npm run check:syntax
```

## 验收

- `npm run build` 正常
- `npm run check:syntax` 正常
- 人为引入一个 `es2020+` 语法后，检查会失败

## 常见坑

- 检查了源码，没有检查构建产物
- 线上发的是压缩文件，但只检查了未压缩文件
- 没锁定 `es-check` 版本
- 把这层检查当成 API 兼容检查

## 说明

这套方案只检查语法，不检查 `Promise`、`fetch`、`Array.from` 这类运行时兼容性。
