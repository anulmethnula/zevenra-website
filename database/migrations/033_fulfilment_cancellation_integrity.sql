BEGIN;

ALTER TABLE preorders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_from_status text;

UPDATE preorders p
SET cancelled_at = COALESCE(p.cancelled_at, p.updated_at),
    cancelled_by = COALESCE(NULLIF(p.cancelled_by, ''), 'owner'),
    cancellation_reason = COALESCE(
      NULLIF(p.cancellation_reason, ''),
      (SELECT al.details->>'cancellationReason' FROM audit_logs al
       WHERE al.entity_type='preorder' AND al.entity_id=p.request_id
       ORDER BY al.created_at DESC LIMIT 1),
      'Legacy cancellation'
    ),
    cancelled_from_status = COALESCE(
      NULLIF(p.cancelled_from_status, ''),
      (SELECT al.details->>'previousStatus' FROM audit_logs al
       WHERE al.entity_type='preorder' AND al.entity_id=p.request_id
       ORDER BY al.created_at DESC LIMIT 1),
      'confirmed'
    )
WHERE p.status='cancelled';

CREATE OR REPLACE FUNCTION enforce_order_workflow_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  status_changed boolean := true;
  dispatch_changed boolean := true;
BEGIN
  IF TG_OP='UPDATE' THEN
    status_changed := OLD.order_status IS DISTINCT FROM NEW.order_status;
    dispatch_changed := status_changed
      OR OLD.fulfilment_courier_id IS DISTINCT FROM NEW.fulfilment_courier_id
      OR OLD.fulfilment_courier_name IS DISTINCT FROM NEW.fulfilment_courier_name
      OR OLD.courier_sent_date IS DISTINCT FROM NEW.courier_sent_date;
  END IF;

  IF NEW.order_status IN ('dispatched','delivered') AND dispatch_changed THEN
    IF NEW.fulfilment_courier_id IS NULL
       OR btrim(COALESCE(NEW.fulfilment_courier_name,''))=''
       OR NEW.courier_sent_date IS NULL THEN
      RAISE EXCEPTION 'Dispatch requires the actual courier and handover time.';
    END IF;
  END IF;

  IF NEW.order_status='cancelled' AND status_changed THEN
    IF NEW.cancelled_at IS NULL
       OR btrim(COALESCE(NEW.cancelled_by,''))=''
       OR btrim(COALESCE(NEW.cancellation_reason,''))=''
       OR NEW.cancelled_from_status NOT IN ('pending','confirmed') THEN
      RAISE EXCEPTION 'Cancellation metadata is incomplete.';
    END IF;
    IF TG_OP='UPDATE'
       AND (OLD.stock_state='reserved' OR (OLD.stock_state='not_applicable' AND OLD.source_preorder_request_id IS NOT NULL))
       AND NEW.stock_state<>'restored' THEN
      RAISE EXCEPTION 'Cancellation must release reserved inventory.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_workflow_integrity ON orders;
CREATE TRIGGER orders_workflow_integrity
BEFORE INSERT OR UPDATE OF order_status,stock_state,fulfilment_courier_id,fulfilment_courier_name,courier_sent_date,cancelled_at,cancelled_by,cancellation_reason,cancelled_from_status
ON orders FOR EACH ROW EXECUTE FUNCTION enforce_order_workflow_integrity();

CREATE OR REPLACE FUNCTION enforce_preorder_cancellation_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  status_changed boolean := true;
BEGIN
  IF TG_OP='UPDATE' THEN
    status_changed := OLD.status IS DISTINCT FROM NEW.status;
  END IF;
  IF NEW.status='cancelled' AND status_changed THEN
    IF NEW.cancelled_at IS NULL
       OR btrim(COALESCE(NEW.cancelled_by,''))=''
       OR btrim(COALESCE(NEW.cancellation_reason,''))=''
       OR btrim(COALESCE(NEW.cancelled_from_status,''))='' THEN
      RAISE EXCEPTION 'Pre-order cancellation metadata is incomplete.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS preorders_cancellation_integrity ON preorders;
CREATE TRIGGER preorders_cancellation_integrity
BEFORE INSERT OR UPDATE OF status,cancelled_at,cancelled_by,cancellation_reason,cancelled_from_status
ON preorders FOR EACH ROW EXECUTE FUNCTION enforce_preorder_cancellation_integrity();

INSERT INTO schema_migrations(version)
VALUES ('033_fulfilment_cancellation_integrity')
ON CONFLICT(version) DO NOTHING;

COMMIT;
