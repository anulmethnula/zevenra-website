from pathlib import Path
import re

# Order lifecycle + inventory/refund correctness.
orders = Path('server/api-implementation/_data/orders-legacy.ts')
text = orders.read_text()
old = 'export function validOrderTransition(current:unknown,next:unknown){const from=normalizeAdminOrderStatus(current),to=normalizeAdminOrderStatus(next),transitions:Record<string,string[]>={pending:["confirmed"],confirmed:["dispatched"],dispatched:["delivered"],delivered:[]};return from===to||Boolean(transitions[from]?.includes(to));}'
new = 'export function validOrderTransition(current:unknown,next:unknown){const from=normalizeAdminOrderStatus(current),to=normalizeAdminOrderStatus(next),transitions:Record<string,string[]>={pending:["confirmed","cancelled"],confirmed:["dispatched","cancelled"],dispatched:["delivered"],delivered:[],cancelled:["pending","confirmed"]};return from===to||Boolean(transitions[from]?.includes(to));}'
assert text.count(old) == 1, 'validOrderTransition block missing'
text = text.replace(old, new, 1)

old = '''    if(nextStatus==="dispatched"){
      if(!requestedCourierId)throw new Error("Select the actual fulfilment courier before marking this order dispatched.");
      selectedCourier=(await client.query<Record<string,unknown>>("SELECT id,name,tracking_url_template FROM fulfilment_couriers WHERE id=$1 AND active=true",[requestedCourierId])).rows[0];
      if(!selectedCourier)throw new Error("Select an active actual fulfilment courier before marking this order dispatched.");
    }
    if(input.courierSentDate!==undefined&&!Number.isFinite(Date.parse(String(input.courierSentDate))))
      throw new Error("Add a valid courier handover date.");'''
new = '''    if(nextStatus==="dispatched"){
      if(!requestedCourierId)throw new Error("Select the actual fulfilment courier before marking this order dispatched.");
      selectedCourier=(await client.query<Record<string,unknown>>("SELECT id,name,tracking_url_template FROM fulfilment_couriers WHERE id=$1 AND active=true",[requestedCourierId])).rows[0];
      if(!selectedCourier)throw new Error("Select an active actual fulfilment courier before marking this order dispatched.");
    }
    if(nextStatus==="delivered"){
      const existingCourierId=String(current.fulfilment_courier_id||"").trim(),
        existingCourierName=String(current.fulfilment_courier_name||"").trim(),
        existingHandover=input.courierSentDate??current.courier_sent_date;
      if(!existingCourierId||!existingCourierName||!existingHandover)
        throw new Error("Complete the courier handover details before marking this order delivered.");
    }
    if(input.courierSentDate!==undefined&&!Number.isFinite(Date.parse(String(input.courierSentDate))))
      throw new Error("Add a valid courier handover date.");'''
assert text.count(old) == 1, 'dispatch validation block missing'
text = text.replace(old, new, 1)

old = '''    const restoring=currentStatus==="cancelled"&&nextStatus!=="cancelled";
    if(restoring){
      const previous=String(current.cancelled_from_status||"");
      if(!["pending","confirmed"].includes(previous)||nextStatus!==previous)throw new Error("This order cannot be restored to that status.");
      if(current.stock_state==="restored"){
        const items=await client.query<Record<string,unknown>>("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id FOR UPDATE",[orderId]);
        for(const item of items.rows)if(!item.is_preorder&&item.variant_id){const updated=await client.query("UPDATE variants SET stock=stock-$2,updated_at=now() WHERE id=$1 AND stock>=$2",[item.variant_id,item.quantity]);if(!updated.rowCount)throw new Error("Order cannot be restored because inventory is no longer available.");}
      }
    }
    let restoredUnits = 0;
    if (nextStatus === "cancelled" && currentStatus !== "cancelled" && current.stock_state === "reserved") {
      const items = await client.query<Record<string, unknown>>(
        "SELECT * FROM order_items WHERE order_id=$1 FOR UPDATE",
        [orderId],
      );
      for (const item of items.rows)
        if (!item.is_preorder && item.variant_id) {
          await client.query(
            "UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",
            [item.variant_id, item.quantity],
          );
          restoredUnits += Number(item.quantity) || 0;
        }
    }
    const stockState = restoring&&current.stock_state==="restored"?"reserved":
      nextStatus === "cancelled" && current.stock_state === "reserved"
        ? "restored"
        : nextStatus === "delivered" && current.stock_state === "reserved"
          ? "fulfilled"
        : current.stock_state;'''
new = '''    const restoring=currentStatus==="cancelled"&&nextStatus!=="cancelled";
    if(restoring){
      const previous=String(current.cancelled_from_status||"");
      if(!["pending","confirmed"].includes(previous)||nextStatus!==previous)throw new Error("This order cannot be restored to that status.");
      if(current.stock_state==="restored"){
        const items=await client.query<Record<string,unknown>>("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id FOR UPDATE",[orderId]);
        for(const item of items.rows){
          const inventoryBacked=preorderOrder||!item.is_preorder;
          if(inventoryBacked&&item.variant_id){const updated=await client.query("UPDATE variants SET stock=stock-$2,updated_at=now() WHERE id=$1 AND stock>=$2",[item.variant_id,item.quantity]);if(!updated.rowCount)throw new Error("Order cannot be restored because inventory is no longer available.");}
        }
      }
    }
    let restoredUnits = 0;
    const cancellationReleasesStock = nextStatus === "cancelled" && currentStatus !== "cancelled" &&
      (current.stock_state === "reserved" || (preorderOrder && current.stock_state === "not_applicable"));
    if (cancellationReleasesStock) {
      const items = await client.query<Record<string, unknown>>(
        "SELECT * FROM order_items WHERE order_id=$1 FOR UPDATE",
        [orderId],
      );
      for (const item of items.rows) {
        const inventoryBacked = preorderOrder || !item.is_preorder;
        if (inventoryBacked && item.variant_id) {
          await client.query(
            "UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",
            [item.variant_id, item.quantity],
          );
          restoredUnits += Number(item.quantity) || 0;
        }
      }
    }
    const stockState = restoring&&current.stock_state==="restored"?(preorderOrder?"not_applicable":"reserved"):
      cancellationReleasesStock
        ? "restored"
        : nextStatus === "delivered" && current.stock_state === "reserved"
          ? "fulfilled"
        : current.stock_state;'''
assert text.count(old) == 1, 'cancellation inventory block missing'
text = text.replace(old, new, 1)

old = '''    const automaticCodPaid = !preorderOrder && current.payment_method === "cod" && nextStatus === "delivered",
      cancellingPrepaidBank = nextStatus === "cancelled" && currentStatus !== "cancelled" && current.payment_method === "bank" && ["paid", "verified"].includes(nextPayment.toLowerCase()),
      paymentStatus = automaticCodPaid ? "paid" : cancellingPrepaidBank ? "refund pending" : nextPayment;'''
new = '''    const automaticCodPaid = !preorderOrder && current.payment_method === "cod" && nextStatus === "delivered",
      cancellingPaidOrder = nextStatus === "cancelled" && currentStatus !== "cancelled" && ["paid", "verified"].includes(nextPayment.toLowerCase()),
      paymentStatus = automaticCodPaid ? "paid" : cancellingPaidOrder ? "refund pending" : nextPayment;'''
assert text.count(old) == 1, 'payment cancellation block missing'
orders.write_text(text.replace(old, new, 1))

# Customer cancellation uses the same inventory/refund model.
cancellation = Path('server/api-implementation/_data/order-cancellation.ts')
text = cancellation.read_text()
old = '''    const status=normalizeOrderStatus(order.order_status);
    if(status==="cancelled")return{ok:true,orderId,status:"cancelled"};
    if(order.payment_method!=="cod"||!["pending","confirmed"].includes(status))throw new Error("ORDER_NOT_CANCELLABLE");
    if(order.stock_state==="reserved"){
      const items=(await client.query<Record<string,unknown>>("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id FOR UPDATE",[orderId])).rows;
      for(const item of items)if(!item.is_preorder&&item.variant_id)await client.query("UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",[item.variant_id,item.quantity]);
    }
    const stockState=order.stock_state==="reserved"?"restored":order.stock_state;
    await client.query("UPDATE orders SET order_status='cancelled',stock_state=$2,cancelled_at=now(),cancelled_by='customer',cancellation_reason=$3,cancelled_from_status=$4,updated_at=now() WHERE order_id=$1",[orderId,stockState,reason,status]);
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('customer','order_cancelled','order',$1,$2::jsonb)",[orderId,JSON.stringify({reason,from:status,restocked:stockState==="restored"})]);'''
new = '''    const status=normalizeOrderStatus(order.order_status),preorderOrder=Boolean(order.source_preorder_request_id);
    if(status==="cancelled")return{ok:true,orderId,status:"cancelled"};
    if(order.payment_method!=="cod"||!["pending","confirmed"].includes(status))throw new Error("ORDER_NOT_CANCELLABLE");
    const releasesStock=order.stock_state==="reserved"||(preorderOrder&&order.stock_state==="not_applicable");
    let restoredUnits=0;
    if(releasesStock){
      const items=(await client.query<Record<string,unknown>>("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id FOR UPDATE",[orderId])).rows;
      for(const item of items){
        const inventoryBacked=preorderOrder||!item.is_preorder;
        if(inventoryBacked&&item.variant_id){await client.query("UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",[item.variant_id,item.quantity]);restoredUnits+=Number(item.quantity)||0;}
      }
    }
    const stockState=releasesStock?"restored":order.stock_state,
      paymentStatus=["paid","verified"].includes(String(order.payment_status||"").toLowerCase())?"refund pending":String(order.payment_status||"");
    await client.query("UPDATE orders SET order_status='cancelled',stock_state=$2,payment_status=$3,cancelled_at=now(),cancelled_by='customer',cancellation_reason=$4,cancelled_from_status=$5,updated_at=now() WHERE order_id=$1",[orderId,stockState,paymentStatus,reason,status]);
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('customer','order_cancelled','order',$1,$2::jsonb)",[orderId,JSON.stringify({reason,from:status,restockedUnits,paymentStatus})]);'''
assert text.count(old) == 1, 'customer cancellation block missing'
cancellation.write_text(text.replace(old, new, 1))

# Durable preorder cancellation evidence.
preorders = Path('server/api-implementation/_data/preorders.ts')
text = preorders.read_text()
old = 'p.notified_at,p.reservation_expires_at,p.released_at,p.converted_order_id,p.payment_receipt_public_id,p.payment_submitted_at,p.payment_verified_at,o.order_number AS converted_order_number'
new = 'p.notified_at,p.reservation_expires_at,p.released_at,p.converted_order_id,p.payment_receipt_public_id,p.payment_submitted_at,p.payment_verified_at,p.cancelled_at,p.cancelled_by,p.cancellation_reason,p.cancelled_from_status,o.order_number AS converted_order_number'
assert text.count(old) == 1, 'preorder list columns missing'
text = text.replace(old, new, 1)
old = '''      `UPDATE preorders SET status=$2,confirmed_price=$3,batch_id=$4,notes=$5,customer_name=$6,phone=$7,whatsapp=$8,email=$9,address1=$10,address2=$11,city=$12,district=$13,postal_code=$14,payment_verified_at=CASE WHEN $2='paid' THEN now() ELSE payment_verified_at END,updated_at=now() WHERE request_id=$1 RETURNING *`,
      [
        input.requestId,
        nextStatus,
        confirmedPrice,
        input.batchId ?? current.batch_id,
        input.notes ?? current.notes,
        input.customerName ?? current.customer_name,
        input.phone ?? current.phone,
        input.whatsapp ?? current.whatsapp,
        input.email ?? current.email,
        input.address1 ?? current.address1,
        input.address2 ?? current.address2,
        input.city ?? current.city,
        input.district ?? current.district,
        input.postalCode ?? current.postal_code,
      ],'''
new = '''      `UPDATE preorders SET status=$2,confirmed_price=$3,batch_id=$4,notes=$5,customer_name=$6,phone=$7,whatsapp=$8,email=$9,address1=$10,address2=$11,city=$12,district=$13,postal_code=$14,
       cancelled_at=CASE WHEN $2='cancelled' AND status<>'cancelled' THEN now() ELSE cancelled_at END,
       cancelled_by=CASE WHEN $2='cancelled' AND status<>'cancelled' THEN 'owner' ELSE cancelled_by END,
       cancellation_reason=CASE WHEN $2='cancelled' AND status<>'cancelled' THEN $15 ELSE cancellation_reason END,
       cancelled_from_status=CASE WHEN $2='cancelled' AND status<>'cancelled' THEN status ELSE cancelled_from_status END,
       payment_verified_at=CASE WHEN $2='paid' THEN now() ELSE payment_verified_at END,updated_at=now() WHERE request_id=$1 RETURNING *`,
      [
        input.requestId,
        nextStatus,
        confirmedPrice,
        input.batchId ?? current.batch_id,
        input.notes ?? current.notes,
        input.customerName ?? current.customer_name,
        input.phone ?? current.phone,
        input.whatsapp ?? current.whatsapp,
        input.email ?? current.email,
        input.address1 ?? current.address1,
        input.address2 ?? current.address2,
        input.city ?? current.city,
        input.district ?? current.district,
        input.postalCode ?? current.postal_code,
        cancellationReason,
      ],'''
assert text.count(old) == 1, 'preorder update query missing'
preorders.write_text(text.replace(old, new, 1))

customers = Path('server/api-implementation/_data/customers.ts')
text = customers.read_text()
old = 'sku,color,size,quantity,requested_price,confirmed_price,status,batch_id,notes,converted_order_id,payment_submitted_at,payment_verified_at'
new = 'sku,color,size,quantity,requested_price,confirmed_price,status,batch_id,notes,converted_order_id,payment_submitted_at,payment_verified_at,cancelled_at,cancelled_by,cancellation_reason,cancelled_from_status'
assert text.count(old) == 1, 'customer preorder columns missing'
customers.write_text(text.replace(old, new, 1))

mappers = Path('server/api-implementation/_data/mappers.ts')
text = mappers.read_text()
old = '''    paymentRejectedAt: text(row.rejected_at),
    notes: text(row.notes),'''
new = '''    paymentRejectedAt: text(row.rejected_at),
    cancelledAt: date(row.cancelled_at),
    cancelledBy: text(row.cancelled_by),
    cancellationReason: text(row.cancellation_reason),
    cancelledFromStatus: text(row.cancelled_from_status),
    notes: text(row.notes),'''
assert text.count(old) == 1, 'preorder mapper insertion point missing'
mappers.write_text(text.replace(old, new, 1))

types = Path('src/types/index.ts')
text = types.read_text()
old = '''  paymentRejectedAt?: string;
  paymentToken?: string;'''
new = '''  paymentRejectedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  cancelledFromStatus?: string;
  paymentToken?: string;'''
assert text.count(old) == 1, 'preorder type insertion point missing'
text = text.replace(old, new, 1)
old = '''  paymentStatus?: string;
  subtotal: number;'''
new = '''  paymentStatus?: string;
  sourcePreorderRequestId?: string;
  amountPaid?: number;
  amountToCollect?: number;
  subtotal: number;'''
assert text.count(old) == 1, 'customer order type insertion point missing'
types.write_text(text.replace(old, new, 1))

# Admin can repair old/stuck dispatched rows before marking delivered.
admin = Path('src/pages/admin/AdminPage.tsx')
text = admin.read_text()
pattern = re.compile(r'''\{normalizedOrderStatus === "dispatched" && \(\n\s*<button type="button" className="btn btn-dark w-full justify-center" disabled=\{savingId === order\.orderId\} onClick=\{\(\) => \{ if\(window\.confirm\("Mark this order as delivered\?"\)\) void change\(order\.orderId,\{orderStatus:"delivered"\}\); \}\}>\n\s*\{savingId===order\.orderId\?"Updating…":"Mark delivered"\}\n\s*</button>\n\s*\)\}''')
replacement = '''{normalizedOrderStatus === "dispatched" && (!detail.fulfilmentCourierId || !detail.courierSentDate ? (
                      <>
                        <p className="rounded-xl border border-amber-900/15 bg-amber-50/70 p-3 text-xs leading-5 text-amber-950">Dispatch details are incomplete. Add the actual courier and handover time before delivery can be completed.</p>
                        <button type="button" className="btn btn-dark w-full justify-center" disabled={savingId === order.orderId} onClick={() => { const existingId=detail.fulfilmentCourierId||""; setDispatchOrderId(order.orderId); setDispatchCourierId(selectDispatchCourierId(admin.fulfilmentCouriers,existingId)); setDispatchTrackingNumber(detail.trackingNumber||""); setDispatchTrackingUrl(detail.trackingUrl||""); setDispatchHandover(detail.courierSentDate ? sriLankaDateTimeLocal(new Date(detail.courierSentDate)) : sriLankaDateTimeLocal()); }}>
                          Complete dispatch details
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-dark w-full justify-center" disabled={savingId === order.orderId} onClick={() => { if(window.confirm("Mark this order as delivered?")) void change(order.orderId,{orderStatus:"delivered"}); }}>
                        {savingId===order.orderId?"Updating…":"Mark delivered"}
                      </button>
                    ))}'''
text, n = pattern.subn(replacement, text, count=1)
assert n == 1, f'dispatched UI block replacement count={n}'
old = '                    {item.status==="in_transit"&&<p className="rounded-xl border border-amber-900/15 bg-amber-50/70 p-3 text-xs leading-5 text-amber-950">Already in transit. Receive the item first, then cancel it to release the reserved piece to stock safely.</p>}'
new = old + '\n                    {item.status==="cancelled"&&item.cancellationReason&&<p className="rounded-xl border border-red-900/15 bg-red-50/60 p-3 text-xs leading-5 text-red-900">Cancelled: {item.cancellationReason}</p>}'
assert text.count(old) == 1, 'preorder cancelled reason insertion point missing'
admin.write_text(text.replace(old, new, 1))

customer_page = Path('src/pages/CustomerOrdersPage.tsx')
text = customer_page.read_text()
old = '              {order.paymentMethod==="cod"&&["pending","confirmed"].includes(order.orderStatus)?<div className="mt-4 border border-red-900/15 bg-red-950/[.03] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-red-900">Cancel order</p><select'
new = '              {order.paymentMethod==="cod"&&["pending","confirmed"].includes(order.orderStatus)?<div className="mt-4 border border-red-900/15 bg-red-950/[.03] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-red-900">Cancel order</p>{order.sourcePreorderRequestId&&<p className="mt-2 text-xs leading-5 text-red-900/75">This delivery order came from a paid pre-order. Cancelling releases the reserved piece to stock and moves the prepaid amount to refund pending.</p>}<select'
assert text.count(old) == 1, 'customer cancellation UI insertion point missing'
customer_page.write_text(text.replace(old, new, 1))

# Database guards: existing legacy rows remain untouched; future transitions cannot create the same broken state.
migration = Path('database/migrations/033_fulfilment_cancellation_integrity.sql')
migration.write_text('''BEGIN;

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
''')

# Regression tests.
tests = Path('tests/order-workflow.test.ts')
text = tests.read_text()
if 'converted preorder cancellation releases its arrived unit' not in text:
    text += '''\n\ntest("converted preorder cancellation releases its arrived unit and requests a refund",async()=>{\n  const backend=await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts",import.meta.url),"utf8");\n  const customer=await readFile(new URL("../server/api-implementation/_data/order-cancellation.ts",import.meta.url),"utf8");\n  assert.match(backend,/preorderOrder && current\\.stock_state === "not_applicable"/);\n  assert.match(backend,/inventoryBacked = preorderOrder \\|\\| !item\\.is_preorder/);\n  assert.match(backend,/cancellingPaidOrder/);\n  assert.match(customer,/preorderOrder&&order\\.stock_state==="not_applicable"/);\n  assert.match(customer,/paymentStatus=\\["paid","verified"\\].*"refund pending"/s);\n});\n\ntest("delivery cannot complete with missing courier handover and legacy dispatch can be repaired",async()=>{\n  const backend=await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts",import.meta.url),"utf8");\n  const ui=await readFile(new URL("../src/pages/admin/AdminPage.tsx",import.meta.url),"utf8");\n  assert.match(backend,/nextStatus==="delivered"/);\n  assert.match(backend,/Complete the courier handover details before marking this order delivered/);\n  assert.match(ui,/Dispatch details are incomplete/);\n  assert.match(ui,/Complete dispatch details/);\n});\n\ntest("database migration guards future dispatch and cancellation integrity",async()=>{\n  const sql=await readFile(new URL("../database/migrations/033_fulfilment_cancellation_integrity.sql",import.meta.url),"utf8");\n  assert.match(sql,/enforce_order_workflow_integrity/);\n  assert.match(sql,/fulfilment_courier_id/);\n  assert.match(sql,/courier_sent_date/);\n  assert.match(sql,/Cancellation metadata is incomplete/);\n  assert.match(sql,/enforce_preorder_cancellation_integrity/);\n});\n'''
    tests.write_text(text)

pre_tests = Path('tests/preorder-lifecycle.test.ts')
text = pre_tests.read_text()
if 'preorder cancellation stores durable cancellation evidence' not in text:
    text += '''\n\ntest("preorder cancellation stores durable cancellation evidence",async()=>{\n  const source=await readFile(new URL("../server/api-implementation/_data/preorders.ts",import.meta.url),"utf8");\n  assert.match(source,/cancelled_at=CASE WHEN \\$2='cancelled'/);\n  assert.match(source,/cancellation_reason=CASE WHEN \\$2='cancelled'/);\n  assert.match(source,/cancelled_from_status=CASE WHEN \\$2='cancelled'/);\n  const migration=await readFile(new URL("../database/migrations/033_fulfilment_cancellation_integrity.sql",import.meta.url),"utf8");\n  assert.match(migration,/ADD COLUMN IF NOT EXISTS cancellation_reason/);\n});\n'''
    pre_tests.write_text(text)
