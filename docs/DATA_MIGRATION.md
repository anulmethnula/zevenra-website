# Google Sheets to Neon migration

This is a one-time import, not a dual-write or fallback design. The source Sheet is never modified or deleted by these scripts.

## Export format

Create a JSON object whose keys are Sheet tab names and whose values are arrays of row objects using the existing header names:

```json
{
  "Products": [],
  "Variants": [],
  "Categories": [],
  "Collections": [],
  "ProductCollections": [],
  "SizeCharts": [],
  "Navigation": [],
  "HomepageSections": [],
  "Customers": [],
  "Orders": [],
  "OrderItems": [],
  "SiteSettings": [],
  "CourierProviders": [],
  "DeliveryRates": [],
  "Preorders": [],
  "AuditLog": []
}
```

Export through a trusted local/admin process. Do not commit the result; `*.sheets-export.json` and `migration-data/` are ignored.

## Import

```bash
npm run db:migrate
npm run db:import-sheets -- migration-data/zevenra.sheets-export.json
npm run db:verify
```

The importer runs in one transaction, preserves IDs/timestamps/history, upserts entities by their source IDs, rebuilds imported order items, and adds duplicate protection for audit rows. Re-running the same complete export is safe. It does not remove rows that are absent from an export.

## Manual verification

Compare counts for every source tab and destination table. Then sample:

- published/draft/archived products, variants, SKUs, stock, media, collections, and size charts;
- customer hashes/salts and saved addresses;
- old COD and bank orders, order items, totals, statuses, courier snapshots, fulfilment/tracking data, and receipt access;
- active, cancelled, batched, arrived, ready, and converted preorders;
- courier fallback and free-delivery threshold behavior.

The code and schema being ready does not mean the real Neon database or production data has been migrated.
