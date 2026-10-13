BEGIN;

ALTER TABLE preorders
  ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz;

ALTER TABLE preorders DROP CONSTRAINT IF EXISTS preorders_status_check;
ALTER TABLE preorders ADD CONSTRAINT preorders_status_check CHECK (
  status IN ('new','awaiting_payment','payment_submitted','paid','contacted','confirmed','batched','ordered','in_transit','arrived','ready','notified','converted','cancelled','expired')
);

INSERT INTO schema_migrations(version) VALUES ('025_preorder_payment_first')
ON CONFLICT(version) DO NOTHING;

COMMIT;
