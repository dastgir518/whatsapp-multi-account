import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../../..");

export function authDir(userId: string, accountId: string) {
  const dir = path.resolve(
    root,
    process.env.AUTH_DIR || "auth",
    userId,
    accountId
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Wipe Baileys session files so pairing can start clean. */
export function clearAuthDir(userId: string, accountId: string) {
  const dir = path.resolve(
    root,
    process.env.AUTH_DIR || "auth",
    userId,
    accountId
  );
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function mediaDir(accountId: string) {
  const dir = path.resolve(root, process.env.MEDIA_DIR || "media", accountId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureDataDirs() {
  fs.mkdirSync(path.resolve(root, "data"), { recursive: true });
  fs.mkdirSync(path.resolve(root, process.env.AUTH_DIR || "auth"), {
    recursive: true,
  });
  fs.mkdirSync(path.resolve(root, process.env.MEDIA_DIR || "media"), {
    recursive: true,
  });
}
