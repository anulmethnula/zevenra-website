# ZEVENRA V1

Production-oriented React storefront, guest checkout, owner control room, Cloudflare Pages Functions, Google Sheets/Apps Script data layer, and signed Cloudinary upload endpoint for **ZEVENRA — The Art of Becoming.**

## 1. Install and run

```bash
npm install
cp .env.example .env
npm run dev
```

Demo mode is on by default. It uses six clearly labelled sample products and never writes fake orders to Google Sheets. Admin demo login accepts any non-empty credentials. Set `VITE_DEMO_MODE=false` only after the server services below are configured.

## 2. Brand assets and design

Replace these files without changing their names:

- `public/brand/logo.svg` — dark logo for light surfaces
- `public/brand/logo-light.svg` — light logo for dark surfaces
- `public/brand/favicon.png` / `favicon.svg` — browser icon
- `public/brand/og-image.jpg` — 1200×630 social sharing image
- `public/brand/hero.jpg` — temporary home hero

The two supplied images are preserved at the repository root and copied into the temporary brand kit. Edit global colour tokens in `src/styles/index.css`, typography in `index.html` and `tailwind.config.js`, and store defaults in `src/config/site.ts`. Once connected, operational content belongs in `SiteSettings`, not source files.

## 3. Create the temporary database

1. Create a blank Google Sheet owned by the store owner.
2. Open **Extensions → Apps Script**.
3. Copy `apps-script/Code.gs` into the editor.
4. Run `setup()` and approve spreadsheet access. This creates Products, Variants, Categories, Collections, SizeCharts, Orders, OrderItems, SiteSettings, DeliveryRates and AuditLog with frozen headers.
5. In Apps Script **Project Settings → Script properties**, create `APPS_SCRIPT_SECRET` using a cryptographically random value of at least 32 bytes.
6. Deploy as a Web App, execute as the owner, and copy its deployment URL. See `apps-script/README.md`.

The Apps Script endpoint rejects every request without the shared secret. Public browsers communicate with Vercel Functions only. Order IDs are generated server-side as `ZEV-YYMMDD-0001`; writes and stock transitions use `LockService`.

## 4. Configure Vercel

Create a Vercel project from this repository with:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 20 or newer

Add these encrypted environment variables in **Settings → Environment variables** for Production and Preview:

| Name | Purpose |
| --- | --- |
| `APPS_SCRIPT_URL` | Deployed Apps Script Web App URL |
| `APPS_SCRIPT_SECRET` | Same random secret stored in Apps Script Properties |
| `SESSION_SECRET` | Different random 32+ byte value for signed admin sessions |
| `ADMIN_USERNAME` | Owner username |
| `ADMIN_PASSWORD_HASH` | Base64url SHA-256 of the owner password |
| `ALLOWED_ORIGIN` | Exact production origin, e.g. `https://zevenra.lk` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret; server-only |

Generate `ADMIN_PASSWORD_HASH` locally (PowerShell):

```powershell
$bytes = [Text.Encoding]::UTF8.GetBytes('replace-with-a-long-password')
$hash = [Security.Cryptography.SHA256]::HashData($bytes)
[Convert]::ToBase64String($hash).TrimEnd('=').Replace('+','-').Replace('/','_')
```

Also set `VITE_API_BASE=/api` and `VITE_DEMO_MODE=false`. Never prefix a server secret with `VITE_`. The Vercel Functions set an HttpOnly, Secure, SameSite=Strict, eight-hour signed cookie. Mutations validate Origin. Admin API actions also validate the server session before Apps Script is called.

### Optional customer accounts

Customer accounts use Supabase Auth and remain completely separate from the custom admin session. Add these public-safe values to the build environment:

| Name | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL used by the browser auth client |
| `VITE_SUPABASE_ANON_KEY` | Public Supabase anon key; never use a service-role key |

Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the same public values to the Vercel Functions runtime. The server uses them to validate access tokens with Supabase before reading a customer's orders. Enable Email/Password in Supabase Auth and add the production `/account/login` URL to the allowed redirect URLs for password recovery. Email confirmation is required for account-linked order history.

Copy the updated `apps-script/Code.gs` into Apps Script and redeploy the web app so the server-only `listCustomerOrders` action is available. No Sheet columns or schema migration are required. Guest orders and checkout continue to work without Supabase configuration.

## 5. Configure Cloudinary

1. Create a Cloudinary account and add the three Cloudinary variables above to Cloudflare.
2. The browser first requests `/api/admin/cloudinary-sign`; only an authenticated admin receives a short-lived signature.
3. Upload directly to Cloudinary with that signature and store only the returned secure URL, public ID, media type, dimensions and alt text in `mediaJson`.
4. Accepted policy: JPEG, PNG, WebP, AVIF, MP4 and WebM; maximum 20 MB. Keep storefront video short and provide a poster. Use Cloudinary transformations such as `f_auto,q_auto,w_800` when displaying images.

The current media editor presents the intended drag/drop and ordering interface. Connect its upload control to the signed endpoint once credentials exist; secrets are never exposed to React.

## 6. Add the first real product

1. Turn off demo mode locally and sign in at `/admin/login`.
2. Open **Products → Add product**.
3. Enter the product story, category, pricing and status.
4. Upload media, set the primary image and meaningful alt text.
5. Create each colour/size/stock variant. Do not encode variants as JSON manually.
6. Assign a size chart and publish.
7. Verify the product on `/shop`, its PDP at mobile and desktop widths, and one sold-out variant.

The checked-in demo catalogue is isolated in `src/data/demo.ts` and should be removed from production bundles after live API verification.

## 7. Homepage, delivery, bank and contact settings

Use Admin → Homepage for announcement, hero, featured content and section visibility/order. Use Admin → Delivery for flat and district rates and a free-delivery threshold. Use Admin → Settings for WhatsApp, social links, COD/bank-transfer toggles and bank details. Bank details should exist only in `SiteSettings` and be returned only to checkout when bank transfer is enabled.

Before launch, replace every placeholder policy under Delivery, Returns, Privacy and Terms with reviewed business-specific content. The project deliberately makes no invented legal, quality, manufacturing or refund promises.

## 8. Test the order flow

1. Set `VITE_DEMO_MODE=false` and run Cloudflare Pages locally with Wrangler, or use a Preview deployment.
2. Home → Shop → Product → select colour/size → Add to Bag.
3. Cart → Checkout; test both COD and bank transfer.
4. Double-click Place Order: the UI locks immediately; Apps Script validates stock under a lock.
5. Confirm the Orders and OrderItems rows share one authoritative ID.
6. Open the confirmation WhatsApp link and confirm it includes order ID, non-sensitive item summary, totals, first name/city and payment method—not the full address.
7. In Admin, move the order to Confirmed and verify stock is deducted once. Re-saving Confirmed must not deduct again. Change to Cancelled and verify one restoration.
8. Repeat around 390 px and 1440 px. Test keyboard navigation, reduced motion, empty/error states and a sold-out product.

Run the release gate:

```bash
npm run lint
npm run typecheck
npm run build
```

## 9. Deploy and connect a domain

Push the verified build to the branch connected to Cloudflare Pages. Add a custom domain under **Pages → Custom domains**, update `ALLOWED_ORIGIN`, `robots.txt`, `sitemap.xml` and canonical/OG production URLs, then redeploy. Enforce HTTPS. Rotate any secret that was ever pasted into source or chat.

## 10. Migration path

All data access is behind `src/services/api.ts` and Cloudflare Functions. To move to PostgreSQL/Supabase, preserve the public JSON types and replace `callScript()` with parameterized database queries. Migrate tables matching the current sheets, add real transactions/row locking, unique constraints on slugs/SKUs/order IDs, and role-based admin auth. No UI redesign is required.

To add PayHere or card payments later, implement a `PaymentProvider` service beside the existing COD/bank methods. Create payments server-side, verify webhook signatures, make callbacks idempotent, and transition `paymentStatus` only from verified server events. Never trust a browser success redirect as proof of payment.

## Security notes

- Do not commit `.env`, `.dev.vars`, secrets, credentials or real customer exports.
- Rate-limit login and order routes with Cloudflare WAF/rules before public launch.
- Add CSRF tokens if the admin later supports cross-site embedding or relaxes SameSite.
- Sanitize rich text on the server if rich HTML editing is introduced. Current content is rendered as text and uses no `dangerouslySetInnerHTML`.
- Cloudflare should add CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy` and frame restrictions.
- Google Sheets is appropriate only for low-volume V1. Migrate before concurrent inventory volume becomes material.
