import assert from "node:assert/strict";
import test from "node:test";
import {
  isPreorderTransitionAllowed,
  normalizePreorderPaymentMethod,
  preorderDeliveryAddressReady,
  resolvePreorderConfirmedPrice,
} from "../shared/preorder-lifecycle.ts";

test("preorder lifecycle accepts only forward/admin-safe transitions", () => {
  assert.equal(isPreorderTransitionAllowed("new", "contacted"), true);
  assert.equal(isPreorderTransitionAllowed("contacted", "confirmed"), true);
  assert.equal(isPreorderTransitionAllowed("confirmed", "batched"), false);
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
