"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const db_1 = require("@wma/db");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pino_1 = __importDefault(require("pino"));
const qrcode_1 = __importDefault(require("qrcode"));
const message_utils_1 = require("./message-utils");
const paths_1 = require("./paths");
const logger = (0, pino_1.default)({ level: process.env.LOG_LEVEL || "info" });
class SessionManager {
    sessions = new Map();
    starting = new Map();
    io;
    constructor(io) {
        this.io = io;
    }
    emitToAccount(accountId, event, payload) {
        this.io.to(`account:${accountId}`).emit(event, payload);
        const session = this.sessions.get(accountId);
        if (session?.inviteToken) {
            this.io.to(`invite:${session.inviteToken}`).emit(event, payload);
        }
    }
    emitToUser(userId, event, payload) {
        this.io.to(`user:${userId}`).emit(event, payload);
    }
    getSession(accountId) {
        return this.sessions.get(accountId);
    }
    getLinkState(accountId) {
        const session = this.sessions.get(accountId);
        if (!session)
            return null;
        return {
            qr: session.lastQr,
            pairingCode: session.lastPairingCode,
            connected: Boolean(session.sock?.user),
        };
    }
    async restoreConnectedAccounts() {
        const accounts = await db_1.prisma.waAccount.findMany({
            where: { status: "connected" },
        });
        for (const account of accounts) {
            const dir = (0, paths_1.authDir)(account.userId, account.id);
            if (fs_1.default.existsSync(path_1.default.join(dir, "creds.json"))) {
                void this.startSession(account.id);
            }
            else {
                await db_1.prisma.waAccount.update({
                    where: { id: account.id },
                    data: { status: "disconnected" },
                });
            }
        }
    }
    async startSession(accountId, opts) {
        const existing = this.sessions.get(accountId);
        if (existing?.sock && !opts?.force && !opts?.clearAuth) {
            return;
        }
        const inflight = this.starting.get(accountId);
        if (inflight && !opts?.force && !opts?.clearAuth) {
            await inflight;
            return;
        }
        const run = this._startSession(accountId, opts);
        this.starting.set(accountId, run);
        try {
            await run;
        }
        finally {
            this.starting.delete(accountId);
        }
    }
    /** Wipe auth + restart so the user gets a fresh QR / pairing code. */
    async refreshLink(accountId) {
        const account = await db_1.prisma.waAccount.findUnique({
            where: { id: accountId },
        });
        if (!account)
            throw new Error("Account not found");
        const existing = this.sessions.get(accountId);
        if (existing?.sock) {
            try {
                existing.sock.end(undefined);
            }
            catch {
                /* ignore */
            }
        }
        this.sessions.delete(accountId);
        (0, paths_1.clearAuthDir)(account.userId, account.id);
        await db_1.prisma.waAccount.update({
            where: { id: accountId },
            data: { status: "pending" },
        });
        await this.startSession(accountId, { force: true, clearAuth: true });
    }
    async _startSession(accountId, opts) {
        const account = await db_1.prisma.waAccount.findUnique({
            where: { id: accountId },
        });
        if (!account)
            throw new Error("Account not found");
        const existing = this.sessions.get(accountId);
        if (existing?.sock && !opts?.force && !opts?.clearAuth) {
            return;
        }
        if (existing?.sock) {
            try {
                existing.sock.end(undefined);
            }
            catch {
                /* ignore */
            }
        }
        if (opts?.clearAuth) {
            (0, paths_1.clearAuthDir)(account.userId, account.id);
        }
        const prevAttempts = existing?.reconnectAttempts ?? 0;
        const session = {
            accountId,
            userId: account.userId,
            phone: account.phone,
            inviteToken: account.inviteToken,
            sock: null,
            pairingRequested: false,
            restarting: false,
            lastQr: null,
            lastPairingCode: null,
            reconnectAttempts: prevAttempts,
        };
        this.sessions.set(accountId, session);
        const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)((0, paths_1.authDir)(account.userId, account.id));
        const { version } = await (0, baileys_1.fetchLatestBaileysVersion)();
        const sock = (0, baileys_1.default)({
            version,
            auth: {
                creds: state.creds,
                keys: (0, baileys_1.makeCacheableSignalKeyStore)(state.keys, logger),
            },
            logger,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
        });
        session.sock = sock;
        sock.ev.on("creds.update", saveCreds);
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                const qrDataUrl = await qrcode_1.default.toDataURL(qr);
                session.lastQr = qrDataUrl;
                this.emitToAccount(accountId, "account:qr", {
                    accountId,
                    qr: qrDataUrl,
                });
                if (!sock.authState.creds.registered && !session.pairingRequested) {
                    session.pairingRequested = true;
                    try {
                        // Baileys needs the socket fully ready before requesting a code
                        await new Promise((r) => setTimeout(r, 1500));
                        if (!session.sock)
                            return;
                        const phone = account.phone.replace(/\D/g, "");
                        const code = await sock.requestPairingCode(phone);
                        session.lastPairingCode = code;
                        this.emitToAccount(accountId, "account:pairing-code", {
                            accountId,
                            code,
                        });
                    }
                    catch (err) {
                        logger.error({ err, accountId }, "Failed to request pairing code");
                        session.pairingRequested = false;
                        this.emitToAccount(accountId, "account:error", {
                            accountId,
                            message: "Could not create pairing code. Tap Refresh code and try again.",
                        });
                    }
                }
            }
            if (connection === "open") {
                session.reconnectAttempts = 0;
                session.lastQr = null;
                session.lastPairingCode = null;
                const phone = sock.user?.id?.split(":")[0] ||
                    sock.user?.id?.split("@")[0] ||
                    account.phone;
                const pushName = sock.user?.name || account.pushName || null;
                await db_1.prisma.waAccount.update({
                    where: { id: accountId },
                    data: {
                        status: "connected",
                        phone,
                        pushName,
                        lastSeenAt: new Date(),
                    },
                });
                this.emitToUser(account.userId, "account:status", {
                    accountId,
                    status: "connected",
                    phone,
                    pushName,
                });
                this.emitToAccount(accountId, "account:connected", {
                    accountId,
                    phone,
                    pushName,
                });
                await this.syncChats(accountId);
            }
            if (connection === "close") {
                const err = lastDisconnect?.error;
                const statusCode = err?.output?.statusCode;
                const errMsg = String(err?.message ||
                    err?.message ||
                    "");
                // Baileys often reports generic "Connection Failure" with status 401,
                // which is the same code as loggedOut — do not treat those as logout.
                const connectionFailure = /connection failure/i.test(errMsg);
                const loggedOut = statusCode === baileys_1.DisconnectReason.loggedOut &&
                    !connectionFailure &&
                    /logged out/i.test(errMsg);
                const wasPending = account.status === "pending" || !sock.authState.creds.registered;
                const badSession = statusCode === baileys_1.DisconnectReason.badSession ||
                    statusCode === baileys_1.DisconnectReason.multideviceMismatch ||
                    /invalid account signature/i.test(errMsg) ||
                    /QR refs attempts ended/i.test(errMsg) ||
                    // Connection Failure while still pairing almost always means corrupt/partial auth
                    (connectionFailure && wasPending);
                const replaced = statusCode === baileys_1.DisconnectReason.connectionReplaced;
                const restartRequired = statusCode === baileys_1.DisconnectReason.restartRequired;
                logger.warn({
                    accountId,
                    statusCode,
                    errMsg,
                    badSession,
                    replaced,
                    loggedOut,
                    connectionFailure,
                }, "WhatsApp connection closed");
                session.sock = null;
                session.lastQr = null;
                session.lastPairingCode = null;
                await db_1.prisma.waAccount.update({
                    where: { id: accountId },
                    data: {
                        status: wasPending ? "pending" : "disconnected",
                        lastSeenAt: new Date(),
                    },
                });
                this.emitToUser(account.userId, "account:status", {
                    accountId,
                    status: "disconnected",
                    loggedOut,
                    reason: errMsg || statusCode,
                });
                if (replaced || loggedOut) {
                    if (loggedOut)
                        (0, paths_1.clearAuthDir)(account.userId, accountId);
                    this.sessions.delete(accountId);
                    this.emitToAccount(accountId, "account:error", {
                        accountId,
                        message: loggedOut
                            ? "Logged out from phone. Create a new invite to link again."
                            : "Session replaced by another connection. Refresh the invite page.",
                    });
                    return;
                }
                // Pending / broken pairing → wipe auth and start a clean QR/code session
                if (badSession || wasPending) {
                    if (session.restarting)
                        return;
                    if (session.reconnectAttempts >= 4) {
                        (0, paths_1.clearAuthDir)(account.userId, accountId);
                        this.sessions.delete(accountId);
                        this.emitToAccount(accountId, "account:error", {
                            accountId,
                            message: "Couldn’t finish linking. Tap “Refresh code” on the invite page, then try again on your phone.",
                        });
                        return;
                    }
                    session.restarting = true;
                    session.reconnectAttempts += 1;
                    (0, paths_1.clearAuthDir)(account.userId, accountId);
                    const delay = Math.min(2500 * session.reconnectAttempts, 12000);
                    setTimeout(() => {
                        session.restarting = false;
                        void this.startSession(accountId, {
                            force: true,
                            clearAuth: true,
                        });
                    }, delay);
                    return;
                }
                // Linked account: soft reconnect; after repeated Connection Failure, wipe & require re-link
                if (!session.restarting) {
                    if (connectionFailure && session.reconnectAttempts >= 3) {
                        (0, paths_1.clearAuthDir)(account.userId, accountId);
                        this.sessions.delete(accountId);
                        await db_1.prisma.waAccount.update({
                            where: { id: accountId },
                            data: { status: "disconnected" },
                        });
                        this.emitToAccount(accountId, "account:error", {
                            accountId,
                            message: "WhatsApp session expired. Create a new invite or re-link this account.",
                        });
                        return;
                    }
                    if (session.reconnectAttempts >= 8)
                        return;
                    session.restarting = true;
                    session.reconnectAttempts += 1;
                    const delay = restartRequired
                        ? 1000
                        : Math.min(3000 * session.reconnectAttempts, 20000);
                    setTimeout(() => {
                        session.restarting = false;
                        void this.startSession(accountId, { force: restartRequired });
                    }, delay);
                }
            }
        });
        sock.ev.on("contacts.update", async (updates) => {
            for (const contact of updates) {
                if (!contact.id || !contact.notify)
                    continue;
                await db_1.prisma.chat.updateMany({
                    where: { waAccountId: accountId, jid: contact.id },
                    data: { name: contact.notify },
                });
            }
            await this.syncChats(accountId);
        });
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify" && type !== "append")
                return;
            for (const msg of messages) {
                // Someone deleted for everyone (ProtocolMessage.Type.REVOKE = 0)
                const protoType = msg.message?.protocolMessage?.type;
                const revokedId = protoType === 0
                    ? msg.message?.protocolMessage?.key?.id
                    : null;
                if (revokedId && msg.key.remoteJid) {
                    const chat = await db_1.prisma.chat.findUnique({
                        where: {
                            waAccountId_jid: {
                                waAccountId: accountId,
                                jid: msg.key.remoteJid,
                            },
                        },
                    });
                    if (chat) {
                        const existing = await db_1.prisma.message.findFirst({
                            where: { chatId: chat.id, waMessageId: revokedId },
                        });
                        if (existing) {
                            await db_1.prisma.message.delete({ where: { id: existing.id } });
                            this.emitToAccount(accountId, "message:deleted", {
                                accountId,
                                chatId: chat.id,
                                messageId: existing.id,
                                waMessageId: revokedId,
                                forEveryone: true,
                            });
                        }
                    }
                    continue;
                }
                await this.handleIncomingMessage(accountId, msg);
            }
        });
        sock.ev.on("messages.update", async (updates) => {
            for (const u of updates) {
                if (!u.key?.id || !u.key.remoteJid)
                    continue;
                const chat = await db_1.prisma.chat.findUnique({
                    where: {
                        waAccountId_jid: {
                            waAccountId: accountId,
                            jid: u.key.remoteJid,
                        },
                    },
                });
                if (!chat)
                    continue;
                if (u.update.status != null) {
                    const statusMap = {
                        0: "error",
                        1: "pending",
                        2: "sent",
                        3: "delivered",
                        4: "read",
                        5: "played",
                    };
                    await db_1.prisma.message.updateMany({
                        where: { chatId: chat.id, waMessageId: u.key.id },
                        data: { status: statusMap[u.update.status] || String(u.update.status) },
                    });
                    this.emitToAccount(accountId, "message:update", {
                        accountId,
                        chatId: chat.id,
                        waMessageId: u.key.id,
                        status: statusMap[u.update.status] || String(u.update.status),
                    });
                }
            }
        });
    }
    async syncChats(accountId) {
        const session = this.sessions.get(accountId);
        if (!session?.sock)
            return;
        // Baileys does not expose a simple chat list API in all versions;
        // chats appear as messages arrive. Emit current DB chats.
        const chats = await db_1.prisma.chat.findMany({
            where: { waAccountId: accountId },
            orderBy: { lastMessageAt: "desc" },
        });
        this.emitToAccount(accountId, "chats:list", { accountId, chats });
    }
    async handleIncomingMessage(accountId, msg) {
        const jid = msg.key.remoteJid;
        if (!jid || jid === "status@broadcast")
            return;
        const waMessageId = msg.key.id;
        if (!waMessageId)
            return;
        const isGroup = jid.endsWith("@g.us");
        const fromMe = Boolean(msg.key.fromMe);
        const type = (0, message_utils_1.getMessageType)(msg.message);
        const body = (0, message_utils_1.getMessageBody)(msg.message);
        const timestamp = new Date(Number(msg.messageTimestamp || Date.now()) * 1000);
        let name = null;
        if (isGroup) {
            name = msg.message?.senderKeyDistributionMessage
                ? null
                : jid.split("@")[0];
        }
        else {
            name = msg.pushName || jid.split("@")[0] || null;
        }
        const chat = await db_1.prisma.chat.upsert({
            where: {
                waAccountId_jid: { waAccountId: accountId, jid },
            },
            create: {
                waAccountId: accountId,
                jid,
                name,
                isGroup,
                unreadCount: fromMe ? 0 : 1,
                lastMessageAt: timestamp,
                lastPreview: body,
            },
            update: {
                name: name || undefined,
                lastMessageAt: timestamp,
                lastPreview: body,
                unreadCount: fromMe ? undefined : { increment: 1 },
            },
        });
        let mediaPath = null;
        if ((0, message_utils_1.hasMedia)(type) && msg.message) {
            try {
                mediaPath = await this.saveMedia(accountId, msg, type);
            }
            catch (err) {
                logger.warn({ err, accountId, waMessageId }, "Media download failed");
            }
        }
        const message = await db_1.prisma.message.upsert({
            where: {
                chatId_waMessageId: { chatId: chat.id, waMessageId },
            },
            create: {
                chatId: chat.id,
                waMessageId,
                fromMe,
                senderJid: msg.key.participant || jid,
                type,
                body,
                mediaPath,
                timestamp,
                status: fromMe ? "sent" : null,
            },
            update: {
                body: body ?? undefined,
                mediaPath: mediaPath ?? undefined,
            },
        });
        this.emitToAccount(accountId, "message:new", {
            accountId,
            chat,
            message,
        });
    }
    async saveMedia(accountId, msg, type) {
        const session = this.sessions.get(accountId);
        if (!session?.sock || !msg.message)
            return null;
        const buffer = (await (0, baileys_1.downloadMediaMessage)(msg, "buffer", {}, {
            logger,
            reuploadRequest: session.sock.updateMediaMessage,
        }));
        const dir = (0, paths_1.mediaDir)(accountId);
        const ext = type === "image"
            ? "jpg"
            : type === "video"
                ? "mp4"
                : type === "audio"
                    ? "ogg"
                    : type === "document"
                        ? "bin"
                        : "bin";
        const filename = `${msg.key.id}.${ext}`;
        const filePath = path_1.default.join(dir, filename);
        fs_1.default.writeFileSync(filePath, buffer);
        return `${accountId}/${filename}`;
    }
    async sendText(accountId, jid, text) {
        const session = this.sessions.get(accountId);
        if (!session?.sock)
            throw new Error("Account not connected");
        const sent = await session.sock.sendMessage(jid, { text });
        if (sent)
            await this.handleIncomingMessage(accountId, sent);
        return sent;
    }
    async sendMedia(accountId, jid, filePath, mimeType, fileName, caption) {
        const session = this.sessions.get(accountId);
        if (!session?.sock)
            throw new Error("Account not connected");
        const buffer = fs_1.default.readFileSync(filePath);
        let content;
        if (mimeType.startsWith("image/")) {
            content = { image: buffer, caption };
        }
        else if (mimeType.startsWith("video/")) {
            content = { video: buffer, caption };
        }
        else if (mimeType.startsWith("audio/")) {
            content = { audio: buffer, mimetype: mimeType };
        }
        else {
            content = {
                document: buffer,
                mimetype: mimeType,
                fileName,
                caption,
            };
        }
        const sent = await session.sock.sendMessage(jid, content);
        if (sent)
            await this.handleIncomingMessage(accountId, sent);
        return sent;
    }
    async markRead(accountId, jid, messageIds) {
        const session = this.sessions.get(accountId);
        if (!session?.sock)
            throw new Error("Account not connected");
        const keys = messageIds.map((id) => ({
            remoteJid: jid,
            id,
            fromMe: false,
        }));
        await session.sock.readMessages(keys);
        const chat = await db_1.prisma.chat.findUnique({
            where: { waAccountId_jid: { waAccountId: accountId, jid } },
        });
        if (chat) {
            await db_1.prisma.chat.update({
                where: { id: chat.id },
                data: { unreadCount: 0 },
            });
            this.emitToAccount(accountId, "chat:updated", {
                accountId,
                chatId: chat.id,
                unreadCount: 0,
            });
        }
    }
    /**
     * Delete a message.
     * - forEveryone: revoke on WhatsApp (only works for your own messages within WA limits)
     * - otherwise: remove from our DB only (delete for me)
     */
    async deleteMessage(accountId, messageId, forEveryone = false) {
        const message = await db_1.prisma.message.findUnique({
            where: { id: messageId },
            include: { chat: true },
        });
        if (!message || message.chat.waAccountId !== accountId) {
            throw new Error("Message not found");
        }
        if (forEveryone) {
            const session = this.sessions.get(accountId);
            if (!session?.sock)
                throw new Error("Account not connected");
            if (!message.fromMe) {
                throw new Error("Can only delete others' messages for yourself");
            }
            await session.sock.sendMessage(message.chat.jid, {
                delete: {
                    remoteJid: message.chat.jid,
                    fromMe: true,
                    id: message.waMessageId,
                },
            });
        }
        await db_1.prisma.message.delete({ where: { id: message.id } });
        this.emitToAccount(accountId, "message:deleted", {
            accountId,
            chatId: message.chatId,
            messageId: message.id,
            waMessageId: message.waMessageId,
            forEveryone,
        });
        return { ok: true };
    }
    async disconnectAccount(accountId, logout = false) {
        const session = this.sessions.get(accountId);
        if (session?.sock) {
            try {
                if (logout)
                    await session.sock.logout();
                else
                    session.sock.end(undefined);
            }
            catch {
                /* ignore */
            }
        }
        this.sessions.delete(accountId);
        await db_1.prisma.waAccount.update({
            where: { id: accountId },
            data: { status: "disconnected", lastSeenAt: new Date() },
        });
    }
}
exports.SessionManager = SessionManager;
