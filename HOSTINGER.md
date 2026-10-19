# Deploy on Hostinger

The earlier **403 Forbidden** happened because Hostinger built the monorepo as **Application type: Other** with no Node entry server. Next.js never started, so Apache returned 403.

## hPanel settings (required)

In **Websites → your site → Deployments / Node.js**:

| Setting | Value |
| --- | --- |
| Application type | **Next.js** (preferred) **or** Other |
| Root directory | `/` (repo root) |
| Build script | `build` |
| Output directory | `.next` if Next.js type, otherwise leave empty for Other |
| Entry file | `server.js` (use this if Application type is **Other**) |
| Node.js | 20 or 22 |

If you pick **Next.js**, also try Output directory: `apps/web/.next`.

After changing settings, **Redeploy** from GitHub `main`.

## Environment variables

Add these in hPanel → Node.js → Environment variables:

```
JWT_SECRET=a-long-random-secret
DATABASE_URL=file:./data/app.db
NEXT_PUBLIC_GATEWAY_URL=https://YOUR-DOMAIN
GATEWAY_URL=http://127.0.0.1:4000
WEB_ORIGIN=https://YOUR-DOMAIN
```

Create a writable `data/` folder on the server for SQLite (or use an absolute path Hostinger allows).

## Important limitation

This project is **two processes**:

1. **Next.js web** (login, UI, APIs) — what Hostinger Node hosting runs  
2. **Baileys gateway** (WhatsApp sockets on port 4000) — needs a **always-on** Node process

Hostinger Web App hosting typically runs **one** start command (`server.js` / Next). WhatsApp linking will **not** work until the gateway also runs (VPS, separate Node app, or PM2 on a VPS).

For invite QR / chat send to work, run the gateway on a VPS:

```bash
npm run start:gateway
```

Point `NEXT_PUBLIC_GATEWAY_URL` at that gateway’s public HTTPS URL (with CORS `WEB_ORIGIN` set to your Hostinger site).

## After deploy checklist

1. Open the site — you should see the login page (not 403)  
2. Sign up / log in  
3. Confirm env vars are set  
4. Run gateway separately for WhatsApp features  
