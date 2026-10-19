# YFT School System

**Multi-tenant school management platform** — Flutter clients (mobile, web, desktop), a **Cloudflare Workers** API on the edge, and a **Next.js** super-admin console. Built as a portfolio-grade full-stack system with explicit **tenant isolation**, **JWT auth**, and **defense-in-depth** API design.

![Flutter](https://img.shields.io/badge/Flutter-3.11+-02569B?logo=flutter&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

**Repository:** [github.com/Bosiakoba/YFT-SCHOOL-MANAGEMENT-SYSTEM](https://github.com/Bosiakoba/YFT-SCHOOL-MANAGEMENT-SYSTEM)

---

## Why this project

If you’re reviewing this repo as a hiring manager or tech lead, here is what it is meant to demonstrate:

| Focus | How it shows up in the codebase |
|--------|--------------------------------|
| **Full-stack ownership** | End-to-end flows: auth → API → SQL → UI across Dart, TypeScript, and React. |
| **Multi-tenant SaaS** | Shared D1 database with `school_id` on every tenant row; middleware enforces context. |
| **Edge & serverless** | Hono on Cloudflare Workers, D1, R2, parameterized SQL, no long-lived servers. |
| **Mobile + web** | One Flutter codebase targeting multiple platforms with a coherent design system. |
| **Security awareness** | JWT verification, role guards, Zod validation, CORS allowlists, safe file handling — not just “happy path” CRUD. |
| **Operability** | Migrations, Wrangler, env separation, scripts for super-admin bootstrap. |

---

## Overview

Designed for real school operations: **admissions**, **classes & subjects**, **fees and arrears**, **academic calendar**, **attendance & grading surfaces**, **parent wards and receipts**, and **super-admin school onboarding** (branding, defaults, admin provisioning).

**Geography / context:** Conceived with Ghanaian schools in mind (currency, fee cycles, terminology), but the architecture is region-agnostic.

---

## Architecture

```
┌──────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   Flutter App    │────▶│  Cloudflare Worker   │◀────│   Super Admin    │
│  (Mobile / Web / │     │  (Hono + TypeScript) │     │   (Next.js 16)   │
│    Desktop)      │     │                      │     │                  │
└──────────────────┘     └──────────┬───────────┘     └──────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │ D1 (SQL) │  │ R2 (Obj) │  │ Firebase │
              │ Database │  │ Storage  │  │   Auth   │
              └──────────┘  └──────────┘  └──────────┘
```

| Layer | Stack | Role |
|-------|--------|------|
| **Clients** | Flutter (Dart), Riverpod, GoRouter, Dio | Admin, teacher, and parent experiences |
| **API** | Cloudflare Workers, Hono, Zod, Jose | REST API, auth, validation, tenant enforcement |
| **Super admin** | Next.js (App Router), React 19, Tailwind | Cross-school onboarding and operations |
| **Data** | D1 (SQLite at the edge), SQL migrations | Persistent multi-tenant data |
| **Media** | R2 | School logos and uploads |
| **Identity** | Firebase Auth | JWTs; custom claims for `school_id` and roles |

---

## Multi-tenancy

**Pattern:** single database, **row-level isolation** by `school_id`.

1. Verify Firebase JWT on protected routes.  
2. Resolve `school_id` (and role) from claims and the `Users` table.  
3. Bind `school_id` in queries — **no string concatenation of user input into SQL**.

---

## Getting started

### Prerequisites

- [Flutter](https://docs.flutter.dev/get-started/install) **3.11+**
- [Node.js](https://nodejs.org/) **18+**
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler`)
- [Firebase CLI](https://firebase.google.com/docs/cli) & a Firebase project

### Clone and install

```bash
git clone https://github.com/Bosiakoba/YFT-SCHOOL-MANAGEMENT-SYSTEM.git
cd YFT-SCHOOL-MANAGEMENT-SYSTEM

flutter pub get
cd school-worker && npm install && cd ..
cd super-admin && npm install && cd ..
```

### Firebase and Flutter

```bash
firebase login
flutterfire configure
```

- `lib/firebase_options.dart` is placeholder-friendly until you run `flutterfire configure`.  
- **Android:** copy `android/app/google-services.example.json` → `google-services.json` and fill from the Firebase Console (this file is gitignored).  
- **iOS / macOS:** add `GoogleService-Info.plist` locally (gitignored).

### D1 (local)

```bash
cd school-worker
npx wrangler d1 create school_management_db   # once — then put database_id in wrangler config
npx wrangler d1 migrations apply school_management_db --local
```

### Secrets and env (important)

Do **not** commit real API keys. Use:

- **Worker:** `npx wrangler secret put FIREBASE_WEB_API_KEY` and `npx wrangler secret put SUPER_ADMIN_API_KEY`  
- **Super admin:** `super-admin/.env.local` (see [`ENVIRONMENT.md`](ENVIRONMENT.md))  
- **Local worker dev:** `school-worker/.dev.vars` (gitignored)

Full variable list and bootstrap notes: **[`ENVIRONMENT.md`](ENVIRONMENT.md)**.

### Run locally (three terminals)

```bash
# 1 — API
cd school-worker && npx wrangler dev

# 2 — Super admin
cd super-admin && npm run dev

# 3 — Flutter
flutter run -d chrome   # or android, ios, windows, …
```

---

## Scripts and quality checks

```bash
# Flutter
flutter analyze
flutter test

# Worker
cd school-worker && npm test && npm audit

# Super admin (TypeScript check)
cd super-admin && npm run lint
```

---

## Deployment (outline)

| Target | Command / notes |
|--------|------------------|
| **Worker** | `npx wrangler d1 migrations apply … --remote` then `npx wrangler deploy` |
| **Super admin** | `npm run build` → host on Vercel, Cloudflare Pages, etc. |
| **Flutter** | `flutter build apk` / `ios` / `web` / `windows` as needed |

---

## Security highlights

- **SQL:** D1 `.prepare().bind()` everywhere; dynamic SQL fragments are fixed literals only.  
- **Auth:** Firebase JWT (JWKS / RS256), role-based route guards, separate super-admin API key for platform routes.  
- **Input:** Zod on mutating Worker endpoints; upload size and MIME checks; safe media paths (e.g. logos prefix, traversal blocked).  
- **HTTP:** CORS allowlist, security-oriented headers on media responses.  

---

## Repository layout

```
yft_school_system/
├── lib/                 # Flutter app (core, features, routing)
├── school-worker/       # Cloudflare Worker — API, middleware, D1 migrations
├── super-admin/         # Next.js super-admin portal
├── test/                # Flutter tests
├── ENVIRONMENT.md       # Env vars and secrets setup
└── LICENSE
```

---

## API surface (summary)

- **Tenant API** — JWT required: classes, subjects, students, finance, users/me, calendar, wards (parent), etc.  
- **Super admin API** — API key + controlled routes: metrics, schools, onboarding, logo upload.  

See the README history section or `school-worker/src/routes.ts` for the authoritative route map.

---

## License

[MIT](LICENSE)

---

## Author

**Raymond Antwi** — [GitHub @Bosiakoba](https://github.com/Bosiakoba)

If this repo is useful for your team’s stack (Flutter, edge APIs, or multi-tenant design), feel free to open an issue or reach out via GitHub.
