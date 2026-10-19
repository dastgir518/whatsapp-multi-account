#!/usr/bin/env node
/**
 * Hostinger entry file — set Entry file to: server.js
 *
 * Hostinger often strips `.next` / `dist` when publishing to /nodejs.
 * We build into `next-build` + `build` (non-hidden) and rebuild here if missing.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

process.env.NODE_ENV = process.env.NODE_ENV || "production";

const root = __dirname;

try {
  require("dotenv").config({ path: path.join(root, ".env") });
} catch {
  /* optional */
}

const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(root, "auth"), { recursive: true });
fs.mkdirSync(path.join(root, "media"), { recursive: true });
const dbFile = path.join(dataDir, "app.db");
if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.startsWith("file:./") ||
  process.env.DATABASE_URL.includes("file:data")
) {
  process.env.DATABASE_URL = `file:${dbFile}`;
}

const hostEntry = path.join(root, "apps", "host", "build", "index.js");
const gatewayEntry = path.join(
  root,
  "apps",
  "gateway",
  "build",
  "create-gateway.js"
);
const webNext = path.join(root, "apps", "web", "next-build");

function exists(p) {
  return fs.existsSync(p);
}

console.log("[server.js] cwd=", process.cwd());
console.log("[server.js] root=", root);
console.log("[server.js] PORT=", process.env.PORT || "(unset)");
console.log("[server.js] DATABASE_URL=", process.env.DATABASE_URL);
console.log("[server.js] hostEntry exists=", exists(hostEntry));
console.log("[server.js] gatewayEntry exists=", exists(gatewayEntry));
console.log("[server.js] web next-build exists=", exists(webNext));

if (!exists(hostEntry) || !exists(gatewayEntry) || !exists(webNext)) {
  console.log(
    "[server.js] Build artifacts missing in /nodejs — running npm run build now…"
  );
  try {
    execSync("npm run build", {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
  } catch (err) {
    console.error("[server.js] FATAL: npm run build failed", err);
    process.exit(1);
  }
  console.log("[server.js] hostEntry exists=", exists(hostEntry));
  console.log("[server.js] gatewayEntry exists=", exists(gatewayEntry));
  console.log("[server.js] web next-build exists=", exists(webNext));
}

if (!exists(hostEntry)) {
  console.error("[server.js] FATAL: apps/host/build/index.js still missing");
  process.exit(1);
}

if (!exists(webNext)) {
  console.error("[server.js] FATAL: apps/web/next-build still missing");
  process.exit(1);
}

require(hostEntry);
