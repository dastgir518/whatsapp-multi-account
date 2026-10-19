#!/usr/bin/env node
/**
 * Hostinger entry — Entry file must be: server.js
 *
 * Hostinger only keeps git-tracked files in /nodejs (plus node_modules).
 * Next build output is committed under /release/web.
 */
"use strict";

const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = process.env.NODE_ENV || "production";

const root = __dirname;
process.env.PROJECT_ROOT = root;
process.env.WEB_DIR = path.join(root, "apps", "web");

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

const releaseHost = path.join(root, "release", "host", "index.js");
const releaseWeb = path.join(root, "release", "web");
const appsHost = path.join(root, "apps", "host", "build", "index.js");
const nextBuild = path.join(root, "apps", "web", "next-build");

function exists(p) {
  return fs.existsSync(p);
}

console.log("[server.js] PORT=", process.env.PORT || "(unset)");
console.log("[server.js] release/host=", exists(releaseHost));
console.log("[server.js] release/web=", exists(releaseWeb));
console.log("[server.js] apps/host/build=", exists(appsHost));

// Materialize outputs Hostinger keeps in /release into paths the app expects
const releaseGateway = path.join(root, "release", "gateway");
const appsGateway = path.join(root, "apps", "gateway", "build");
const appsHostBuild = path.join(root, "apps", "host", "build");
const releaseHostDir = path.join(root, "release", "host");

if (exists(releaseWeb) && !exists(nextBuild)) {
  console.log("[server.js] copying release/web -> apps/web/next-build");
  fs.cpSync(releaseWeb, nextBuild, { recursive: true });
}
if (exists(releaseGateway) && !exists(path.join(appsGateway, "create-gateway.js"))) {
  console.log("[server.js] copying release/gateway -> apps/gateway/build");
  fs.cpSync(releaseGateway, appsGateway, { recursive: true });
}
if (exists(releaseHostDir) && !exists(appsHostBuild)) {
  console.log("[server.js] copying release/host -> apps/host/build");
  fs.cpSync(releaseHostDir, appsHostBuild, { recursive: true });
}

const hostEntry = exists(releaseHost) ? releaseHost : appsHost;

if (!exists(hostEntry)) {
  console.error("[server.js] FATAL: no host entry (release/host or apps/host/build)");
  process.exit(1);
}

if (!exists(nextBuild) && !exists(releaseWeb)) {
  console.error("[server.js] FATAL: no Next build (release/web missing — redeploy latest main)");
  process.exit(1);
}

console.log("[server.js] starting", hostEntry);
require(hostEntry);
