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

function buildDemoHtml(slug) {
  const filePath = path.join(DEMO_DIR, `${slug}.html`);
  if (!fs.existsSync(filePath)) {
    return buildNotFoundHtml(slug);
  }

  return fs.readFileSync(filePath, "utf8");
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

function buildDemoCatalogHtml() {
  const manifest = loadDemoManifest();
  const items = Object.entries(manifest)
    .map(([slug, pageDef]) => {
      const href = `/demo/${slug}`;
      return `<li><a href="${href}">${slug}</a> — expected <code>${pageDef.expectedStatus}</code> — ${pageDef.description}</li>`;
    })
    .join("\n");

  return renderLayout(
    "compat demo catalog",
    `
      <h1>compat-check demo catalog</h1>
      <p>These pages are served by the local runner and are meant for Appium-driven iOS Simulator Safari checks.</p>
      <ul>${items}</ul>
    `,
  );
}

function startCompatServer(options = {}) {
  const port = options.port || 0;
  const manifest = loadDemoManifest();

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, "http://127.0.0.1");

    if (req.method === "GET" && requestUrl.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/demo/catalog") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(buildDemoCatalogHtml());
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/demo/")) {
      const slug = requestUrl.pathname.split("/").pop() || "ok";
      const pageDef = manifest[slug];
      const statusCode = pageDef ? 200 : 404;
      res.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
      res.end(pageDef ? buildDemoHtml(slug) : buildNotFoundHtml(slug));
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
      });
    });
  });
}

module.exports = {
  loadDemoManifest,
  startCompatServer,
};
