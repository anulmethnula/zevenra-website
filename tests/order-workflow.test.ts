import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { customerOrderStatus,orderProgress } from "../src/utils/orderTracking.js";
import { cancelCustomerOrder } from "../server/api-implementation/_data/order-cancellation.js";
import { normalizeAdminOrderStatus,validOrderTransition } from "../server/api-implementation/_data/orders-legacy.js";
import { mapOrder, mapPreorder } from "../server/api-implementation/_data/mappers.js";
import { convertedOrderStatusLabel, normalizeOrderStatus } from "../shared/order-status.js";
import { selectDispatchCourierId, sriLankaDateTimeToIso } from "../shared/dispatch.js";

test("customer lifecycle exposes only pending, confirmed, dispatched and delivered",()=>{
  assert.deepEqual(orderProgress.map(([status])=>status),["pending","confirmed","dispatched","delivered"]);
  assert.equal(customerOrderStatus("packed"),"dispatched");
  assert.equal(customerOrderStatus("shipped"),"dispatched");
  assert.equal(customerOrderStatus("sourcing"),"dispatched");
});

test("admin normal order transitions are forward-only",()=>{
  assert.equal(validOrderTransition("pending","confirmed"),true);
  assert.equal(validOrderTransition("confirmed","dispatched"),true);
  assert.equal(validOrderTransition("dispatched","delivered"),true);
  assert.equal(validOrderTransition("delivered","pending"),false);
  assert.equal(validOrderTransition("confirmed","pending"),false);
});

test("legacy packed and shipped statuses normalize to dispatched",()=>{
  assert.equal(normalizeAdminOrderStatus("packed"),"dispatched");
  assert.equal(normalizeAdminOrderStatus("shipped"),"dispatched");
});

test("mapper exposes canonical dispatched for a legacy shipped row",()=>{
  assert.equal(mapOrder({order_status:"shipped"}).orderStatus,"dispatched");
  assert.equal(normalizeOrderStatus("shipped"),"dispatched");
});

test("preorder converted legacy shipped value displays Dispatched",()=>{
  const preorder=mapPreorder({converted_order_status:"shipped"});
  assert.equal(preorder.convertedOrderStatus,"dispatched");
  assert.equal(convertedOrderStatusLabel(preorder.convertedOrderStatus),"Dispatched");
});

test("dispatch defaults the only active courier and stores Sri Lanka handover time",()=>{
  assert.equal(selectDispatchCourierId([{id:"one",active:true},{id:"off",active:false}]),"one");
  assert.equal(selectDispatchCourierId([{id:"one",active:true},{id:"two",active:true}],"two"),"two");
  assert.equal(sriLankaDateTimeToIso("2026-10-14T12:30"),"2026-10-14T07:00:00.000Z");
});

test("owner COD pending cancellation restores normal stock once and creates evidence",async()=>{
  let status="pending",stockState="reserved",stock=2,notifications=0,audits=0;
  const client={query:async(sql:string,values?:unknown[])=>{
    if(sql.startsWith("SELECT * FROM orders"))return{rows:[{order_id:"ZEV-1",customer_id:"CUS-1",customer_name:"Anu",payment_method:"cod",order_status:status,stock_state:stockState}]};
    if(sql.startsWith("SELECT * FROM order_items"))return{rows:[{variant_id:"VAR-1",quantity:2,is_preorder:false}]};
    if(sql.startsWith("UPDATE variants")){stock+=Number(values?.[1]);return{rowCount:1,rows:[]};}
    if(sql.startsWith("UPDATE orders")){status="cancelled";stockState="restored";return{rowCount:1,rows:[]};}
    if(sql.includes("audit_logs")){audits++;return{rowCount:1,rows:[]};}
    if(sql.includes("admin_notifications")){notifications++;return{rowCount:1,rows:[]};}
    return{rowCount:1,rows:[]};
  }};
  const transact=(async(work:(value:typeof client)=>Promise<unknown>)=>work(client)) as never;
  await cancelCustomerOrder("CUS-1",{orderId:"ZEV-1",reason:"Changed my mind"},transact);
  await cancelCustomerOrder("CUS-1",{orderId:"ZEV-1",reason:"Changed my mind"},transact);
  assert.equal(stock,4);assert.equal(audits,1);assert.equal(notifications,1);
});

test("owner COD confirmed cancellation is allowed",async()=>{
  let status="confirmed";
  const client={query:async(sql:string)=>{
    if(sql.startsWith("SELECT * FROM orders"))return{rows:[{order_id:"ZEV-3",customer_id:"CUS-1",customer_name:"Anu",payment_method:"cod",order_status:status,stock_state:"restored"}]};
    if(sql.startsWith("UPDATE orders"))status="cancelled";
    return{rowCount:1,rows:[]};
  }};
  const transact=(async(work:(value:typeof client)=>Promise<unknown>)=>work(client)) as never;
  await cancelCustomerOrder("CUS-1",{orderId:"ZEV-3",reason:"Changed my mind"},transact);
  assert.equal(status,"cancelled");
});

test("customer cancellation rejects bank, dispatched, and wrong-owner orders",async()=>{
  for(const order of [{customer_id:"CUS-1",payment_method:"bank",order_status:"pending"},{customer_id:"CUS-1",payment_method:"cod",order_status:"dispatched"},{customer_id:"OTHER",payment_method:"cod",order_status:"pending"}]){
    const transact=(async(work:(client:{query:(sql:string)=>Promise<{rows:unknown[]}>})=>Promise<unknown>)=>work({query:async()=>({rows:[{...order,order_id:"ZEV-2",stock_state:"reserved"}]})})) as never;
    await assert.rejects(cancelCustomerOrder("CUS-1",{orderId:"ZEV-2",reason:"Ordered by mistake"},transact),/ORDER_NOT_CANCELLABLE/);
  }
});

test("migration carries cancellation metadata, notifications, and dispatched constraint",async()=>{
  const sql=await readFile(new URL("../database/migrations/026_order_workflow_notifications.sql",import.meta.url),"utf8");
  assert.match(sql,/cancelled_from_status/);assert.match(sql,/admin_notifications/);assert.match(sql,/packed','shipped/);assert.match(sql,/dispatched/);
});

test("forward migration stores only the current order status vocabulary",async()=>{
  const sql=await readFile(new URL("../database/migrations/027_dispatched_order_status.sql",import.meta.url),"utf8");
  assert.match(sql,/UPDATE orders SET order_status='dispatched'/);
  assert.match(sql,/pending','confirmed','dispatched','delivered','cancelled/);
});

test("admin order UI uses a simple forward flow and avoids duplicate refreshes",async()=>{
  const source=await readFile(new URL("../src/pages/admin/AdminPage.tsx",import.meta.url),"utf8");
  assert.match(source,/updateInFlight\.current\.has\(orderId\)/);
  assert.match(source,/finally[\s\S]*updateInFlight\.current\.delete\(orderId\)/);
  assert.match(source,/const updated = await updateOrder\(\{ orderId, \.\.\.patch \}\)/);
  assert.match(source,/const cached = admin\.orders\.find/);
  assert.match(source,/Start processing/);
  assert.match(source,/Dispatch order/);
  assert.match(source,/Mark delivered/);
  assert.match(source,/Receipt decision/);
  assert.match(source,/<option value="verified">Verified<\/option>/);
  assert.match(source,/<option value="rejected">Rejected<\/option>/);
  assert.doesNotMatch(source,/Payment status[\s\S]{0,500}refund pending/);
  assert.match(source,/fulfilmentCourierId:dispatchCourierId/);
  assert.doesNotMatch(source,/fulfilmentCourierProviderId:dispatchCourierId/);
  assert.match(source,/courierSentDate:sriLankaDateTimeToIso\(dispatchHandover\)/);
  assert.match(source,/CONFIRM HANDOVER/);
  assert.match(source,/if \(expanded\) void load\(\)/);
});

test("dispatch keeps optional tracking fields empty instead of writing database nulls",async()=>{
  const source=await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts",import.meta.url),"utf8");
  assert.match(source,/key === "trackingNumber" \|\| key === "trackingUrl"/);
  assert.match(source,/String\(input\[key\] \?\? ""\)\.trim\(\)/);
});

test("rejected bank receipts cannot continue fulfilment and processing rolls back safely",async()=>{
  const backend=await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts",import.meta.url),"utf8");
  const ui=await readFile(new URL("../src/pages/admin/AdminPage.tsx",import.meta.url),"utf8");
  assert.match(backend,/paymentRollback = rejectingBankPayment && currentStatus === "confirmed"/);
  assert.match(backend,/\["confirmed", "dispatched", "delivered"\]\.includes\(nextStatus\) && !bankReady/);
  assert.match(ui,/bankPaymentReady/);
  assert.match(ui,/Receipt rejected\. Processing is locked until the payment is verified\./);
});

test("delivery cleanup creates an empty actual-courier registry and drops the legacy model",async()=>{
  const sql=await readFile(new URL("../database/migrations/028_delivery_architecture_cleanup.sql",import.meta.url),"utf8");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS fulfilment_couriers/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS fulfilment_courier_id/);
  for(const table of ["courier_rates","courier_rate_import_rows","courier_rate_cards","delivery_rates","courier_providers"])assert.match(sql,new RegExp(`DROP TABLE IF EXISTS ${table}`));
  assert.match(sql,/DELETE FROM site_settings WHERE key='defaultCourierProviderId'/);
  assert.doesNotMatch(sql,/INSERT INTO fulfilment_couriers/i);
  assert.doesNotMatch(sql,/SONIK/i);
});


test("repeat owner cancellation is idempotent and preserves original cancellation evidence", async () => {
  const source = await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts", import.meta.url), "utf8");
  assert.match(source, /\["pending","confirmed","cancelled"\]\.includes\(currentStatus\)/);
  assert.match(source, /currentStatus!=="cancelled"&&!cancellationReason/);
  assert.match(source, /nextStatus==="cancelled"&&currentStatus!=="cancelled"\)\{values\.push\(cancellationReason\)/);
});
