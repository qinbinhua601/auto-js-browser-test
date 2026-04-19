# compat-check 使用指南

这份指南说明如何使用当前仓库里的 `compat-check` 工具，在 iOS Simulator 的 Safari 中打开测试页面，收集运行时错误，并输出结构化结果。

## 1. 工具能做什么

`compat-check` 目前已经能完成这条链路：

1. 选择并启动一个 iOS Simulator 设备
2. 用 Safari 打开目标页面
3. 让页面在测试态下把运行时错误回传给本地 HTTP 服务
4. 输出 `PASS / FAIL / INFRA_FAIL`
5. 在失败时保存截图和结果文件

它适合先验证“整条自动化测试链”是否可用，后续再扩展到更多 iOS runtime 或真实业务页面。

## 2. 使用前提

开始前请确认：

- 已安装 Xcode
- `xcode-select -p` 指向 `/Applications/Xcode.app/Contents/Developer`
- `xcrun simctl list devices available` 能正常列出模拟器
- 你至少有一个可用的 iPhone Simulator

推荐先手动验证一次：

```bash
xcrun simctl list runtimes
xcrun simctl list devices available
```

## 3. 目录与入口

本工具的关键文件如下：

- `scripts/compat-check.js`
  运行器入口
- `scripts/compat-demo-server.js`
  独立 demo 服务入口
- `demo-pages/`
  测试页面源码，每个场景一个独立 HTML 文件
- `compat-check.config.json`
  最小 demo 配置
- `compat-check.demo-suite.json`
  完整测试态场景配置
- `artifacts/`
  输出目录

可直接使用的 npm 命令：

```bash
npm run compat:check
npm run compat:demo-suite
npm run compat:serve-demo
npm run compat:config
```

含义分别是：

- `compat:check`
  跑最小 demo，只测 2 个页面
- `compat:demo-suite`
  跑完整测试态场景集
- `compat:serve-demo`
  单独启动 demo 页面服务，方便人工查看
- `compat:config`
  打印默认配置模板

## 4. 最小跑通方式

在项目根目录执行：

```bash
npm install
npm run compat:check
```

默认配置会：

- 使用 `iPhone 17 Pro`
- 选择当前已安装的 `iOS` runtime
- 跑两个页面：
  - `demo-ok`
  - `demo-runtime-error`

你会看到类似输出：

```bash
compat-check finished
- simulator:  iPhone 17 Pro
- runtime:    iOS 26.3
- artifacts:  /.../artifacts/compat-check
- totals:     PASS 1, FAIL 1, INFRA_FAIL 0

results:
- demo-ok                  PASS       no errors
- demo-runtime-error       FAIL       1 error
```

这说明：

- `demo-ok` 没有错误，判定通过
- `demo-runtime-error` 主动抛错，判定失败

## 5. 完整测试态场景

如果你想一次把各种错误类型都测一遍，执行：

```bash
npm run compat:demo-suite
```

这会运行下面这些测试页：

- `ok`
  基线页，无错误，应为 `PASS`
- `warning-only`
  只有 `console.warn`，应为 `PASS`
- `console-error`
  调用 `console.error`，应为 `FAIL`
- `runtime-error`
  抛出未捕获异常，应为 `FAIL`
- `promise-rejection`
  触发未处理 Promise rejection，应为 `FAIL`
- `mixed-errors`
  同时触发多种错误，应为 `FAIL`
- `async-runtime-error`
  延迟抛错，仍应被抓到，结果为 `FAIL`
- `missing-base-object`
  基对象不存在，访问 `a.bbb` 一类情况，应为 `FAIL`
- `missing-method-call`
  方法不存在但被调用，应为 `FAIL`
- `missing-nested-property-call`
  缺失属性继续链式调用，应为 `FAIL`
- `missing-property-read-only`
  只读取不存在属性，不会报错，应为 `PASS`
- `caught-runtime-error`
  报错被 `try/catch` 吞掉，不会上报全局错误，应为 `PASS`
- `ready-never`
  故意不回传结果，用来验证超时处理，应为 `INFRA_FAIL`

## 6. Demo 测试 URL 怎么用

demo 页面现在已经拆成 `demo-pages/` 目录下的独立文件，便于逐个查看和维护。

你有两种方式访问它们：

### 方式 A：在检查流程里使用

`compat-check` 运行时会临时起一个本地 HTTP 服务，并动态提供测试页面。

### 方式 B：单独启动 demo 服务

如果你想人工点开页面看效果，执行：

```bash
npm run compat:serve-demo
```

默认访问：

```bash
http://127.0.0.1:4173/demo/catalog
```

可用路径包括：

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

其中：

- `/demo/catalog`
  是一个可点击目录页
- 其他路径都是单独测试页

这些页面可以由 `compat-check` 临时启动，也可以由 `compat:serve-demo` 长时间单独提供。

## 7. 配置文件怎么改

最常改的是这几个字段：

```json
{
  "simulatorName": "iPhone 17 Pro",
  "runtimePrefix": "iOS",
  "loadTimeoutMs": 20000,
  "settleTimeMs": 3000,
  "artifactDir": "artifacts/compat-check",
  "screenshotOnPass": false,
  "targets": [
    {
      "name": "demo-ok",
      "type": "demo",
      "page": "ok"
    }
  ]
}
```

字段说明：

- `simulatorName`
  指定要启动的模拟器名称
- `runtimePrefix`
  用来筛选 runtime，当前通常填 `iOS`
- `loadTimeoutMs`
  等待页面结果回传的超时时间
- `settleTimeMs`
  页面 load 后继续观察错误的窗口时长
- `artifactDir`
  输出目录
- `screenshotOnPass`
  是否在通过时也保存截图
- `targets`
  要测试的页面列表

## 8. `targets` 支持什么

当前支持两种目标：

### 方式 A：跑内置 demo 页面

```json
{
  "name": "demo-runtime-error",
  "type": "demo",
  "page": "runtime-error"
}
```

### 方式 B：跑真实业务 URL

```json
{
  "name": "my-page",
  "url": "https://example.com/page"
}
```

如果是方式 B，建议你的真实页面支持测试态采集逻辑，这样工具才能拿到结构化运行时错误。

## 9. 结果怎么看

每次运行都会在配置指定的 `artifactDir` 下生成结果。

常见文件有：

- `results.json`
  完整结构化结果
- `report.md`
  摘要报告
- `*.png`
  失败页面截图

状态含义：

- `PASS`
  页面成功回传，并且没有采集到错误
- `FAIL`
  页面成功回传，但采集到了运行时错误
- `INFRA_FAIL`
  页面没有成功回传，或运行链路本身超时/异常

## 10. 页面错误是怎么采集的

当 URL 上带有这些参数时：

- `compat_mode=1`
- `compat_run_id=...`
- `compat_report_url=http://127.0.0.1:PORT/report`

页面会启用测试态错误采集，并把结果 POST 回本地服务。

当前采集范围包括：

- `window.onerror`
- `unhandledrejection`
- `console.error`

这意味着它不是去“抓 Safari 开发者工具控制台”，而是让页面自己把错误结构化上报回来。这样更稳定，也更容易后续迁移到真实项目。

## 11. 怎么接入真实页面

推荐做法是给真实业务页加一个测试态：

1. 页面识别 `compat_mode=1`
2. 开启错误采集
3. 把错误放进结构化对象
4. 用 `compat_report_url` 回传结果

这样你之后只需要把配置里的 `targets` 改成真实 URL：

```json
{
  "name": "checkout-page",
  "url": "https://your-site.example/checkout?compat_mode=1"
}
```

更稳妥的方式是：

- 用 query 参数开启测试态
- 不污染生产默认路径
- 只在自动化测试时启用错误上报

## 12. 推荐使用顺序

建议你按这个顺序用：

1. 先跑 `npm run compat:check`
   确认最小链路可用
2. 再跑 `npm run compat:demo-suite`
   确认各种错误类型都能被识别
3. 再把 `targets` 改成你自己的真实页面
4. 最后再扩展到更多 runtime 或更低版本的 iOS

## 13. 常见问题

### 1) `simctl` 不能用

先检查：

```bash
xcrun simctl list devices available
```

如果这里就失败，先不要看工具代码，先修 Xcode / Simulator 环境。

### 2) 页面能打开但结果一直超时

通常说明：

- 页面没有启用测试态采集
- 没有正确使用 `compat_report_url`
- 页面逻辑把上报流程阻断了

### 3) 为什么不是直接读 Safari Console？

因为直接抓 Safari Web Inspector 控制台更脆弱，更难自动化，也不利于后续迁移到真实项目和 CI。

当前方案的核心思路是：

- 用 Simulator + Safari 执行真实页面
- 用页面内测试态逻辑回传结构化错误

这样能更稳定地落地成长期可维护的测试工具。
