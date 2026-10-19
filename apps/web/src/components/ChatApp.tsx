"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InviteModal } from "./InviteModal";
import { LinkAccountModal } from "./LinkAccountModal";
import { useSocket } from "@/hooks/useSocket";
import { publicGatewayUrl } from "@/lib/config";
import type { Chat, Message, WaAccount } from "@/lib/types";

type Props = {
  initialAccounts: WaAccount[];
  userEmail: string;
  token: string;
};

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function shortPhone(phone: string) {
  if (phone.length <= 4) return phone;
  return phone.slice(-4);
}

export function ChatApp({ initialAccounts, userEmail, token }: Props) {
  const router = useRouter();
  const { socket, connected } = useSocket(token);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialAccounts.find((a) => a.status === "connected")?.id ||
      initialAccounts[0]?.id ||
      null
  );
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const selectedChat = chats.find((c) => c.id === selectedChatId);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        c.jid.toLowerCase().includes(q) ||
        (c.lastPreview || "").toLowerCase().includes(q)
    );
  }, [chats, search]);

  const loadChats = useCallback(async (accountId: string) => {
    const res = await fetch(`/api/accounts/${accountId}/chats`);
    if (!res.ok) return;
    const data = await res.json();
    setChats(data.chats || []);
  }, []);

  useEffect(() => {
    if (!selectedAccountId) {
      setChats([]);
      setSelectedChatId(null);
      setMessages([]);
      return;
    }
    setSelectedChatId(null);
    setMessages([]);
    void loadChats(selectedAccountId);
    const s = socket.current;
    if (s) {
      s.emit("account:subscribe", selectedAccountId);
      s.emit("account:start", selectedAccountId);
    }
  }, [selectedAccountId, loadChats, socket]);

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    const onStatus = (payload: {
      accountId: string;
      status: string;
      phone?: string;
      pushName?: string | null;
    }) => {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === payload.accountId
            ? {
                ...a,
                status: payload.status,
                phone: payload.phone || a.phone,
                pushName:
                  payload.pushName !== undefined ? payload.pushName : a.pushName,
              }
            : a
        )
      );
    };

    const onChatsList = (payload: { accountId: string; chats: Chat[] }) => {
      if (payload.accountId !== selectedAccountId) return;
      setChats(payload.chats);
    };

    const onMessageNew = (payload: {
      accountId: string;
      chat: Chat;
      message: Message;
    }) => {
      if (payload.accountId !== selectedAccountId) return;
      setChats((prev) => {
        const others = prev.filter((c) => c.id !== payload.chat.id);
        return [payload.chat, ...others].sort((a, b) => {
          const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bt - at;
        });
      });
      if (selectedChatId === payload.chat.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.waMessageId === payload.message.waMessageId)) {
            return prev;
          }
          return [...prev, payload.message];
        });
      }
    };

    const onChatUpdated = (payload: {
      accountId: string;
      chatId: string;
      unreadCount: number;
    }) => {
      if (payload.accountId !== selectedAccountId) return;
      setChats((prev) =>
        prev.map((c) =>
          c.id === payload.chatId
            ? { ...c, unreadCount: payload.unreadCount }
            : c
        )
      );
    };

    const onMessageDeleted = (payload: {
      accountId: string;
      chatId: string;
      messageId: string;
    }) => {
      if (payload.accountId !== selectedAccountId) return;
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    };

    s.on("account:status", onStatus);
    s.on("chats:list", onChatsList);
    s.on("message:new", onMessageNew);
    s.on("chat:updated", onChatUpdated);
    s.on("message:deleted", onMessageDeleted);

    return () => {
      s.off("account:status", onStatus);
      s.off("chats:list", onChatsList);
      s.off("message:new", onMessageNew);
      s.off("chat:updated", onChatUpdated);
      s.off("message:deleted", onMessageDeleted);
    };
  }, [socket, selectedAccountId, selectedChatId, connected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openChat(chat: Chat) {
    if (!selectedAccountId) return;
    setSelectedChatId(chat.id);
    setMobileShowChat(true);

    const res = await fetch(
      `/api/accounts/${selectedAccountId}/chats/${chat.id}/messages`
    );
    if (!res.ok) return;
    const data = await res.json();
    const loaded: Message[] = data.messages || [];
    setMessages(loaded);
    if (data.chat) {
      setChats((prev) =>
        prev.map((c) => (c.id === chat.id ? { ...c, ...data.chat } : c))
      );
    }

    const ids = loaded.filter((m) => !m.fromMe).map((m) => m.waMessageId);
    if (ids.length) {
      await fetch(`/api/accounts/${selectedAccountId}/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: chat.jid, messageIds: ids }),
      });
      setChats((prev) =>
        prev.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c))
      );
    }
  }

  async function sendText() {
    if (!selectedAccountId || !selectedChat || !text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/accounts/${selectedAccountId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: selectedChat.jid, text }),
      });
      if (res.ok) setText("");
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    if (!selectedAccountId || !selectedChat || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("jid", selectedChat.jid);
      form.append("file", file);
      await fetch(`/api/accounts/${selectedAccountId}/send`, {
        method: "POST",
        body: form,
      });
    } finally {
      setSending(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("wma_token");
    router.push("/login");
    router.refresh();
  }

  async function removeAccount(accountId: string) {
    if (!confirm("Unlink this WhatsApp account?")) return;
    await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    if (selectedAccountId === accountId) {
      setSelectedAccountId(null);
    }
  }

  async function deleteInviteLink(accountId: string) {
    if (!confirm("Delete this public invite link? It will stop working immediately.")) {
      return;
    }
    const res = await fetch(`/api/accounts/${accountId}/invite`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Could not delete invite link");
      return;
    }
    const data = await res.json();
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId
          ? { ...a, ...(data.account || {}), inviteToken: null }
          : a
      )
    );
    setLastInviteUrl(null);
  }

  async function deleteMessage(message: Message) {
    if (!selectedAccountId) return;
    if (!confirm("Delete this message?")) return;

    const forEveryone = message.fromMe
      ? confirm("Also delete for everyone on WhatsApp?")
      : false;

    const qs = forEveryone ? "?forEveryone=1" : "";
    const res = await fetch(
      `/api/accounts/${selectedAccountId}/messages/${message.id}${qs}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not delete message");
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
  }

  function mediaUrl(mediaPath: string | null) {
    if (!mediaPath) return null;
    return `${publicGatewayUrl()}/media/${mediaPath}`;
  }

  return (
    <div className="app-shell">
      <aside className="accounts-rail">
        <div className="brand" title="WhatsApp Hub">
          WA
        </div>
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`account-avatar ${
              a.id === selectedAccountId ? "active" : ""
            }`}
            title={`${a.pushName || a.phone} (${a.status})`}
            onClick={() => {
              setSelectedAccountId(a.id);
              setMobileShowChat(false);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              void removeAccount(a.id);
            }}
          >
            {shortPhone(a.phone)}
            <span
              className={`dot ${
                a.status === "connected"
                  ? "online"
                  : a.status === "pending"
                    ? "pending"
                    : ""
              }`}
            />
          </button>
        ))}
        <button
          type="button"
          className="add-account"
          title="Link WhatsApp account"
          onClick={() => setLinkOpen(true)}
        >
          +
        </button>
        <button
          type="button"
          className="add-account"
          title="Create public invite"
          onClick={() => setInviteOpen(true)}
          style={{ fontSize: "0.65rem", fontWeight: 700 }}
        >
          Inv
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: 48, height: 48, padding: 0, fontSize: 11 }}
          title={`Logout (${userEmail})`}
          onClick={() => void logout()}
        >
          Out
        </button>
      </aside>

      <div className="main-columns">
        <section
          className={`chat-list-panel ${
            mobileShowChat ? "hidden-mobile" : ""
          }`}
        >
          <div className="panel-header">
            <div>
              <h2>
                {selectedAccount
                  ? selectedAccount.pushName || `+${selectedAccount.phone}`
                  : "Select an account"}
              </h2>
              {selectedAccount ? (
                <span
                  className={`status-pill ${
                    selectedAccount.status === "connected"
                      ? "online"
                      : selectedAccount.status === "pending"
                        ? "pending"
                        : ""
                  }`}
                >
                  {selectedAccount.status}
                  {connected ? "" : " · socket offline"}
                </span>
              ) : null}
              {selectedAccount?.inviteToken ? (
                <p
                  className="muted invite-link-row"
                  style={{ margin: "8px 0 0", fontSize: "0.8rem" }}
                >
                  Public invite:{" "}
                  <a
                    href={`/invite/${selectedAccount.inviteToken}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    /invite/{selectedAccount.inviteToken.slice(0, 8)}…
                  </a>{" "}
                  <button
                    type="button"
                    className="btn-link-danger"
                    onClick={() => void deleteInviteLink(selectedAccount.id)}
                  >
                    Delete link
                  </button>
                </p>
              ) : null}
              {lastInviteUrl ? (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
                  Latest invite ready —{" "}
                  <a href={lastInviteUrl} target="_blank" rel="noreferrer">
                    open public page
                  </a>
                </p>
              ) : null}
            </div>
          </div>
          <div className="search-box">
            <input
              placeholder="Search chats"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!selectedAccount}
            />
          </div>
          <div className="scroll-list">
            {!selectedAccount ? (
              <div className="empty-state">
                <p>
                  Link a WhatsApp account with the + button to start managing
                  chats.
                </p>
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="empty-state">
                <p>
                  No chats yet. Messages will appear here once this account
                  receives or sends them.
                </p>
              </div>
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  className={`chat-row ${
                    chat.id === selectedChatId ? "active" : ""
                  }`}
                  onClick={() => void openChat(chat)}
                >
                  <span className="name">
                    {chat.name || chat.jid.split("@")[0]}
                  </span>
                  <span className="meta">
                    {chat.unreadCount > 0 ? (
                      <span className="badge">{chat.unreadCount}</span>
                    ) : (
                      formatTime(chat.lastMessageAt)
                    )}
                  </span>
                  <span className="preview">{chat.lastPreview || ""}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section
          className={`conversation-panel ${
            !mobileShowChat ? "hidden-mobile" : ""
          }`}
        >
          {!selectedChat ? (
            <div className="empty-state">
              <div>
                <h2 style={{ marginTop: 0 }}>Your chats</h2>
                <p className="muted">
                  Pick a conversation from the left to read and reply.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-header">
                <div>
                  <button
                    type="button"
                    className="btn btn-ghost back-chats"
                    onClick={() => setMobileShowChat(false)}
                  >
                    ← Chats
                  </button>
                  <h2>{selectedChat.name || selectedChat.jid.split("@")[0]}</h2>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {selectedChat.jid}
                  </span>
                </div>
              </div>
              <div className="messages">
                {messages.map((m) => {
                  const url = mediaUrl(m.mediaPath);
                  return (
                    <div
                      key={m.id}
                      className={`bubble ${m.fromMe ? "out" : "in"}`}
                    >
                      <button
                        type="button"
                        className="bubble-delete"
                        title="Delete message"
                        onClick={() => void deleteMessage(m)}
                      >
                        ×
                      </button>
                      {m.type === "image" && url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={m.body || "image"} />
                      ) : null}
                      {m.type === "video" && url ? (
                        <video src={url} controls />
                      ) : null}
                      {m.type === "audio" && url ? (
                        <audio src={url} controls />
                      ) : null}
                      {m.type === "document" && url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          {m.body || "Download file"}
                        </a>
                      ) : null}
                      {m.body && m.type === "text" ? <span>{m.body}</span> : null}
                      {m.body &&
                      m.type !== "text" &&
                      m.type !== "document" ? (
                        <span>{m.body}</span>
                      ) : null}
                      {!m.body && !url ? (
                        <span className="muted">[{m.type}]</span>
                      ) : null}
                      <span className="time">
                        {formatTime(m.timestamp)}
                        {m.fromMe && m.status ? ` · ${m.status}` : ""}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="composer">
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void sendFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  title="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                >
                  +
                </button>
                <textarea
                  rows={1}
                  placeholder="Type a message"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendText();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void sendText()}
                  disabled={sending || !text.trim()}
                >
                  Send
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <LinkAccountModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        socket={socket.current}
        onLinked={(account) => {
          setAccounts((prev) => {
            const exists = prev.some((a) => a.id === account.id);
            return exists
              ? prev.map((a) => (a.id === account.id ? account : a))
              : [...prev, account];
          });
          setSelectedAccountId(account.id);
        }}
      />
      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={(account, inviteUrl) => {
          setLastInviteUrl(inviteUrl);
          setAccounts((prev) => {
            const exists = prev.some((a) => a.id === account.id);
            return exists
              ? prev.map((a) => (a.id === account.id ? account : a))
              : [...prev, account];
          });
          setSelectedAccountId(account.id);
        }}
      />
    </div>
  );
}
