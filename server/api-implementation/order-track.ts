import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { findGuestOrder } from "./_data/orders.js";
import { query } from "./_db.js";
import { findGuestPreorder } from "./_data/preorders.js";
import { preorderCustomerStatusLabel } from "../../shared/preorder-customer-status.js";
import { normalizeOrderStatus } from "../../shared/order-status.js";
import {
  normalizeOrderIdForLookup,
  normalizeSriLankanPhoneForLookup,
} from "./_order-track-normalization.js";
import { durableRateLimit } from "./_rate-limit.js";
import {
  body,
  json,
  methodNotAllowed,
  orderTrackSchema,
  originEnv,
  validOrigin,
} from "./_shared.js";

const notFound = "Order or pre-order details could not be found.";
type FindOrder = (orderId: string, phone: string) => Promise<Record<string, unknown> | null>;
type ResolveOrderNumber = (orderNumber: number) => Promise<string | null>;
type ResolvePreorderNumber = (preorderNumber: number) => Promise<string | null>;

function safeOrder(row: Record<string, unknown>) {
  const text = (value: unknown) => String(value ?? ""),
    number = (value: unknown) => Number(value) || 0,
    bool = (value: unknown) => value === true || String(value).toLowerCase() === "true";
  const rawTrackingUrl = text(row.tracking_url ?? row.trackingUrl);
  const safeHttpsUrl = (value: unknown) => {
    try {
      const parsed = new URL(text(value));
      return parsed.protocol === "https:" ? parsed.toString() : "";
    } catch {
      return "";
    }
  };
  let trackingUrl = "";
  try {
    const parsed = new URL(rawTrackingUrl);
    if (parsed.protocol === "https:") trackingUrl = parsed.toString();
  } catch {
    trackingUrl = "";
  }
  return {
    kind:"order" as const,
    orderId: text(row.order_id ?? row.orderId),
    orderNumber: number(row.order_number ?? row.orderNumber),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : text(row.created_at ?? row.createdAt),
    customerName: text(row.customer_name ?? row.customerName),
    address1: text(row.address1),
    address2: text(row.address2),
    city: text(row.city),
    district: text(row.district),
    postalCode: text(row.postal_code ?? row.postalCode),
    orderStatus: normalizeOrderStatus(row.order_status ?? row.orderStatus),
    paymentMethod: text(row.payment_method ?? row.paymentMethod),
    paymentStatus: text(row.payment_status ?? row.paymentStatus),
    preorderDelivery: row.source_preorder_request_id != null ? Boolean(String(row.source_preorder_request_id).trim()) : bool(row.preorderDelivery),
    amountPaid: number(row.amount_paid ?? row.amountPaid),
    amountToCollect: number(row.amount_to_collect ?? row.amountToCollect),
    fulfillmentMethod: text(row.fulfillment_method ?? row.fulfillmentMethod),
    deliveryMethodName: text(row.delivery_method_name ?? row.deliveryMethodName),
    deliveryAreaGroupName: text(row.delivery_area_group_name ?? row.deliveryAreaGroupName),
    pickupBranchName: text(row.pickup_branch_name ?? row.pickupBranchName),
    pickupBranchAddress: text(row.pickup_branch_address ?? row.pickupBranchAddress),
    pickupInstructions: text(row.pickup_instructions ?? row.pickupInstructions),
    fulfilmentCourierName: text(row.fulfilment_courier_name ?? row.fulfilmentCourierName),
    trackingNumber: text(row.tracking_number ?? row.trackingNumber),
    trackingUrl,
    courierSentDate: row.courier_sent_date instanceof Date ? row.courier_sent_date.toISOString() : text(row.courier_sent_date ?? row.courierSentDate),
    subtotal: number(row.subtotal),
    discountCode: text(row.discount_code ?? row.discountCode),
    discountAmount: number(row.discount_amount ?? row.discountAmount),
    deliveryFee: number(row.delivery_fee ?? row.deliveryFee),
    total: number(row.total),
    items: (Array.isArray(row.items) ? row.items : []).map((value) => {
      const item = value as Record<string, unknown>;
      const productSlug = text(item.productSlug ?? item.product_slug).trim(),
        imageUrl = safeHttpsUrl(item.imageUrl ?? item.image_url);
      return {
        name: text(item.name ?? item.product_name ?? item.productName),
        color: text(item.color),
        size: text(item.size),
        quantity: number(item.quantity),
        unitPrice: number(item.unitPrice ?? item.unit_price),
        isPreorder: bool(item.isPreorder ?? item.is_preorder),
        ...(productSlug ? { productSlug } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      };
    }),
  };
}

function safePreorder(row:Record<string,unknown>){
  const text=(value:unknown)=>String(value??""),number=(value:unknown)=>Number(value)||0,status=text(row.status);
  return{kind:"preorder" as const,requestId:text(row.request_id??row.requestId),preorderNumber:number(row.preorder_number??row.preorderNumber),createdAt:row.created_at instanceof Date?row.created_at.toISOString():text(row.created_at??row.createdAt),customerName:text(row.customer_name??row.customerName),productName:text(row.product_name??row.productName),color:text(row.color),size:text(row.size),quantity:number(row.quantity),productTotal:number(row.requested_price??row.productTotal)*number(row.quantity),status,statusLabel:preorderCustomerStatusLabel(status),paymentState:row.payment_verified_at?"Payment verified":status==="payment_submitted"?"Payment pending verification":"Awaiting payment",convertedOrderId:status==="converted"?text(row.converted_order_id??row.convertedOrderId):""};
}

export function createOrderTrackHandler(
  findOrder: FindOrder = findGuestOrder,
  findPreorder: FindOrder = findGuestPreorder,
  resolveOrderNumber: ResolveOrderNumber = async (orderNumber) => {
    const resolved=(await query<{order_id:string}>("SELECT order_id FROM orders WHERE order_number=$1 LIMIT 1",[orderNumber])).rows[0];
    return resolved?.order_id || null;
  },
  resolvePreorderNumber: ResolvePreorderNumber = async (preorderNumber) => {
    const resolved=(await query<{request_id:string}>("SELECT request_id FROM preorders WHERE preorder_number=$1 LIMIT 1",[preorderNumber])).rows[0];
    return resolved?.request_id || null;
  },
) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
    const throttle = await durableRateLimit(req, "order-track", 10, 10 * 60 * 1000);
    if (throttle.limited) {
      res.setHeader("Retry-After", String(throttle.retryAfter));
      return json(res, { error: "Too many tracking attempts. Please wait and try again." }, 429);
    }
    try {
      if (!validOrigin(req, originEnv()))
        return json(res, { error: "Invalid request origin" }, 403);
      const input = orderTrackSchema.parse(body(req)),
        orderId = normalizeOrderIdForLookup(input.orderId),
        phone = normalizeSriLankanPhoneForLookup(input.phone);
      if (!(/^\d+$/.test(orderId) || /^(ZEV|PRE)-[A-Z0-9-]+$/.test(orderId)) || !/^947\d{8}$/.test(phone))
        return json(res, { error: "Please enter a valid Order or Pre-order ID and mobile number." }, 400);
      const preorder=orderId.startsWith("PRE-");
      let lookupId=orderId;
      if (preorder && /^PRE-\d+$/.test(orderId)) {
        const resolved=await resolvePreorderNumber(Number(orderId.slice(4)));
        if (!resolved) return json(res,{error:notFound},404);
        lookupId=resolved;
      } else if (!preorder && /^\d+$/.test(orderId)) {
        const resolved=await resolveOrderNumber(Number(orderId));
        if (!resolved) return json(res,{error:notFound},404);
        lookupId=resolved;
      }
      const row=await (preorder?findPreorder:findOrder)(lookupId, phone);
      return row
        ? json(res, preorder?safePreorder(row):safeOrder(row))
        : json(res, { error: notFound }, 404);
    } catch (error) {
      if (error instanceof z.ZodError)
        return json(res, { error: "Please enter a valid Order or Pre-order ID and mobile number." }, 400);
      console.error("guest order tracking failed", error);
      return json(res, { error: notFound }, 404);
    }
  };
}

export default createOrderTrackHandler();
