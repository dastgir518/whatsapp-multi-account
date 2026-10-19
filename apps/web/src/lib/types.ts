export type WaAccount = {
  id: string;
  phone: string;
  pushName: string | null;
  status: string;
  inviteToken?: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export type Chat = {
  id: string;
  waAccountId: string;
  jid: string;
  name: string | null;
  isGroup: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
};

export type Message = {
  id: string;
  chatId: string;
  waMessageId: string;
  fromMe: boolean;
  senderJid: string | null;
  type: string;
  body: string | null;
  mediaPath: string | null;
  timestamp: string;
  status: string | null;
};
