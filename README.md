# WhatsApp Multi-Account Chat Manager

Self-hosted web app to sign up, link multiple WhatsApp accounts (QR or pairing code), and manage chats in one place — view messages, send text/media, and mark as read.

> Uses the unofficial WhatsApp Web multi-device protocol via [Baileys](https://github.com/WhiskeySockets/Baileys). It can break when WhatsApp changes things and may violate WhatsApp’s terms. Use for personal/self-hosted purposes only.

## Stack

- **apps/web** — Next.js UI + auth APIs
- **apps/gateway** — Baileys sessions + Socket.IO realtime
- **packages/db** — Prisma + SQLite

## Setup

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
cp apps/gateway/.env.example apps/gateway/.env
cp packages/db/.env.example packages/db/.env
npm run db:push
```

### Hostinger deploy

See [HOSTINGER.md](HOSTINGER.md). Use **Application type: Next.js** (or Other + entry `server.js`), build script `build`, and redeploy after the latest `main` push to fix 403.

Ensure these match across services (defaults are fine for local):

| Variable | Where | Default |
| --- | --- | --- |
| `JWT_SECRET` | web + gateway | `dev-secret-change-me-in-production` |
| `DATABASE_URL` | web + gateway + db | `file:../../../data/app.db` |
| `NEXT_PUBLIC_GATEWAY_URL` | web | `http://localhost:4000` |
| `WEB_ORIGIN` | gateway | `http://localhost:3000` |

## Run

```bash
npm run dev
```

Or in separate terminals:

```bash
npm run dev:gateway
npm run dev:web
```

Then open [http://localhost:3000](http://localhost:3000).

1. Sign up / log in
2. Click **+** to link a WhatsApp account
3. Enter phone with country code (digits only, e.g. `15551234567`)
4. On your phone: **Linked Devices → Link a device**
   - Scan the QR, **or**
   - Tap **Link with phone number instead** and enter the 8-digit code
5. Select the account in the left rail to open its chats
6. Or click **Inv** to create a **public invite** — enter a number, copy the `/invite/...` link, and open it without logging in (QR + pairing code + full instructions)

## Tips

- Right-click an account avatar to unlink it
- Sessions persist under `auth/<userId>/<accountId>/` so reconnect usually does not need a new scan
- Downloaded media is stored under `media/`
- SQLite database lives at `data/app.db`

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev:web` | Next.js on port 3000 |
| `npm run dev:gateway` | WhatsApp gateway on port 4000 |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:generate` | Regenerate Prisma client |
