const fs = require("fs");
const http = require("http");
const path = require("path");

const DEMO_DIR = path.resolve(__dirname, "..", "demo-pages");
const MANIFEST_PATH = path.join(DEMO_DIR, "manifest.json");

function loadDemoManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function renderLayout(title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 32px;
        line-height: 1.5;
        background: #f6f8fb;
        color: #162031;
      }
      .card {
        max-width: 760px;
        margin: 0 auto;
        background: white;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 16px 40px rgba(31, 54, 88, 0.12);
      }
      code {
        background: #eef2f7;
        padding: 2px 6px;
        border-radius: 6px;
      }
      a {
        color: #1857b6;
      }
    </style>
  </head>
  <body>
    <main class="card">
      ${body}
    </main>
  </body>
</html>`;
}

function buildDemoHtml(slug, pageDef) {
  const filePath = path.join(DEMO_DIR, `${slug}.html`);
  if (!fs.existsSync(filePath)) {
    return buildNotFoundHtml(slug);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const scriptTag = '<script src="/compat-client.js"></script>';
  if (raw.includes(scriptTag)) {
    return raw;
  }

  return raw.replace(
    "</body>",
    `    ${scriptTag}\n  </body>`,
  );
}

function buildNotFoundHtml(slug) {
  return renderLayout(
    "demo-not-found",
    `
      <h1>Unknown demo page: ${slug}</h1>
      <p>Use <code>/demo/catalog</code> to view the available scenarios.</p>
    `,
  );
}

function buildDemoCatalogHtml(serverPort) {
  const manifest = loadDemoManifest();
  const items = Object.entries(manifest)
    .map(([slug, pageDef]) => {
      const href = `/demo/${slug}?compat_mode=1&compat_report_url=http://127.0.0.1:${serverPort}/report&compat_run_id=manual-${slug}&compat_settle_ms=3000`;
      return `<li><a href="${href}">${slug}</a> — expected <code>${pageDef.expectedStatus}</code> — ${pageDef.description}</li>`;
    })
    .join("\n");

  return renderLayout(
    "compat demo catalog",
    `
      <h1>compat-check demo catalog</h1>
      <p>These pages are served by the local runner and are meant for iOS Simulator Safari checks.</p>
      <ul>${items}</ul>
    `,
  );
}

function buildCompatClient() {
  return `(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("compat_mode") !== "1") {
    return;
  }

  const reportUrl = params.get("compat_report_url");
  const runId = params.get("compat_run_id");
  const settleTimeMs = Number(params.get("compat_settle_ms") || 3000);
  const suppressReport = params.get("compat_disable_report") === "1";
  const errors = [];
  let reported = false;

  window.__compatRuntimeErrors = errors;
  window.__compatRuntimeReady = window.__compatRuntimeReady || false;

  const pushError = (payload) => {
    errors.push({
      ...payload,
      timestamp: new Date().toISOString(),
    });
  };

  window.addEventListener("error", (event) => {
    pushError({
      type: "error",
      message: event.message || "Unknown error",
      source: event.filename || null,
      line: event.lineno || null,
      column: event.colno || null,
      stack: event.error && event.error.stack ? String(event.error.stack) : null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    pushError({
      type: "unhandledrejection",
      message: event.reason ? String(event.reason) : "Unhandled promise rejection",
      stack: event.reason && event.reason.stack ? String(event.reason.stack) : null,
      source: null,
      line: null,
      column: null,
    });
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    pushError({
      type: "console.error",
      message: args.map((arg) => {
        if (typeof arg === "string") return arg;
        try {
          return JSON.stringify(arg);
        } catch (error) {
          return String(arg);
        }
      }).join(" "),
      stack: null,
      source: null,
      line: null,
      column: null,
    });
    originalConsoleError(...args);
  };

  const sendReport = async () => {
    if (reported || !reportUrl || suppressReport) {
      return;
    }
    reported = true;
    const payload = {
      runId,
      href: window.location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      ready: Boolean(window.__compatRuntimeReady),
      errors,
      reportedAt: new Date().toISOString(),
    };

    try {
      await fetch(reportUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (error) {
      originalConsoleError("compat-check report failed", error);
    }
  };

  window.addEventListener("load", () => {
    setTimeout(sendReport, settleTimeMs);
  });
})();`;
}

function startCompatServer(options = {}) {
  const port = options.port || 0;
  const reportWaiters = new Map();
  const reportStore = new Map();
  const manifest = loadDemoManifest();

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, "http://127.0.0.1");

    if (req.method === "GET" && requestUrl.pathname === "/compat-client.js") {
      res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
      res.end(buildCompatClient());
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/demo/catalog") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(buildDemoCatalogHtml(server.address().port));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/demo/")) {
      const slug = requestUrl.pathname.split("/").pop() || "ok";
      const pageDef = manifest[slug];
      const statusCode = pageDef ? 200 : 404;
      res.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
      res.end(pageDef ? buildDemoHtml(slug, pageDef) : buildNotFoundHtml(slug));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/report") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          reportStore.set(payload.runId, payload);
          const waiter = reportWaiters.get(payload.runId);
          if (waiter) {
            waiter.resolve(payload);
            reportWaiters.delete(payload.runId);
          }
          res.writeHead(204);
          res.end();
        } catch (error) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: address.port,
        manifest,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
        waitForReport(runId, timeoutMs) {
          if (reportStore.has(runId)) {
            return Promise.resolve(reportStore.get(runId));
          }

          return new Promise((resolveReport, rejectReport) => {
            const timeout = setTimeout(() => {
              reportWaiters.delete(runId);
              rejectReport(new Error(`Timed out waiting for report ${runId}`));
            }, timeoutMs);

            reportWaiters.set(runId, {
              resolve(payload) {
                clearTimeout(timeout);
                resolveReport(payload);
              },
            });
          });
        },
      });
    });
  });
}

module.exports = {
  loadDemoManifest,
  startCompatServer,
};
