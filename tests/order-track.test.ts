import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOrderTrackHandler } from "../server/api-implementation/order-track.js";
import { normalizeOrderIdForLookup, normalizeSriLankanPhoneForLookup } from "../server/api-implementation/_order-track-normalization.js";
import { getRecentGuestOrders, orderIdFromSearch, rememberGuestOrder } from "../src/utils/guestOrders.js";
import { createOrderPdf } from "../src/utils/orderPdf.js";
import { invoicePaymentStatus, normalizeInvoiceOrder } from "../src/utils/invoicePdf.js";
import { preorderCustomerStatusLabel } from "../shared/preorder-customer-status.js";
import { readFile } from "node:fs/promises";
import { safeHttpsUrl } from "../src/utils/orderTracking.js";

type State = { status: number; headers: Record<string, string>; body: unknown };
const origin = "https://shop.example";

function response() {
  const state: State = { status: 200, headers: {}, body: undefined };
  const res = {
    status(code: number) { state.status = code; return res; },
    setHeader(name: string, value: string | number | readonly string[]) { state.headers[name] = String(value); return res; },
    json(value: unknown) { state.body = value; return res; },
  } as unknown as VercelResponse;
  return { res, state };
}

function request(body: unknown, headers: Record<string, string> = { origin }, ip = "198.51.100.1") {
  return { method: "POST", query: {}, headers: { ...headers, "x-forwarded-for": ip }, body, socket: {} } as unknown as VercelRequest;
}

const stored = {
  order_id: "ZEV-TEST-1", order_number: 200, created_at: "2026-10-08T10:00:00.000Z", customer_name: "Guest Customer",
  address1: "45 Devala Road", address2: "Katubedda", city: "Moratuwa", district: "Polonnaruwa", postal_code: "01505", order_status: "confirmed", payment_method: "cod",
  payment_status: "COD", delivery_zone_name: "Colombo", subtotal: 4000, discount_code: "WELCOME10", discount_amount: 400, delivery_fee: 450, total: 4050,
  fulfilment_courier_name: "Test Courier", tracking_number: "TRACK-123", tracking_url: "https://courier.example/track/TRACK-123", courier_sent_date: "2026-10-09T10:00:00.000Z",
  payment_receipt_public_id: "secret-receipt", admin_notes: "internal", customer_id: "internal-customer",
  items: [{ id: 44, product_id: "internal-product", variant_id: "internal-variant", sku: "SECRET-SKU", name: "Classic Fit", color: "Black", size: "M", quantity: 2, unitPrice: 2000, isPreorder: false, productSlug: "classic-fit", imageUrl: "https://res.cloudinary.com/demo/image/upload/classic-fit.jpg" }],
};

test.before(() => { process.env.ALLOWED_ORIGIN = origin; });

test("correct normalized ID and phone return only the safe customer order", async () => {
  const handler = createOrderTrackHandler(async (orderId, phone) => orderId === stored.order_id && phone === "94770000000" ? stored : null),
    { res, state } = response();
  await handler(request({ orderId: stored.order_id, phone: "+94 77-000-0000" }, { origin }, "198.51.100.2"), res);
  assert.equal(state.status, 200);
  assert.deepEqual(Object.keys(state.body as object).sort(), ["kind","address1","address2","city","courierSentDate","createdAt","customerName","deliveryFee","fulfillmentMethod","deliveryMethodName","deliveryAreaGroupName","pickupBranchName","pickupBranchAddress","pickupInstructions","discountAmount","discountCode","district","fulfilmentCourierName","items","orderId","orderNumber","orderStatus","paymentMethod","paymentStatus","postalCode","subtotal","total","trackingNumber","trackingUrl"].sort());
  assert.equal((state.body as {kind:string}).kind,"order");
  const result = state.body as { items: Array<Record<string, unknown>> };
  assert.deepEqual(Object.keys(result.items[0]).sort(), ["color","imageUrl","isPreorder","name","productSlug","quantity","size","unitPrice"].sort());
  assert.equal((state.body as { address1: string }).address1, stored.address1);
  assert.equal(result.items[0].productSlug, "classic-fit");
  assert.equal(JSON.stringify(state.body).includes("secret-receipt"), false);
  assert.equal(JSON.stringify(state.body).includes("internal"), false);
  assert.equal(JSON.stringify(state.body).includes("SECRET-SKU"), false);
  assert.equal("phone" in (state.body as object), false);
  assert.equal("email" in (state.body as object), false);
  assert.equal((state.body as { trackingUrl: string }).trackingUrl, stored.tracking_url);
});

test("missing current products preserve historical lines without product presentation fields", async () => {
  const historicalItem = { ...stored.items[0], productSlug: null, imageUrl: null },
    handler = createOrderTrackHandler(async () => ({ ...stored, items: [historicalItem] })),
    result = response();
  await handler(request({ orderId: stored.order_id, phone: "0770000000" }, { origin }, "198.51.100.19"), result.res);
  const item = (result.state.body as { items: Array<Record<string, unknown>> }).items[0];
  assert.equal(item.name, historicalItem.name);
  assert.equal("productSlug" in item, false);
  assert.equal("imageUrl" in item, false);
  assert.equal("productId" in item, false);
  assert.equal("variantId" in item, false);
});

test("unsafe product image URLs are omitted", async () => {
  const handler = createOrderTrackHandler(async () => ({ ...stored, items: [{ ...stored.items[0], imageUrl: "http://images.example/item.jpg" }] })),
    result = response();
  await handler(request({ orderId: stored.order_id, phone: "0770000000" }, { origin }, "198.51.100.20"), result.res);
  assert.equal("imageUrl" in (result.state.body as { items: Array<Record<string, unknown>> }).items[0], false);
});

test("lookup normalization accepts copied IDs and Sri Lankan phone formats", async () => {
  assert.equal(normalizeOrderIdForLookup("#zev-test-1"), "ZEV-TEST-1");
  assert.equal(normalizeOrderIdForLookup("# zev-test-1 "), "ZEV-TEST-1");
  for (const phone of ["0740529061", "740529061", "94740529061", "+94740529061", "+94 74 052 9061", "0094740529061"])
    assert.equal(normalizeSriLankanPhoneForLookup(phone), "94740529061");
  const seen: Array<[string, string]> = [], handler = createOrderTrackHandler(async (orderId, phone) => { seen.push([orderId, phone]); return stored; });
  const formats=["0740529061", "740529061", "94740529061", "+94740529061", "+94 74 052 9061", "0094740529061"];
  for (const [index, phone] of formats.entries()) {
    const result = response();
    await handler(request({ orderId: "#zev-test-1", phone }, { origin }, `198.51.101.${index + 1}`), result.res);
    assert.equal(result.state.status, 200);
  }
  assert.deepEqual(seen, Array(formats.length).fill(["ZEV-TEST-1", "94740529061"]));
});

test("public numeric order number can be used for guest tracking", async () => {
  const seen: string[] = [], handler = createOrderTrackHandler(async (orderId, phone) => { seen.push(orderId); return orderId === stored.order_id && phone === "94740529061" ? stored : null; }, undefined, async (orderNumber) => orderNumber === 200 ? stored.order_id : null), result = response();
  await handler(request({ orderId: "#200", phone: "0740529061" }, { origin }, "198.51.102.99"), result.res);
  assert.equal(result.state.status, 200);
  assert.deepEqual(seen, [stored.order_id]);
  assert.equal((result.state.body as { orderNumber: number }).orderNumber, 200);
});

test("a new device with empty storage tracks through the backend only", async () => {
  const emptyStorage={getItem:()=>null,setItem:()=>undefined,removeItem:()=>undefined};
  assert.deepEqual(getRecentGuestOrders(emptyStorage),[]);
  const handler=createOrderTrackHandler(async(orderId,phone)=>orderId===stored.order_id&&phone==="94740529061"?stored:null),result=response();
  await handler(request({orderId:"  zev-test-1  ",phone:"740529061"},{origin},"198.51.102.1"),result.res);
  assert.equal(result.state.status,200);
  assert.equal((result.state.body as {orderId:string}).orderId,stored.order_id);
});

test("order and phone must match the same database record", async()=>{
  const handler=createOrderTrackHandler(async(orderId,phone)=>orderId===stored.order_id&&phone==="94740529061"?stored:null),wrongPhone=response(),wrongOrder=response();
  await handler(request({orderId:stored.order_id,phone:"0740529062"},{origin},"198.51.102.2"),wrongPhone.res);
  await handler(request({orderId:"ZEV-WRONG",phone:"0740529061"},{origin},"198.51.102.3"),wrongOrder.res);
  assert.equal(wrongPhone.state.status,404);assert.equal(wrongOrder.state.status,404);assert.deepEqual(wrongPhone.state.body,wrongOrder.state.body);
});

test("wrong phone and unknown ID return the same generic not-found response", async () => {
  const handler = createOrderTrackHandler(async () => null), expected = { error: "Order or pre-order details could not be found." };
  const wrong = response();
  await handler(request({ orderId: stored.order_id, phone: "0770000001" }, { origin }, "198.51.100.3"), wrong.res);
  const unknown = response();
  await handler(request({ orderId: "ZEV-UNKNOWN", phone: "0770000000" }, { origin }, "198.51.100.4"), unknown.res);
  assert.equal(wrong.state.status, 404);
  assert.equal(unknown.state.status, 404);
  assert.deepEqual(wrong.state.body, expected);
  assert.deepEqual(unknown.state.body, expected);
});

test("PRE ID and matching phone return only safe preorder tracking fields",async()=>{
  const storedPreorder={request_id:"PRE-TEST-1",created_at:"2026-10-08T10:00:00.000Z",customer_name:"Guest Customer",phone:"0770000000",product_name:"Linen Dress",color:"Ivory",size:"M",quantity:2,requested_price:5000,status:"converted",converted_order_id:"ZEV-LINKED-1",payment_submitted_at:"2026-10-08T10:01:00.000Z",payment_verified_at:"2026-10-08T12:00:00.000Z",claim_token_hash:"secret",payment_receipt_public_id:"private",notes:"internal",batch_id:"supplier"};
  const handler=createOrderTrackHandler(async()=>null,async(id,phone)=>id==="PRE-TEST-1"&&phone==="94770000000"?storedPreorder:null),result=response();
  await handler(request({orderId:"#pre-test-1",phone:"0770000000"},{origin},"198.51.103.1"),result.res);
  assert.equal(result.state.status,200);const body=result.state.body as Record<string,unknown>;
  assert.equal(body.kind,"preorder");assert.equal(body.statusLabel,"Delivery order created");assert.equal(body.convertedOrderId,"ZEV-LINKED-1");
  for(const field of ["claim_token_hash","payment_receipt_public_id","notes","batch_id","phone"])assert.equal(field in body,false);
  assert.equal(JSON.stringify(body).includes("secret"),false);assert.equal(JSON.stringify(body).includes("private"),false);
});

test("public numeric preorder number can be used for guest tracking",async()=>{
  const storedPreorder={request_id:"PRE-TEST-1",preorder_number:200,created_at:"2026-10-08T10:00:00.000Z",customer_name:"Guest Customer",product_name:"Linen Dress",color:"Ivory",size:"M",quantity:1,requested_price:5000,status:"confirmed",payment_submitted_at:"2026-10-08T10:01:00.000Z",payment_verified_at:"2026-10-08T12:00:00.000Z"};
  const seen:string[]=[];
  const handler=createOrderTrackHandler(async()=>null,async(id,phone)=>{seen.push(id);return id==="PRE-TEST-1"&&phone==="94770000000"?storedPreorder:null;},undefined,async number=>number===200?"PRE-TEST-1":null),result=response();
  await handler(request({orderId:"PRE-200",phone:"0770000000"},{origin},"198.51.103.9"),result.res);
  assert.equal(result.state.status,200);assert.deepEqual(seen,["PRE-TEST-1"]);assert.equal((result.state.body as {preorderNumber:number}).preorderNumber,200);
});

test("PRE lookup with wrong phone fails with the same generic response",async()=>{
  const handler=createOrderTrackHandler(async()=>null,async()=>null),result=response();await handler(request({orderId:"PRE-TEST-1",phone:"0770000001"},{origin},"198.51.103.2"),result.res);
  assert.equal(result.state.status,404);assert.deepEqual(result.state.body,{error:"Order or pre-order details could not be found."});
});

test("malformed tracking references fail before database lookup",async()=>{let called=false;const find=async()=>{called=true;return stored;},handler=createOrderTrackHandler(find,find),result=response();await handler(request({orderId:"BAD-1",phone:"0770000000"},{origin},"198.51.103.3"),result.res);assert.equal(result.state.status,400);assert.equal(called,false);});

test("customer preorder status labels are safe and complete",()=>{
  assert.equal(preorderCustomerStatusLabel("payment_submitted"),"Payment submitted — awaiting verification");assert.equal(preorderCustomerStatusLabel("paid"),"Payment verified");
  for(const [status,label] of [["confirmed","Pre-order confirmed"],["in_transit","On the way"],["arrived","Arrived"],["ready","Ready for delivery"]])assert.equal(preorderCustomerStatusLabel(status),label);
});

test("missing Origin is rejected", async () => {
  const handler = createOrderTrackHandler(async () => stored), { res, state } = response();
  await handler(request({ orderId: stored.order_id, phone: "0770000000" }, {}, "198.51.100.5"), res);
  assert.equal(state.status, 403);
});

test("incorrect Origin is rejected", async () => {
  const handler = createOrderTrackHandler(async () => stored), { res, state } = response();
  await handler(request({ orderId: stored.order_id, phone: "0770000000" }, { origin: "https://attacker.example" }, "198.51.100.15"), res);
  assert.equal(state.status, 403);
});

test("Order ID alone cannot retrieve an order", async () => {
  let called = false;
  const handler = createOrderTrackHandler(async () => { called = true; return stored; }), { res, state } = response();
  await handler(request({ orderId: stored.order_id }, { origin }, "198.51.100.16"), res);
  assert.equal(state.status, 400);
  assert.equal(called, false);
});

test("invalid and unknown input fields are rejected", async () => {
  const handler = createOrderTrackHandler(async () => stored), { res, state } = response();
  await handler(request({ orderId: "", phone: "bad", extra: true }, { origin }, "198.51.100.6"), res);
  assert.equal(state.status, 400);
});

test("tracking attempts are rate limited", async () => {
  const handler = createOrderTrackHandler(async () => null), ip = "198.51.100.7";
  let last = response();
  for (let attempt = 0; attempt < 11; attempt += 1) {
    last = response();
    await handler(request({ orderId: "ZEV-RATE", phone: "0770000000" }, { origin }, ip), last.res);
  }
  assert.equal(last.state.status, 429);
  assert.ok(Number(last.state.headers["Retry-After"]) > 0);
});

test("unsafe tracking URLs are stripped and never considered clickable", async () => {
  const handler = createOrderTrackHandler(async () => ({ ...stored, tracking_url: "javascript:alert(1)" })), result = response();
  await handler(request({ orderId: stored.order_id, phone: "0770000000" }, { origin }, "198.51.100.18"), result.res);
  assert.equal((result.state.body as { trackingUrl: string }).trackingUrl, "");
  assert.equal(safeHttpsUrl("http://courier.example/track"), "");
  assert.equal(safeHttpsUrl("https://courier.example/track"), "https://courier.example/track");
});

test("recent guest orders keep five unique IDs without personal data and query IDs prefill", () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  for (let index = 1; index <= 6; index += 1) rememberGuestOrder({ orderId: `zev-test-${index}`, createdAt: `2026-10-0${index}T00:00:00.000Z` }, storage);
  rememberGuestOrder({ orderId: "ZEV-TEST-6", createdAt: "2026-10-08T00:00:00.000Z" }, storage);
  const recent = getRecentGuestOrders(storage), serialized = JSON.stringify(recent);
  assert.equal(recent.length, 5);
  assert.equal(new Set(recent.map((item) => item.orderId)).size, 5);
  assert.equal(serialized.includes("phone"), false);
  assert.equal(serialized.includes("name"), false);
  assert.equal(serialized.includes("address"), false);
  assert.equal(orderIdFromSearch("?orderId=ZEV-TEST-1"), "ZEV-TEST-1");
});

test("recent guest order IDs expire after ninety days",()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  rememberGuestOrder({orderId:"ZEV-OLD",createdAt:new Date(Date.now()-91*24*60*60*1000).toISOString()},storage);
  assert.deepEqual(getRecentGuestOrders(storage),[]);
});

test("PDF helper handles single, long, and multi-page orders", async () => {
  const base = { orderId: "ZEV-PDF-TEST", createdAt: "2026-10-08T10:00:00.000Z", orderStatus: "confirmed", paymentMethod: "cod", paymentStatus: "COD", customerName: "Test Customer", address1: "A very long delivery address that should wrap cleanly without touching the next section or leaving the printable area", address2: "Apartment 12, Building Seven", city: "Colombo", district: "Colombo", postalCode: "00100", deliveryZoneName: "Colombo", subtotal: 8000, deliveryFee: 450, total: 8450 };
  const single = await createOrderPdf({ ...base, items: [{ name: "A single product with an intentionally long descriptive product name that must wrap", color: "Black", size: "M", quantity: 1, unitPrice: 8000 }] });
  assert.equal(single.getNumberOfPages(), 1);
  const many = await createOrderPdf({ ...base, items: Array.from({ length: 45 }, (_, index) => ({ name: `Test product with a safely wrapping long name ${index + 1}`, color: "Black / limited seasonal colour", size: "M", quantity: 1, unitPrice: 250 })) });
  assert.ok(many.getNumberOfPages() > 1);
});

test("invoice payment status reflects confirmed order payment state", () => {
  assert.equal(invoicePaymentStatus({ paymentMethod: "cod", paymentStatus: "pending" }), "Pay on delivery");
  assert.equal(invoicePaymentStatus({ paymentMethod: "cod", paymentStatus: "pending", fulfillmentMethod: "pickup" }), "Pay at pickup");
  assert.equal(invoicePaymentStatus({ paymentMethod: "bank", paymentStatus: "pending_verification" }), "Pending verification");
  assert.equal(invoicePaymentStatus({ paymentMethod: "bank", paymentStatus: "verified" }), "Paid");
  assert.equal(invoicePaymentStatus({ paymentMethod: "bank", paymentStatus: "paid" }), "Paid");
});

test("one invoice helper supports tracked and account order snapshots",()=>{const tracked={kind:"order" as const,...({orderId:"ZEV-1",createdAt:"2026-01-01",customerName:"A",address1:"",address2:"",city:"",district:"",postalCode:"",orderStatus:"confirmed",paymentMethod:"bank",paymentStatus:"pending",deliveryZoneName:"",fulfilmentCourierName:"",trackingNumber:"",trackingUrl:"",courierSentDate:"",subtotal:1000,discountCode:"",discountAmount:0,deliveryFee:0,total:1000,items:[{name:"Top",color:"Black",size:"M",quantity:1,unitPrice:1000,isPreorder:false}]})};assert.equal(normalizeInvoiceOrder(tracked).items[0].unitPrice,1000);});

test("invoice and preorder summary downloads are exposed on every customer surface",async()=>{const [checkout,order,track,account,preorder,invoice,summary]=await Promise.all(["CheckoutPage.tsx","OrderPage.tsx","TrackOrderPage.tsx","CustomerOrdersPage.tsx","PreorderPage.tsx"].map(name=>readFile(new URL(`../src/pages/${name}`,import.meta.url),"utf8")).concat([readFile(new URL("../src/utils/invoicePdf.ts",import.meta.url),"utf8"),readFile(new URL("../src/utils/preorderSummaryPdf.ts",import.meta.url),"utf8")]));assert.match(checkout,/downloadInvoicePdf/);assert.match(order,/DOWNLOAD INVOICE/);assert.match(track,/DOWNLOAD INVOICE/);assert.match(account,/DOWNLOAD INVOICE/);assert.match(preorder,/Download pre-order summary/i);assert.match(track,/DOWNLOAD PRE-ORDER SUMMARY/);assert.match(account,/DOWNLOAD PRE-ORDER SUMMARY/);assert.doesNotMatch(summary,/ORDER INVOICE|FINAL INVOICE/);assert.match(summary,/PRE-ORDER SUMMARY/);assert.match(invoice,/normalizeInvoiceOrder/);});


test("checkout uses public order numbers and pickup-safe payment copy", async () => {
  const checkout = await readFile(new URL("../src/pages/CheckoutPage.tsx", import.meta.url), "utf8");
  const tracking = await readFile(new URL("../src/pages/TrackOrderPage.tsx", import.meta.url), "utf8");
  assert.match(checkout, /orderId: String\(order\.orderNumber \|\| order\.orderId\)/);
  assert.match(checkout, /#\{order\.orderNumber \|\| order\.orderId\}/);
  assert.match(checkout, /Pay at Pickup/);
  assert.match(checkout, /when you collect your order/);
  assert.doesNotMatch(checkout, /<strong[^>]*>#\{order\.orderId\}<\/strong>/);
  assert.match(tracking, /placeholder="200 or PRE-200"/);
});


test("guest tracking query returns public order and fulfillment fields", async () => {
  const source = await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts", import.meta.url), "utf8");
  const tracking = await readFile(new URL("../src/pages/TrackOrderPage.tsx", import.meta.url), "utf8");
  assert.match(source, /SELECT o\.order_id,o\.order_number,o\.created_at/);
  assert.match(source, /o\.fulfillment_method,o\.delivery_method_name,o\.delivery_area_group_name,o\.pickup_branch_name/);
  assert.match(tracking, /removeRecentGuestOrder\(result\.orderId\)/);
  assert.match(tracking, /Pay at pickup/);
});
