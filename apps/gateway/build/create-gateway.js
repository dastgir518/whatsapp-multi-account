"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGateway = createGateway;
exports.isGatewayPath = isGatewayPath;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const socket_io_1 = require("socket.io");
const db_1 = require("@wma/db");
const auth_1 = require("./auth");
const paths_1 = require("./paths");
const session_manager_1 = require("./session-manager");
function param(value) {
    if (Array.isArray(value))
        return value[0] ?? "";
    return value ?? "";
}
function createGateway(httpServer, opts = {}) {
    (0, paths_1.ensureDataDirs)();
    const root = opts.rootDir || path_1.default.resolve(__dirname, "../../..");
    const corsOrigin = opts.corsOrigin ?? true;
    const app = (0, express_1.default)();
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: corsOrigin, credentials: true },
        path: "/socket.io",
    });
    const sessions = new session_manager_1.SessionManager(io);
    const upload = (0, multer_1.default)({ dest: path_1.default.join(root, "media", "_uploads") });
    app.use((0, cors_1.default)({ origin: corsOrigin, credentials: true }));
    app.use(express_1.default.json());
    app.use("/media", express_1.default.static(path_1.default.resolve(root, process.env.MEDIA_DIR || "media")));
    async function authMiddleware(req, res, next) {
        const header = req.headers.authorization;
        const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
        if (!token) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const payload = await (0, auth_1.verifyToken)(token);
        if (!payload) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        req.user = payload;
        next();
    }
    async function assertAccountOwner(userId, accountId) {
        return db_1.prisma.waAccount.findFirst({
            where: { id: accountId, userId },
        });
    }
    app.get("/health", (_req, res) => {
        res.json({ ok: true, mode: "gateway" });
    });
    app.get("/invites/:token", async (req, res) => {
        try {
            const account = await db_1.prisma.waAccount.findUnique({
                where: { inviteToken: param(req.params.token) },
            });
            if (!account) {
                res.status(404).json({ error: "Invite not found" });
                return;
            }
            const link = sessions.getLinkState(account.id);
            res.json({
                phone: account.phone,
                status: account.status,
                pushName: account.pushName,
                accountId: account.id,
                qr: link?.qr ?? null,
                pairingCode: link?.pairingCode ?? null,
            });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to load invite" });
        }
    });
    app.post("/invites/:token/start", async (req, res) => {
        try {
            const account = await db_1.prisma.waAccount.findUnique({
                where: { inviteToken: param(req.params.token) },
            });
            if (!account) {
                res.status(404).json({ error: "Invite not found" });
                return;
            }
            if (account.status === "connected") {
                res.json({ ok: true, status: "connected", accountId: account.id });
                return;
            }
            await sessions.startSession(account.id);
            await new Promise((r) => setTimeout(r, 1500));
            const link = sessions.getLinkState(account.id);
            const fresh = await db_1.prisma.waAccount.findUnique({
                where: { id: account.id },
            });
            res.json({
                ok: true,
                accountId: account.id,
                status: fresh?.status ?? account.status,
                qr: link?.qr ?? null,
                pairingCode: link?.pairingCode ?? null,
            });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to start invite session" });
        }
    });
    app.post("/invites/:token/refresh", async (req, res) => {
        try {
            const account = await db_1.prisma.waAccount.findUnique({
                where: { inviteToken: param(req.params.token) },
            });
            if (!account) {
                res.status(404).json({ error: "Invite not found" });
                return;
            }
            await sessions.refreshLink(account.id);
            await new Promise((r) => setTimeout(r, 2000));
            const link = sessions.getLinkState(account.id);
            res.json({
                ok: true,
                accountId: account.id,
                status: "pending",
                qr: link?.qr ?? null,
                pairingCode: link?.pairingCode ?? null,
            });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to refresh invite" });
        }
    });
    app.post("/accounts/:accountId/start", authMiddleware, async (req, res) => {
        try {
            const user = req.user;
            const account = await assertAccountOwner(user.userId, param(req.params.accountId));
            if (!account) {
                res.status(404).json({ error: "Account not found" });
                return;
            }
            await sessions.startSession(account.id);
            res.json({ ok: true, accountId: account.id });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to start session" });
        }
    });
    app.post("/accounts/:accountId/disconnect", authMiddleware, async (req, res) => {
        try {
            const user = req
                .user;
            const account = await assertAccountOwner(user.userId, param(req.params.accountId));
            if (!account) {
                res.status(404).json({ error: "Account not found" });
                return;
            }
            const logout = Boolean(req.body?.logout);
            await sessions.disconnectAccount(account.id, logout);
            res.json({ ok: true });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to disconnect" });
        }
    });
    app.post("/accounts/:accountId/send-text", authMiddleware, async (req, res) => {
        try {
            const user = req
                .user;
            const account = await assertAccountOwner(user.userId, param(req.params.accountId));
            if (!account) {
                res.status(404).json({ error: "Account not found" });
                return;
            }
            const { jid, text } = req.body;
            if (!jid || !text?.trim()) {
                res.status(400).json({ error: "jid and text required" });
                return;
            }
            await sessions.sendText(account.id, jid, text.trim());
            res.json({ ok: true });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message || "Send failed" });
        }
    });
    app.post("/accounts/:accountId/send-media", authMiddleware, upload.single("file"), async (req, res) => {
        try {
            const user = req
                .user;
            const account = await assertAccountOwner(user.userId, param(req.params.accountId));
            if (!account) {
                res.status(404).json({ error: "Account not found" });
                return;
            }
            const jid = String(req.body.jid || "");
            const caption = req.body.caption ? String(req.body.caption) : undefined;
            if (!jid || !req.file) {
                res.status(400).json({ error: "jid and file required" });
                return;
            }
            await sessions.sendMedia(account.id, jid, req.file.path, req.file.mimetype, req.file.originalname, caption);
            res.json({ ok: true });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message || "Send failed" });
        }
    });
    app.post("/accounts/:accountId/mark-read", authMiddleware, async (req, res) => {
        try {
            const user = req
                .user;
            const account = await assertAccountOwner(user.userId, param(req.params.accountId));
            if (!account) {
                res.status(404).json({ error: "Account not found" });
                return;
            }
            const { jid, messageIds } = req.body;
            if (!jid || !Array.isArray(messageIds)) {
                res.status(400).json({ error: "jid and messageIds required" });
                return;
            }
            await sessions.markRead(account.id, jid, messageIds);
            res.json({ ok: true });
        }
        catch (err) {
            console.error(err);
            res
                .status(500)
                .json({ error: err.message || "Mark read failed" });
        }
    });
    app.post("/accounts/:accountId/delete-message", authMiddleware, async (req, res) => {
        try {
            const user = req
                .user;
            const account = await assertAccountOwner(user.userId, param(req.params.accountId));
            if (!account) {
                res.status(404).json({ error: "Account not found" });
                return;
            }
            const { messageId, forEveryone } = req.body;
            if (!messageId) {
                res.status(400).json({ error: "messageId required" });
                return;
            }
            await sessions.deleteMessage(account.id, messageId, Boolean(forEveryone));
            res.json({ ok: true });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({
                error: err.message || "Delete message failed",
            });
        }
    });
    io.use(async (socket, next) => {
        try {
            const inviteToken = socket.handshake.auth?.inviteToken;
            if (inviteToken) {
                const account = await db_1.prisma.waAccount.findUnique({
                    where: { inviteToken },
                });
                if (!account)
                    return next(new Error("Invalid invite"));
                socket.data.invite = {
                    token: inviteToken,
                    accountId: account.id,
                };
                return next();
            }
            const token = socket.handshake.auth?.token ||
                socket.handshake.headers.authorization?.replace("Bearer ", "");
            if (!token)
                return next(new Error("Unauthorized"));
            const payload = await (0, auth_1.verifyToken)(token);
            if (!payload)
                return next(new Error("Unauthorized"));
            socket.data.user = payload;
            next();
        }
        catch {
            next(new Error("Unauthorized"));
        }
    });
    io.on("connection", (socket) => {
        const invite = socket.data.invite;
        const user = socket.data.user;
        if (invite) {
            socket.join(`invite:${invite.token}`);
            socket.join(`account:${invite.accountId}`);
            const pushLinkState = () => {
                const link = sessions.getLinkState(invite.accountId);
                if (link?.qr) {
                    socket.emit("account:qr", {
                        accountId: invite.accountId,
                        qr: link.qr,
                    });
                }
                if (link?.pairingCode) {
                    socket.emit("account:pairing-code", {
                        accountId: invite.accountId,
                        code: link.pairingCode,
                    });
                }
            };
            socket.on("invite:start", async () => {
                try {
                    await sessions.startSession(invite.accountId);
                    pushLinkState();
                }
                catch (err) {
                    socket.emit("account:error", {
                        accountId: invite.accountId,
                        message: err.message,
                    });
                }
            });
            socket.on("invite:refresh", async () => {
                try {
                    await sessions.refreshLink(invite.accountId);
                    pushLinkState();
                }
                catch (err) {
                    socket.emit("account:error", {
                        accountId: invite.accountId,
                        message: err.message,
                    });
                }
            });
            pushLinkState();
            if (!sessions.getSession(invite.accountId)?.sock) {
                void sessions.startSession(invite.accountId).then(pushLinkState);
            }
            return;
        }
        if (!user)
            return;
        socket.join(`user:${user.userId}`);
        socket.on("account:subscribe", async (accountId) => {
            const account = await db_1.prisma.waAccount.findFirst({
                where: { id: accountId, userId: user.userId },
            });
            if (!account)
                return;
            socket.join(`account:${accountId}`);
            if (!sessions.getSession(accountId)?.sock &&
                account.status !== "pending") {
                void sessions.startSession(accountId);
            }
        });
        socket.on("account:unsubscribe", (accountId) => {
            socket.leave(`account:${accountId}`);
        });
        socket.on("account:start", async (accountId) => {
            const account = await db_1.prisma.waAccount.findFirst({
                where: { id: accountId, userId: user.userId },
            });
            if (!account)
                return;
            socket.join(`account:${accountId}`);
            try {
                await sessions.startSession(accountId);
            }
            catch (err) {
                socket.emit("account:error", {
                    accountId,
                    message: err.message,
                });
            }
        });
    });
    (0, paths_1.mediaDir)("_uploads");
    return { app, io, sessions };
}
/** Paths handled by the WhatsApp gateway (not Next.js). */
function isGatewayPath(urlPath) {
    return (urlPath.startsWith("/health") ||
        urlPath.startsWith("/media") ||
        urlPath.startsWith("/invites") ||
        urlPath.startsWith("/accounts/") ||
        urlPath.startsWith("/socket.io"));
}
