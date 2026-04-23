# compat-check

这个仓库现在只保留 iOS Simulator Safari 的 compat 检查能力。

当前实现：

- Appium 2
- XCUITest driver
- iOS Simulator Safari
- `safariConsole` 日志采集
- 不依赖页面注入

## npm scripts

只保留这四个 compat 相关命令：

```bash
npm run compat:check
npm run compat:demo-suite
npm run compat:config
npm run compat:serve-demo
```

## 关键文件

- `scripts/compat-check.js`
- `scripts/compat-demo-server.js`
- `scripts/compat-demo-server-lib.js`
- `compat-check.config.json`
- `compat-check.demo-suite.json`
- `demo-pages/manifest.json`

## 文档

- `COMPAT_CHECK_GUIDE.md`
- `COMPAT_CHECK_MIGRATION_GUIDE.md`
- `COMPAT_CHECK_ENVIRONMENT.md`
- `SAFARI_SIMULATOR_AUTOMATION_FLOW.md`
