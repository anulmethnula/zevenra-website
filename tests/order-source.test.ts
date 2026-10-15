import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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


test("order insert keeps stock state and pending status aligned with all parameters", async () => {
  const source = await readFile(new URL("../server/api-implementation/_data/orders.ts", import.meta.url), "utf8");
  assert.match(source, /\$29,\$30,'pending',\$31,\$32,\$33,\$34,\$35,\$36,\$37,\$38,\$39,\$40\)`/);
});
