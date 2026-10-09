import test from "node:test";
import assert from "node:assert/strict";
import { enforceOnlineStoreAvailability } from "../shared/order-source.ts";

test("web orders obey storefront availability switches", () => {
  assert.equal(enforceOnlineStoreAvailability(), true);
  assert.equal(enforceOnlineStoreAvailability(""), true);
  assert.equal(enforceOnlineStoreAvailability("web"), true);
  assert.equal(enforceOnlineStoreAvailability(" WEB "), true);
});

test("admin multichannel orders can be recorded while storefront ordering is paused", () => {
  assert.equal(enforceOnlineStoreAvailability("manual"), false);
  assert.equal(enforceOnlineStoreAvailability("instagram"), false);
  assert.equal(enforceOnlineStoreAvailability("whatsapp"), false);
  assert.equal(enforceOnlineStoreAvailability("preorder"), false);
});
