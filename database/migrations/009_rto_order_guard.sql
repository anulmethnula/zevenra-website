BEGIN;

CREATE OR REPLACE FUNCTION prevent_delivery_with_active_rto()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_status = 'delivered'
     AND OLD.order_status IS DISTINCT FROM 'delivered'
     AND EXISTS (
       SELECT 1
       FROM order_returns r
       WHERE r.order_id = NEW.order_id
         AND r.type = 'courier_rto'
         AND r.status <> 'rejected'
     ) THEN
    RAISE EXCEPTION 'An order with an active courier RTO cannot be marked delivered.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_prevent_delivery_with_active_rto ON orders;
CREATE TRIGGER orders_prevent_delivery_with_active_rto
BEFORE UPDATE OF order_status ON orders
FOR EACH ROW
EXECUTE FUNCTION prevent_delivery_with_active_rto();

INSERT INTO schema_migrations(version)
VALUES ('009_rto_order_guard')
ON CONFLICT (version) DO NOTHING;

COMMIT;
