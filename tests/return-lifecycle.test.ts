import assert from "node:assert/strict";
import test from "node:test";
import {
  returnTransitionAllowed,
  validateReturnRequest,
} from "../shared/return-lifecycle.ts";

test("return lifecycle only allows forward operational transitions", () => {
  assert.equal(returnTransitionAllowed("requested", "approved"), true);
  assert.equal(returnTransitionAllowed("requested", "in_transit"), true);
  assert.equal(returnTransitionAllowed("approved", "in_transit"), true);
  assert.equal(returnTransitionAllowed("in_transit", "received"), true);
  assert.equal(returnTransitionAllowed("received", "completed"), true);
  assert.equal(returnTransitionAllowed("completed", "received"), false);
  assert.equal(returnTransitionAllowed("rejected", "approved"), false);
});

test("partial customer return can cover fewer than all purchased items", () => {
  assert.doesNotThrow(() =>
    validateReturnRequest(
      [
        { id: 1, quantity: 2 },
        { id: 2, quantity: 1 },
      ],
      [{ orderItemId: 1, quantity: 1 }],
      false,
    ),
  );
});

test("courier RTO must cover the complete shipped order", () => {
  assert.throws(
    () =>
      validateReturnRequest(
        [
          { id: 1, quantity: 2 },
          { id: 2, quantity: 1 },
        ],
        [{ orderItemId: 1, quantity: 2 }],
        true,
      ),
    /complete shipped order/,
  );
  assert.doesNotThrow(() =>
    validateReturnRequest(
      [
        { id: 1, quantity: 2 },
        { id: 2, quantity: 1 },
      ],
      [
        { orderItemId: 1, quantity: 2 },
        { orderItemId: 2, quantity: 1 },
      ],
      true,
    ),
  );
});

test("return validation rejects duplicate, unknown, and excessive item quantities", () => {
  const purchased = [{ id: 1, quantity: 2 }];
  assert.throws(
    () =>
      validateReturnRequest(
        purchased,
        [
          { orderItemId: 1, quantity: 1 },
          { orderItemId: 1, quantity: 1 },
        ],
      ),
    /cannot be added twice/,
  );
  assert.throws(
    () => validateReturnRequest(purchased, [{ orderItemId: 2, quantity: 1 }]),
    /Invalid return item/,
  );
  assert.throws(
    () => validateReturnRequest(purchased, [{ orderItemId: 1, quantity: 3 }]),
    /exceeds the quantity purchased/,
  );
});
