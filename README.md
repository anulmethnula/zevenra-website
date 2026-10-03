# ZEVENRA

ZEVENRA is a React/Vite ecommerce storefront with Vercel Serverless Functions, Neon PostgreSQL, and Cloudinary media.

## Runtime architecture

```text
React / Vite -> /api Vercel Functions -> Neon PostgreSQL
                     |
                     +-> Cloudinary (catalogue media and protected receipts)
```

Google Sheets and Apps Script are not runtime dependencies. The old implementation is archived under `legacy/apps-script` solely for migration reference. The existing Sheet remains an external backup until migration is verified.

## Local modes

```bash
npm ci
npm run dev:demo  # browser-only demo data; never writes to Neon
npm run dev:full  # Vercel Functions + Neon + Cloudinary from .env.local
```

`npm run dev` starts Vite directly. Use `dev:demo` for safe UI work and `dev:full` for integration testing.

## Database

```bash
npm run db:migrate
npm run db:verify
npm run db:import-sheets -- path/to/export.sheets-export.json
```

Migration commands prefer `DATABASE_URL_UNPOOLED`. Runtime functions use `DATABASE_URL`. See [database/README.md](database/README.md) and [docs/DATA_MIGRATION.md](docs/DATA_MIGRATION.md).

## Business invariants

- Checkout reloads current products, prices, variants, stock, courier rules, and settings server-side.
- Order creation, item inserts, stock reservation, and audit logging commit together in a PostgreSQL transaction.
- Cancellation restores reserved stock once; cancelled orders cannot be silently reopened.
- Orders store immutable checkout courier/rate/fee snapshots separately from fulfilment tracking.
- Preorder-to-order conversion is transactional.
- Receipt URLs are never returned to customers. Admin receipt access requires an authenticated session and produces a short-lived Cloudinary URL.

## Required server environment

See `.env.example`. Never expose or `VITE_`-prefix database, session, admin, or Cloudinary secrets.

## Quality gate

```bash
npm run typecheck
npm run lint
npm run build
npm run qa
```

No migration, commit, push, Vercel project creation, or deployment is performed automatically.
