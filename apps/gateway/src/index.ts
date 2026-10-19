import "dotenv/config";
import http from "http";
import { createGateway } from "./create-gateway";

const PORT = Number(process.env.PORT || 4000);
const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";

const server = http.createServer();
const { app, sessions } = createGateway(server, {
  corsOrigin: WEB_ORIGIN,
});

server.on("request", app);

server.listen(PORT, async () => {
  console.log(`Gateway listening on http://localhost:${PORT}`);
  await sessions.restoreConnectedAccounts();
});
