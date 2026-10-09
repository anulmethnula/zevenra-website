import assert from "node:assert/strict";
import test from "node:test";
import { classifyCourierRateDuplicates } from "../shared/courier-rate-dedup.ts";

test("identical duplicate destination rates keep one canonical row", () => {
  const result = classifyCourierRateDuplicates([
    { rowNumber: 3, destinationKey: "colombo\u0000nugegoda", firstKgCharge: 400, additionalKgCharge: 100, hasValidationErrors: false },
    { rowNumber: 20, destinationKey: "colombo\u0000nugegoda", firstKgCharge: 400, additionalKgCharge: 100, hasValidationErrors: false },
    { rowNumber: 40, destinationKey: "colombo\u0000nugegoda", firstKgCharge: 400, additionalKgCharge: 100, hasValidationErrors: false },
  ]);
  assert.equal(result.get(3), "unique");
  assert.equal(result.get(20), "duplicate");
  assert.equal(result.get(40), "duplicate");
});

test("conflicting prices for the same destination block every ambiguous row", () => {
  const result = classifyCourierRateDuplicates([
    { rowNumber: 4, destinationKey: "colombo\u0000orugodawatta", firstKgCharge: 350, additionalKgCharge: 100, hasValidationErrors: false },
    { rowNumber: 9, destinationKey: "colombo\u0000orugodawatta", firstKgCharge: 400, additionalKgCharge: 100, hasValidationErrors: false },
  ]);
  assert.equal(result.get(4), "conflict");
  assert.equal(result.get(9), "conflict");
});

test("invalid rows are not allowed to turn a valid row into a duplicate conflict", () => {
  const result = classifyCourierRateDuplicates([
    { rowNumber: 5, destinationKey: "galle\u0000galle", firstKgCharge: 450, additionalKgCharge: 100, hasValidationErrors: false },
    { rowNumber: 6, destinationKey: "galle\u0000galle", firstKgCharge: null, additionalKgCharge: 100, hasValidationErrors: true },
  ]);
  assert.equal(result.get(5), "unique");
  assert.equal(result.get(6), "unique");
});
