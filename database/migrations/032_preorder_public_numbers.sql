BEGIN;

-- Keep the long request_id as the stable technical key, while exposing a
-- short permanent customer/staff reference such as PRE-200.
CREATE SEQUENCE IF NOT EXISTS preorder_number_seq START WITH 200;

ALTER TABLE preorders
  ADD COLUMN IF NOT EXISTS preorder_number bigint;

-- Existing records receive deterministic public numbers in creation order.
WITH numbered AS (
  SELECT request_id,
         199 + ROW_NUMBER() OVER (ORDER BY created_at, request_id) AS public_number
  FROM preorders
  WHERE preorder_number IS NULL
)
UPDATE preorders p
SET preorder_number = numbered.public_number
FROM numbered
WHERE p.request_id = numbered.request_id;

DO $$
DECLARE current_max bigint;
BEGIN
  SELECT MAX(preorder_number) INTO current_max FROM preorders;
  IF current_max IS NOT NULL THEN
    PERFORM setval('preorder_number_seq', GREATEST(current_max, 199), true);
  END IF;
END
$$;

ALTER TABLE preorders
  ALTER COLUMN preorder_number SET DEFAULT nextval('preorder_number_seq'),
  ALTER COLUMN preorder_number SET NOT NULL;

ALTER SEQUENCE preorder_number_seq OWNED BY preorders.preorder_number;

CREATE UNIQUE INDEX IF NOT EXISTS preorders_preorder_number_unique_idx
  ON preorders(preorder_number);

ALTER TABLE preorders DROP CONSTRAINT IF EXISTS preorders_preorder_number_check;
ALTER TABLE preorders ADD CONSTRAINT preorders_preorder_number_check
  CHECK (preorder_number >= 200);

INSERT INTO schema_migrations(version)
VALUES ('032_preorder_public_numbers')
ON CONFLICT(version) DO NOTHING;

COMMIT;
