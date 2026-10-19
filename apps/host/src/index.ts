/**
 * Unified Hostinger-compatible server:
 * one Node process = Next.js UI + Baileys WhatsApp gateway + Socket.IO
 *
 * Important: bind PORT immediately so Hostinger does not return 503
 * while Next.js is still preparing.
 */
import "dotenv/config";
import fs from "fs";
import http from "http";
import path from "path";
import { execSync } from "child_process";
import next from "next";
import {
  createGateway,
  isGatewayPath,
} from "@wma/gateway/create-gateway";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const projectRoot = path.resolve(__dirname, "../../..");
const webDir = path.resolve(__dirname, "../../web");

function ensureRuntimeEnv() {
  fs.mkdirSync(path.join(projectRoot, "data"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "auth"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "media"), { recursive: true });

  const dbFile = path.join(projectRoot, "data", "app.db");
  const current = process.env.DATABASE_URL || "";
  if (!current || current.startsWith("file:./") || current.startsWith("file:data")) {
    process.env.DATABASE_URL = `file:${dbFile}`;
  }

  console.log("[host] projectRoot=", projectRoot);
  console.log("[host] DATABASE_URL=", process.env.DATABASE_URL);
  console.log("[host] webDir=", webDir);
  console.log(
    "[host] web next-build exists=",
    fs.existsSync(path.join(webDir, "next-build"))
  );
}

function ensureDatabase() {
  try {
    execSync("npx prisma db push --skip-generate", {
      cwd: path.join(projectRoot, "packages", "db"),
      env: process.env,
      stdio: "inherit",
    });
    console.log("[host] database schema synced");
  } catch (err) {
    console.error("[host] prisma db push failed (continuing):", err);
  }
}

async function main() {
  ensureRuntimeEnv();
  ensureDatabase();

  let ready = false;
  let handle: ReturnType<
    Awaited<ReturnType<typeof next>>["getRequestHandler"]
  > | null = null;
  let gatewayApp: ReturnType<typeof createGateway>["app"] | null = null;
  let bootError: string | null = null;

  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    const pathname = url.split("?")[0] || "/";

    if (pathname === "/health" || pathname === "/ready") {
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: ready,
          error: bootError,
          port: PORT,
        })
      );
      return;
    }

    if (!ready || !handle) {
      res.writeHead(503, {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "3",
      });
      res.end(
        `<!doctype html><html><body style="font-family:sans-serif;padding:2rem">
        <h1>Starting WhatsApp Hub…</h1>
        <p>The app is booting. Refresh in a few seconds.</p>
        <pre>${bootError ? String(bootError) : "Loading Next.js + WhatsApp gateway…"}</pre>
        <script>setTimeout(()=>location.reload(),3000)</script>
        </body></html>`
      );
      return;
    }

    if (gatewayApp && isGatewayPath(pathname)) {
      gatewayApp(req, res);
      return;
    }

    void handle(req, res);
  });

  // Bind immediately so Hostinger proxy finds an open port (avoids hard 503)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      console.log(`[host] listening on http://${HOST}:${PORT} (booting…)`);
      resolve();
    });
  });

  try {
    const nextApp = next({
      dev,
      dir: webDir,
      hostname: HOST,
      port: PORT,
      customServer: true,
    });
    handle = nextApp.getRequestHandler();
    await nextApp.prepare();
    console.log("[host] Next.js ready");

    const gateway = createGateway(server, {
      corsOrigin: true,
      rootDir: projectRoot,
    });
    gatewayApp = gateway.app;

    ready = true;
    console.log("[host] Unified app READY (Next.js + WhatsApp gateway)");

    void gateway.sessions.restoreConnectedAccounts().catch((err) => {
      console.error("[host] restore sessions failed:", err);
    });
  } catch (err) {
    bootError = err instanceof Error ? err.stack || err.message : String(err);
    console.error("[host] boot failed:", bootError);
    // Keep process alive so /health and startup HTML stay available for debugging
  }
}

main().catch((err) => {
  console.error("[host] fatal:", err);
  process.exit(1);
});
