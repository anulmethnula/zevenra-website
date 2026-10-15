BEGIN;

-- Copy legacy payment settings only when the canonical key is absent.
INSERT INTO site_settings(key,value,updated_at)
SELECT 'bankEnabled',value,now() FROM site_settings WHERE key='bankTransferEnabled'
ON CONFLICT(key) DO NOTHING;
INSERT INTO site_settings(key,value,updated_at)
SELECT 'accountName',value,now() FROM site_settings WHERE key='bankAccountName'
ON CONFLICT(key) DO NOTHING;
INSERT INTO site_settings(key,value,updated_at)
SELECT 'accountNumber',value,now() FROM site_settings WHERE key='bankAccountNumber'
ON CONFLICT(key) DO NOTHING;
INSERT INTO site_settings(key,value,updated_at)
SELECT 'branch',value,now() FROM site_settings WHERE key='bankBranch'
ON CONFLICT(key) DO NOTHING;

-- Delivery availability is derived from ordersEnabled and active delivery_methods.
DELETE FROM site_settings WHERE key IN (
  'bankTransferEnabled','bankAccountName','bankAccountNumber','bankBranch',
  'defaultCourierProviderId','deliveryFlatFee','deliveryFee','deliveryEnabled'
);

INSERT INTO schema_migrations(version) VALUES ('029_canonical_settings_cleanup')
ON CONFLICT(version) DO NOTHING;

COMMIT;
