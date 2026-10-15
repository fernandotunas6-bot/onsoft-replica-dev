# Environment Setup

This project uses three local configuration surfaces:

- `super-admin/.env.local` for the Next.js super admin portal (copy from `super-admin/.env.example`)
- `school-worker/.dev.vars` for the Cloudflare Worker during local development (never commit)
- Firebase/Auth setup in the Firebase Console

## URL alignment

Use **one** deployed Worker origin everywhere:

| Surface | Variable | Notes |
|--------|----------|--------|
| Super Admin (server) | `WORKER_API_URL` | e.g. `https://school-worker.ceo-6f0.workers.dev` |
| Super Admin (browser / media URLs) | `NEXT_PUBLIC_WORKER_API_URL` | Same origin as above |
| Flutter | `--dart-define=API_BASE_URL=...` | Defaults to the same host in `lib/core/network/api_client.dart` if unset |

Trailing slashes are optional; super-admin code strips them.

**Secrets:** Only store `SUPER_ADMIN_API_KEY` and `FIREBASE_WEB_API_KEY` in Wrangler secrets and in local `.env.local` / `.dev.vars` — not in git.

**`NEXT_PUBLIC_*`:** These are embedded in the browser bundle. They are not suitable for high-assurance secrets; restrict usage in the [Firebase Console](https://console.firebase.google.com/) (API key HTTP referrers / app check as appropriate).

## Super Admin Portal

Required:

- `FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `WORKER_API_URL`
- `SUPER_ADMIN_API_KEY`
- `SUPER_ADMIN_JWT_SECRET` (optional; recommended — long random string used to sign the HttpOnly portal session cookie. If omitted, `SUPER_ADMIN_API_KEY` is used.)

Recommended for completeness:

- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `NEXT_PUBLIC_WORKER_API_URL`

## Cloudflare Worker

Required:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_WEB_API_KEY`
- `SUPER_ADMIN_API_KEY`

`FIREBASE_WEB_API_KEY` and `SUPER_ADMIN_API_KEY` must be set as Wrangler secrets (not committed to config files):

```bash
cd school-worker
npx wrangler secret put FIREBASE_WEB_API_KEY
npx wrangler secret put SUPER_ADMIN_API_KEY
```

Also required in `wrangler.toml` / Cloudflare dashboard:

- D1 binding `DB`
- R2 binding `MEDIA_BUCKET`
- D1 database ID

## Firebase Console

For the super-admin login to work, the account must:

- Exist in Firebase Authentication
- Have a custom claim of either `super_admin: true` or `role: "super_admin"`

Also make sure Email/Password sign-in is enabled in Firebase Auth.

## Super Admin Bootstrap Script

Use this to create or refresh the first super-admin account:

- `cd school-worker`
- `npm run bootstrap:super-admin`

The script will:

- ask for the email and password
- create or update the Firebase Auth user
- set `super_admin: true` and `role: "super_admin"`
- verify the Worker health endpoint
- verify the Worker super-admin metrics endpoint with the shared key

If Firebase blocks private key downloads, use Google Application Default Credentials instead:

- `gcloud auth application-default login`
- `gcloud config set project <your-project-id>`

The script will automatically use a Firebase Admin SDK service account JSON file at the repo root (if it exists), otherwise it will fall back to ADC or a path you provide with `FIREBASE_SERVICE_ACCOUNT_PATH`. **Never commit service account files to version control.**

## Local API URLs

If you run the worker locally with Wrangler dev, a typical setup is:

- `WORKER_API_URL=http://127.0.0.1:8787`
- `NEXT_PUBLIC_WORKER_API_URL=http://127.0.0.1:8787`

## Flutter Note

The Flutter app will use the same Firebase project, but it will also need Firebase platform config generated through FlutterFire:

- `firebase_options.dart`
- `google-services.json`
- `GoogleService-Info.plist`
