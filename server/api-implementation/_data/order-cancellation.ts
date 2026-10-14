import { withTransaction } from "../_db.js";
import { createAdminNotification } from "./notifications.js";

const customerReasons=["Changed my mind","Ordered by mistake","Need to change the order","Other"];
export async function cancelCustomerOrder(customerId:string,input:Record<string,unknown>,transact:typeof withTransaction=withTransaction){
  const orderId=String(input.orderId||""),selected=String(input.reason||"").trim(),custom=String(input.customReason||"").trim();
  if(!customerReasons.includes(selected))throw new Error("Choose a cancellation reason.");
  if(selected==="Other"&&!custom)throw new Error("Enter a cancellation reason.");
  const reason=selected==="Other"?custom:selected;
  if(reason.length>240)throw new Error("Keep the cancellation reason under 240 characters.");
  return transact(async client=>{
    const order=(await client.query<Record<string,unknown>>("SELECT * FROM orders WHERE order_id=$1 FOR UPDATE",[orderId])).rows[0];
    if(!order||String(order.customer_id)!==customerId)throw new Error("ORDER_NOT_CANCELLABLE");
    const status=String(order.order_status);
    if(status==="cancelled")return{ok:true,orderId,status:"cancelled"};
    if(order.payment_method!=="cod"||!["pending","confirmed"].includes(status))throw new Error("ORDER_NOT_CANCELLABLE");
    if(order.stock_state==="reserved"){
      const items=(await client.query<Record<string,unknown>>("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id FOR UPDATE",[orderId])).rows;
      for(const item of items)if(!item.is_preorder&&item.variant_id)await client.query("UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",[item.variant_id,item.quantity]);
    }
    const stockState=order.stock_state==="reserved"?"restored":order.stock_state;
    await client.query("UPDATE orders SET order_status='cancelled',stock_state=$2,cancelled_at=now(),cancelled_by='customer',cancellation_reason=$3,cancelled_from_status=$4,updated_at=now() WHERE order_id=$1",[orderId,stockState,reason,status]);
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('customer','order_cancelled','order',$1,$2::jsonb)",[orderId,JSON.stringify({reason,from:status,restocked:stockState==="restored"})]);
    await createAdminNotification(client,{type:"customer_cancellation",title:"Customer cancelled order",description:`${orderId} · ${order.customer_name}`,href:`/admin/orders/${encodeURIComponent(orderId)}`,entityType:"order",entityId:orderId});
    return{ok:true,orderId,status:"cancelled",cancellationReason:reason};
  });
}
