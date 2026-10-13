BEGIN;

ALTER TABLE preorders
  ADD COLUMN IF NOT EXISTS claim_token_hash text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS preorders_claim_token_hash_idx
  ON preorders(claim_token_hash)
  WHERE claim_token_hash IS NOT NULL;

ALTER TABLE preorders DROP CONSTRAINT IF EXISTS preorders_status_check;
ALTER TABLE preorders ADD CONSTRAINT preorders_status_check CHECK (
  status IN ('new','contacted','confirmed','batched','ordered','in_transit','arrived','ready','notified','converted','cancelled','expired')
);

INSERT INTO schema_migrations(version)
VALUES ('023_preorder_claims')
ON CONFLICT(version) DO NOTHING;

COMMIT;
