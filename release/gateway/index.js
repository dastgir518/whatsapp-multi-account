"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const create_gateway_1 = require("./create-gateway");
const PORT = Number(process.env.PORT || 4000);
const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";
const server = http_1.default.createServer();
const { app, sessions } = (0, create_gateway_1.createGateway)(server, {
    corsOrigin: WEB_ORIGIN,
});
server.on("request", app);
server.listen(PORT, async () => {
    console.log(`Gateway listening on http://localhost:${PORT}`);
    await sessions.restoreConnectedAccounts();
});
