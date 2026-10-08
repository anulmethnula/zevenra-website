import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOrderTrackHandler } from "../api/order-track.js";

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
  payment_receipt_public_id: "secret-receipt", admin_notes: "internal", customer_id: "internal-customer",
  items: [{ id: 44, product_id: "internal-product", variant_id: "internal-variant", sku: "SECRET-SKU", name: "Classic Fit", color: "Black", size: "M", quantity: 2, unitPrice: 2000, isPreorder: false }],
};

test.before(() => { process.env.ALLOWED_ORIGIN = origin; });

test("correct ID and phone returns only the safe customer order", async () => {
  const handler = createOrderTrackHandler(async (orderId, phone) => orderId === stored.order_id && phone === "+94 77-000-0000" ? stored : null),
    { res, state } = response();
  await handler(request({ orderId: stored.order_id, phone: "+94 77-000-0000" }, { origin }, "198.51.100.2"), res);
  assert.equal(state.status, 200);
  assert.deepEqual(Object.keys(state.body as object).sort(), ["city","createdAt","customerName","deliveryFee","deliveryZoneName","district","items","orderId","orderStatus","paymentMethod","paymentStatus","subtotal","total"].sort());
  const result = state.body as { items: Array<Record<string, unknown>> };
  assert.deepEqual(Object.keys(result.items[0]).sort(), ["color","isPreorder","name","quantity","size","unitPrice"].sort());
  assert.equal(JSON.stringify(state.body).includes("secret-receipt"), false);
  assert.equal(JSON.stringify(state.body).includes("internal"), false);
  assert.equal(JSON.stringify(state.body).includes("SECRET-SKU"), false);
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
