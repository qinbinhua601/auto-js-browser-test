#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadDemoManifest, startCompatServer } = require("./compat-demo-server-lib");

const DEFAULT_CONFIG = {
  simulatorName: "iPhone 17 Pro",
  runtimePrefix: "iOS",
  loadTimeoutMs: 20000,
  settleTimeMs: 3000,
  artifactDir: "artifacts/compat-check",
  screenshotOnPass: false,
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


function buildTargetUrl(target, serverPort, config, runId) {
  const demoManifest = loadDemoManifest();
  let targetUrl;
  if (target.type === "demo") {
    targetUrl = new URL(`http://127.0.0.1:${serverPort}/demo/${target.page || "ok"}`);
  } else if (target.url) {
    targetUrl = new URL(target.url);
  } else {
    throw new Error(`Target "${target.name}" must define either type=demo or url`);
  }

  targetUrl.searchParams.set("compat_mode", "1");
  targetUrl.searchParams.set("compat_run_id", runId);
  targetUrl.searchParams.set("compat_settle_ms", String(config.settleTimeMs));
  targetUrl.searchParams.set("compat_report_url", `http://127.0.0.1:${serverPort}/report`);
  if (target.type === "demo" && demoManifest[target.page] && demoManifest[target.page].disableAutoReport) {
    targetUrl.searchParams.set("compat_disable_report", "1");
  }
  return targetUrl.toString();
}

function captureScreenshot(udid, outputPath) {
  runCommand("xcrun", ["simctl", "io", udid, "screenshot", outputPath]);
}

async function runTarget(target, context) {
  const { config, device, server, artifactsDir } = context;
  const runId = `${Date.now()}-${sanitizeFilePart(target.name)}`;
  const targetUrl = buildTargetUrl(target, server.port, config, runId);

  try {
    spawnSync("xcrun", ["simctl", "terminate", device.udid, "com.apple.mobilesafari"], {
      encoding: "utf8",
    });
  } catch {}

  runCommand("xcrun", ["simctl", "openurl", device.udid, targetUrl]);
  const report = await server.waitForReport(runId, config.loadTimeoutMs + config.settleTimeMs);

  const status = report.errors.length === 0 ? "PASS" : "FAIL";
  const screenshotPath = path.join(
    artifactsDir,
    `${sanitizeFilePart(target.name)}-${status.toLowerCase()}.png`,
  );

  if (status !== "PASS" || config.screenshotOnPass) {
    captureScreenshot(device.udid, screenshotPath);
  }

  return {
    name: target.name,
    url: report.href,
    status,
    runtimeName: device.runtimeName,
    simulatorName: device.name,
    errors: report.errors,
    title: report.title,
    userAgent: report.userAgent,
    screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
    reportedAt: report.reportedAt,
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printConfig) {
    process.stdout.write(`${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    return;
  }

  const config = readConfig(path.resolve(args.configPath));
  const artifactRoot = path.resolve(config.artifactDir);
  ensureDir(artifactRoot);

  let server;
  let device;
  const results = [];

  try {
    device = pickDevice(config.simulatorName, config.runtimePrefix);
    bootDevice(device.udid);

    server = await startCompatServer();
    for (const target of config.targets) {
      try {
        const result = await runTarget(target, {
          config,
          device,
          server,
          artifactsDir: artifactRoot,
        });
        results.push(result);
      } catch (error) {
        results.push({
          name: target.name,
          url: target.url || target.page || null,
          status: "INFRA_FAIL",
          runtimeName: device.runtimeName,
          simulatorName: device.name,
          errors: [
            {
              type: "infra",
              message: String(error.message || error),
            },
          ],
          title: null,
          userAgent: null,
          screenshotPath: null,
          reportedAt: new Date().toISOString(),
        });
      }
    }

    const artifactDir = writeArtifacts(config, device, results);
    printSummary(device, artifactDir, results);
  } finally {
    if (server) {
      await server.close();
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
