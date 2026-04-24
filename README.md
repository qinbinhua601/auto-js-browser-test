# compat-check

这个仓库现在只保留一套能力：

- Appium 2
- XCUITest driver
- iOS Simulator Safari
- `safariConsole` 日志采集
- 不依赖页面注入

## 命令

```bash
npm run compat:check
npm run compat:demo-suite
npm run compat:config
npm run compat:serve-demo
```

含义：

- `compat:check`
  跑最小 demo
- `compat:demo-suite`
  跑完整 demo 集合
- `compat:config`
  打印默认配置
- `compat:serve-demo`
  单独启动 demo 页面服务

## 当前方案

`scripts/compat-check.js` 会：

1. 选择并启动一个 iOS Simulator
2. 启动或连接 Appium server
3. 创建 Safari session
4. 打开目标 URL
5. 读取 `safariConsole`
6. 输出 `PASS / FAIL / INFRA_FAIL`
7. 保存截图、控制台日志和结构化结果

当前实现不会：

- 加 `compat_mode`
- 注入 `compat-client.js`
- 等待页面 POST `/report`

结果判定来自 Safari 控制台本身。

## 环境要求

开始前先确认：

```bash
xcode-select -p
xcrun simctl list runtimes -j
xcrun simctl list devices available -j
appium driver list --installed
```

预期：

- `simctl` 能返回 JSON
- 有可用 iPhone Simulator
- Appium 已安装 `xcuitest` driver

如果缺少 driver：

```bash
appium driver install xcuitest
```

如果你连的是外部 Appium server，要装在那一份 Appium 环境里。

## 关键文件

- `scripts/compat-check.js`
- `scripts/compat-demo-server.js`
- `scripts/compat-demo-server-lib.js`
- `compat-check.config.json`
- `compat-check.demo-suite.json`
- `demo-pages/manifest.json`

## 配置

默认配置文件是 `compat-check.config.json`，完整 demo 配置是
`compat-check.demo-suite.json`。

典型结构：

```json
{
  "simulatorName": "iPhone 17 Pro",
  "runtimePrefix": "iOS",
  "loadTimeoutMs": 20000,
  "settleTimeMs": 3000,
  "artifactDir": "artifacts/compat-check",
  "screenshotOnPass": true,
  "appium": {
    "serverUrl": "http://127.0.0.1:4723",
    "autoStart": true,
    "showSafariConsoleLog": true,
    "failOnNetworkErrors": false,
    "webviewConnectTimeoutMs": 10000,
    "wdaLaunchTimeoutMs": 120000
  },
  "targets": [
    {
      "name": "demo-ok",
      "type": "demo",
      "page": "ok"
    }
  ]
}
```

重点字段：

- `simulatorName`
  首选 simulator 名称。找不到精确匹配时，会自动退到同一 `runtimePrefix`
  下可用的 iPhone Simulator；如果没有 iPhone，会退到任意可用 simulator。
- `runtimePrefix`
- `loadTimeoutMs`
- `settleTimeMs`
- `artifactDir`
- `screenshotOnPass`
- `appium.serverUrl`
- `appium.autoStart`
- `appium.failOnNetworkErrors`

## targets

支持两种写法。

内置 demo：

```json
{
  "name": "demo-runtime-error",
  "type": "demo",
  "page": "runtime-error"
}
```

真实页面：

```json
{
  "name": "checkout-page",
  "url": "https://example.com/checkout"
}
```

真实页面不需要额外加测试态 query 参数。

## Demo 页面

当前 demo 包括：

- `ok`
- `warning-only`
- `console-error`
- `runtime-error`
- `promise-rejection`
- `mixed-errors`
- `async-runtime-error`
- `missing-base-object`
- `missing-method-call`
- `missing-nested-property-call`
- `missing-nested-property-log`
- `missing-property-read-only`
- `caught-runtime-error`

手动查看：

```bash
npm run compat:serve-demo
```

然后打开：

```bash
http://127.0.0.1:4173/demo/catalog
```

## 结果产物

默认最小运行输出到：

```bash
artifacts/compat-check/
```

完整 demo suite 输出到：

```bash
artifacts/compat-check-demo-suite/
```

常见文件：

- `results.json`
- `report.md`
- `*.png`
- `*-safari-console.json`

状态含义：

- `PASS`
- `FAIL`
- `INFRA_FAIL`

默认不把 `source=network` 的日志项算成失败，所以像 `favicon.ico` 404
不会误判。

## 维护和迁移

后续如果继续改 compat-check，按这几个原则：

- 不要重新引入页面注入
- 新增 demo 时同步改 `demo-pages/<slug>.html`、`demo-pages/manifest.json`、`compat-check.demo-suite.json`
- 调整误判时优先改 `scripts/compat-check.js` 里的日志分类逻辑
- 处理稳定性问题时优先排查 Appium / Simulator 环境

旧方案里这些概念已经废弃，不要再恢复：

- `compat_mode=1`
- `compat_report_url`
- 页面 POST `/report`
- 注入 `compat-client.js`
- 单独维护平行后端

## 常见问题

### `simctl` 失败

如果 `xcrun simctl list devices available -j` 失败，先修 Xcode / Simulator 环境。

### 缺少 `XCUITest` driver

如果报 `Could not find a driver for automationName 'XCUITest'`，说明 Appium
server 可达，但缺少 `xcuitest` driver。安装后重启 Appium。

### 正常页面被判成 `FAIL`

先看对应的 `*-safari-console.json`，确认是：

- 真正的 JavaScript 错误
- 浏览器资源噪音
- 还是分类规则过宽
