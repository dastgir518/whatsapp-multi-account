# Fix 403 Forbidden on Hostinger

A **green build with 403** almost always means:

> **Entry file is empty** → no Node process starts → Apache returns 403.

Your earlier logs showed: `Entry file: none`. That must be fixed in hPanel (code alone cannot set it).

## Exact hPanel settings

1. Open **hPanel** → your website → **Node.js** / **Deployments**
2. Open **Settings** (or Edit deploy settings)
3. Set:

| Field | Value |
| --- | --- |
| Application type / Framework | **Express** |
| Build script / Build command | `build` |
| Output directory | *(leave empty)* |
| **Entry file** | **`server.js`** |
| Node.js version | **22** |
| Branch | `main` |

4. Save
5. Click **Redeploy** (or push to GitHub again)
6. After deploy, if there is a **Running** badge, click **Restart**

## Environment variables (hPanel)

```
JWT_SECRET=your-secret
DATABASE_URL=file:./data/app.db
WEB_ORIGIN=https://cyan-butterfly-627461.hostingersite.com
NODE_ENV=production
```

Leave `NEXT_PUBLIC_GATEWAY_URL` unset.

## How to verify Entry file is set

Open the latest **build log**. You must see something like:

```
Entry file:         server.js
Application type:   Express
```

If it still says `Entry file: none`, the setting was not saved — set it again and redeploy.

## If still 403 after Entry file is server.js

1. Redeploy once more (regenerates `public_html/.htaccess`)
2. Check **Runtime logs** (not only build logs) for crashes on startup
3. Confirm the site is a **Node.js web app**, not a normal PHP website

## If runtime says build artifacts missing (503)

Hostinger’s publish step often drops `.next` / `dist`. This repo builds to:

- `apps/web/next-build`
- `apps/host/build`
- `apps/gateway/build`

`server.js` will **re-run `npm run build`** on start if those folders are missing (first boot may take several minutes).
