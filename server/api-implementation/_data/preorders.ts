import { createHash, randomBytes } from "node:crypto";
import { query, withTransaction,type DatabaseClient } from "../_db.js";
import { normalizeSriLankanPhoneForLookup } from "../_order-track-normalization.js";
import { mapOrder, mapPreorder } from "./mappers.js";
import {
  isPreorderTransitionAllowed,
  normalizePreorderPaymentMethod,
  preorderDeliveryAddressReady,
  preorderActiveStatuses,
  resolvePreorderConfirmedPrice,
} from "../../../shared/preorder-lifecycle.js";
import { assertPaymentMethodAvailable, deliverySnapshot } from "./orders.js";
import { verifyReceiptAsset } from "../_receipt-asset.js";
import { cloudinaryEnv } from "../_shared.js";
import { createAdminNotification } from "./notifications.js";

const orderWithItems = `SELECT o.*,COALESCE(NULLIF(o.payment_receipt_public_id,''),pr.payment_receipt_public_id) AS linked_payment_receipt_public_id,pr.created_at AS source_preorder_created_at,pr.notified_at AS source_preorder_notified_at,pr.confirmed_price AS source_preorder_confirmed_price,COALESCE((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.order_id),'[]') AS items FROM orders o LEFT JOIN preorders pr ON pr.request_id=o.source_preorder_request_id`;
const newId = (prefix: string) =>
  `${prefix}-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
export const hashPreorderClaimToken=(token:string)=>createHash("sha256").update(token).digest("hex");
export function createPreorderClaimToken(){const token=randomBytes(32).toString("base64url");return{token,hash:hashPreorderClaimToken(token)};}
export const preorderPaymentRejectionReasons = [
  "Payment not found", "Amount does not match", "Receipt is unclear / unreadable",
  "Wrong receipt uploaded", "Duplicate / previously used receipt",
  "Receipt appears altered or cannot be verified", "Other",
] as const;

export async function rejectPreorderPayment(input:{requestId:string;reason:string;customReason?:string},transact:typeof withTransaction=withTransaction){
  const selected=String(input.reason||"").trim();
  if(!preorderPaymentRejectionReasons.includes(selected as typeof preorderPaymentRejectionReasons[number]))throw new Error("Choose a payment rejection reason.");
  const customReason=String(input.customReason||"").trim();
  if(selected==="Other"&&!customReason)throw new Error("Enter a short reason.");
  if(customReason.length>240)throw new Error("Keep the custom reason under 240 characters.");
  const reason=selected==="Other"?customReason:selected,{token,hash}=createPreorderClaimToken(),rejectedAt=new Date().toISOString();
  return transact(async(client)=>{
    const current=(await client.query<Record<string,unknown>>("SELECT * FROM preorders WHERE request_id=$1 FOR UPDATE",[input.requestId])).rows[0];
    if(!current||current.status!=="payment_submitted")throw new Error("Only a submitted payment can request a new receipt.");
    if(!current.payment_receipt_public_id)throw new Error("A submitted receipt is required.");
    const result=await client.query<Record<string,unknown>>("UPDATE preorders SET status='awaiting_payment',claim_token_hash=$2,updated_at=now() WHERE request_id=$1 AND status='payment_submitted' RETURNING *",[input.requestId,hash]);
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','payment_rejected','preorder',$1,$2::jsonb)",[input.requestId,JSON.stringify({requestId:input.requestId,reason,previousReceiptPresent:true,previousReceipt:{publicId:current.payment_receipt_public_id,resourceType:current.payment_receipt_resource_type,format:current.payment_receipt_format},adminTimestamp:rejectedAt})]);
    return{preorder:mapPreorder({...result.rows[0],rejection_reason:reason,rejected_at:rejectedAt}),token,reason,rejectedAt};
  });
}

export async function notifyPreorder(requestId:string,run:{query:typeof query}={query}){
  const {token,hash}=createPreorderClaimToken();
  const result=await run.query<Record<string,unknown>>(
    "UPDATE preorders SET status='notified',claim_token_hash=$2,notified_at=now(),reservation_expires_at=now()+interval '48 hours',released_at=NULL,updated_at=now() WHERE request_id=$1 AND status IN('ready','notified') AND converted_order_id IS NULL RETURNING reservation_expires_at",
    [requestId,hash],
  );
  if(!result.rows[0])throw new Error("Only a ready preorder can be notified.");
  return{token,reservationExpiresAt:String(result.rows[0].reservation_expires_at)};
}

export async function extendPreorderReservation(requestId:string){
  const result=await query<Record<string,unknown>>(
    "UPDATE preorders SET reservation_expires_at=greatest(reservation_expires_at,now())+interval '24 hours',updated_at=now() WHERE request_id=$1 AND status='notified' AND claim_token_hash IS NOT NULL AND released_at IS NULL AND converted_order_id IS NULL RETURNING reservation_expires_at",
    [requestId],
  );
  if(!result.rows[0])throw new Error("This reservation cannot be extended.");
  return{reservationExpiresAt:String(result.rows[0].reservation_expires_at)};
}

export async function releasePreorderToStock(requestId:string,transact:(work:(client:DatabaseClient)=>Promise<{ok:boolean}>)=>Promise<{ok:boolean}>=withTransaction){
  return transact(async(client)=>{
    const preorder=(await client.query<Record<string,unknown>>("SELECT * FROM preorders WHERE request_id=$1 FOR UPDATE",[requestId])).rows[0];
    if(!preorder||preorder.status!=="notified"||preorder.released_at||preorder.converted_order_id)throw new Error("This reservation cannot be released.");
    await client.query("UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",[preorder.variant_id,preorder.quantity]);
    await client.query("UPDATE preorders SET status='expired',released_at=now(),claim_token_hash=NULL,reservation_expires_at=NULL,updated_at=now() WHERE request_id=$1",[requestId]);
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','release','preorder',$1,$2::jsonb)",[requestId,JSON.stringify({quantity:preorder.quantity,variantId:preorder.variant_id})]);
    return{ok:true};
  });
}

export async function getPreorderClaim(token:string){
  if(!token)return null;
  const row=(await query<Record<string,unknown>>(
    `SELECT pr.request_id,pr.customer_name,pr.phone,pr.whatsapp,pr.email,pr.address1,pr.address2,pr.city,pr.district,pr.postal_code,
            pr.product_id,pr.variant_id,pr.product_name,pr.color,pr.size,pr.quantity,pr.requested_price,pr.confirmed_price,pr.status,pr.reservation_expires_at,p.media,
            (SELECT al.details->>'reason' FROM audit_logs al WHERE al.entity_type='preorder' AND al.entity_id=pr.request_id AND al.action='payment_rejected' ORDER BY al.created_at DESC LIMIT 1) AS payment_issue_reason
       FROM preorders pr LEFT JOIN products p ON p.id=pr.product_id
      WHERE pr.claim_token_hash=$1 AND ((pr.status='awaiting_payment') OR (pr.status='notified' AND pr.reservation_expires_at>now())) AND pr.released_at IS NULL AND pr.converted_order_id IS NULL
      LIMIT 1`,
    [hashPreorderClaimToken(token)],
  )).rows[0];
  if(!row)return null;
  const media=Array.isArray(row.media)?row.media as Array<Record<string,unknown>>:[];
  return{requestId:String(row.request_id),status:String(row.status),customerName:String(row.customer_name),phone:String(row.phone),whatsapp:String(row.whatsapp),email:String(row.email||""),address1:String(row.address1||""),address2:String(row.address2||""),city:String(row.city||""),district:String(row.district||""),postalCode:String(row.postal_code||""),productId:String(row.product_id),variantId:String(row.variant_id),productName:String(row.product_name),color:String(row.color),size:String(row.size),quantity:Number(row.quantity),confirmedPrice:Number(row.confirmed_price||row.requested_price),reservationExpiresAt:String(row.reservation_expires_at||""),imageUrl:String(media.find(item=>item.type==="image")?.url||""),paymentIssueReason:String(row.payment_issue_reason||"")};
}

export async function findGuestPreorder(requestId:string,phone:string){
  const requestKey=String(requestId||"").trim().replace(/^#/,"").trim().toUpperCase(),phoneKey=normalizeSriLankanPhoneForLookup(phone);
  return (await query<Record<string,unknown>>(
    `SELECT request_id,created_at,customer_name,product_name,color,size,quantity,requested_price,status,converted_order_id,payment_submitted_at,payment_verified_at
       FROM preorders WHERE request_id=$1 AND CASE
         WHEN regexp_replace(COALESCE(NULLIF(phone,''),whatsapp),'\\D','','g') LIKE '0094%' THEN substring(regexp_replace(COALESCE(NULLIF(phone,''),whatsapp),'\\D','','g') from 3)
         WHEN regexp_replace(COALESCE(NULLIF(phone,''),whatsapp),'\\D','','g') ~ '^7[0-9]{8}$' THEN '94'||regexp_replace(COALESCE(NULLIF(phone,''),whatsapp),'\\D','','g')
         WHEN regexp_replace(COALESCE(NULLIF(phone,''),whatsapp),'\\D','','g') LIKE '0%' THEN '94'||substring(regexp_replace(COALESCE(NULLIF(phone,''),whatsapp),'\\D','','g') from 2)
         ELSE regexp_replace(COALESCE(NULLIF(phone,''),whatsapp),'\\D','','g') END=$2 LIMIT 1`,
    [requestKey,phoneKey],
  )).rows[0]||null;
}

export async function quotePreorderClaim(input:Record<string,unknown>){
  return withTransaction(async(client)=>{
    const preorder=(await client.query<Record<string,unknown>>("SELECT * FROM preorders WHERE claim_token_hash=$1 AND status='notified' AND released_at IS NULL AND converted_order_id IS NULL AND reservation_expires_at>now()",[hashPreorderClaimToken(String(input.token||""))])).rows[0];
    if(!preorder)throw new Error("Pre-order claim unavailable");
    const delivery=await deliverySnapshot(client,{fulfillmentMethod:String(input.fulfillmentMethod||"") as "flat"|"area_group"|"pickup",pickupLocationId:String(input.pickupLocationId||"")||undefined,city:String(input.city||""),district:String(input.district||""),postalCode:String(input.postalCode||"")},Number(preorder.confirmed_price)*Number(preorder.quantity),false);
    return{fee:delivery.fee,minimumDeliveryDays:delivery.minimumDeliveryDays,maximumDeliveryDays:delivery.maximumDeliveryDays,fulfillmentMethod:delivery.method,methodName:delivery.methodName,areaGroupName:delivery.areaGroupName,pickupLocationId:delivery.pickup?.id||""};
  });
}

export async function createPreorder(input: Record<string, unknown>) {
  const receipt=await verifyReceiptAsset(String(input.paymentReceiptUrl||""),cloudinaryEnv());
  return withTransaction(async (client) => {
    await assertPaymentMethodAvailable(client,"bank");
    const product = (
      await client.query<Record<string, unknown>>(
        `SELECT p.id AS product_id,p.name AS product_name,p.price,p.preorder_enabled,p.status,v.id AS variant_id,v.sku,v.color,v.size,v.stock,v.active FROM products p JOIN variants v ON v.product_id=p.id WHERE p.id=$1 AND v.id=$2 FOR UPDATE`,
        [input.productId, input.variantId],
      )
    ).rows[0];
    if (
      !product ||
      product.status !== "published" ||
      !product.preorder_enabled ||
      !product.active ||
      Number(product.stock) > 0
    )
      throw new Error("Pre-order unavailable");

    const active = await client.query<{
      customer_id: string | null;
      whatsapp: string;
    }>(
      "SELECT customer_id,whatsapp FROM preorders WHERE variant_id=$1 AND status=ANY($2::text[])",
      [input.variantId, preorderActiveStatuses],
    );
    const customerId = String(input.customerId || "").trim(),
      normalizedWhatsapp = normalizeSriLankanPhoneForLookup(
        String(input.whatsapp || ""),
      ),
      duplicate = active.rows.some((row) => {
        const sameCustomer =
          Boolean(customerId) && String(row.customer_id || "") === customerId;
        const storedWhatsapp = normalizeSriLankanPhoneForLookup(
          String(row.whatsapp || ""),
        );
        return (
          sameCustomer ||
          (Boolean(normalizedWhatsapp) && storedWhatsapp === normalizedWhatsapp)
        );
      });
    if (duplicate)
      throw new Error(
        "You already have an active pre-order request for this size. Contact ZEVENRA if you want to change it.",
      );

    const requestId = newId("PRE"),
      result = await client.query<Record<string, unknown>>(
        `INSERT INTO preorders(request_id,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,product_id,variant_id,product_name,sku,color,size,quantity,requested_price,status,payment_receipt_public_id,payment_receipt_resource_type,payment_receipt_format,payment_submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'payment_submitted',$20,$21,$22,now()) RETURNING *`,
        [
          requestId,
          input.customerId || null,
          input.customerName,
          input.phone || input.whatsapp,
          input.whatsapp,
          input.email || "",
          input.address1 || "",
          input.address2 || "",
          input.city || "",
          input.district || "",
          input.postalCode || "",
          product.product_id,
          product.variant_id,
          product.product_name,
          product.sku,
          product.color,
          product.size,
          input.quantity,
          product.price,
          receipt.publicId,
          receipt.resourceType,
          receipt.format,
        ],
      );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('system','create','preorder',$1,$2::jsonb)",
      [
        requestId,
        JSON.stringify({
          productId: product.product_id,
          quantity: input.quantity,
          receipt: true,
        }),
      ],
    );
    await createAdminNotification(client,{type:"preorder_payment",title:"New preorder payment submitted",description:`${requestId} · ${input.customerName}`,href:`/admin/preorders?search=${encodeURIComponent(requestId)}`,entityType:"preorder",entityId:requestId});
    return mapPreorder(result.rows[0]);
  });
}

export async function submitPreorderPayment(input:{token:string;paymentReceiptUrl:string}){
  const asset=await verifyReceiptAsset(input.paymentReceiptUrl,cloudinaryEnv());
  return withTransaction(async(client)=>{
    const result=await client.query<Record<string,unknown>>(
      `UPDATE preorders SET status='payment_submitted',payment_receipt_public_id=$2,payment_receipt_resource_type=$3,payment_receipt_format=$4,payment_submitted_at=now(),claim_token_hash=NULL,updated_at=now()
       WHERE claim_token_hash=$1 AND status='awaiting_payment' AND converted_order_id IS NULL RETURNING *`,
      [hashPreorderClaimToken(input.token),asset.publicId,asset.resourceType,asset.format],
    );
    if(!result.rows[0])throw new Error("Pre-order payment link unavailable");
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('customer','payment_submitted','preorder',$1,$2::jsonb)",[result.rows[0].request_id,JSON.stringify({receipt:true})]);
    await createAdminNotification(client,{type:"preorder_payment",title:"Replacement preorder receipt submitted",description:`${result.rows[0].request_id} · ${result.rows[0].customer_name}`,href:`/admin/preorders?search=${encodeURIComponent(String(result.rows[0].request_id))}`,entityType:"preorder",entityId:String(result.rows[0].request_id)});
    return mapPreorder(result.rows[0]);
  });
}

export async function listPreorders(status?: string) {
  const values = status ? [status] : [],
    where = status ? " WHERE p.status=$1" : "";
  return (
    await query<Record<string, unknown>>(
      `SELECT p.request_id,p.created_at,p.updated_at,p.customer_id,p.customer_name,p.phone,p.whatsapp,p.email,
              p.address1,p.address2,p.city,p.district,p.postal_code,p.product_id,p.variant_id,p.product_name,
              p.sku,p.color,p.size,p.quantity,p.requested_price,p.confirmed_price,p.status,p.batch_id,p.notes,
              p.notified_at,p.reservation_expires_at,p.released_at,p.converted_order_id,p.payment_receipt_public_id,p.payment_submitted_at,p.payment_verified_at,o.order_status AS converted_order_status,o.delivery_fee AS converted_order_delivery_fee,
              (SELECT al.details->>'reason' FROM audit_logs al WHERE al.entity_type='preorder' AND al.entity_id=p.request_id AND al.action='payment_rejected' ORDER BY al.created_at DESC LIMIT 1) AS rejection_reason,
              (SELECT COALESCE(al.details->>'adminTimestamp',al.created_at::text) FROM audit_logs al WHERE al.entity_type='preorder' AND al.entity_id=p.request_id AND al.action='payment_rejected' ORDER BY al.created_at DESC LIMIT 1) AS rejected_at
         FROM preorders p LEFT JOIN orders o ON o.order_id=p.converted_order_id${where}
        ORDER BY p.created_at DESC
        LIMIT 100`,
      values,
    )
  ).rows.map(mapPreorder);
}

export async function updatePreorder(input: Record<string, unknown>) {
  return withTransaction(async (client) => {
    const current = (
      await client.query<Record<string, unknown>>(
        "SELECT * FROM preorders WHERE request_id=$1 FOR UPDATE",
        [input.requestId],
      )
    ).rows[0];
    if (!current) throw new Error("Pre-order not found");

    const nextStatus = String(input.status ?? current.status),
      confirmedPrice = resolvePreorderConfirmedPrice(
        input.confirmedPrice,
        current.confirmed_price,
      );
    if (!isPreorderTransitionAllowed(current.status, nextStatus))
      throw new Error(
        "Invalid pre-order step. Follow the next action shown in the admin panel.",
      );
    if(nextStatus==="paid"&&!current.payment_receipt_public_id)throw new Error("A verified payment receipt is required.");
    if(nextStatus==="confirmed"&&current.status!=="paid"&&current.status!=="confirmed")throw new Error("Only a paid pre-order can be confirmed.");

    const result = await client.query<Record<string, unknown>>(
      `UPDATE preorders SET status=$2,confirmed_price=$3,batch_id=$4,notes=$5,customer_name=$6,phone=$7,whatsapp=$8,email=$9,address1=$10,address2=$11,city=$12,district=$13,postal_code=$14,payment_verified_at=CASE WHEN $2='paid' THEN now() ELSE payment_verified_at END,updated_at=now() WHERE request_id=$1 RETURNING *`,
      [
        input.requestId,
        nextStatus,
        confirmedPrice,
        input.batchId ?? current.batch_id,
        input.notes ?? current.notes,
        input.customerName ?? current.customer_name,
        input.phone ?? current.phone,
        input.whatsapp ?? current.whatsapp,
        input.email ?? current.email,
        input.address1 ?? current.address1,
        input.address2 ?? current.address2,
        input.city ?? current.city,
        input.district ?? current.district,
        input.postalCode ?? current.postal_code,
      ],
    );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','update','preorder',$1,$2::jsonb)",
      [input.requestId, JSON.stringify(input)],
    );
    return mapPreorder(result.rows[0]);
  });
}

export async function convertPreorderToOrder(input: Record<string, unknown>) {
  return withTransaction(async (client) => {
    const token=String(input.token||""),customerClaim=Boolean(token);
    const preorder = (
      await client.query<Record<string, unknown>>(
        customerClaim
          ? "SELECT * FROM preorders WHERE claim_token_hash=$1 FOR UPDATE"
          : "SELECT * FROM preorders WHERE request_id=$1 FOR UPDATE",
        [customerClaim?hashPreorderClaimToken(token):input.requestId],
      )
    ).rows[0];
    if (!preorder) throw new Error("Pre-order not found");
    if(customerClaim&&(preorder.status!=="notified"||preorder.released_at||preorder.converted_order_id||!preorder.reservation_expires_at||new Date(String(preorder.reservation_expires_at)).getTime()<=Date.now()))throw new Error("Pre-order claim unavailable");
    if (!customerClaim&&preorder.status!=="ready")
      throw new Error(
        "Mark the pre-order as arrived or ready before conversion.",
      );
    if (!customerClaim&&!preorder.payment_verified_at)throw new Error("Only a paid pre-order can create a delivery order.");
    const fulfillmentMethod=String(input.fulfillmentMethod||"") as "flat"|"area_group"|"pickup";
    const customerName=customerClaim?String(input.customerName||"").trim():String(preorder.customer_name),
      phone=customerClaim?String(input.phone||"").trim():String(preorder.phone),
      whatsapp=customerClaim?String(input.whatsapp||input.phone||"").trim():String(preorder.whatsapp),
      email=customerClaim?String(input.email||"").trim():String(preorder.email||""),
      address1=customerClaim?String(input.address1||"").trim():String(preorder.address1||""),
      address2=customerClaim?String(input.address2||"").trim():String(preorder.address2||""),
      city=customerClaim?String(input.city||"").trim():String(preorder.city||""),
      district=customerClaim?String(input.district||"").trim():String(preorder.district||""),
      postalCode=customerClaim?String(input.postalCode||"").trim():String(preorder.postal_code||"");
    if (fulfillmentMethod!=="pickup"&&!preorderDeliveryAddressReady({
      address1,
      city,
      district,
      postalCode,
    }))
      throw new Error(
        "Complete the delivery address with a valid 5-digit postal code before conversion.",
      );

    const paymentMethod = normalizePreorderPaymentMethod(input.paymentMethod);
    await assertPaymentMethodAvailable(client,paymentMethod);
    const price = Number(preorder.requested_price),
      subtotal = price * Number(preorder.quantity),
      delivery = await deliverySnapshot(
        client,
        {
          fulfillmentMethod,
          pickupLocationId:String(input.pickupLocationId||"")||undefined,
          district,
          city,
          postalCode,
        },
        subtotal,
        false,
      ),
      fee = delivery.fee,
      orderId = newId("ZEV");
    await client.query(
      `INSERT INTO orders(order_id,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,courier_provider_id,courier_name,delivery_pricing_mode,delivery_rate_plan,delivery_zone_name,payment_method,payment_status,subtotal,delivery_fee,total,total_product_weight_grams,total_shipping_weight_grams,minimum_delivery_days,maximum_delivery_days,stock_state,order_status,source,has_preorder,source_preorder_request_id,amount_paid,amount_to_collect,fulfillment_method,delivery_method_name,delivery_area_group_id,delivery_area_group_name,pickup_location_id,pickup_branch_name,pickup_branch_address,pickup_instructions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'paid',$18,$19,$20,$21,$22,$23,$24,'not_applicable','pending','preorder',true,$25,$18,$19,$26,$27,$28,$29,$30,$31,$32,$33)`,
      [
        orderId,
        preorder.customer_id,
        customerName,
        phone,
        whatsapp,
        email,
        fulfillmentMethod==="pickup"?"":address1,
        fulfillmentMethod==="pickup"?"":address2,
        fulfillmentMethod==="pickup"?"":city,
        fulfillmentMethod==="pickup"?"":district,
        fulfillmentMethod==="pickup"?"":postalCode,
        delivery.courierProviderId,
        delivery.courierName,
        delivery.pricingMode,
        delivery.ratePlan,
        delivery.zoneName,
        paymentMethod,
        subtotal,
        fee,
        subtotal + fee,
        null,
        null,
        delivery.minimumDeliveryDays,
        delivery.maximumDeliveryDays,
        preorder.request_id,
        delivery.method,
        delivery.methodName,
        delivery.areaGroupId||null,
        delivery.areaGroupName,
        delivery.pickup?.id||null,
        delivery.pickup?.name||"",
        delivery.pickup?.address||"",
        delivery.pickup?.instructions||"",
      ],
    );
    await client.query(
      `INSERT INTO order_items(order_id,product_id,variant_id,sku,product_name,color,size,quantity,unit_price,line_total,is_preorder,shipping_weight_grams) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
      [
        orderId,
        preorder.product_id,
        preorder.variant_id,
        preorder.sku,
        preorder.product_name,
        preorder.color,
        preorder.size,
        preorder.quantity,
        price,
        price * Number(preorder.quantity),
        null,
      ],
    );
    await client.query(
      "UPDATE preorders SET status='converted',converted_order_id=$2,claim_token_hash=NULL,reservation_expires_at=NULL,notes=concat_ws(' | ',nullif(notes,''),$3::text),updated_at=now() WHERE request_id=$1",
      [preorder.request_id, orderId, `Converted to ${orderId}`],
    );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','convert','preorder',$1,$2::jsonb)",
      [preorder.request_id, JSON.stringify({ orderId, amountPaid: subtotal, amountToCollect: fee })],
    );
    return mapOrder(
      (
        await client.query<Record<string, unknown>>(
          `${orderWithItems} WHERE o.order_id=$1`,
          [orderId],
        )
      ).rows[0],
    );
  });
}
