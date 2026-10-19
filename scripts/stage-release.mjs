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

// Point Next at staged output by also mirroring into apps/web/next-build
// is already the source; host will prefer RELEASE_WEB if set.

fs.writeFileSync(
  path.join(release, "READY"),
  new Date().toISOString() + "\n"
);
console.log("[stage-release] done");
