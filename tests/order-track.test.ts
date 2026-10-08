import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOrderTrackHandler } from "../api/order-track.js";
import { normalizeOrderIdForLookup, normalizeSriLankanPhoneForLookup } from "../api/_order-track-normalization.js";
import { getRecentGuestOrders, orderIdFromSearch, rememberGuestOrder } from "../src/utils/guestOrders.js";
import { createOrderPdf } from "../src/utils/orderPdf.js";
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
  order_id: "ZEV-TEST-1", created_at: "2026-10-08T10:00:00.000Z", customer_name: "Guest Customer",
  city: "Colombo", district: "Colombo", order_status: "confirmed", payment_method: "cod",
  payment_status: "COD", delivery_zone_name: "Colombo", subtotal: 4000, delivery_fee: 450, total: 4450,
  fulfilment_courier_name: "Test Courier", tracking_number: "TRACK-123", tracking_url: "https://courier.example/track/TRACK-123", courier_sent_date: "2026-10-09T10:00:00.000Z",
  payment_receipt_public_id: "secret-receipt", admin_notes: "internal", customer_id: "internal-customer",
  items: [{ id: 44, product_id: "internal-product", variant_id: "internal-variant", sku: "SECRET-SKU", name: "Classic Fit", color: "Black", size: "M", quantity: 2, unitPrice: 2000, isPreorder: false }],
};

test.before(() => { process.env.ALLOWED_ORIGIN = origin; });

test("correct normalized ID and phone return only the safe customer order", async () => {
  const handler = createOrderTrackHandler(async (orderId, phone) => orderId === stored.order_id && phone === "94770000000" ? stored : null),
    { res, state } = response();
  await handler(request({ orderId: stored.order_id, phone: "+94 77-000-0000" }, { origin }, "198.51.100.2"), res);
  assert.equal(state.status, 200);
  assert.deepEqual(Object.keys(state.body as object).sort(), ["city","courierSentDate","createdAt","customerName","deliveryFee","deliveryZoneName","district","fulfilmentCourierName","items","orderId","orderStatus","paymentMethod","paymentStatus","subtotal","total","trackingNumber","trackingUrl"].sort());
  const result = state.body as { items: Array<Record<string, unknown>> };
  assert.deepEqual(Object.keys(result.items[0]).sort(), ["color","isPreorder","name","quantity","size","unitPrice"].sort());
  assert.equal(JSON.stringify(state.body).includes("secret-receipt"), false);
  assert.equal(JSON.stringify(state.body).includes("internal"), false);
  assert.equal(JSON.stringify(state.body).includes("SECRET-SKU"), false);
  assert.equal((state.body as { trackingUrl: string }).trackingUrl, stored.tracking_url);
});

test("lookup normalization accepts copied IDs and Sri Lankan phone formats", async () => {
  assert.equal(normalizeOrderIdForLookup("#zev-test-1"), "ZEV-TEST-1");
  assert.equal(normalizeOrderIdForLookup("# zev-test-1 "), "ZEV-TEST-1");
  for (const phone of ["0740529061", "+94 74 052 9061", "94740529061", "0094740529061"])
    assert.equal(normalizeSriLankanPhoneForLookup(phone), "94740529061");
  const seen: Array<[string, string]> = [], handler = createOrderTrackHandler(async (orderId, phone) => { seen.push([orderId, phone]); return stored; });
  for (const [index, phone] of ["0740529061", "+94 74 052 9061", "0094740529061"].entries()) {
    const result = response();
    await handler(request({ orderId: "#zev-test-1", phone }, { origin }, `198.51.101.${index + 1}`), result.res);
    assert.equal(result.state.status, 200);
  }
  assert.deepEqual(seen, Array(3).fill(["ZEV-TEST-1", "94740529061"]));
});

test("wrong phone and unknown ID return the same generic not-found response", async () => {
  const handler = createOrderTrackHandler(async () => null), expected = { error: "Order details could not be found." };
  const wrong = response();
  await handler(request({ orderId: stored.order_id, phone: "0770000001" }, { origin }, "198.51.100.3"), wrong.res);
  const unknown = response();
  await handler(request({ orderId: "ZEV-UNKNOWN", phone: "0770000000" }, { origin }, "198.51.100.4"), unknown.res);
  assert.equal(wrong.state.status, 404);
  assert.equal(unknown.state.status, 404);
  assert.deepEqual(wrong.state.body, expected);
  assert.deepEqual(unknown.state.body, expected);
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

test("PDF helper builds multiple order lines", async () => {
  const doc = await createOrderPdf({
    orderId: "ZEV-PDF-TEST", createdAt: "2026-10-08T10:00:00.000Z", orderStatus: "confirmed", paymentMethod: "cod", paymentStatus: "COD", customerName: "Test Customer", city: "Colombo", district: "Colombo", deliveryZoneName: "Colombo", subtotal: 8000, deliveryFee: 450, total: 8450,
    items: Array.from({ length: 30 }, (_, index) => ({ name: `Test product with a safely wrapping long name ${index + 1}`, color: "Black", size: "M", quantity: 1, unitPrice: 250 })),
  });
  assert.ok(doc.getNumberOfPages() > 1);
});
