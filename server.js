#!/usr/bin/env node
/**
 * Hostinger entry file (REQUIRED in hPanel).
 *
 * hPanel → Deployments → Settings:
 *   Application type : Express   (or Other)
 *   Build script     : build
 *   Entry file       : server.js   ← must not be empty
 *   Node.js          : 22
 *
 * If Entry file is empty, Hostinger serves no Node process → 403 Forbidden.
 */
"use strict";

const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = process.env.NODE_ENV || "production";

// Load root .env if present (optional; hPanel env vars also work)
try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch {
  /* dotenv may not resolve from root; host package loads it too */
}

const hostEntry = path.join(__dirname, "apps", "host", "dist", "index.js");

if (!fs.existsSync(hostEntry)) {
  console.error("[server.js] Missing apps/host/dist/index.js");
  console.error("[server.js] Build may have failed or Entry file points to wrong place.");
  console.error("[server.js] Expected after `npm run build`.");
  process.exit(1);
}

console.log("[server.js] Starting unified app (Next.js + WhatsApp gateway)...");
console.log("[server.js] PORT=", process.env.PORT || "(Hostinger will set PORT)");

require(hostEntry);
