# compat-check 环境须知

这份文档汇总当前 compat-check 方案的环境要求、预检命令和常见故障。

## 1. 必要条件

当前实现依赖：

- macOS
- Xcode
- iOS Simulator runtime
- Appium 2
- Appium `xcuitest` driver

`compat-check` 本身不会绕过这些依赖。

## 2. 启动前预检

先执行：

```bash
xcode-select -p
xcrun simctl list runtimes -j
xcrun simctl list devices available -j
appium driver list --installed
```

预期：

- `xcode-select -p` 指向有效 Xcode Developer 目录
- `simctl` 能成功返回 JSON
- 有至少一个可用 iPhone Simulator
- `appium driver list --installed` 里包含 `xcuitest`

## 3. 安装 XCUITest driver

如果 Appium 缺少 driver，执行：

```bash
appium driver install xcuitest
```

注意：

- 如果你连的是外部 Appium server，要装在那一份 Appium 环境里
- 不是装在“当前 shell”就一定生效，关键看 server 是哪一份 Appium 起的

## 4. Appium server 两种用法

### 方式 A：runner 自动拉起

前提：

- 本机 shell 里能直接执行 `appium`

配置：

```json
{
  "appium": {
    "serverUrl": "http://127.0.0.1:4723",
    "autoStart": true
  }
}
```

### 方式 B：连接外部已启动的 Appium server

前提：

- 对应地址可达
- 那个 server 的环境里已经装了 `xcuitest`

配置：

```json
{
  "appium": {
    "serverUrl": "http://127.0.0.1:4723",
    "autoStart": false
  }
}
```

## 5. 常见故障

### 1) `CoreSimulatorService connection invalid/refused`

说明 Simulator 环境本身有问题，不是 runner 逻辑问题。

优先检查：

- Xcode 是否完整安装
- Simulator 是否能手动打开
- `simctl` 是否在当前 shell 下工作

### 2) `Could not find a driver for automationName 'XCUITest'`

说明 Appium server 可达，但对应环境缺少 `xcuitest` driver。

处理方式：

```bash
appium driver install xcuitest
```

然后重启 Appium server。

### 3) 正常页面被判成 `FAIL`

先打开：

- `results.json`
- 对应的 `*-safari-console.json`

重点看：

- 是 JavaScript 错误
- 还是网络/资源噪音
- 还是分类规则过宽

当前默认配置下，`source=network` 不会被当成失败。

### 4) 命令行里 `curl http://127.0.0.1:4723/status` 失败，但 runner 有时能通

优先检查代理环境变量，例如：

- `http_proxy`
- `https_proxy`

有些 shell 工具会被代理干扰，而 Node 进程未必表现一致。

## 6. 结果目录

默认最小运行：

```bash
artifacts/compat-check/
```

完整 demo suite：

```bash
artifacts/compat-check-demo-suite/
```

常见文件：

- `results.json`
- `report.md`
- `*.png`
- `*-safari-console.json`

## 7. 环境变更时先做什么

如果你切换了：

- Xcode 版本
- iOS runtime
- Appium 版本
- `xcuitest` driver 版本

先重新跑：

```bash
npm run compat:check
```

不要先假设旧环境问题还适用。
