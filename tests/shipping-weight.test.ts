import assert from "node:assert/strict";
import test from "node:test";
import { calculateShippingWeight } from "../shared/shipping-weight.ts";

test("product weight overrides its category default", () => {
  assert.deepEqual(calculateShippingWeight([{ productId:"dress", quantity:2, shippingWeightGrams:400, categoryDefaultShippingWeightGrams:350 }],30),{ready:true,totalProductWeightGrams:800,totalShippingWeightGrams:830});
});

test("category defaults support mixed future categories", () => {
  assert.deepEqual(calculateShippingWeight([{productId:"top",quantity:2,categoryDefaultShippingWeightGrams:150},{productId:"denim",quantity:1,categoryDefaultShippingWeightGrams:600}],30),{ready:true,totalProductWeightGrams:900,totalShippingWeightGrams:930});
});

test("missing product and category weight is reported instead of invented", () => {
  assert.deepEqual(calculateShippingWeight([{productId:"jacket",productName:"Jacket",quantity:1}],30),{ready:false,missing:[{productId:"jacket",productName:"Jacket"}]});
});
