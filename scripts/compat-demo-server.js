#!/usr/bin/env node

const { startCompatServer } = require("./compat-demo-server-lib");

function parseArgs(argv) {
  const args = {
    port: 4173,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      args.port = Number(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = await startCompatServer({ port: args.port });

  process.stdout.write("\n");
  process.stdout.write("compat demo server is running\n");
  process.stdout.write(`- base url:   http://127.0.0.1:${server.port}\n`);
  process.stdout.write(`- catalog:    http://127.0.0.1:${server.port}/demo/catalog\n`);
  process.stdout.write("available pages:\n");

  for (const [slug, pageDef] of Object.entries(server.manifest)) {
    process.stdout.write(
      `  - ${slug.padEnd(20)} ${pageDef.expectedStatus.padEnd(10)} ${pageDef.description}\n`,
    );
  }

  process.stdout.write("\nPress Ctrl+C to stop.\n");

  const shutdown = async () => {
    process.stdout.write("\nStopping compat demo server...\n");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
