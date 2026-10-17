from pathlib import Path


def replace_one(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    assert count == 1, f"{label}: expected 1 match, found {count}"
    p.write_text(text.replace(old, new, 1))


# 1) Deterministic implicit fulfillment selection for admin/manual orders.
p = Path("shared/fulfillment.ts")
text = p.read_text()
anchor = 'export type DistrictDefault = { district:string; groupId:string };\n\n'
addition = '''export type DistrictDefault = { district:string; groupId:string };
export type FulfillmentMethodChoice = { type:string; active:boolean };

export function selectImplicitFulfillmentMethod(methods:FulfillmentMethodChoice[], input:{fulfillmentMethod?:string;district?:string;city?:string;postalCode?:string}) {
  const explicit=String(input.fulfillmentMethod||"").trim();
  if(explicit)return explicit;
  const active=methods.filter(item=>item.active),area=active.find(item=>item.type==="area_group"),flat=active.find(item=>item.type==="flat"),completeAddress=Boolean(String(input.district||"").trim()&&String(input.city||"").trim()&&/^\\d{5}$/.test(String(input.postalCode||"").trim()));
  if(area&&completeAddress)return "area_group";
  if(flat)return "flat";
  return active.length===1?active[0].type:"";
}

'''
assert text.count(anchor) == 1, "shared fulfillment type anchor missing"
text = text.replace(anchor, addition, 1)
p.write_text(text)

p = Path("server/api-implementation/_data/fulfillment.ts")
text = p.read_text()
old = 'import { resolveAreaGroup, type AreaGroup, type AreaLocation, type DistrictDefault } from "../../../shared/fulfillment.js";'
new = 'import { resolveAreaGroup, selectImplicitFulfillmentMethod, type AreaGroup, type AreaLocation, type DistrictDefault } from "../../../shared/fulfillment.js";'
assert text.count(old) == 1, "server fulfillment import missing"
text = text.replace(old, new, 1)
old = '  const x=await load(client), active=x.methods.filter(m=>m.active), requested=input.fulfillmentMethod||(active.length===1?active[0].type:(input.district?"area_group":"")), selected=x.methods.find(m=>m.type===requested&&m.active);'
new = '  const x=await load(client), requested=selectImplicitFulfillmentMethod(x.methods,input), selected=x.methods.find(m=>m.type===requested&&m.active);'
assert text.count(old) == 1, "implicit fulfillment resolver line missing"
text = text.replace(old, new, 1)
p.write_text(text)

p = Path("tests/fulfillment.test.ts")
text = p.read_text()
old = 'import { resolveAreaGroup, type AreaGroup, type AreaLocation } from "../shared/fulfillment.ts";'
new = 'import { resolveAreaGroup, selectImplicitFulfillmentMethod, type AreaGroup, type AreaLocation } from "../shared/fulfillment.ts";'
assert text.count(old) == 1, "fulfillment test import missing"
text = text.replace(old, new, 1)
text += '''\n\ntest("manual orders choose the only active delivery method instead of inactive area groups",()=>{
  const methods=[{type:"flat",active:true},{type:"area_group",active:false},{type:"pickup",active:true}];
  assert.equal(selectImplicitFulfillmentMethod(methods,{district:"Colombo",city:"Colombo",postalCode:"00100"}),"flat");
});

test("area group is preferred when it is active and the delivery address is complete",()=>{
  const methods=[{type:"flat",active:true},{type:"area_group",active:true},{type:"pickup",active:true}];
  assert.equal(selectImplicitFulfillmentMethod(methods,{district:"Colombo",city:"Colombo",postalCode:"00100"}),"area_group");
  assert.equal(selectImplicitFulfillmentMethod(methods,{district:"Colombo",city:"Colombo",postalCode:""}),"flat");
  assert.equal(selectImplicitFulfillmentMethod(methods,{fulfillmentMethod:"pickup",district:"Colombo",city:"Colombo",postalCode:"00100"}),"pickup");
});
'''
p.write_text(text)

# 2) Canonical remaining-balance transitions for converted preorder delivery orders.
p = Path("server/api-implementation/_data/orders-legacy.ts")
text = p.read_text()
old = '        o.payment_method,o.payment_status,o.fulfillment_method,o.delivery_method_name,o.delivery_area_group_name,o.pickup_branch_name,o.pickup_branch_address,o.pickup_instructions,o.delivery_zone_name,o.subtotal,o.delivery_fee,o.total,'
new = '        o.payment_method,o.payment_status,o.source_preorder_request_id,o.amount_paid,o.amount_to_collect,o.fulfillment_method,o.delivery_method_name,o.delivery_area_group_name,o.pickup_branch_name,o.pickup_branch_address,o.pickup_instructions,o.delivery_zone_name,o.subtotal,o.delivery_fee,o.total,'
assert text.count(old) == 1, "guest order financial select missing"
text = text.replace(old, new, 1)
old = '''    const automaticCodPaid = !preorderOrder && current.payment_method === "cod" && nextStatus === "delivered",
      cancellingPaidOrder = nextStatus === "cancelled" && currentStatus !== "cancelled" && ["paid", "verified"].includes(nextPayment.toLowerCase()),
      paymentStatus = automaticCodPaid ? "paid" : cancellingPaidOrder ? "refund pending" : nextPayment;
    const updates = ["order_status=$2", "stock_state=$3", "payment_status=$4", "updated_at=now()"],
      values: unknown[] = [orderId, nextStatus, stockState, paymentStatus];'''
new = '''    const automaticCodPaid = !preorderOrder && current.payment_method === "cod" && nextStatus === "delivered",
      cancellingPaidOrder = nextStatus === "cancelled" && currentStatus !== "cancelled" && ["paid", "verified"].includes(nextPayment.toLowerCase()),
      paymentStatus = automaticCodPaid ? "paid" : cancellingPaidOrder ? "refund pending" : nextPayment,
      amountToCollect = preorderOrder ? (["delivered","cancelled"].includes(nextStatus) ? 0 : Number(current.delivery_fee)||0) : Number(current.amount_to_collect)||0;
    const updates = ["order_status=$2", "stock_state=$3", "payment_status=$4", "updated_at=now()"],
      values: unknown[] = [orderId, nextStatus, stockState, paymentStatus];
    if(preorderOrder&&Number(current.amount_to_collect||0)!==amountToCollect){values.push(amountToCollect);updates.push(`amount_to_collect=$${values.length}`);}'''
assert text.count(old) == 1, "order financial transition block missing"
text = text.replace(old, new, 1)
old = 'after: { orderStatus: nextStatus, paymentStatus, stockState }, restoredUnits'
new = 'after: { orderStatus: nextStatus, paymentStatus, stockState, amountToCollect }, restoredUnits'
assert text.count(old) == 1, "order update audit block missing"
text = text.replace(old, new, 1)
p.write_text(text)

# 3) Safe guest tracking exposes only a derived preorder-delivery flag and balances.
p = Path("server/api-implementation/order-track.ts")
text = p.read_text()
old = '''    paymentMethod: text(row.payment_method ?? row.paymentMethod),
    paymentStatus: text(row.payment_status ?? row.paymentStatus),
    fulfillmentMethod: text(row.fulfillment_method ?? row.fulfillmentMethod),'''
new = '''    paymentMethod: text(row.payment_method ?? row.paymentMethod),
    paymentStatus: text(row.payment_status ?? row.paymentStatus),
    preorderDelivery: bool(row.source_preorder_request_id ?? row.preorderDelivery),
    amountPaid: number(row.amount_paid ?? row.amountPaid),
    amountToCollect: number(row.amount_to_collect ?? row.amountToCollect),
    fulfillmentMethod: text(row.fulfillment_method ?? row.fulfillmentMethod),'''
assert text.count(old) == 1, "safe guest order payment block missing"
text = text.replace(old, new, 1)
p.write_text(text)

p = Path("src/types/index.ts")
text = p.read_text()
old = '''  paymentMethod: string;
  paymentStatus: string;
  fulfillmentMethod?: "flat" | "area_group" | "pickup";'''
new = '''  paymentMethod: string;
  paymentStatus: string;
  preorderDelivery?: boolean;
  amountPaid?: number;
  amountToCollect?: number;
  fulfillmentMethod?: "flat" | "area_group" | "pickup";'''
assert text.count(old) == 1, "GuestTrackedOrder payment fields missing"
text = text.replace(old, new, 1)
p.write_text(text)

# 4) Tracking page shows actual paid vs due values for converted preorders.
p = Path("src/pages/TrackOrderPage.tsx")
text = p.read_text()
old = '''    trackingUrl = safeHttpsUrl(order.trackingUrl),
    address = deliveryAddressLines(order),
    paymentLabel = order.paymentMethod === "cod" ? (order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Cash on delivery") : (order.paymentStatus || "Bank transfer");'''
new = '''    trackingUrl = safeHttpsUrl(order.trackingUrl),
    address = deliveryAddressLines(order),
    refundState = ["refund pending","refunded"].includes(String(order.paymentStatus||"").toLowerCase()) ? String(order.paymentStatus||"").toLowerCase() : "",
    collectionDue = Number(order.amountToCollect||0),
    paymentLabel = order.preorderDelivery
      ? (refundState === "refund pending" ? "Refund pending" : refundState === "refunded" ? "Refunded" : collectionDue > 0 ? `Product paid · ${money(collectionDue)} delivery due` : "Paid")
      : order.paymentMethod === "cod" ? (order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Cash on delivery") : (order.paymentStatus || "Bank transfer");'''
assert text.count(old) == 1, "tracking payment label block missing"
text = text.replace(old, new, 1)
old = '<div className="space-y-6"><Detail label="Payment method" value={order.paymentMethod === "cod" ? (order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Cash on delivery") : "Bank transfer"} /><Detail label="Delivery method"'
new = '<div className="space-y-6"><Detail label="Payment method" value={order.preorderDelivery ? "Product prepaid · courier fee on delivery" : order.paymentMethod === "cod" ? (order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Cash on delivery") : "Bank transfer"} /><Detail label="Delivery method"'
assert text.count(old) == 1, "tracking payment method detail missing"
text = text.replace(old, new, 1)
old = '<div className="ml-auto mt-7 max-w-sm"><h3 className="eyebrow mb-4 text-bronze">Order totals</h3><div className="space-y-3 border-t border-line pt-4 text-sm"><Row label="Subtotal" value={money(order.subtotal)} />{order.discountAmount>0?<Row label={`Discount${order.discountCode?` (${order.discountCode})`:""}`} value={`-${money(order.discountAmount)}`} />:null}<Row label="Delivery" value={order.deliveryFee ? money(order.deliveryFee) : "Free"} /><Row label="Total" value={money(order.total)} strong /></div></div>'
new = '<div className="ml-auto mt-7 max-w-sm"><h3 className="eyebrow mb-4 text-bronze">Order totals</h3><div className="space-y-3 border-t border-line pt-4 text-sm">{order.preorderDelivery?<><Row label="Product total" value={money(order.subtotal)} /><Row label="Amount already paid" value={money(Number(order.amountPaid??order.subtotal))} /><Row label="Delivery fee" value={order.deliveryFee ? money(order.deliveryFee) : "Free"} /><Row label="Amount to collect" value={money(Number(order.amountToCollect||0))} strong /><Row label="Order total value" value={money(order.total)} /></>:<><Row label="Subtotal" value={money(order.subtotal)} />{order.discountAmount>0?<Row label={`Discount${order.discountCode?` (${order.discountCode})`:""}`} value={`-${money(order.discountAmount)}`} />:null}<Row label="Delivery" value={order.deliveryFee ? money(order.deliveryFee) : "Free"} /><Row label="Total" value={money(order.total)} strong /></>}</div></div>'
assert text.count(old) == 1, "tracking totals block missing"
text = text.replace(old, new, 1)
p.write_text(text)

# 5) Signed-in account uses the same prepaid/delivery-balance language.
p = Path("src/pages/CustomerOrdersPage.tsx")
text = p.read_text()
old = '''                {order.paymentMethod === "cod"
                  ? (order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Cash on delivery")
                  : "Bank transfer"}
              </b>
              {order.paymentStatus && <small>{order.paymentStatus}</small>}'''
new = '''                {order.sourcePreorderRequestId
                  ? "Product prepaid"
                  : order.paymentMethod === "cod"
                    ? (order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Cash on delivery")
                    : "Bank transfer"}
              </b>
              {order.sourcePreorderRequestId && !["refund pending","refunded"].includes(String(order.paymentStatus||"").toLowerCase())
                ? <small>{Number(order.amountToCollect||0)>0 ? `${money(Number(order.amountToCollect))} delivery due` : "No balance due"}</small>
                : order.paymentStatus && <small>{order.paymentStatus}</small>}'''
assert text.count(old) == 1, "account order summary payment block missing"
text = text.replace(old, new, 1)
old = '''              <dl>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(order.subtotal)}</dd>
                </div>
                {Number(order.discountAmount || 0)>0&&<div><dt>Discount{order.discountCode?` (${order.discountCode})`:""}</dt><dd>-{money(Number(order.discountAmount))}</dd></div>}
                <div>
                  <dt>
                    {order.deliveryMethodName || "Delivery"}
                    {order.deliveryAreaGroupName ? ` · ${order.deliveryAreaGroupName}` : order.pickupBranchName ? ` · ${order.pickupBranchName}` : ""}
                  </dt>
                  <dd>
                    {order.deliveryFee
                      ? money(order.deliveryFee)
                      : "Complimentary"}
                  </dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{money(order.total)}</dd>
                </div>
                <div>
                  <dt>Order status</dt>
                  <dd>{orderStatusLabel(order.orderStatus)}</dd>
                </div>
                <div>
                  <dt>Payment status</dt>
                  <dd>{order.paymentStatus || "—"}</dd>
                </div>
              </dl>'''
new = '''              <dl>
                {order.sourcePreorderRequestId ? <>
                  <div><dt>Product total</dt><dd>{money(order.subtotal)}</dd></div>
                  <div><dt>Amount already paid</dt><dd>{money(Number(order.amountPaid??order.subtotal))}</dd></div>
                  <div><dt>{order.deliveryMethodName || "Delivery fee"}</dt><dd>{order.deliveryFee ? money(order.deliveryFee) : "Complimentary"}</dd></div>
                  <div><dt>Amount to collect</dt><dd>{money(Number(order.amountToCollect||0))}</dd></div>
                  <div><dt>Order total value</dt><dd>{money(order.total)}</dd></div>
                </> : <>
                  <div><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
                  {Number(order.discountAmount || 0)>0&&<div><dt>Discount{order.discountCode?` (${order.discountCode})`:""}</dt><dd>-{money(Number(order.discountAmount))}</dd></div>}
                  <div><dt>{order.deliveryMethodName || "Delivery"}{order.deliveryAreaGroupName ? ` · ${order.deliveryAreaGroupName}` : order.pickupBranchName ? ` · ${order.pickupBranchName}` : ""}</dt><dd>{order.deliveryFee ? money(order.deliveryFee) : "Complimentary"}</dd></div>
                  <div><dt>Total</dt><dd>{money(order.total)}</dd></div>
                </>}
                <div><dt>Order status</dt><dd>{orderStatusLabel(order.orderStatus)}</dd></div>
                <div><dt>Payment status</dt><dd>{order.paymentStatus || "—"}</dd></div>
              </dl>'''
assert text.count(old) == 1, "account totals block missing"
text = text.replace(old, new, 1)
old = 'order.paymentMethod==="bank"&&!(["delivered","cancelled"].includes(order.orderStatus))?<p className="mt-4 text-xs text-ink/55">Contact ZEVENRA for cancellation assistance.</p>'
new = 'order.paymentMethod==="bank"&&!(["delivered","cancelled"].includes(order.orderStatus))?<p className="mt-4 text-xs text-ink/55">{order.sourcePreorderRequestId?"This order came from a paid pre-order. Contact ZEVENRA for cancellation and refund assistance.":"Contact ZEVENRA for cancellation assistance."}</p>'
assert text.count(old) == 1, "account bank cancellation help missing"
text = text.replace(old, new, 1)
p.write_text(text)

# 6) Invoice PDF distinguishes product-prepaid converted preorder orders.
p = Path("src/utils/invoicePdf.ts")
text = p.read_text()
old = 'export type InvoiceOrder={orderId:string;orderNumber?:number;createdAt:string;customerName:string;phone?:string;email?:string;address1?:string;address2?:string;city?:string;district?:string;postalCode?:string;deliveryMethodName?:string;fulfillmentMethod?:string;pickupBranchName?:string;pickupBranchAddress?:string;fulfilmentCourierName?:string;courierName?:string;paymentMethod:string;paymentStatus?:string;subtotal:number;discountAmount?:number;deliveryFee:number;total:number;items:Array<{name:string;color?:string;size?:string;quantity:number;unitPrice:number}>};'
new = 'export type InvoiceOrder={orderId:string;orderNumber?:number;createdAt:string;customerName:string;phone?:string;email?:string;address1?:string;address2?:string;city?:string;district?:string;postalCode?:string;deliveryMethodName?:string;fulfillmentMethod?:string;pickupBranchName?:string;pickupBranchAddress?:string;fulfilmentCourierName?:string;courierName?:string;paymentMethod:string;paymentStatus?:string;preorderDelivery?:boolean;amountPaid?:number;amountToCollect?:number;subtotal:number;discountAmount?:number;deliveryFee:number;total:number;items:Array<{name:string;color?:string;size?:string;quantity:number;unitPrice:number}>};'
assert text.count(old) == 1, "InvoiceOrder type missing"
text = text.replace(old, new, 1)
old_start = 'export function normalizeInvoiceOrder(order:InvoiceOrderSource):InvoiceOrder{return{'
assert text.count(old_start) == 1, "normalizeInvoiceOrder start missing"
start = text.index(old_start)
end = text.index('\n\nexport function invoicePaymentStatus', start)
old_block = text[start:end]
new_block = '''export function normalizeInvoiceOrder(order:InvoiceOrderSource):InvoiceOrder{
  const preorderDelivery="sourcePreorderRequestId" in order?Boolean(order.sourcePreorderRequestId):"preorderDelivery" in order?Boolean(order.preorderDelivery):false,
    amountPaid="amountPaid" in order?Number(order.amountPaid||0):undefined,
    amountToCollect="amountToCollect" in order?Number(order.amountToCollect||0):undefined;
  return{orderId:order.orderId,orderNumber:"orderNumber" in order?order.orderNumber:undefined,createdAt:order.createdAt,customerName:order.customerName||"",phone:"phone" in order?order.phone:"",email:"email" in order?order.email:"",address1:order.address1,address2:order.address2,city:order.city,district:order.district,postalCode:order.postalCode,deliveryMethodName:"deliveryMethodName" in order?order.deliveryMethodName:"",fulfillmentMethod:"fulfillmentMethod" in order?order.fulfillmentMethod:"",pickupBranchName:"pickupBranchName" in order?order.pickupBranchName:"",pickupBranchAddress:"pickupBranchAddress" in order?order.pickupBranchAddress:"",fulfilmentCourierName:order.fulfilmentCourierName,courierName:"courierName" in order?order.courierName:"",paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,preorderDelivery,amountPaid,amountToCollect,subtotal:order.subtotal,discountAmount:order.discountAmount,deliveryFee:order.deliveryFee,total:order.total,items:order.items.map(item=>({name:item.name,color:item.color,size:item.size,quantity:item.quantity,unitPrice:item.unitPrice}))};
}'''
text = text[:start] + new_block + text[end:]
old = '''export function invoicePaymentStatus(order: Pick<InvoiceOrder, "paymentMethod" | "paymentStatus" | "fulfillmentMethod">) {
  if (order.paymentMethod === "cod") return order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Pay on delivery";
  return ["paid", "verified"].includes(clean(order.paymentStatus).toLowerCase()) ? "Paid" : "Pending verification";
}'''
new = '''export function invoicePaymentStatus(order: Pick<InvoiceOrder, "paymentMethod" | "paymentStatus" | "fulfillmentMethod" | "preorderDelivery" | "amountToCollect">) {
  const status=clean(order.paymentStatus).toLowerCase();
  if(status==="refund pending")return "Refund pending";
  if(status==="refunded")return "Refunded";
  if(order.preorderDelivery)return Number(order.amountToCollect||0)>0?"Product paid · delivery fee due":"Paid";
  if (order.paymentMethod === "cod") return order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Pay on delivery";
  return ["paid", "verified"].includes(status) ? "Paid" : "Pending verification";
}'''
assert text.count(old) == 1, "invoicePaymentStatus block missing"
text = text.replace(old, new, 1)
old = '''  section("PAYMENT", y);
  y = details([
    ["Method", order.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"],
    ["Status", paymentStatus],
  ], y + 8);'''
new = '''  section("PAYMENT", y);
  const paymentRows:Array<[string,string]>=[
    ["Method", order.preorderDelivery ? "Product prepaid · courier fee on delivery" : order.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"],
    ["Status", paymentStatus],
  ];
  if(order.preorderDelivery){
    paymentRows.push(["Amount already paid",lkr(Number(order.amountPaid??order.subtotal))]);
    paymentRows.push(["Amount to collect",lkr(Number(order.amountToCollect||0))]);
  }
  y = details(paymentRows, y + 8);'''
assert text.count(old) == 1, "invoice payment rows block missing"
text = text.replace(old, new, 1)
p.write_text(text)

# 7) Database migration makes remaining balance durable, not merely UI-derived.
migration = Path("database/migrations/035_preorder_delivery_balance_integrity.sql")
assert not migration.exists(), "migration 035 already exists"
migration.write_text('''BEGIN;

UPDATE orders
SET amount_to_collect=0,updated_at=now()
WHERE source_preorder_request_id IS NOT NULL
  AND order_status IN ('delivered','cancelled')
  AND COALESCE(amount_to_collect,0)<>0;

UPDATE orders
SET amount_to_collect=COALESCE(delivery_fee,0),updated_at=now()
WHERE source_preorder_request_id IS NOT NULL
  AND order_status IN ('pending','confirmed','dispatched')
  AND COALESCE(amount_to_collect,-1)<>COALESCE(delivery_fee,0);

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

  IF NEW.source_preorder_request_id IS NOT NULL THEN
    IF abs(COALESCE(NEW.amount_paid,0)-COALESCE(NEW.subtotal,0))>0.01 THEN
      RAISE EXCEPTION 'Converted pre-order product payment must equal the product subtotal.';
    END IF;
    IF NEW.order_status IN ('delivered','cancelled') AND abs(COALESCE(NEW.amount_to_collect,0))>0.01 THEN
      RAISE EXCEPTION 'Completed or cancelled pre-order delivery cannot keep an outstanding collection balance.';
    END IF;
    IF NEW.order_status IN ('pending','confirmed','dispatched') AND abs(COALESCE(NEW.amount_to_collect,0)-COALESCE(NEW.delivery_fee,0))>0.01 THEN
      RAISE EXCEPTION 'Active pre-order delivery balance must equal its delivery fee.';
    END IF;
  END IF;

  IF NEW.order_status IN ('dispatched','delivered') AND dispatch_changed THEN
    IF NEW.fulfilment_courier_id IS NULL
       OR btrim(COALESCE(NEW.fulfilment_courier_name,''))=''
       OR NEW.courier_sent_date IS NULL THEN
      RAISE EXCEPTION 'Dispatch requires the actual courier and handover time.';
    END IF;
  END IF;

  IF NEW.order_status='delivered' AND status_changed AND NEW.source_preorder_request_id IS NULL THEN
    IF NEW.stock_state='reserved' THEN
      RAISE EXCEPTION 'Delivered inventory-backed orders must be fulfilled.';
    END IF;
    IF NEW.payment_method='cod' AND lower(btrim(COALESCE(NEW.payment_status,'')))<>'paid' THEN
      RAISE EXCEPTION 'Delivered COD orders must be marked paid.';
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
BEFORE INSERT OR UPDATE OF order_status,stock_state,payment_status,amount_paid,amount_to_collect,subtotal,delivery_fee,source_preorder_request_id,fulfilment_courier_id,fulfilment_courier_name,courier_sent_date,cancelled_at,cancelled_by,cancellation_reason,cancelled_from_status
ON orders FOR EACH ROW EXECUTE FUNCTION enforce_order_workflow_integrity();

INSERT INTO schema_migrations(version)
VALUES ('035_preorder_delivery_balance_integrity')
ON CONFLICT(version) DO NOTHING;

COMMIT;
''')

# 8) Regression tests for safe balance exposure, invoice semantics and lifecycle zeroing.
p = Path("tests/order-track.test.ts")
text = p.read_text()
old = '["kind","address1","address2","city","courierSentDate","createdAt","customerName","deliveryFee","fulfillmentMethod","deliveryMethodName","deliveryAreaGroupName","pickupBranchName","pickupBranchAddress","pickupInstructions","discountAmount","discountCode","district","fulfilmentCourierName","items","orderId","orderNumber","orderStatus","paymentMethod","paymentStatus","postalCode","subtotal","total","trackingNumber","trackingUrl"].sort()'
new = '["kind","address1","address2","city","courierSentDate","createdAt","customerName","deliveryFee","fulfillmentMethod","deliveryMethodName","deliveryAreaGroupName","pickupBranchName","pickupBranchAddress","pickupInstructions","discountAmount","discountCode","district","fulfilmentCourierName","items","orderId","orderNumber","orderStatus","paymentMethod","paymentStatus","preorderDelivery","amountPaid","amountToCollect","postalCode","subtotal","total","trackingNumber","trackingUrl"].sort()'
assert text.count(old) == 1, "safe order key assertion missing"
text = text.replace(old, new, 1)
old = '  assert.equal(invoicePaymentStatus({ paymentMethod: "bank", paymentStatus: "paid" }), "Paid");\n});'
new = '''  assert.equal(invoicePaymentStatus({ paymentMethod: "bank", paymentStatus: "paid" }), "Paid");
  assert.equal(invoicePaymentStatus({ paymentMethod: "bank", paymentStatus: "paid", preorderDelivery:true, amountToCollect:425 }), "Product paid · delivery fee due");
  assert.equal(invoicePaymentStatus({ paymentMethod: "bank", paymentStatus: "paid", preorderDelivery:true, amountToCollect:0 }), "Paid");
  assert.equal(invoicePaymentStatus({ paymentMethod: "bank", paymentStatus: "refund pending", preorderDelivery:true, amountToCollect:0 }), "Refund pending");
});'''
assert text.count(old) == 1, "invoice status assertions missing"
text = text.replace(old, new, 1)
anchor = '''test("guest tracking query returns public order and fulfillment fields", async () => {
  const source = await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts", import.meta.url), "utf8");
  const tracking = await readFile(new URL("../src/pages/TrackOrderPage.tsx", import.meta.url), "utf8");
  assert.match(source, /SELECT o\\.order_id,o\\.order_number,o\\.created_at/);
  assert.match(source, /o\\.fulfillment_method,o\\.delivery_method_name,o\\.delivery_area_group_name,o\\.pickup_branch_name/);
  assert.match(tracking, /removeRecentGuestOrder\\(result\\.orderId\\)/);
  assert.match(tracking, /Pay at pickup/);
});'''
assert text.count(anchor) == 1, "guest tracking query test missing"
replacement = '''test("guest tracking query returns public order and fulfillment fields", async () => {
  const source = await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts", import.meta.url), "utf8");
  const tracking = await readFile(new URL("../src/pages/TrackOrderPage.tsx", import.meta.url), "utf8");
  assert.match(source, /SELECT o\\.order_id,o\\.order_number,o\\.created_at/);
  assert.match(source, /o\\.source_preorder_request_id,o\\.amount_paid,o\\.amount_to_collect/);
  assert.match(source, /o\\.fulfillment_method,o\\.delivery_method_name,o\\.delivery_area_group_name,o\\.pickup_branch_name/);
  assert.match(tracking, /removeRecentGuestOrder\\(result\\.orderId\\)/);
  assert.match(tracking, /Pay at pickup/);
  assert.match(tracking, /Amount to collect/);
});

test("converted preorder tracking exposes balances without leaking the technical preorder id",async()=>{
  const converted={...stored,source_preorder_request_id:"PRE-TECHNICAL-SECRET",amount_paid:1700,amount_to_collect:425,subtotal:1700,delivery_fee:425,total:2125,payment_method:"bank",payment_status:"paid"};
  const handler=createOrderTrackHandler(async()=>converted),result=response();
  await handler(request({orderId:stored.order_id,phone:"0770000000"},{origin},"198.51.104.9"),result.res);
  const body=result.state.body as Record<string,unknown>;
  assert.equal(body.preorderDelivery,true);
  assert.equal(body.amountPaid,1700);
  assert.equal(body.amountToCollect,425);
  assert.equal("sourcePreorderRequestId" in body,false);
  assert.equal("source_preorder_request_id" in body,false);
  assert.equal(JSON.stringify(body).includes("PRE-TECHNICAL-SECRET"),false);
});

test("account and invoice surfaces show the converted preorder delivery balance",async()=>{
  const [account,invoice]=await Promise.all([readFile(new URL("../src/pages/CustomerOrdersPage.tsx",import.meta.url),"utf8"),readFile(new URL("../src/utils/invoicePdf.ts",import.meta.url),"utf8")]);
  assert.match(account,/Amount to collect/);
  assert.match(account,/Product prepaid/);
  assert.match(invoice,/Amount to collect/);
  assert.match(invoice,/Product prepaid · courier fee on delivery/);
});'''
text = text.replace(anchor, replacement, 1)
p.write_text(text)

p = Path("tests/order-workflow.test.ts")
text = p.read_text()
anchor = '  assert.match(backend,/stock=stock\\+\\$2/);\n  assert.match(ui,/"Amount to Collect"/);'
replacement = '  assert.match(backend,/stock=stock\\+\\$2/);\n  assert.match(backend,/amountToCollect = preorderOrder/);\n  assert.match(backend,/amount_to_collect=\\$\\$\\{values\\.length\\}/);\n  assert.match(ui,/"Amount to Collect"/);'
assert text.count(anchor) == 1, "order workflow balance assertion anchor missing"
text = text.replace(anchor, replacement, 1)
p.write_text(text)
