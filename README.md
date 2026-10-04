# ZEVENRA

ZEVENRA is a React/Vite ecommerce storefront backed by Vercel Serverless Functions, Neon PostgreSQL, and Cloudinary media.

## Runtime architecture

```text
React / Vite -> /api Vercel Functions -> Neon PostgreSQL
                     |
                     +-> Cloudinary (catalogue media and protected receipts)
```

Neon PostgreSQL is the single source of truth for products, stock, customers, orders, pre-orders, delivery settings, and site settings.

## Local development

```bash
npm ci
npm run dev:demo
npm run dev:full
```

- `npm run dev:demo` uses browser-only demo data and never writes to Neon.
- `npm run dev:full` loads `.env.local`, starts Vercel Functions, and connects to Neon and Cloudinary.
- `npm run dev` starts Vite only and is intended for frontend-only work.

## Database

```bash
node --env-file=.env.local scripts/db-migrate.mjs
node --env-file=.env.local scripts/db-verify.mjs
```

Runtime functions use `DATABASE_URL`. Migration and verification tools prefer `DATABASE_URL_UNPOOLED` and fall back to `DATABASE_URL`.

## Business invariants

- Checkout reloads current products, prices, variants, stock, courier rules, and settings server-side.
- Order creation, order items, stock reservation, and audit logging commit together in a PostgreSQL transaction.
- Cancellation restores reserved stock once; cancelled orders cannot be silently reopened.
- Orders keep immutable checkout delivery snapshots separately from fulfilment tracking.
- Pre-order conversion is transactional.
- Receipt URLs are not exposed publicly. Admin receipt access requires an authenticated session and a short-lived Cloudinary URL.

## Required environment

See `.env.example`. Never expose or `VITE_`-prefix database, session, admin, or Cloudinary secrets.

## Quality gate

```bash
npm run typecheck
npm run lint
npm run build
npm run qa
```

Production deployment is intentionally separate from local development. Use the fresh-project checklist in `docs/NEW_VERCEL_PROJECT.md`.
