from pathlib import Path
import re


def replace_one(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    assert count == 1, f"{label}: expected 1 match, found {count}"
    p.write_text(text.replace(old, new, 1))


# 1) Preorder delivery orders are product-prepaid. Do not make conversion depend on
# current checkout payment toggles, and use the locked/paid requested price for quotes.
p = Path("server/api-implementation/_data/preorders.ts")
text = p.read_text()
assert text.count("  normalizePreorderPaymentMethod,\n") == 1, "normalizePreorderPaymentMethod import missing"
text = text.replace("  normalizePreorderPaymentMethod,\n", "", 1)
assert text.count("confirmedPrice:Number(row.confirmed_price||row.requested_price)") == 1, "claim price mapping missing"
text = text.replace("confirmedPrice:Number(row.confirmed_price||row.requested_price)", "confirmedPrice:Number(row.requested_price)", 1)
assert text.count("Number(preorder.confirmed_price)*Number(preorder.quantity)") == 1, "claim quote confirmed price expression missing"
text = text.replace("Number(preorder.confirmed_price)*Number(preorder.quantity)", "Number(preorder.requested_price)*Number(preorder.quantity)", 1)
pattern = re.compile(r"\n\s*const paymentMethod = normalizePreorderPaymentMethod\(input\.paymentMethod\);\n\s*await assertPaymentMethodAvailable\(client,paymentMethod\);")
text, count = pattern.subn('\n    const paymentMethod: "bank" = "bank";', text, count=1)
assert count == 1, "preorder conversion payment availability block missing"
p.write_text(text)

# 2) Keep old clients compatible, but payment selection is no longer required for a
# product-prepaid preorder delivery conversion.
p = Path("server/api-implementation/_shared.ts")
text = p.read_text()
old = '''export const preorderConversionSchema = z.object({
  requestId: z.string().trim().min(1).max(100),
  paymentMethod: z.enum(["cod", "bank"]),
  fulfillmentMethod: z.enum(["flat", "area_group", "pickup"]),'''
new = '''export const preorderConversionSchema = z.object({
  requestId: z.string().trim().min(1).max(100),
  paymentMethod: z.enum(["cod", "bank"]).optional(),
  fulfillmentMethod: z.enum(["flat", "area_group", "pickup"]),'''
assert text.count(old) == 1, "preorderConversionSchema block missing"
text = text.replace(old, new, 1)
old = '''  postalCode:optionalPostalSchema,
  paymentMethod:z.enum(["cod","bank"]),
}).strict().superRefine((value,ctx)=>{'''
new = '''  postalCode:optionalPostalSchema,
  paymentMethod:z.enum(["cod","bank"]).optional(),
}).strict().superRefine((value,ctx)=>{'''
assert text.count(old) == 1, "preorderClaimCheckoutSchema payment block missing"
text = text.replace(old, new, 1)
p.write_text(text)

# 3) Customer completion page: product is already paid. Remove the misleading second
# payment choice and show only the courier/delivery balance due.
p = Path("src/pages/PreorderCompletePage.tsx")
text = p.read_text()
assert text.count('import type {Order,PaymentMethod,PreorderClaim} from "../types";') == 1, "PreorderComplete type import missing"
text = text.replace('import type {Order,PaymentMethod,PreorderClaim} from "../types";', 'import type {Order,PreorderClaim} from "../types";', 1)
old = '[method,setMethod]=useState<CheckoutFulfillmentType|null>(null),[pickupLocationId,setPickupLocationId]=useState(""),[address1,setAddress1]=useState(""),[address2,setAddress2]=useState(""),[city,setCity]=useState(""),[district,setDistrict]=useState(""),[postalCode,setPostalCode]=useState(""),[payment,setPayment]=useState<PaymentMethod>("cod"),[quote,setQuote]=useState<{fee:number}|null>(null);'
new = '[method,setMethod]=useState<CheckoutFulfillmentType|null>(null),[pickupLocationId,setPickupLocationId]=useState(""),[address1,setAddress1]=useState(""),[address2,setAddress2]=useState(""),[city,setCity]=useState(""),[district,setDistrict]=useState(""),[postalCode,setPostalCode]=useState(""),[quote,setQuote]=useState<{fee:number}|null>(null);'
assert text.count(old) == 1, "PreorderComplete payment state missing"
text = text.replace(old, new, 1)
old = '  const raw=Object.fromEntries((checkout.data?.settings||[]).map(row=>[row.key,row.value])),enabled=(key:string)=>raw[key]===true||String(raw[key]).toLowerCase()==="true",subtotal=(claim?.confirmedPrice||0)*(claim?.quantity||0),total=subtotal+(quote?.fee||0);\n  const codEnabled=enabled("codEnabled"),bankEnabled=enabled("bankEnabled")||enabled("bankTransferEnabled");\n  useEffect(()=>{if(!codEnabled&&bankEnabled)setPayment("bank");},[bankEnabled,codEnabled]);'
new = '  const subtotal=(claim?.confirmedPrice||0)*(claim?.quantity||0),deliveryDue=quote?.fee||0,total=subtotal+deliveryDue;'
assert text.count(old) == 1, "PreorderComplete payment settings block missing"
text = text.replace(old, new, 1)
old = 'paymentMethod:payment,whatsapp:form.phone}'
new = 'whatsapp:form.phone}'
assert text.count(old) == 1, "PreorderComplete submit paymentMethod missing"
text = text.replace(old, new, 1)
old = '<h2 className="display mt-2 text-4xl">Delivery & payment.</h2><p className="mt-3 text-xs text-ink/55">No advance payment is required.</p>'
new = '<h2 className="display mt-2 text-4xl">Delivery details.</h2><p className="mt-3 text-xs text-ink/55">Your product payment is already verified. Only the delivery fee will be collected on delivery.</p>'
assert text.count(old) == 1, "PreorderComplete heading block missing"
text = text.replace(old, new, 1)
payment_choices = '<div className="grid gap-2 sm:grid-cols-2">{enabled("codEnabled")?<label className="flex min-h-14 items-center gap-3 border border-line p-3"><input type="radio" checked={payment==="cod"} onChange={()=>setPayment("cod")}/>Cash on delivery</label>:null}{enabled("bankEnabled")?<label className="flex min-h-14 items-center gap-3 border border-line p-3"><input type="radio" checked={payment==="bank"} onChange={()=>setPayment("bank")}/>Bank transfer</label>:null}</div>'
paid_panel = '<div className="border border-emerald-800/20 bg-emerald-50/60 p-4 text-sm"><b>Product payment received ✓</b><p className="mt-1 text-xs text-ink/55">The courier collects only the delivery fee shown below.</p></div>'
assert text.count(payment_choices) == 1, "PreorderComplete payment choices block missing"
text = text.replace(payment_choices, paid_panel, 1)
old = '<div className="border-y border-line py-4 text-sm"><div className="flex justify-between"><span>Item</span><b>{money(subtotal)}</b></div><div className="mt-2 flex justify-between"><span>Delivery</span><b>{quote?money(quote.fee):"Calculated from your details"}</b></div><div className="mt-3 flex justify-between text-base"><span>Total</span><b>{quote?money(total):"—"}</b></div></div>'
new = '<div className="border-y border-line py-4 text-sm"><div className="flex justify-between"><span>Product total</span><b>{money(subtotal)} · PAID</b></div><div className="mt-2 flex justify-between"><span>Delivery fee</span><b>{quote?money(quote.fee):"Calculated from your details"}</b></div><div className="mt-3 flex justify-between border-t border-line pt-3 text-base"><span>Amount to collect</span><b>{quote?money(deliveryDue):"—"}</b></div><div className="mt-2 flex justify-between text-xs text-ink/55"><span>Order total value</span><b>{quote?money(total):"—"}</b></div></div>'
assert text.count(old) == 1, "PreorderComplete summary block missing"
text = text.replace(old, new, 1)
p.write_text(text)

# 4) Admin conversion should not send a fake payment choice. Courier CSV must export
# the actual collection balance for converted preorders.
p = Path("src/pages/admin/AdminPage.tsx")
text = p.read_text()
assert text.count('        paymentMethod:"bank",\n') == 1, "admin preorder conversion paymentMethod line missing"
text = text.replace('        paymentMethod:"bank",\n', '', 1)
assert text.count('    "COD Amount",') == 1, "CSV COD Amount header missing"
text = text.replace('    "COD Amount",', '    "Amount to Collect",', 1)
old = '      order.paymentMethod === "cod" ? Number(order.total) || 0 : 0,'
new = '      order.sourcePreorderRequestId ? Number(order.amountToCollect ?? order.deliveryFee) || 0 : order.paymentMethod === "cod" ? Number(order.total) || 0 : 0,'
assert text.count(old) == 1, "CSV collection amount formula missing"
text = text.replace(old, new, 1)
p.write_text(text)

# 5) Durable DB cleanup/invariants for old fulfilled orders.
migration = Path("database/migrations/034_order_financial_fulfilment_integrity.sql")
assert not migration.exists(), "migration 034 already exists"
migration.write_text('''BEGIN;

-- Historical normal orders that were already delivered had inventory deducted at
-- order creation, so only the lifecycle marker was stale. Do not change stock qty.
UPDATE orders
SET stock_state='fulfilled', updated_at=now()
WHERE order_status='delivered'
  AND source_preorder_request_id IS NULL
  AND stock_state='reserved';

-- Delivered normal COD orders have completed collection. Preserve refund states.
UPDATE orders
SET payment_status='paid', updated_at=now()
WHERE order_status='delivered'
  AND source_preorder_request_id IS NULL
  AND payment_method='cod'
  AND lower(btrim(COALESCE(payment_status,'')))='cod';

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
BEFORE INSERT OR UPDATE OF order_status,stock_state,payment_status,fulfilment_courier_id,fulfilment_courier_name,courier_sent_date,cancelled_at,cancelled_by,cancellation_reason,cancelled_from_status
ON orders FOR EACH ROW EXECUTE FUNCTION enforce_order_workflow_integrity();

INSERT INTO schema_migrations(version)
VALUES ('034_order_financial_fulfilment_integrity')
ON CONFLICT(version) DO NOTHING;

COMMIT;
''')

# 6) Regression tests for the exact stuck/double-charge paths.
p = Path("tests/preorder-lifecycle.test.ts")
text = p.read_text()
text = text.replace('assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",paymentMethod:"cod"}).success,false);', 'assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1"}).success,false);')
text = text.replace('assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",paymentMethod:"cod",fulfillmentMethod:"flat"}).success,true);', 'assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",fulfillmentMethod:"flat"}).success,true);')
text = text.replace('assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",paymentMethod:"bank",fulfillmentMethod:"pickup"}).success,false);', 'assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",fulfillmentMethod:"pickup"}).success,false);')
text = text.replace('assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",paymentMethod:"bank",fulfillmentMethod:"pickup",pickupLocationId:"branch"}).success,true);', 'assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",fulfillmentMethod:"pickup",pickupLocationId:"branch"}).success,true);')
old = '''test("customer preorder completion accepts COD and bank checkout",()=>{
  const base={token:"x".repeat(32),customerName:"Test Customer",phone:"0771234567",fulfillmentMethod:"pickup",pickupLocationId:"branch"};
  assert.equal(preorderClaimCheckoutSchema.safeParse({...base,paymentMethod:"cod"}).success,true);
  assert.equal(preorderClaimCheckoutSchema.safeParse({...base,paymentMethod:"bank"}).success,true);
});'''
new = '''test("customer preorder completion does not require a second payment choice",()=>{
  const base={token:"x".repeat(32),customerName:"Test Customer",phone:"0771234567",fulfillmentMethod:"pickup",pickupLocationId:"branch"};
  assert.equal(preorderClaimCheckoutSchema.safeParse(base).success,true);
  assert.equal(preorderClaimCheckoutSchema.safeParse({...base,paymentMethod:"cod"}).success,true);
  assert.equal(preorderClaimCheckoutSchema.safeParse({...base,paymentMethod:"bank"}).success,true);
});'''
assert text.count(old) == 1, "customer preorder payment-choice test missing"
text = text.replace(old, new, 1)
old = '  assert.match(source,/Number\\(preorder\\.confirmed_price\\)/);'
new = '  assert.match(source,/Number\\(preorder\\.requested_price\\)\\*Number\\(preorder\\.quantity\\)/);\n  assert.doesNotMatch(source,/Number\\(preorder\\.confirmed_price\\)\\*Number\\(preorder\\.quantity\\)/);'
assert text.count(old) == 1, "claim quote price assertion missing"
text = text.replace(old, new, 1)
insert_after = '''test("payment-first preorder uses snapshotted price and verified protected receipt",async()=>{
  const source=await readFile(new URL("../server/api-implementation/_data/preorders.ts",import.meta.url),"utf8");
  const create=source.slice(source.indexOf("export async function createPreorder"),source.indexOf("export async function listPreorders"));
  const conversion=source.slice(source.indexOf("export async function convertPreorderToOrder"));
  assert.match(create,/verifyReceiptAsset\\(String\\(input\\.paymentReceiptUrl/);
  assert.match(create,/status,payment_receipt_public_id,payment_receipt_resource_type,payment_receipt_format,payment_submitted_at\\).*'payment_submitted'/s);
  assert.match(source,/status='payment_submitted'.*payment_submitted_at=now\\(\\).*claim_token_hash=NULL/s);
  assert.match(source,/nextStatus==="paid"&&!current\\.payment_receipt_public_id/);
  assert.match(source,/nextStatus==="confirmed"&&current\\.status!=="paid"/);
  assert.match(conversion,/Number\\(preorder\\.requested_price\\)/);
  assert.doesNotMatch(conversion,/Number\\(preorder\\.confirmed_price\\)/);
});'''
assert text.count(insert_after) == 1, "payment-first preorder test block missing"
addition = insert_after + '''\n\ntest("preorder delivery checkout never charges the paid product a second time",async()=>{
  const [page,data]=await Promise.all([readFile(new URL("../src/pages/PreorderCompletePage.tsx",import.meta.url),"utf8"),readFile(new URL("../server/api-implementation/_data/preorders.ts",import.meta.url),"utf8")]);
  assert.match(page,/Product payment received ✓/);
  assert.match(page,/Amount to collect/);
  assert.doesNotMatch(page,/setPayment\\(|checked=\\{payment===/);
  const conversion=data.slice(data.indexOf("export async function convertPreorderToOrder"));
  assert.match(conversion,/const paymentMethod: "bank" = "bank"/);
  assert.doesNotMatch(conversion,/assertPaymentMethodAvailable\\(client,paymentMethod\\)/);
});'''
text = text.replace(insert_after, addition, 1)
p.write_text(text)

p = Path("tests/order-workflow.test.ts")
text = p.read_text()
anchor = '''  assert.match(backend,/stock=stock\\+\\$2/);
});'''
assert text.count(anchor) == 1, "order cancellation workflow test anchor missing"
addition = '''  assert.match(backend,/stock=stock\\+\\$2/);
  assert.match(ui,/"Amount to Collect"/);
  assert.match(ui,/order\\.sourcePreorderRequestId \\? Number\\(order\\.amountToCollect \\?\\? order\\.deliveryFee\\) \\|\\| 0/);
});'''
text = text.replace(anchor, addition, 1)
p.write_text(text)
