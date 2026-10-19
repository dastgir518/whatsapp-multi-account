#!/usr/bin/env node
/**
 * Hostinger entry point — single process:
 * Next.js + WhatsApp gateway + Socket.IO
 *
 * hPanel:
 *   Application type: Other
 *   Build script: build
 *   Entry file: server.js
 */
process.env.NODE_ENV = process.env.NODE_ENV || "production";

require("./apps/host/dist/index.js");
