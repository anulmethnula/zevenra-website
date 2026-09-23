# ZEVENRA Apps Script backend

`Code.gs` is the temporary Google Sheets backend used by the Vercel API.

## Deploy/update

1. Open the ZEVENRA Google Sheet → **Extensions → Apps Script**.
2. Replace the existing `Code.gs` with the repository version.
3. Save and run `setup()` after schema changes.
4. Keep `APPS_SCRIPT_SECRET` in **Project Settings → Script properties**.
5. Open **Deploy → Manage deployments → Edit**.
6. Select **New version** and deploy. Keep the existing Web App URL.

Do not manually reorder live sheet columns.

## Current data behavior

- Normal website/manual orders reserve stock immediately.
- Cancelling a reserved order restores its stock once.
- Pre-orders are stored separately in the `Preorders` sheet and take no payment at request time.
- Confirmed pre-order pieces can be grouped into supplier batches.
- Arrived/ready pre-orders can be converted into normal COD or bank orders.
- `LockService` protects stock-sensitive writes and IDs.

Vercel is the only public caller of the Apps Script URL; browsers call the Vercel `/api` routes instead.
