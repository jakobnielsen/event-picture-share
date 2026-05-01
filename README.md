# Event Photo Share

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A free-to-host progressive web app that lets event attendees upload photos and videos directly to the organizer's Google Drive — just scan a QR code, no app install required.

**No subscriptions. No third-party storage. Files go straight to your Google Drive.**

---

## How it works

1. The organizer creates an event in the admin dashboard → gets a QR code
2. The QR code is displayed at the venue
3. Attendees scan the QR code (or use the in-app scanner on the landing page)
4. They select photos/videos and upload — files land in a Drive subfolder instantly

The **main app** (`/`) and the **admin app** (`/admin/`) are two separate installable PWAs. Attendees install the main app; the organizer installs the admin app.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript, deployed to GitHub Pages |
| Backend | Google Apps Script Web App (free, serverless) |
| Storage | Organizer's own Google Drive |
| Uploads | Browser-initiated Drive resumable uploads (no size limit, real progress) |
| QR scanning | jsQR + device camera |
| i18n | English + Danish (auto-detected from browser) |
| CI/CD | GitHub Actions — push to `main` deploys everything |

---

## Features

- 📷 Scan QR code directly from the landing page
- 🖼️ Upload photos and videos (any `image/*` or `video/*`)
- ♾️ No file size limit — uses Drive resumable upload protocol
- 🔄 Auto-retry with exponential backoff + manual retry per file
- ⏳ Token expiry — set per event (default 14 days), with close, reopen, and delete controls
- 🚫 Duplicate prevention — re-uploading the same filename is detected and skipped
- 🌙 Dark mode
- 🌐 English + Danish UI
- 📱 PWA — two independently installable apps: main app for attendees, admin app for the organizer
- 🔒 Per-event tokens + separate admin key — no user accounts needed

---

## Event lifecycle

Each event has a token, an expiry date, and a revoked flag. Uploads are rejected as soon as any of these conditions are true.

| State | Uploads accepted | Admin can |
|---|---|---|
| Active | ✅ Yes | Close event, Delete |
| Closed (revoked) | ❌ No | Reopen, Delete |
| Expired | ❌ No | Reopen (extends expiry by 14 days), Delete |

Event data is stored in Apps Script Script Properties as a JSON array (key: `EVENTS`). The practical limit is ~35 events before the 9 KB property size limit is reached.

---

## Development

```sh
git clone https://github.com/jakobnielsen/event-picture-share.git
cd event-picture-share
npm install

# Set the Apps Script URL (or use a real deployed one)
echo "VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec" > .env.local

npm run dev      # start local dev server
npm run build    # type-check + production build
npm run preview  # preview production build locally
```

---

## Deployment

Every push to `main` triggers two parallel GitHub Actions jobs:

- **deploy-frontend** — builds the Vite app and deploys `dist/` to the `gh-pages` branch
- **deploy-apps-script** — pushes `apps-script/` to Google Apps Script via `clasp`

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `VITE_APPS_SCRIPT_URL` | The `https://script.google.com/macros/s/.../exec` deployment URL |
| `CLASPRC_JSON` | Contents of `~/.clasprc.json` after running `clasp login` locally |
| `CLASP_DEPLOYMENT_ID` | Deployment ID from the Apps Script editor (Deploy → Manage deployments) |

---

## One-time setup

See [PLAN.md](PLAN.md) for the full one-time bootstrap steps (Apps Script project creation, Script Properties, GitHub Pages configuration).

---

## Security

- Upload tokens are random 32-character strings, one per event, embedded in the QR code URL
- The admin key is stored only in Apps Script Script Properties and the organizer's browser `localStorage`
- POST requests use `Content-Type: text/plain` to avoid CORS preflight on Apps Script
- All admin key comparisons use constant-time comparison to prevent timing attacks

---

## License

MIT © 2026 Jakob Nielsen — see [LICENSE](LICENSE).
