# Development and release runbook

## Modes

- `npm run dev:demo`: local demo data. Store/admin edits stay in browser local storage and no Neon request is made.
- `npm run dev:full`: local Vercel Functions connected to Neon and Cloudinary through ignored `.env.local` values.
- `npm run dev`: plain Vite frontend development. It does not execute local API functions.

## Database workflow

1. Create a Neon branch/database and place its pooled and unpooled connection strings in `.env.local`.
2. Run `npm run db:migrate`.
3. Run `npm run db:verify`.
4. Export the old Sheet and run the one-time importer as documented in `DATA_MIGRATION.md`.
5. Run `npm run db:verify` again and compare source/destination counts.
6. Test the complete storefront, account, admin, order, courier, receipt, and preorder flows against a non-production Neon branch.

## Courier rules

The default active checkout courier controls checkout. A courier is either flat-rate or zone-based. Zone precedence is postal code, city/area, district-only rule, then fallback. Historical orders retain their checkout courier, pricing mode, rate plan, zone, and fee even after configuration changes. Fulfilment courier and tracking fields remain separate.

## Release safety

Before review:

```bash
npm ci
npm run qa
```

Do not point production at Neon until the schema, real import, counts, sampled historical orders, stock, protected receipts, and end-to-end order flows pass. Keep the old Sheet, Apps Script deployment, and Vercel project untouched until the replacement production deployment is verified.
