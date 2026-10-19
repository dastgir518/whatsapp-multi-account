#!/usr/bin/env node
/**
 * Hostinger entry file — MUST be set in hPanel as Entry file: server.js
 *
 * Framework: Express (or Other)
 * Build: build
 * Entry: server.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = process.env.NODE_ENV || "production";

const root = __dirname;

try {
  require("dotenv").config({ path: path.join(root, ".env") });
} catch {
  /* optional */
}

// Absolute SQLite path (Hostinger-safe)
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

const hostEntry = path.join(root, "apps", "host", "dist", "index.js");
const webNext = path.join(root, "apps", "web", ".next");

console.log("[server.js] cwd=", process.cwd());
console.log("[server.js] root=", root);
console.log("[server.js] PORT=", process.env.PORT || "(unset)");
console.log("[server.js] DATABASE_URL=", process.env.DATABASE_URL);
console.log("[server.js] hostEntry exists=", fs.existsSync(hostEntry));
console.log("[server.js] web .next exists=", fs.existsSync(webNext));

if (!fs.existsSync(hostEntry)) {
  console.error("[server.js] FATAL: apps/host/dist/index.js missing — build failed?");
  process.exit(1);
}

if (!fs.existsSync(webNext)) {
  console.error("[server.js] FATAL: apps/web/.next missing — next build failed?");
  process.exit(1);
}

require(hostEntry);
