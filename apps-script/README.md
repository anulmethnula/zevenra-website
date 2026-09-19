# ZEVENRA Google Sheets API

1. Create a blank Google Sheet and open **Extensions → Apps Script**.
2. Paste `Code.gs`, save, and run `setup()` once. Approve the requested spreadsheet permission.
3. In **Project Settings → Script properties**, add `APPS_SCRIPT_SECRET` with a long random value (32+ bytes).
4. Deploy as **Web app**, execute as yourself, and allow access to anyone. The shared secret protects every request; the browser never calls this URL directly.
5. Copy the deployment URL into Cloudflare Pages as `APPS_SCRIPT_URL`; add the same secret as `APPS_SCRIPT_SECRET`.
6. If columns change later, update `SCHEMA` first. Do not reorder live sheet columns manually.

`LockService` protects order IDs, order rows, stock validation, confirmation deductions, and cancellation restoration. Stock is deducted exactly once when an order changes to `confirmed`; a confirmed order changing to `cancelled` restores stock once.
