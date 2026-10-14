import assert from "node:assert/strict";
import test from "node:test";
import {
  returnTransitionAllowed,
  validateReturnRequest,
} from "../shared/return-lifecycle.ts";
import { returnTypeAllowedForOrder } from "../server/api-implementation/_data/returns.ts";

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

test("courier RTO must cover the complete dispatched order", () => {
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
    /complete dispatched order/,
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

test("return type eligibility uses canonical order statuses", () => {
  assert.equal(returnTypeAllowedForOrder("dispatched", "courier_rto"), true);
  assert.equal(returnTypeAllowedForOrder("confirmed", "courier_rto"), false);
  assert.equal(returnTypeAllowedForOrder("delivered", "customer_return"), true);
  assert.equal(returnTypeAllowedForOrder("dispatched", "customer_return"), false);
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

test("return validation normalizes PostgreSQL bigint IDs",()=>assert.doesNotThrow(()=>validateReturnRequest([{id:"42" as unknown as number,quantity:2}],[{orderItemId:42,quantity:1}])));
