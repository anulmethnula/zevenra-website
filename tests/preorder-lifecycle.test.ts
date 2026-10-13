import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import test from "node:test";
import { preorderClaimCheckoutSchema,preorderConversionSchema,preorderSchema } from "../api/_shared.ts";
import {createPreorderClaimToken,hashPreorderClaimToken,releasePreorderToStock} from "../api/_data/preorders.ts";
import {
  isPreorderTransitionAllowed,
  normalizePreorderPaymentMethod,
  preorderDeliveryAddressReady,
  resolvePreorderConfirmedPrice,
} from "../shared/preorder-lifecycle.ts";

test("preorder lifecycle accepts only forward/admin-safe transitions", () => {
  assert.equal(isPreorderTransitionAllowed("awaiting_payment","payment_submitted"),true);
  assert.equal(isPreorderTransitionAllowed("payment_submitted","paid"),true);
  assert.equal(isPreorderTransitionAllowed("paid","confirmed"),true);
  assert.equal(isPreorderTransitionAllowed("awaiting_payment","confirmed"),false);
  assert.equal(isPreorderTransitionAllowed("new", "contacted"), true);
  assert.equal(isPreorderTransitionAllowed("contacted", "confirmed"), true);
  assert.equal(isPreorderTransitionAllowed("confirmed", "ordered"), true);
  assert.equal(isPreorderTransitionAllowed("confirmed", "batched"), false);
  assert.equal(isPreorderTransitionAllowed("batched", "ordered"), true);
  assert.equal(isPreorderTransitionAllowed("ready", "converted"), false);
  assert.equal(isPreorderTransitionAllowed("converted", "cancelled"), false);
});

test("payment-first preorder uses snapshotted price and verified protected receipt",async()=>{
  const source=await readFile(new URL("../api/_data/preorders.ts",import.meta.url),"utf8");
  const create=source.slice(source.indexOf("export async function createPreorder"),source.indexOf("export async function listPreorders"));
  const conversion=source.slice(source.indexOf("export async function convertPreorderToOrder"));
  assert.match(create,/verifyReceiptAsset\(String\(input\.paymentReceiptUrl/);
  assert.match(create,/status,payment_receipt_public_id,payment_receipt_resource_type,payment_receipt_format,payment_submitted_at\).*'payment_submitted'/s);
  assert.match(source,/status='payment_submitted'.*payment_submitted_at=now\(\).*claim_token_hash=NULL/s);
  assert.match(source,/nextStatus==="paid"&&!current\.payment_receipt_public_id/);
  assert.match(source,/nextStatus==="confirmed"&&current\.status!=="paid"/);
  assert.match(conversion,/Number\(preorder\.requested_price\)/);
  assert.doesNotMatch(conversion,/Number\(preorder\.confirmed_price\)/);
});

test("new preorder submission requires a protected payment receipt",()=>{
  const base={customerName:"Test Customer",whatsapp:"0771234567",address1:"12 Main Street",city:"Colombo",district:"Colombo",postalCode:"00100",productId:"product",variantId:"variant",quantity:1};
  assert.equal(preorderSchema.safeParse(base).success,false);
  assert.equal(preorderSchema.safeParse({...base,paymentReceiptUrl:"https://res.cloudinary.com/cloud/image/authenticated/v1/zevenra/payment-receipts/test.jpg"}).success,true);
});

test("paid preorder lifecycle has no automatic release path",async()=>{
  const source=await readFile(new URL("../api/_data/preorders.ts",import.meta.url),"utf8");
  const release=source.slice(source.indexOf("export async function releasePreorderToStock"),source.indexOf("export async function getPreorderClaim"));
  assert.match(release,/preorder\.status!=="notified"/);
  assert.doesNotMatch(release,/status='paid'/);
});

test("preorder conversion requires a complete address and exact postal code", () => {
  const valid = { address1: "12 Main Street", city: "Colombo", district: "Colombo", postalCode: "00100" };
  assert.equal(preorderDeliveryAddressReady(valid), true);
  assert.equal(preorderDeliveryAddressReady({ ...valid, postalCode: "100" }), false);
  assert.equal(preorderDeliveryAddressReady({ ...valid, postalCode: "0010A" }), false);
  assert.equal(preorderDeliveryAddressReady({ ...valid, address1: "" }), false);
});

test("preorder conversion requires explicit fulfillment and a branch for pickup",()=>{
  assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",paymentMethod:"cod"}).success,false);
  assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",paymentMethod:"cod",fulfillmentMethod:"flat"}).success,true);
  assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",paymentMethod:"bank",fulfillmentMethod:"pickup"}).success,false);
  assert.equal(preorderConversionSchema.safeParse({requestId:"PRE-1",paymentMethod:"bank",fulfillmentMethod:"pickup",pickupLocationId:"branch"}).success,true);
});

test("confirmed preorder price must be a positive whole LKR amount", () => {
  assert.equal(resolvePreorderConfirmedPrice(undefined, 1600), 1600);
  assert.equal(resolvePreorderConfirmedPrice("1700", 1600), 1700);
  assert.equal(resolvePreorderConfirmedPrice("", 1600), null);
  assert.throws(() => resolvePreorderConfirmedPrice(-1, 1600));
  assert.throws(() => resolvePreorderConfirmedPrice(10.5, 1600));
  assert.throws(() => resolvePreorderConfirmedPrice("abc", 1600));
});

test("preorder conversion rejects arbitrary payment method values", () => {
  assert.equal(normalizePreorderPaymentMethod(undefined), "cod");
  assert.equal(normalizePreorderPaymentMethod("COD"), "cod");
  assert.equal(normalizePreorderPaymentMethod("bank"), "bank");
  assert.throws(() => normalizePreorderPaymentMethod("crypto"));
});

test("customer preorder completion accepts COD and bank checkout",()=>{
  const base={token:"x".repeat(32),customerName:"Test Customer",phone:"0771234567",fulfillmentMethod:"pickup",pickupLocationId:"branch"};
  assert.equal(preorderClaimCheckoutSchema.safeParse({...base,paymentMethod:"cod"}).success,true);
  assert.equal(preorderClaimCheckoutSchema.safeParse({...base,paymentMethod:"bank"}).success,true);
});

test("admin preorder list is bounded and selects only mapped fields", async () => {
  const source = await readFile(
    new URL("../api/_data/preorders.ts", import.meta.url),
    "utf8",
  );
  const listQuery = source.slice(
    source.indexOf("export async function listPreorders"),
    source.indexOf("export async function updatePreorder"),
  );
  assert.doesNotMatch(listQuery, /SELECT\s+\*/i);
  assert.match(listQuery, /LIMIT 100/);
  assert.match(listQuery, /p\.request_id,p\.created_at,p\.updated_at/);
});

test("preorder requests use configured variants without deducting stock",async()=>{
  const source=await readFile(new URL("../api/_data/preorders.ts",import.meta.url),"utf8");
  const create=source.slice(source.indexOf("export async function createPreorder"),source.indexOf("export async function listPreorders"));
  assert.match(create,/JOIN variants v ON v\.product_id=p\.id WHERE p\.id=\$1 AND v\.id=\$2/);
  assert.match(create,/Number\(product\.stock\) > 0/);
  assert.match(create,/FROM preorders WHERE variant_id=\$1 AND status=ANY/);
  assert.match(create,/already have an active pre-order request/);
  assert.doesNotMatch(create,/UPDATE\s+variants/i);
});

test("supplier batch creation is no longer exposed",async()=>{
  const [dataSource,actionSource]=await Promise.all([
    readFile(new URL("../api/_data/preorders.ts",import.meta.url),"utf8"),
    readFile(new URL("../api/admin/[action].ts",import.meta.url),"utf8"),
  ]);
  assert.doesNotMatch(dataSource,/createPreorderBatch|SHEIN-|at least 5 pieces/);
  assert.doesNotMatch(actionSource,/createPreorderBatch/);
});

test("preorder claim tokens are random and represented by hashes for storage",()=>{
  const first=createPreorderClaimToken(),second=createPreorderClaimToken();
  assert.notEqual(first.token,second.token);
  assert.equal(first.hash,hashPreorderClaimToken(first.token));
  assert.notEqual(first.hash,first.token);
  assert.match(first.hash,/^[a-f0-9]{64}$/);
});

test("claim lookup and checkout enforce one-time notified reservations",async()=>{
  const source=await readFile(new URL("../api/_data/preorders.ts",import.meta.url),"utf8");
  assert.match(source,/status='notified'.*released_at IS NULL.*converted_order_id IS NULL.*reservation_expires_at>now\(\)/s);
  assert.match(source,/status IN\('ready','notified'\)/);
  assert.match(source,/claim_token_hash=NULL,reservation_expires_at=NULL/);
  assert.match(source,/Number\(preorder\.confirmed_price\)/);
  const conversion=source.slice(source.indexOf("export async function convertPreorderToOrder"));
  assert.doesNotMatch(conversion,/stock=stock-/);
});

test("conversion links both records and snapshots prepaid product and courier balance",async()=>{
  const source=await readFile(new URL("../api/_data/preorders.ts",import.meta.url),"utf8");
  const conversion=source.slice(source.indexOf("export async function convertPreorderToOrder"));
  assert.match(conversion,/source_preorder_request_id,amount_paid,amount_to_collect/);
  assert.match(conversion,/\$25,\$18,\$19/);
  assert.match(conversion,/payment_method,payment_status.*\$17,'paid'/s);
  assert.match(conversion,/UPDATE preorders SET status='converted',converted_order_id=\$2/);
  assert.doesNotMatch(conversion,/UPDATE variants SET stock=stock-/);
});

test("linked preorder order IDs are unique and receipts remain relationship-backed",async()=>{
  const migration=await readFile(new URL("../database/migrations/024_preorder_order_linking.sql",import.meta.url),"utf8");
  const orders=await readFile(new URL("../api/_data/orders-legacy.ts",import.meta.url),"utf8");
  assert.match(migration,/UNIQUE INDEX[\s\S]*source_preorder_request_id/);
  assert.match(migration,/amount_paid = o\.subtotal[\s\S]*amount_to_collect = o\.delivery_fee/);
  assert.match(migration,/UPDATE preorders[\s\S]*payment_receipt_public_id = o\.payment_receipt_public_id/);
  assert.match(migration,/UPDATE orders[\s\S]*payment_receipt_public_id = ''/);
  assert.match(orders,/LEFT JOIN preorders p ON p\.request_id=o\.source_preorder_request_id/);
  assert.match(orders,/COALESCE\(NULLIF\(o\.payment_receipt_public_id,''\),p\.payment_receipt_public_id\)/);
});

test("release returns reserved quantity to stock exactly once",async()=>{
  const source=await readFile(new URL("../api/_data/preorders.ts",import.meta.url),"utf8"),release=source.slice(source.indexOf("export async function releasePreorderToStock"),source.indexOf("export async function getPreorderClaim"));
  assert.match(release,/FOR UPDATE/);
  assert.match(release,/preorder\.released_at/);
  assert.match(release,/stock=stock\+\$2/);
  assert.match(release,/released_at=now\(\)/);
  const state={released:false,stock:0},client={query:async(text:string)=>{
    if(text.startsWith("SELECT"))return{rows:state.released?[]:[{request_id:"PRE-1",status:"notified",released_at:null,converted_order_id:null,variant_id:"variant",quantity:2}],rowCount:state.released?0:1};
    if(text.startsWith("UPDATE variants")){state.stock+=2;return{rows:[],rowCount:1};}
    if(text.startsWith("UPDATE preorders")){state.released=true;return{rows:[],rowCount:1};}
    return{rows:[],rowCount:1};
  }};
  const transact=async(work:(db:typeof client)=>Promise<{ok:boolean}>)=>work(client);
  assert.deepEqual(await releasePreorderToStock("PRE-1",transact),{ok:true});
  await assert.rejects(()=>releasePreorderToStock("PRE-1",transact),/cannot be released/);
  assert.equal(state.stock,2);
});

test("claim lookup and checkout share the existing preorder API entry",async()=>{
  const source=await readFile(new URL("../api/preorders.ts",import.meta.url),"utf8");
  assert.match(source,/action==="claim"/);
  assert.match(source,/action==="checkout"/);
  await assert.rejects(()=>access(new URL("../api/preorder-claim.ts",import.meta.url)));
  await assert.rejects(()=>access(new URL("../api/preorder-checkout.ts",import.meta.url)));
});
