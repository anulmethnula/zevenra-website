import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import adminHandler from "../api/admin/[action].js";
import orderHandler from "../api/orders.js";
import { adminCookie, makeSession, validOrigin } from "../api/_shared.js";

type ResponseState = { status: number; headers: Record<string, string>; body: unknown };

function response() {
  const state: ResponseState = { status: 200, headers: {}, body: undefined };
  const res = {
    status(code: number) { state.status = code; return res; },
    setHeader(name: string, value: string | number | readonly string[]) { state.headers[name] = String(value); return res; },
    json(value: unknown) { state.body = value; return res; },
  } as unknown as VercelResponse;
  return { res, state };
}

function request(method: string, action: string, headers: Record<string, string> = {}, body: unknown = {}) {
  return { method, query: { action }, headers, body, socket: {} } as unknown as VercelRequest;
}

test("GET mutation returns 405 with POST Allow header", async () => {
  const { res, state } = response();
  await adminHandler(request("GET", "saveSettings"), res);
  assert.equal(state.status, 405);
  assert.equal(state.headers.Allow, "POST");
});

test("POST read returns 405 with GET Allow header", async () => {
  const { res, state } = response();
  await adminHandler(request("POST", "dashboard"), res);
  assert.equal(state.status, 405);
  assert.equal(state.headers.Allow, "GET");
});

test("mutation origin validation rejects missing and wrong origins", () => {
  const config = { ALLOWED_ORIGIN: "https://shop.example" };
  assert.equal(validOrigin(request("POST", "saveSettings"), config), false);
  assert.equal(validOrigin(request("POST", "saveSettings", { origin: "https://evil.example", host: "shop.example", "x-forwarded-proto": "https" }), config), false);
});

test("admin internal error is logged and sanitized", async () => {
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.ADMIN_USERNAME = "owner";
  process.env.ADMIN_PASSWORD_HASH = "unused";
  process.env.ALLOWED_ORIGIN = "https://shop.example";
  delete process.env.DATABASE_URL;
  const cookie = adminCookie(makeSession(process.env.SESSION_SECRET));
  const { res, state } = response();
  const original = console.error;
  let logged = false;
  console.error = () => { logged = true; };
  try {
    await adminHandler(request("GET", "getProduct", { cookie }), res);
  } finally {
    console.error = original;
  }
  assert.equal(state.status, 500);
  assert.deepEqual(state.body, { error: "The operation could not be completed." });
  assert.equal(logged, true);
});

test("order internal error is logged and sanitized", async () => {
  process.env.ALLOWED_ORIGIN = "https://shop.example";
  delete process.env.DATABASE_URL;
  const { res, state } = response();
  const original = console.error;
  console.error = () => {};
  try {
    await orderHandler(request("POST", "", { origin: "https://shop.example" }, {
      customerName: "Test Customer", phone: "+94770000000", email: "",
      address1: "1 Test Street", city: "Colombo", district: "Colombo", postalCode: "",
      paymentMethod: "cod", items: [{ productId: "product", variantId: "variant", quantity: 1 }],
    }), res);
  } finally {
    console.error = original;
  }
  assert.equal(state.status, 500);
  assert.deepEqual(state.body, { error: "We could not place the order. Your bag has not been cleared." });
});
