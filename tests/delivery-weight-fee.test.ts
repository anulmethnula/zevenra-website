import assert from "node:assert/strict";
import test from "node:test";
import { weightBasedDeliveryFee } from "../shared/delivery-weight-fee.ts";

const firstKgFee = 400;
const additionalKgFee = 150;

for (const [grams, expected] of [
  [700, 400],
  [1000, 400],
  [1001, 550],
  [1400, 550],
  [2000, 550],
  [2001, 700],
  [2300, 700],
] as const) {
  test(`${grams}g produces the correct courier fee`, () => {
    assert.equal(weightBasedDeliveryFee(grams, firstKgFee, additionalKgFee), expected);
  });
}
