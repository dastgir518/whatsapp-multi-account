#!/usr/bin/env node
/**
 * Hostinger / production entry.
 * Requires: npm run build (standalone Next.js output).
 */
const path = require("path");
const fs = require("fs");

const standaloneWeb = path.join(
  __dirname,
  "apps",
  "web",
  ".next",
  "standalone",
  "apps",
  "web"
);
const serverPath = path.join(standaloneWeb, "server.js");

if (!fs.existsSync(serverPath)) {
  console.error(
    "Missing standalone server. Run `npm run build` first (output: standalone)."
  );
  process.exit(1);
}

process.env.PORT = process.env.PORT || process.env.WEB_PORT || "3000";
process.chdir(standaloneWeb);
require(serverPath);
