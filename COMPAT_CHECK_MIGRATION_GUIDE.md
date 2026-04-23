# compat-check 迁移指南

这份文档是给后续 agent 和维护者看的，重点说明：

- 当前实现是什么
- 旧实现去掉了什么
- 今后应该如何在当前方案上继续迁移

## 1. 当前唯一实现

仓库里当前只保留这一条链路：

- `scripts/compat-check.js`
- Appium 2 + XCUITest
- iOS Simulator Safari
- `safariConsole` 采集
- demo server 只提供静态页面

兼容性判断来自 Safari 控制台日志，不依赖页面回传。

## 2. 已移除的旧方案

下面这些旧思路已经被移除，不应再恢复：

- `compat_mode=1`
- `compat_report_url`
- 页面 POST `/report`
- 注入 `compat-client.js`
- 页面内运行时采集器
- 单独维护一套 `compat:check:appium` 平行入口

如果你在后续工作里再次看到这些概念，请把它们视为历史方案，而不是当前设计。

## 3. 当前代码的事实来源

维护 compat-check 时，优先看这些文件：

- `scripts/compat-check.js`
  唯一 runner
- `compat-check.config.json`
  最小配置
- `compat-check.demo-suite.json`
  全量 demo 集合
- `scripts/compat-demo-server-lib.js`
  demo 页面服务
- `demo-pages/manifest.json`
  demo 场景目录
- `SAFARI_SIMULATOR_AUTOMATION_FLOW.md`
  当前流程图
- `COMPAT_CHECK_ENVIRONMENT.md`
  环境要求和故障排查

## 4. 如何把旧注入方案迁到当前方案

如果你手里还有旧的 target 或旧文档，按下面迁：

1. 删掉 `compat_mode`、`compat_report_url`、`compat_run_id` 之类 query 参数
2. 不再要求页面识别测试态并主动回传结果
3. 直接把真实 URL 放进 `targets`
4. 把错误判定逻辑放在 runner 侧，也就是 `safariConsole` 分类规则里
5. 把“页面不回传结果”这类旧 `INFRA_FAIL` 语义，改成“导航/驱动链路失败”

旧写法：

```json
{
  "name": "checkout-page",
  "url": "https://example.com/checkout?compat_mode=1"
}
```

当前写法：

```json
{
  "name": "checkout-page",
  "url": "https://example.com/checkout"
}
```

## 5. 以后如何继续扩展

### 新增 demo 场景

同步改这三处：

1. `demo-pages/<slug>.html`
2. `demo-pages/manifest.json`
3. `compat-check.demo-suite.json`

### 调整错误分类

改 `scripts/compat-check.js` 里的：

- `normalizeSafariConsoleEntry`
- `isErrorLikeEntry`
- `toCompatError`

### 调整 Appium 行为

优先改配置，不要先改代码：

- `compat-check.config.json`
- `compat-check.demo-suite.json`

只有当配置不够表达时，再改 runner。

## 6. 迁移时的判断原则

- 如果目标是“完全不改页面”，不要重新引入页面注入
- 如果目标是“减少误判”，先改日志过滤规则
- 如果目标是“增加覆盖场景”，优先新增 demo 页面或真实 URL target
- 如果目标是“提高稳定性”，优先处理 Appium / Simulator 环境，而不是在页面里补回传逻辑

## 7. 已知边界

- `safariConsole` 是黑盒方案，稳定性受 Appium / WebKit / Simulator 影响
- 默认不把 `source=network` 的控制台项算成失败
- `INFRA_FAIL` 主要表示导航、Appium session、log endpoint、simulator 等链路失败
- 这套方案更接近“浏览器真实表现”，但结构化程度不如页面主动上报

## 8. 推荐的后续维护方式

后续 agent 在动 compat-check 前，先做这三件事：

1. 读 `COMPAT_CHECK_ENVIRONMENT.md`
2. 读 `SAFARI_SIMULATOR_AUTOMATION_FLOW.md`
3. 跑 `npm run compat:config`

这样能最快确认：

- 当前方案是黑盒 Appium，不是注入式回传
- 依赖链路是什么
- 配置面是否已经足够
