# compat-check 使用指南

这份指南描述的是仓库里当前唯一保留的实现：

- Appium 2
- XCUITest driver
- iOS Simulator Safari
- `safariConsole` 日志采集
- 不依赖页面注入

## 1. 当前方案做什么

`compat-check` 会：

1. 选择并启动一个 iOS Simulator
2. 启动或连接一个 Appium server
3. 创建 Safari session
4. 打开目标 URL
5. 读取 `safariConsole`
6. 输出 `PASS / FAIL / INFRA_FAIL`
7. 保存截图、控制台日志和结构化结果

结果判定基于 Safari 控制台本身，而不是页面回传。

## 2. 常用命令

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
  跑完整 demo 场景
- `compat:config`
  打印默认配置
- `compat:serve-demo`
  单独启动 demo 页面服务

## 3. 使用前提

在开始前，请先确认：

- `xcrun simctl list devices available -j` 能成功
- 已安装可用的 iOS Simulator runtime
- Appium 2 可用
- Appium 里已安装 `xcuitest` driver

推荐先手动验证：

```bash
xcrun simctl list runtimes -j
xcrun simctl list devices available -j
appium driver list --installed
```

如果 `xcuitest` 不在安装列表里，执行：

```bash
appium driver install xcuitest
```

## 4. 配置文件

默认配置文件是 `compat-check.config.json`。

完整 demo 配置是 `compat-check.demo-suite.json`。

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
  选择哪台模拟器
- `runtimePrefix`
  用来筛选 runtime，通常填 `iOS`
- `loadTimeoutMs`
  页面导航超时
- `settleTimeMs`
  页面加载后继续采集控制台的窗口
- `artifactDir`
  输出目录
- `screenshotOnPass`
  是否对 `PASS` 也截图
- `appium.serverUrl`
  Appium server 地址
- `appium.autoStart`
  当 server 不可达时，是否尝试用本机 `appium` 命令自动拉起
- `appium.failOnNetworkErrors`
  是否把 `source=network` 的 Safari console 项也算成失败

## 5. `targets` 怎么写

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

当前实现里，不需要给真实页面加 `compat_mode`、`compat_report_url` 之类参数。

## 6. Demo 页面列表

当前 demo 集合包括：

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

目录页地址：

```bash
http://127.0.0.1:4173/demo/catalog
```

## 7. 结果怎么看

主要产物：

- `results.json`
  完整结构化结果
- `report.md`
  摘要报告
- `*-safari-console.json`
  原始控制台条目
- `*.png`
  页面截图

状态含义：

- `PASS`
  导航完成，且没有命中错误分类规则
- `FAIL`
  导航完成，但命中了 JavaScript 侧错误
- `INFRA_FAIL`
  导航或驱动链路本身失败

默认情况下，像 `favicon.ico` 404 这种浏览器噪音不会被判成 `FAIL`。

## 8. 如何扩展

新增 demo 页面时，通常同步改这几处：

1. `demo-pages/<slug>.html`
2. `demo-pages/manifest.json`
3. `compat-check.demo-suite.json`

如果是调分类逻辑，主要改：

- `scripts/compat-check.js`
  里的 `normalizeSafariConsoleEntry`
- `isErrorLikeEntry`

## 9. 常见问题

### 1) `simctl` 失败

如果 `xcrun simctl list devices available -j` 失败，先修 Xcode / Simulator
环境，不要先改 runner。

### 2) Appium 报缺少 `XCUITest` driver

说明 Appium server 是通的，但对应环境里没有安装 driver。

执行：

```bash
appium driver install xcuitest
```

如果你连的是外部 Appium server，要装在那一份 Appium 环境里。

### 3) 为什么正常页面被判成 `FAIL`

先看 `*-safari-console.json`。

最常见原因是：

- 页面真的有 JS 错误
- 过滤规则过宽
- 你把 `appium.failOnNetworkErrors` 打开了
