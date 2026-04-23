#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { startCompatServer } = require("./compat-demo-server-lib");

const DEFAULT_CONFIG = {
  simulatorName: "iPhone 17 Pro",
  runtimePrefix: "iOS",
  loadTimeoutMs: 20000,
  settleTimeMs: 3000,
  artifactDir: "artifacts/compat-check",
  screenshotOnPass: false,
  appium: {
    serverUrl: process.env.APPIUM_SERVER_URL || "http://127.0.0.1:4723",
    autoStart: true,
    binary: process.env.APPIUM_BINARY || "appium",
    serverArgs: [],
    startupTimeoutMs: 30000,
    showSafariConsoleLog: true,
    skipLogCapture: false,
    noReset: true,
    useNewWDA: false,
    clearSystemFiles: true,
    webviewConnectTimeoutMs: 10000,
    wdaLaunchTimeoutMs: 120000,
    newCommandTimeoutSec: 120,
    safariInitialUrl: "about:blank",
    showXcodeLog: false,
    pageLoadStrategy: "normal",
    failOnNetworkErrors: false,
    capabilities: {},
  },
  targets: [
    {
      name: "demo-ok",
      type: "demo",
      page: "ok",
    },
    {
      name: "demo-runtime-error",
      type: "demo",
      page: "runtime-error",
    },
  ],
};

function parseArgs(argv) {
  const args = {
    configPath: "compat-check.config.json",
    printConfig: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      args.configPath = argv[index + 1];
      index += 1;
    } else if (arg === "--print-default-config") {
      args.printConfig = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const loaded = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    ...DEFAULT_CONFIG,
    ...loaded,
    appium: {
      ...DEFAULT_CONFIG.appium,
      ...(loaded.appium || {}),
      capabilities: {
        ...DEFAULT_CONFIG.appium.capabilities,
        ...((loaded.appium && loaded.appium.capabilities) || {}),
      },
    },
    targets: loaded.targets || DEFAULT_CONFIG.targets,
  };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout.trim();
}

function getDevices() {
  const stdout = runCommand("xcrun", ["simctl", "list", "devices", "available", "-j"]);
  const parsed = JSON.parse(stdout);
  return parsed.devices || {};
}

function getRuntimes() {
  const stdout = runCommand("xcrun", ["simctl", "list", "runtimes", "-j"]);
  const parsed = JSON.parse(stdout);
  return parsed.runtimes || [];
}

function extractPlatformVersion(runtimeName) {
  const match = String(runtimeName || "").match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

function pickDevice(simulatorName, runtimePrefix) {
  const devicesByRuntime = getDevices();
  const runtimes = getRuntimes();
  const runtimeLookup = new Map(runtimes.map((runtime) => [runtime.identifier, runtime]));

  const candidates = [];
  for (const [runtimeId, devices] of Object.entries(devicesByRuntime)) {
    const runtime = runtimeLookup.get(runtimeId);
    if (!runtime || !runtime.isAvailable) {
      continue;
    }

    if (!runtime.name.startsWith(runtimePrefix)) {
      continue;
    }

    for (const device of devices) {
      if (!device.isAvailable) {
        continue;
      }
      if (device.name === simulatorName) {
        candidates.push({
          udid: device.udid,
          name: device.name,
          state: device.state,
          runtimeIdentifier: runtimeId,
          runtimeName: runtime.name,
          platformVersion: extractPlatformVersion(runtime.name),
        });
      }
    }
  }

  if (candidates.length === 0) {
    const availableRuntimes = runtimes
      .filter((runtime) => runtime.isAvailable)
      .map((runtime) => runtime.name)
      .join(", ");
    throw new Error(
      `No available simulator matched name "${simulatorName}" with runtime prefix "${runtimePrefix}". Available runtimes: ${availableRuntimes}`,
    );
  }

  return candidates[0];
}

function bootDevice(udid) {
  spawnSync("xcrun", ["simctl", "boot", udid], { encoding: "utf8" });
  runCommand("xcrun", ["simctl", "bootstatus", udid, "-b"]);
}

function shutdownDevice(udid) {
  spawnSync("xcrun", ["simctl", "shutdown", udid], { encoding: "utf8" });
}

function sanitizeFilePart(value) {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function joinUrl(baseUrl, relativePath = "") {
  const base = new URL(baseUrl);
  const normalizedBase = base.href.endsWith("/") ? base.href : `${base.href}/`;
  return new URL(relativePath.replace(/^\//, ""), normalizedBase).toString();
}

function unwrapValue(payload) {
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "value")) {
    return payload.value;
  }
  return payload;
}

function stringifyValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function maybeParseJsonString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractWebDriverMessage(payload, fallback) {
  if (payload && typeof payload === "object") {
    if (payload.value && typeof payload.value.message === "string") {
      return payload.value.message;
    }
    if (typeof payload.message === "string") {
      return payload.message;
    }
  }
  return fallback;
}

function augmentKnownAppiumError(error, config) {
  const message = String(error && error.message ? error.message : error);

  if (
    message.includes("Could not find a driver for automationName 'XCUITest'") ||
    message.includes("Could not find installed driver to support given caps")
  ) {
    return new Error(
      [
        message,
        "",
        "Appium server is reachable, but its XCUITest driver is not installed.",
        "Install it in the same Appium environment that is serving this session:",
        "  appium driver install xcuitest",
        "",
        `Current server URL: ${config.appium.serverUrl}`,
        "If that server was started elsewhere, install the driver there and restart Appium before rerunning compat:check.",
      ].join("\n"),
    );
  }

  return error;
}

function requestJson(urlString, options = {}) {
  const url = new URL(urlString);
  const transport = url.protocol === "https:" ? https : http;
  const method = options.method || "GET";
  const timeoutMs = options.timeoutMs || 30000;
  const bodyString =
    options.body === undefined || options.body === null
      ? null
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);

  const headers = {
    accept: "application/json",
    ...(bodyString
      ? {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(bodyString),
        }
      : {}),
    ...(options.headers || {}),
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const parsedBody = rawBody ? maybeParseJsonString(rawBody) || rawBody : null;
          const statusCode = res.statusCode || 0;

          if (statusCode >= 400) {
            reject(
              new Error(
                extractWebDriverMessage(
                  parsedBody,
                  `HTTP ${statusCode} calling ${urlString}${rawBody ? `\n${rawBody}` : ""}`,
                ),
              ),
            );
            return;
          }

          resolve(parsedBody);
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request to ${urlString} timed out after ${timeoutMs}ms`));
    });

    if (bodyString) {
      req.write(bodyString);
    }
    req.end();
  });
}

function createOutputBuffer(limit = 200) {
  const lines = [];
  return {
    push(chunk) {
      const text = chunk.toString("utf8");
      text.split(/\r?\n/).forEach((line) => {
        if (!line) {
          return;
        }
        lines.push(line);
        if (lines.length > limit) {
          lines.shift();
        }
      });
    },
    toString() {
      return lines.join("\n");
    },
  };
}

async function waitForAppiumServer(serverUrl, timeoutMs, getSpawnError) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    const spawnError = getSpawnError();
    if (spawnError) {
      throw spawnError;
    }

    try {
      const status = await requestJson(joinUrl(serverUrl, "status"), { timeoutMs: 3000 });
      const ready = status && status.value ? status.value.ready : true;
      if (ready !== false) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for Appium server at ${serverUrl}${lastError ? `: ${lastError.message}` : ""}`,
  );
}

function stopChildProcess(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) {
      resolve();
      return;
    }

    const killTimer = setTimeout(() => {
      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    }, 5000);

    proc.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });

    proc.kill("SIGTERM");
  });
}

async function ensureAppiumServer(config) {
  const serverUrl = config.appium.serverUrl;

  try {
    await requestJson(joinUrl(serverUrl, "status"), { timeoutMs: 3000 });
    return {
      serverUrl,
      autoStarted: false,
      stop: async () => {},
      getRecentOutput: () => "",
    };
  } catch {}

  if (!config.appium.autoStart) {
    throw new Error(`Appium server is not reachable at ${serverUrl}`);
  }

  const parsed = new URL(serverUrl);
  const args = [
    "--address",
    parsed.hostname,
    "--port",
    parsed.port || "4723",
  ];
  if (parsed.pathname && parsed.pathname !== "/") {
    args.push("--base-path", parsed.pathname.replace(/\/$/, ""));
  }
  if (Array.isArray(config.appium.serverArgs)) {
    args.push(...config.appium.serverArgs.map((entry) => String(entry)));
  }

  const output = createOutputBuffer();
  let spawnError = null;
  let exitError = null;
  const proc = spawn(config.appium.binary, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.on("error", (error) => {
    spawnError = error;
  });
  proc.on("exit", (code, signal) => {
    if (code && code !== 0) {
      exitError = new Error(`Appium exited before becoming ready with code ${code}`);
      return;
    }
    if (signal) {
      exitError = new Error(`Appium exited before becoming ready because of signal ${signal}`);
    }
  });
  proc.stdout.on("data", (chunk) => output.push(chunk));
  proc.stderr.on("data", (chunk) => output.push(chunk));

  try {
    await waitForAppiumServer(serverUrl, config.appium.startupTimeoutMs, () => spawnError || exitError);
  } catch (error) {
    await stopChildProcess(proc);
    const recentOutput = output.toString();
    throw new Error(
      [
        `Failed to start Appium with binary "${config.appium.binary}".`,
        error.message,
        recentOutput ? `Recent Appium output:\n${recentOutput}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    serverUrl,
    autoStarted: true,
    stop: async () => {
      await stopChildProcess(proc);
    },
    getRecentOutput: () => output.toString(),
  };
}

function createSessionClient(serverUrl, sessionId) {
  return {
    serverUrl,
    sessionId,
    logCommandPath: null,
    availableLogTypes: [],
    request(method, relativePath, body, timeoutMs) {
      return requestJson(joinUrl(serverUrl, `session/${sessionId}/${relativePath}`), {
        method,
        body,
        timeoutMs,
      });
    },
  };
}

async function configureSessionTimeouts(session, config) {
  try {
    await session.request(
      "POST",
      "timeouts",
      {
        pageLoad: config.loadTimeoutMs,
        script: Math.max(config.loadTimeoutMs, 10000),
        implicit: 0,
      },
      10000,
    );
  } catch (error) {
    session.timeoutConfigError = String(error.message || error);
  }
}

async function detectLogCommands(session) {
  const candidates = [
    { typesPath: "log/types", logPath: "log" },
    { typesPath: "se/log/types", logPath: "se/log" },
  ];

  let lastError;
  for (const candidate of candidates) {
    try {
      const payload = await session.request("GET", candidate.typesPath, null, 5000);
      const value = unwrapValue(payload);
      if (Array.isArray(value)) {
        return {
          ...candidate,
          availableTypes: value,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not resolve Appium log endpoints${lastError ? `: ${lastError.message}` : ""}`,
  );
}

async function initLogCapture(session, config) {
  const detected = await detectLogCommands(session);
  session.logCommandPath = detected.logPath;
  session.availableLogTypes = detected.availableTypes;

  const hasSafariConsole = detected.availableTypes.some(
    (logType) => String(logType).toLowerCase() === "safariconsole",
  );
  if (config.appium.showSafariConsoleLog && !hasSafariConsole) {
    throw new Error(
      `Appium session did not expose safariConsole logs. Available types: ${detected.availableTypes.join(", ")}`,
    );
  }
}

async function createAppiumSession(serverUrl, device, config) {
  const capabilities = compactObject({
    platformName: "iOS",
    browserName: "safari",
    "appium:automationName": "XCUITest",
    "appium:deviceName": device.name,
    "appium:udid": device.udid,
    "appium:platformVersion": device.platformVersion || undefined,
    "appium:noReset": config.appium.noReset,
    "appium:useNewWDA": config.appium.useNewWDA,
    "appium:clearSystemFiles": config.appium.clearSystemFiles,
    "appium:showSafariConsoleLog": config.appium.showSafariConsoleLog,
    "appium:skipLogCapture": config.appium.skipLogCapture,
    "appium:webviewConnectTimeout": config.appium.webviewConnectTimeoutMs,
    "appium:wdaLaunchTimeout": config.appium.wdaLaunchTimeoutMs,
    "appium:newCommandTimeout": config.appium.newCommandTimeoutSec,
    "appium:safariInitialUrl": config.appium.safariInitialUrl,
    "appium:showXcodeLog": config.appium.showXcodeLog,
    pageLoadStrategy: config.appium.pageLoadStrategy,
    ...config.appium.capabilities,
  });

  const response = await requestJson(joinUrl(serverUrl, "session"), {
    method: "POST",
    body: {
      capabilities: {
        alwaysMatch: capabilities,
        firstMatch: [{}],
      },
    },
    timeoutMs: config.appium.wdaLaunchTimeoutMs + 60000,
  }).catch((error) => {
    throw augmentKnownAppiumError(error, config);
  });

  const sessionValue = unwrapValue(response) || {};
  const sessionId = sessionValue.sessionId || response.sessionId;
  if (!sessionId) {
    throw new Error(`Appium did not return a session id: ${stringifyValue(response)}`);
  }

  const session = createSessionClient(serverUrl, sessionId);
  session.capabilities = sessionValue.capabilities || {};
  await configureSessionTimeouts(session, config);
  await initLogCapture(session, config);
  return session;
}

async function deleteAppiumSession(session) {
  await requestJson(joinUrl(session.serverUrl, `session/${session.sessionId}`), {
    method: "DELETE",
    timeoutMs: 10000,
  });
}

async function getLogEntries(session, type) {
  const payload = await session.request(
    "POST",
    session.logCommandPath,
    { type },
    10000,
  );
  const value = unwrapValue(payload);
  return Array.isArray(value) ? value : [];
}

async function drainSafariConsoleLogs(session) {
  await getLogEntries(session, "safariConsole");
}

function collectTextFragments(value, bucket) {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    if (value.trim()) {
      bucket.push(value);
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    bucket.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectTextFragments(entry, bucket));
    return;
  }
  if (typeof value === "object") {
    const preferredKeys = [
      "messageText",
      "message",
      "text",
      "description",
      "reason",
      "value",
      "type",
      "subtype",
      "url",
    ];
    preferredKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        collectTextFragments(value[key], bucket);
      }
    });
  }
}

function formatTimestamp(timestamp) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }
  if (typeof timestamp === "string" && timestamp) {
    return timestamp;
  }
  return new Date().toISOString();
}

function normalizeSafariConsoleEntry(entry) {
  const rawMessage = stringifyValue(entry && entry.message);
  const parsedMessage = maybeParseJsonString(rawMessage);
  const fragments = [];
  collectTextFragments(parsedMessage, fragments);
  if (rawMessage) {
    fragments.push(rawMessage);
  }

  const stack =
    parsedMessage && typeof parsedMessage === "object"
      ? parsedMessage.stack ||
        parsedMessage.stackTrace ||
        parsedMessage.stacktrace ||
        null
      : null;

  return {
    timestamp: formatTimestamp(entry && entry.timestamp),
    level: String(
      (entry && entry.level) ||
        (parsedMessage && parsedMessage.level) ||
        (parsedMessage && parsedMessage.type) ||
        "info",
    ).toLowerCase(),
    message: fragments.filter(Boolean).join(" | ") || stringifyValue(entry),
    stack: typeof stack === "string" ? stack : stack ? stringifyValue(stack) : null,
    source:
      (parsedMessage && (parsedMessage.sourceURL || parsedMessage.url)) || null,
    sourceType:
      (parsedMessage && parsedMessage.source) ||
      (entry && entry.source) ||
      null,
    raw: parsedMessage || entry,
  };
}

function isErrorLikeEntry(entry, config) {
  const sourceType = String(entry.sourceType || "").toLowerCase();
  if (sourceType === "network" && !config.appium.failOnNetworkErrors) {
    return false;
  }

  const level = String(entry.level || "").toLowerCase();
  if (/(^|[^a-z])(error|severe|fatal)([^a-z]|$)/.test(level)) {
    return true;
  }

  const haystack = `${level} ${entry.message}`.toLowerCase();
  return /console\.error|uncaught|unhandled(?: promise)? rejection|syntaxerror|typeerror|referenceerror|rangeerror|urierror|evalerror|aggregateerror|\berror:/.test(
    haystack,
  );
}

function toCompatError(entry) {
  return {
    type: "safariConsole",
    message: entry.message,
    stack: entry.stack,
    source: entry.source,
    line: null,
    column: null,
    timestamp: entry.timestamp,
    level: entry.level,
  };
}

async function collectSafariConsoleWindow(session, windowMs) {
  const entries = [];
  const deadline = Date.now() + Math.max(windowMs, 0);

  while (true) {
    const batch = await getLogEntries(session, "safariConsole");
    entries.push(...batch.map((entry) => normalizeSafariConsoleEntry(entry)));
    if (Date.now() >= deadline) {
      break;
    }
    await delay(Math.min(500, Math.max(0, deadline - Date.now())));
  }

  return entries;
}

async function getPageInfo(session) {
  try {
    const payload = await session.request(
      "POST",
      "execute/sync",
      {
        script:
          "return {href: window.location.href, title: document.title, userAgent: navigator.userAgent, readyState: document.readyState};",
        args: [],
      },
      10000,
    );
    return unwrapValue(payload);
  } catch (error) {
    return {
      href: null,
      title: null,
      userAgent: null,
      readyState: null,
      pageInfoError: String(error.message || error),
    };
  }
}

function buildTargetUrl(target, serverPort) {
  if (target.type === "demo") {
    if (!serverPort) {
      throw new Error(`Target "${target.name}" needs the local demo server, but it is not running`);
    }
    return new URL(`http://127.0.0.1:${serverPort}/demo/${target.page || "ok"}`).toString();
  }

  if (target.url) {
    return new URL(target.url).toString();
  }

  throw new Error(`Target "${target.name}" must define either type=demo or url`);
}

function captureScreenshot(udid, outputPath) {
  runCommand("xcrun", ["simctl", "io", udid, "screenshot", outputPath]);
}

function writeConsoleArtifact(artifactsDir, targetName, consoleEntries) {
  const outputPath = path.join(
    artifactsDir,
    `${sanitizeFilePart(targetName)}-safari-console.json`,
  );
  fs.writeFileSync(outputPath, JSON.stringify(consoleEntries, null, 2));
  return outputPath;
}

async function runTarget(target, context) {
  const { config, device, session, server, artifactsDir } = context;
  const targetUrl = buildTargetUrl(target, server ? server.port : null);

  await drainSafariConsoleLogs(session);

  let navigationError = null;
  try {
    await session.request(
      "POST",
      "url",
      { url: targetUrl },
      config.loadTimeoutMs + 5000,
    );
  } catch (error) {
    navigationError = error;
  }

  const consoleEntries = await collectSafariConsoleWindow(session, config.settleTimeMs);
  const pageInfo = await getPageInfo(session);
  const errors = consoleEntries
    .filter((entry) => isErrorLikeEntry(entry, config))
    .map((entry) => toCompatError(entry));

  if (navigationError) {
    errors.push({
      type: "infra",
      message: String(navigationError.message || navigationError),
      stack: navigationError.stack || null,
      source: null,
      line: null,
      column: null,
      timestamp: new Date().toISOString(),
    });
  }

  const hasRuntimeFailure = errors.some((entry) => entry.type === "safariConsole");
  const status = hasRuntimeFailure
    ? "FAIL"
    : navigationError
      ? "INFRA_FAIL"
      : "PASS";

  const screenshotPath = path.join(
    artifactsDir,
    `${sanitizeFilePart(target.name)}-${status.toLowerCase()}.png`,
  );
  if (status !== "PASS" || config.screenshotOnPass) {
    captureScreenshot(device.udid, screenshotPath);
  }

  const consoleLogPath = writeConsoleArtifact(artifactsDir, target.name, consoleEntries);

  return {
    name: target.name,
    url: pageInfo.href || targetUrl,
    status,
    runtimeName: device.runtimeName,
    simulatorName: device.name,
    errors,
    title: pageInfo.title || null,
    userAgent: pageInfo.userAgent || null,
    readyState: pageInfo.readyState || null,
    screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
    consoleLogPath: fs.existsSync(consoleLogPath) ? consoleLogPath : null,
    reportedAt: new Date().toISOString(),
    collectionBackend: "appium:safariConsole",
  };
}

function writeArtifacts(config, device, results) {
  const artifactRoot = path.resolve(config.artifactDir);
  ensureDir(artifactRoot);

  const summary = {
    generatedAt: new Date().toISOString(),
    simulator: {
      name: device.name,
      udid: device.udid,
      runtimeName: device.runtimeName,
      runtimeIdentifier: device.runtimeIdentifier,
    },
    collector: "appium:safariConsole",
    appium: {
      serverUrl: config.appium.serverUrl,
      binary: config.appium.binary,
    },
    totals: {
      pass: results.filter((result) => result.status === "PASS").length,
      fail: results.filter((result) => result.status === "FAIL").length,
      infraFail: results.filter((result) => result.status === "INFRA_FAIL").length,
    },
    results,
  };

  fs.writeFileSync(
    path.join(artifactRoot, "results.json"),
    JSON.stringify(summary, null, 2),
  );

  const markdown = [
    "# compat-check results",
    "",
    `- Simulator: ${device.name}`,
    `- Runtime: ${device.runtimeName}`,
    `- Collector: appium:safariConsole`,
    `- Appium server: ${config.appium.serverUrl}`,
    `- Generated: ${summary.generatedAt}`,
    "",
    "| Target | Status | Errors |",
    "| --- | --- | --- |",
    ...results.map((result) => `| ${result.name} | ${result.status} | ${result.errors.length} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(artifactRoot, "report.md"), markdown);

  return artifactRoot;
}

function formatResultLine(result) {
  const errorCount = result.errors.length;
  const detail =
    result.status === "FAIL"
      ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
      : result.status === "INFRA_FAIL"
        ? result.errors[0].message
        : "no errors";
  return `- ${result.name.padEnd(24)} ${result.status.padEnd(10)} ${detail}`;
}

function printSummary(device, artifactDir, results) {
  const resultsJsonPath = path.join(artifactDir, "results.json");
  const totals = {
    pass: results.filter((result) => result.status === "PASS").length,
    fail: results.filter((result) => result.status === "FAIL").length,
    infraFail: results.filter((result) => result.status === "INFRA_FAIL").length,
  };

  process.stdout.write("\ncompat-check finished\n");
  process.stdout.write(`- simulator:  ${device.name}\n`);
  process.stdout.write(`- runtime:    ${device.runtimeName}\n`);
  process.stdout.write(`- collector:  appium:safariConsole\n`);
  process.stdout.write(`- artifacts:  ${artifactDir}\n`);
  process.stdout.write(`- results:    ${resultsJsonPath}\n`);
  process.stdout.write(
    `- totals:     PASS ${totals.pass}, FAIL ${totals.fail}, INFRA_FAIL ${totals.infraFail}\n`,
  );
  process.stdout.write("\nresults:\n");
  results.forEach((result) => {
    process.stdout.write(`${formatResultLine(result)}\n`);
  });
  process.stdout.write("\n");
}

function buildInfraFailureResult(target, device, error) {
  return {
    name: target.name,
    url: target.url || target.page || null,
    status: "INFRA_FAIL",
    runtimeName: device.runtimeName,
    simulatorName: device.name,
    errors: [
      {
        type: "infra",
        message: String(error.message || error),
        stack: error.stack || null,
        source: null,
        line: null,
        column: null,
        timestamp: new Date().toISOString(),
      },
    ],
    title: null,
    userAgent: null,
    readyState: null,
    screenshotPath: null,
    consoleLogPath: null,
    reportedAt: new Date().toISOString(),
    collectionBackend: "appium:safariConsole",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printConfig) {
    process.stdout.write(`${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    return;
  }

  const config = readConfig(path.resolve(args.configPath));
  const artifactRoot = path.resolve(config.artifactDir);
  ensureDir(artifactRoot);

  let demoServer;
  let device;
  let appiumServer;
  let session;
  const results = [];

  try {
    device = pickDevice(config.simulatorName, config.runtimePrefix);
    bootDevice(device.udid);

    if (config.targets.some((target) => target.type === "demo")) {
      demoServer = await startCompatServer();
    }

    appiumServer = await ensureAppiumServer(config);
    session = await createAppiumSession(appiumServer.serverUrl, device, config);

    for (const target of config.targets) {
      try {
        const result = await runTarget(target, {
          config,
          device,
          session,
          server: demoServer,
          artifactsDir: artifactRoot,
        });
        results.push(result);
      } catch (error) {
        results.push(buildInfraFailureResult(target, device, error));
      }
    }

    const artifactDir = writeArtifacts(config, device, results);
    printSummary(device, artifactDir, results);
  } finally {
    if (session) {
      try {
        await deleteAppiumSession(session);
      } catch {}
    }
    if (appiumServer) {
      await appiumServer.stop();
    }
    if (demoServer) {
      await demoServer.close();
    }
    if (device) {
      shutdownDevice(device.udid);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
