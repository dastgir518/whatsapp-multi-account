/**
 * Copy build outputs into /release so Hostinger's publish step keeps them.
 * (It often drops `.next`, `dist`, and sometimes `*build*` folders.)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source to stage: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[stage-release] ${src} -> ${dest}`);
}

rimraf(release);
fs.mkdirSync(release, { recursive: true });

copyDir(
  path.join(root, "apps", "web", "next-build"),
  path.join(release, "web")
);
copyDir(
  path.join(root, "apps", "host", "build"),
  path.join(release, "host")
);
copyDir(
  path.join(root, "apps", "gateway", "build"),
  path.join(release, "gateway")
);

// Prisma client + Linux engines (Hostinger cannot download engines at runtime)
const prismaSrc = path.join(root, "node_modules", ".prisma", "client");
const prismaDest = path.join(release, "prisma");
if (!fs.existsSync(path.join(prismaSrc, "index.js"))) {
  throw new Error("Missing node_modules/.prisma/client — run prisma generate first");
}
fs.mkdirSync(prismaDest, { recursive: true });
for (const name of fs.readdirSync(prismaSrc)) {
  if (name.includes(".tmp") || name.includes("windows")) continue;
  fs.cpSync(path.join(prismaSrc, name), path.join(prismaDest, name), {
    recursive: true,
  });
}
console.log(`[stage-release] ${prismaSrc} -> ${prismaDest} (linux engines)`);

const dbTemplateSrc = path.join(root, "data", "app.db");
const dbTemplateDest = path.join(release, "app.db.template");
if (fs.existsSync(dbTemplateSrc)) {
  fs.copyFileSync(dbTemplateSrc, dbTemplateDest);
  console.log(`[stage-release] ${dbTemplateSrc} -> ${dbTemplateDest}`);
}

fs.writeFileSync(
  path.join(release, "READY"),
  new Date().toISOString() + "\n"
);
console.log("[stage-release] done");
