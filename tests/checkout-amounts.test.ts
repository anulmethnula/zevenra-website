import test from "node:test";
import assert from "node:assert/strict";
import { checkoutAmounts } from "../src/utils/checkoutAmounts.ts";

test("LKR 1600 plus LKR 400 produces LKR 2000",()=>{assert.deepEqual(checkoutAmounts(1600,400,true),{ready:true,subtotal:1600,deliveryFee:400,total:2000});});
test("LKR 1600 plus LKR 500 produces LKR 2100",()=>{assert.equal(checkoutAmounts(1600,500,true).total,2100);});
test("free delivery keeps the transfer amount at the subtotal",()=>{assert.deepEqual(checkoutAmounts(1600,0,true),{ready:true,subtotal:1600,deliveryFee:0,total:1600});});
test("an unresolved delivery quote has no final transfer amount",()=>{assert.deepEqual(checkoutAmounts(1600,0,false),{ready:false,subtotal:1600,deliveryFee:0,total:undefined});});
test("recomputes immediately when cart or delivery values change",()=>{assert.equal(checkoutAmounts(1600,500,true).total,2100);assert.equal(checkoutAmounts(3200,0,true).total,3200);});
