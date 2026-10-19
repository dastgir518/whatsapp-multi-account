/**
 * After Next.js standalone build, copy static assets so Hostinger
 * can run apps/web/.next/standalone/.../server.js correctly.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps", "web");
const nextDir = path.join(web, ".next");
const standaloneWeb = path.join(nextDir, "standalone", "apps", "web");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[prepare-standalone] skip missing: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[prepare-standalone] copied ${src} -> ${dest}`);
}

if (!fs.existsSync(path.join(nextDir, "standalone"))) {
  console.error(
    "[prepare-standalone] standalone output not found. Set output: 'standalone' in next.config."
  );
  process.exit(1);
}

fs.mkdirSync(path.join(standaloneWeb, ".next"), { recursive: true });
copyDir(path.join(nextDir, "static"), path.join(standaloneWeb, ".next", "static"));
copyDir(path.join(web, "public"), path.join(standaloneWeb, "public"));
console.log("[prepare-standalone] done — start with: node server.js");
