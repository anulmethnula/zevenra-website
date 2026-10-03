# ZEVENRA development and release runbook

## Local modes

Use demo mode for safe UI work with no live backend writes:

```bash
npm run dev:demo
```

Use the real Vercel Functions + current Apps Script backend when testing integration:

```bash
npm run dev:full
```

The real mode reads secrets from `.env.local`. Never commit that file.

## Quality gate

Before merging or releasing:

```bash
npm run qa
```

GitHub Actions also runs the same TypeScript, ESLint, production build, dependency audit, Apps Script syntax, and required-asset checks on `dev-rebuild` and `main`.

## Google Sheets / Apps Script migration

The current live data source remains Google Sheets + Apps Script until a separate database migration is approved.

Before deploying a new `apps-script/Code.gs` version:

1. Make a backup copy of the Google Sheet.
2. Paste the exact `apps-script/Code.gs` from the tested branch into the existing Apps Script project.
3. Run `setup()` once from the Apps Script editor. Schema migrations are additive and preserve existing catalogue, customer, order, preorder, courier, and audit data.
4. Confirm the SchemaVersion sheet includes the latest version.
5. Deploy a new version of the existing Web App deployment so the existing Apps Script URL remains stable.
6. Test storefront bootstrap, admin bootstrap, checkout, preorder, and one non-production test order before releasing the frontend.

## Courier and delivery rules

A courier can use either:

- Flat rate: one nationwide price.
- Zone based: postal code -> city/area -> district-only rule -> one fallback zone.

Only one active courier can be the website checkout default. Inactive couriers cannot become the default.

Orders permanently store the checkout courier, pricing mode, zone/rate plan, and delivery fee used when the order was created. Changing future courier prices does not rewrite old orders.

Do not publish Colombo/suburb/postal mappings until they have been verified against the courier's official rate sheet.

## Release

Do not deploy directly from unfinished local changes.

Release flow:

```bash
git checkout dev-rebuild
git pull origin dev-rebuild
npm ci
npm run qa
```

After the Apps Script backend is updated and integration testing passes, merge the tested branch into `main`. Reconnect Vercel Git integration or perform the intended production deployment only at that final stage.
