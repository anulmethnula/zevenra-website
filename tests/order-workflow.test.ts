import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { customerOrderStatus,orderProgress } from "../src/utils/orderTracking.js";
import { cancelCustomerOrder } from "../server/api-implementation/_data/order-cancellation.js";
import { normalizeAdminOrderStatus,validOrderTransition } from "../server/api-implementation/_data/orders-legacy.js";

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

test("admin status UI blocks duplicates, restores server state, and captures dispatch details",async()=>{
  const source=await readFile(new URL("../src/pages/admin/AdminPage.tsx",import.meta.url),"utf8");
  assert.match(source,/updateInFlight\.current\.has\(orderId\)/);
  assert.match(source,/finally[\s\S]*updateInFlight\.current\.delete\(orderId\)/);
  assert.match(source,/adminApi\.get<AdminOrderDetail>\("getOrder"/);
  assert.match(source,/fulfilmentCourierProviderId:dispatchCourierId/);
  assert.match(source,/courierSentDate:new Date\(dispatchHandover\)\.toISOString\(\)/);
  assert.match(source,/Tracking number \(optional\)/);
  assert.match(source,/Tracking URL \(optional\)/);
});
