import cors from "cors";
import express from "express";
import type { Server as HttpServer } from "http";
import multer from "multer";
import path from "path";
import { Server } from "socket.io";
import { prisma } from "@wma/db";
import { verifyToken } from "./auth";
import { ensureDataDirs, mediaDir } from "./paths";
import { SessionManager } from "./session-manager";

export type GatewayOptions = {
  /** Allowed browser origin(s). Use true to reflect request origin (same-host deploy). */
  corsOrigin?: string | string[] | boolean;
  rootDir?: string;
};

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function createGateway(httpServer: HttpServer, opts: GatewayOptions = {}) {
  ensureDataDirs();

  const root = opts.rootDir || path.resolve(__dirname, "../../..");
  const corsOrigin = opts.corsOrigin ?? true;

  const app = express();
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    path: "/socket.io",
  });

  const sessions = new SessionManager(io);
  const upload = multer({ dest: path.join(root, "media", "_uploads") });

  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(
    "/media",
    express.static(path.resolve(root, process.env.MEDIA_DIR || "media"))
  );

  async function authMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const payload = await verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as express.Request & { user: typeof payload }).user = payload;
    next();
  }

  async function assertAccountOwner(userId: string, accountId: string) {
    return prisma.waAccount.findFirst({
      where: { id: accountId, userId },
    });
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, mode: "gateway" });
  });

  app.get("/invites/:token", async (req, res) => {
    try {
      const account = await prisma.waAccount.findUnique({
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load invite" });
    }
  });

  app.post("/invites/:token/start", async (req, res) => {
    try {
      const account = await prisma.waAccount.findUnique({
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
      const fresh = await prisma.waAccount.findUnique({
        where: { id: account.id },
      });
      res.json({
        ok: true,
        accountId: account.id,
        status: fresh?.status ?? account.status,
        qr: link?.qr ?? null,
        pairingCode: link?.pairingCode ?? null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start invite session" });
    }
  });

  app.post("/invites/:token/refresh", async (req, res) => {
    try {
      const account = await prisma.waAccount.findUnique({
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to refresh invite" });
    }
  });

  app.post("/accounts/:accountId/start", authMiddleware, async (req, res) => {
    try {
      const user = (req as express.Request & { user: { userId: string } }).user;
      const account = await assertAccountOwner(
        user.userId,
        param(req.params.accountId)
      );
      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      await sessions.startSession(account.id);
      res.json({ ok: true, accountId: account.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start session" });
    }
  });

  app.post(
    "/accounts/:accountId/disconnect",
    authMiddleware,
    async (req, res) => {
      try {
        const user = (req as express.Request & { user: { userId: string } })
          .user;
        const account = await assertAccountOwner(
          user.userId,
          param(req.params.accountId)
        );
        if (!account) {
          res.status(404).json({ error: "Account not found" });
          return;
        }
        const logout = Boolean(req.body?.logout);
        await sessions.disconnectAccount(account.id, logout);
        res.json({ ok: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to disconnect" });
      }
    }
  );

  app.post(
    "/accounts/:accountId/send-text",
    authMiddleware,
    async (req, res) => {
      try {
        const user = (req as express.Request & { user: { userId: string } })
          .user;
        const account = await assertAccountOwner(
          user.userId,
          param(req.params.accountId)
        );
        if (!account) {
          res.status(404).json({ error: "Account not found" });
          return;
        }
        const { jid, text } = req.body as { jid?: string; text?: string };
        if (!jid || !text?.trim()) {
          res.status(400).json({ error: "jid and text required" });
          return;
        }
        await sessions.sendText(account.id, jid, text.trim());
        res.json({ ok: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: (err as Error).message || "Send failed" });
      }
    }
  );

  app.post(
    "/accounts/:accountId/send-media",
    authMiddleware,
    upload.single("file"),
    async (req, res) => {
      try {
        const user = (req as express.Request & { user: { userId: string } })
          .user;
        const account = await assertAccountOwner(
          user.userId,
          param(req.params.accountId)
        );
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
        await sessions.sendMedia(
          account.id,
          jid,
          req.file.path,
          req.file.mimetype,
          req.file.originalname,
          caption
        );
        res.json({ ok: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: (err as Error).message || "Send failed" });
      }
    }
  );

  app.post(
    "/accounts/:accountId/mark-read",
    authMiddleware,
    async (req, res) => {
      try {
        const user = (req as express.Request & { user: { userId: string } })
          .user;
        const account = await assertAccountOwner(
          user.userId,
          param(req.params.accountId)
        );
        if (!account) {
          res.status(404).json({ error: "Account not found" });
          return;
        }
        const { jid, messageIds } = req.body as {
          jid?: string;
          messageIds?: string[];
        };
        if (!jid || !Array.isArray(messageIds)) {
          res.status(400).json({ error: "jid and messageIds required" });
          return;
        }
        await sessions.markRead(account.id, jid, messageIds);
        res.json({ ok: true });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ error: (err as Error).message || "Mark read failed" });
      }
    }
  );

  app.post(
    "/accounts/:accountId/delete-message",
    authMiddleware,
    async (req, res) => {
      try {
        const user = (req as express.Request & { user: { userId: string } })
          .user;
        const account = await assertAccountOwner(
          user.userId,
          param(req.params.accountId)
        );
        if (!account) {
          res.status(404).json({ error: "Account not found" });
          return;
        }
        const { messageId, forEveryone } = req.body as {
          messageId?: string;
          forEveryone?: boolean;
        };
        if (!messageId) {
          res.status(400).json({ error: "messageId required" });
          return;
        }
        await sessions.deleteMessage(
          account.id,
          messageId,
          Boolean(forEveryone)
        );
        res.json({ ok: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({
          error: (err as Error).message || "Delete message failed",
        });
      }
    }
  );

  io.use(async (socket, next) => {
    try {
      const inviteToken = socket.handshake.auth?.inviteToken as
        | string
        | undefined;
      if (inviteToken) {
        const account = await prisma.waAccount.findUnique({
          where: { inviteToken },
        });
        if (!account) return next(new Error("Invalid invite"));
        socket.data.invite = {
          token: inviteToken,
          accountId: account.id,
        };
        return next();
      }

      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization?.replace("Bearer ", "") as
          | string
          | undefined);
      if (!token) return next(new Error("Unauthorized"));
      const payload = await verifyToken(token);
      if (!payload) return next(new Error("Unauthorized"));
      socket.data.user = payload;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const invite = socket.data.invite as
      | { token: string; accountId: string }
      | undefined;
    const user = socket.data.user as
      | { userId: string; email: string }
      | undefined;

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
        } catch (err) {
          socket.emit("account:error", {
            accountId: invite.accountId,
            message: (err as Error).message,
          });
        }
      });

      socket.on("invite:refresh", async () => {
        try {
          await sessions.refreshLink(invite.accountId);
          pushLinkState();
        } catch (err) {
          socket.emit("account:error", {
            accountId: invite.accountId,
            message: (err as Error).message,
          });
        }
      });

      pushLinkState();
      if (!sessions.getSession(invite.accountId)?.sock) {
        void sessions.startSession(invite.accountId).then(pushLinkState);
      }
      return;
    }

    if (!user) return;
    socket.join(`user:${user.userId}`);

    socket.on("account:subscribe", async (accountId: string) => {
      const account = await prisma.waAccount.findFirst({
        where: { id: accountId, userId: user.userId },
      });
      if (!account) return;
      socket.join(`account:${accountId}`);
      if (
        !sessions.getSession(accountId)?.sock &&
        account.status !== "pending"
      ) {
        void sessions.startSession(accountId);
      }
    });

    socket.on("account:unsubscribe", (accountId: string) => {
      socket.leave(`account:${accountId}`);
    });

    socket.on("account:start", async (accountId: string) => {
      const account = await prisma.waAccount.findFirst({
        where: { id: accountId, userId: user.userId },
      });
      if (!account) return;
      socket.join(`account:${accountId}`);
      try {
        await sessions.startSession(accountId);
      } catch (err) {
        socket.emit("account:error", {
          accountId,
          message: (err as Error).message,
        });
      }
    });
  });

  mediaDir("_uploads");

  return { app, io, sessions };
}

/** Paths handled by the WhatsApp gateway (not Next.js). */
export function isGatewayPath(urlPath: string) {
  return (
    urlPath.startsWith("/health") ||
    urlPath.startsWith("/media") ||
    urlPath.startsWith("/invites") ||
    urlPath.startsWith("/accounts/") ||
    urlPath.startsWith("/socket.io")
  );
}
