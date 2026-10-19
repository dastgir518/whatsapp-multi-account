/**
 * Unified Hostinger-compatible server:
 * one Node process = Next.js UI + Baileys WhatsApp gateway + Socket.IO
 */
import "dotenv/config";
import http from "http";
import path from "path";
import next from "next";
import {
  createGateway,
  isGatewayPath,
} from "@wma/gateway/create-gateway";

const PORT = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== "production";
const webDir = path.resolve(__dirname, "../../web");

async function main() {
  const nextApp = next({
    dev,
    dir: webDir,
    hostname: "0.0.0.0",
    port: PORT,
  });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  const server = http.createServer();
  const { app: gatewayApp, sessions } = createGateway(server, {
    corsOrigin: true,
    rootDir: path.resolve(__dirname, "../../.."),
  });

  server.on("request", (req, res) => {
    const url = req.url || "/";
    const pathname = url.split("?")[0] || "/";

    if (isGatewayPath(pathname)) {
      gatewayApp(req, res);
      return;
    }

    void handle(req, res);
  });

  server.listen(PORT, "0.0.0.0", async () => {
    console.log(`Unified app listening on http://0.0.0.0:${PORT}`);
    console.log(`  Next.js UI + WhatsApp gateway (same process)`);
    await sessions.restoreConnectedAccounts();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
