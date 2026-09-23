# ZEVENRA

Production React/Vite storefront for ZEVENRA, deployed on Vercel with Vercel Functions, Google Sheets + Apps Script, and signed Cloudinary uploads.

## Local development

```bash
npm install
npm run dev
```

`.env.development` uses demo mode for local visual work. Production uses Vercel environment variables and `VITE_DEMO_MODE=false`.

## Production architecture

- Frontend: React + Vite
- Hosting/API: Vercel + Vercel Functions in `/api`
- Data: Google Sheets through `apps-script/Code.gs`
- Media uploads: Cloudinary signed server-side
- Admin auth: signed HttpOnly session
- Customer accounts: optional; guest checkout remains available

The production hero is `public/media/hero-final-v2.mp4`.

## Main business flows

### In-stock orders
Website, Instagram and WhatsApp sales share the same inventory. Stock is reserved when an order is created and restored once if that order is cancelled.

Website checkout supports COD and bank transfer. Bank orders require the customer receipt upload before submission.

### Pre-orders
Out-of-stock products may expose a separate no-payment pre-order request flow. Pre-orders never enter the normal cart. Admin confirms customers on WhatsApp, records the final selling price, groups confirmed pieces into a SHEIN batch, then converts arrived/ready requests into normal orders.

## Apps Script

1. Open the store Google Sheet → Extensions → Apps Script.
2. Replace `Code.gs` with `apps-script/Code.gs`.
3. Run `setup()` after schema changes.
4. Keep `APPS_SCRIPT_SECRET` in Script Properties.
5. Deploy by editing the existing Web App deployment and selecting **New version**. Keep the same deployment URL.

Existing catalogue and order rows are preserved by the migration code.

## Vercel environment variables

Required production variables include:

- `APPS_SCRIPT_URL`
- `APPS_SCRIPT_SECRET`
- `SESSION_SECRET`
- `CUSTOMER_SESSION_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `ALLOWED_ORIGIN`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `VITE_API_BASE=/api`
- `VITE_DEMO_MODE=false`

Never commit server secrets.

## Release checks

Before production changes are considered complete:

```bash
npm run typecheck
npm run lint
npm run build
```

Normal work is committed directly to `main`. Use a temporary branch only for unusually risky auth/payment/database work, and remove it after merge.
