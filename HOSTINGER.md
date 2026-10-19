# Deploy full app on Hostinger (single process)

Yes — the app is set up so **one Node process** runs everything:

- Next.js website (login, chats UI, invites)
- WhatsApp Baileys gateway
- Socket.IO realtime

## hPanel settings

| Setting | Value |
| --- | --- |
| Application type | **Other** |
| Root directory | `/` (repo root) |
| Build script | `build` |
| Entry file | `server.js` |
| Node.js | **20** or **22** |

Then **Redeploy** from GitHub `main`.

## Environment variables

```
NODE_ENV=production
JWT_SECRET=change-me-to-a-long-random-string
DATABASE_URL=file:./data/app.db
# Leave NEXT_PUBLIC_GATEWAY_URL empty → same website URL (required for Hostinger)
WEB_ORIGIN=https://YOUR-DOMAIN
```

Optional (only if you split gateway later):

```
NEXT_PUBLIC_GATEWAY_URL=https://other-gateway-host
GATEWAY_URL=https://other-gateway-host
```

## After first deploy

1. Open your domain — you should see the login page (not 403)
2. Sign up / log in
3. Create an invite or link a WhatsApp account — QR/code should appear on the **same** domain

## Local unified mode (same as Hostinger)

```bash
npm install
npm run db:push
npm run build
npm start
```

Opens everything on `http://localhost:3000`.

## Notes / limits

- Hostinger must allow a **long-running** Node app and **WebSockets** (their Node.js Web App product does; plain static PHP hosting does not).
- Free/shared plans may kill or sleep the process — WhatsApp will disconnect until the app wakes and sessions restore from `auth/`.
- Keep enough disk for `auth/` and `media/`.
- If QR never appears, check deploy logs for Baileys errors and that `server.js` is the entry file.
