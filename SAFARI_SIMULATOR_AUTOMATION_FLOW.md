# Safari 模拟器自动化检测流程图

这份流程图描述的是当前仓库里已经落地的实际执行链路，不是 `PLAN.md` 中早期设想的 Web Inspector 抓取方案。

## 实际 CLI 命令

用户入口命令：

- `npm run compat:check`
- `npm run compat:demo-suite`
- `npm run compat:serve-demo`
- `npm run compat:config`

Runner 内部调用的关键系统命令：

- `xcrun simctl list devices available -j`
- `xcrun simctl list runtimes -j`
- `xcrun simctl boot <udid>`
- `xcrun simctl bootstatus <udid> -b`
- `xcrun simctl terminate <udid> com.apple.mobilesafari`
- `xcrun simctl openurl <udid> <targetUrl>`
- `xcrun simctl io <udid> screenshot <outputPath>`
- `xcrun simctl shutdown <udid>`

## 整体流程图

```mermaid
flowchart TD
    A[执行 npm run compat:check<br/>或 compat:demo-suite] --> B[node scripts/compat-check.js]
    B --> C[读取 config]
    C --> D[xcrun simctl list devices available -j]
    D --> E[xcrun simctl list runtimes -j]
    E --> F[选择匹配的 simulator 和 runtime]
    F --> G[xcrun simctl boot udid]
    G --> H[xcrun simctl bootstatus udid -b]
    H --> I[启动本地 compat server]
    I --> J[为 target 生成带 compat 参数的 URL]

    J --> K[xcrun simctl terminate udid com.apple.mobilesafari]
    K --> L[xcrun simctl openurl udid targetUrl]
    L --> M[Simulator Safari 打开页面]
    M --> N[页面注入 compat-client.js]
    N --> O[监听 window error]
    N --> P[监听 unhandledrejection]
    N --> Q[hook console.error]
    O --> R[load 后等待 settleTime]
    P --> R
    Q --> R
    R --> S[POST /report 回传结构化结果]
    S --> T[Runner waitForReport]

    T --> U{是否收到 report?}
    U -->|否| V[INFRA_FAIL]
    U -->|是| W{errors.length == 0?}
    W -->|是| X[PASS]
    W -->|否| Y[FAIL]

    Y --> Z[xcrun simctl io udid screenshot outputPath]
    V --> AA[记录基础设施异常]
    X --> AB[写 results.json 和 report.md]
    Z --> AB
    AA --> AB
    AB --> AC[输出汇总]
    AC --> AD[xcrun simctl shutdown udid]
```

## 时序图

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant NPM as npm script
    participant CLI as scripts/compat-check.js
    participant Simctl as xcrun simctl
    participant Sim as iOS Simulator
    participant Safari as MobileSafari in Simulator
    participant Server as local compat server
    participant Page as target page + compat-client.js
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
    CLI->>Server: startCompatServer()
    Server-->>CLI: listen on 127.0.0.1:<port>

    loop for each target
        CLI->>CLI: build targetUrl with compat params
        CLI->>Simctl: terminate <udid> com.apple.mobilesafari
        CLI->>Simctl: openurl <udid> <targetUrl>
        Simctl->>Sim: open URL in simulator
        Sim->>Safari: launch / navigate
        Safari->>Server: GET /demo/... or target URL
        Server-->>Safari: HTML page
        Safari->>Server: GET /compat-client.js
        Server-->>Safari: compat-client.js
        Safari->>Page: execute page and compat client
        Page->>Page: capture error / unhandledrejection / console.error
        CLI->>Server: waitForReport(runId)

        alt page reports before timeout
            Page->>Server: POST /report
            Server-->>CLI: resolve report payload
            alt errors.length == 0
                CLI->>Artifacts: write PASS result
            else errors.length > 0
                CLI->>Simctl: io <udid> screenshot <outputPath>
                CLI->>Artifacts: write FAIL result + screenshot path
            end
        else timeout or runner exception
            Server-->>CLI: timeout / reject
            CLI->>Artifacts: write INFRA_FAIL result
        end
    end

    CLI->>Artifacts: write results.json
    CLI->>Artifacts: write report.md
    CLI->>Simctl: shutdown <udid>
    CLI-->>User: print PASS / FAIL / INFRA_FAIL summary
```

## 说明

- 当前实现没有接 Safari Web Inspector。
- 错误来源是页面内注入脚本采集到的：
  - `window error`
  - `unhandledrejection`
  - `console.error`
- 结果产物默认写到 `artifacts/compat-check/`。
