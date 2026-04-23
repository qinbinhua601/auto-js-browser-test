# Safari 模拟器自动化检测流程图

这份流程图描述的是仓库里当前唯一保留的 compat-check 方案：

- Appium 2
- XCUITest
- iOS Simulator Safari
- `safariConsole` 日志采集

## CLI 入口

- `npm run compat:check`
- `npm run compat:demo-suite`
- `npm run compat:config`
- `npm run compat:serve-demo`

## 关键系统调用

- `xcrun simctl list devices available -j`
- `xcrun simctl list runtimes -j`
- `xcrun simctl boot <udid>`
- `xcrun simctl bootstatus <udid> -b`
- Appium `POST /session`
- Appium `POST /session/:id/url`
- Appium log endpoints for `safariConsole`
- `xcrun simctl io <udid> screenshot <outputPath>`
- `DELETE /session/:id`
- `xcrun simctl shutdown <udid>`

## 整体流程图

```mermaid
flowchart TD
    A[执行 compat:check 或 compat:demo-suite] --> B[node scripts/compat-check.js]
    B --> C[读取 compat-check config]
    C --> D[xcrun simctl list devices available -j]
    D --> E[xcrun simctl list runtimes -j]
    E --> F[选择匹配 simulator 和 runtime]
    F --> G[xcrun simctl boot udid]
    G --> H[xcrun simctl bootstatus udid -b]
    H --> I{targets 中是否有 demo 页面?}
    I -->|是| J[启动本地 demo server]
    I -->|否| K[跳过 demo server]
    J --> L[连接或拉起 Appium server]
    K --> L
    L --> M[创建 XCUITest Safari session]
    M --> N[确认 safariConsole log type 可用]

    N --> O[逐个处理 target]
    O --> P[构造目标 URL]
    P --> Q[清空旧的 safariConsole 缓冲]
    Q --> R[WebDriver navigate]
    R --> S[轮询 safariConsole 直到 settle 窗口结束]
    S --> T[拉取 href title readyState]
    T --> U{命中错误分类规则?}
    U -->|是| V[FAIL]
    U -->|否| W{导航是否异常?}
    W -->|是| X[INFRA_FAIL]
    W -->|否| Y[PASS]
    V --> Z[写 screenshot + safari-console.json]
    X --> Z
    Y --> Z
    Z --> AA[写 results.json 和 report.md]
    AA --> AB[关闭 session / demo server / simulator]
```

## 时序图

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant NPM as npm script
    participant CLI as scripts/compat-check.js
    participant Simctl as xcrun simctl
    participant Server as local demo server
    participant Appium as Appium server
    participant Safari as Simulator Safari
    participant Artifacts as artifacts/compat-check

    User->>NPM: npm run compat:check
    NPM->>CLI: node scripts/compat-check.js
    CLI->>Simctl: list devices available -j
    Simctl-->>CLI: devices JSON
    CLI->>Simctl: list runtimes -j
    Simctl-->>CLI: runtimes JSON
    CLI->>Simctl: boot <udid>
    CLI->>Simctl: bootstatus <udid> -b
    Simctl-->>CLI: simulator ready

    alt target includes demo pages
        CLI->>Server: startCompatServer()
        Server-->>CLI: listen on 127.0.0.1:<port>
    end

    CLI->>Appium: ensure server reachable
    CLI->>Appium: create Safari session
    Appium-->>CLI: session id + capabilities
    CLI->>Appium: detect log endpoints

    loop for each target
        CLI->>CLI: build target URL
        CLI->>Appium: clear safariConsole buffer
        CLI->>Appium: navigate to URL
        Appium->>Safari: open target page
        Safari->>Server: GET /demo/... (demo targets only)
        Server-->>Safari: HTML page
        CLI->>Appium: read safariConsole window
        Appium-->>CLI: console entries
        CLI->>Appium: execute script for href/title/readyState
        alt JS error matched
            CLI->>Simctl: screenshot
            CLI->>Artifacts: write FAIL result
        else navigation failed
            CLI->>Artifacts: write INFRA_FAIL result
        else no matched error
            CLI->>Artifacts: write PASS result
        end
    end

    CLI->>Artifacts: write results.json
    CLI->>Artifacts: write report.md
    CLI->>Appium: delete session
    CLI->>Server: close()
    CLI->>Simctl: shutdown <udid>
```

## 说明

- 当前实现不会给页面加 `compat_mode`
- 当前实现不会等待页面 POST `/report`
- 当前实现的 demo server 只负责静态提供页面和目录
- 结果来源是 Safari console，不是页面主动上报
