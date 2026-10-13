import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { preorderConversionSchema } from "../api/_shared.ts";
import {
  isPreorderTransitionAllowed,
  normalizePreorderPaymentMethod,
  preorderDeliveryAddressReady,
  resolvePreorderConfirmedPrice,
} from "../shared/preorder-lifecycle.ts";

test("preorder lifecycle accepts only forward/admin-safe transitions", () => {
  assert.equal(isPreorderTransitionAllowed("new", "contacted"), true);
  assert.equal(isPreorderTransitionAllowed("contacted", "confirmed"), true);
  assert.equal(isPreorderTransitionAllowed("confirmed", "ordered"), true);
  assert.equal(isPreorderTransitionAllowed("confirmed", "batched"), false);
  assert.equal(isPreorderTransitionAllowed("batched", "ordered"), true);
  assert.equal(isPreorderTransitionAllowed("ready", "converted"), false);
  assert.equal(isPreorderTransitionAllowed("converted", "cancelled"), false);
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
  assert.match(listQuery, /request_id,created_at,updated_at/);
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
