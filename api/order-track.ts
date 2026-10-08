import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { findGuestOrder } from "./_data/orders.js";
import {
  normalizeOrderIdForLookup,
  normalizeSriLankanPhoneForLookup,
} from "./_order-track-normalization.js";
import {
  body,
  json,
  methodNotAllowed,
  orderTrackSchema,
  originEnv,
  rateLimit,
  validOrigin,
} from "./_shared.js";

const notFound = "Order details could not be found.";
type FindOrder = (orderId: string, phone: string) => Promise<Record<string, unknown> | null>;

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
    orderId: text(row.order_id ?? row.orderId),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : text(row.created_at ?? row.createdAt),
    customerName: text(row.customer_name ?? row.customerName),
    address1: text(row.address1),
    address2: text(row.address2),
    city: text(row.city),
    district: text(row.district),
    postalCode: text(row.postal_code ?? row.postalCode),
    orderStatus: text(row.order_status ?? row.orderStatus),
    paymentMethod: text(row.payment_method ?? row.paymentMethod),
    paymentStatus: text(row.payment_status ?? row.paymentStatus),
    deliveryZoneName: text(row.delivery_zone_name ?? row.deliveryZoneName),
    fulfilmentCourierName: text(row.fulfilment_courier_name ?? row.fulfilmentCourierName),
    trackingNumber: text(row.tracking_number ?? row.trackingNumber),
    trackingUrl,
    courierSentDate: row.courier_sent_date instanceof Date ? row.courier_sent_date.toISOString() : text(row.courier_sent_date ?? row.courierSentDate),
    subtotal: number(row.subtotal),
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

export function createOrderTrackHandler(findOrder: FindOrder = findGuestOrder) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
    const throttle = rateLimit(req, "order-track", 10, 10 * 60 * 1000);
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
      if (!orderId || !/^947\d{8}$/.test(phone))
        return json(res, { error: "Please enter a valid Order ID and mobile number." }, 400);
      const row = await findOrder(orderId, phone);
      return row
        ? json(res, safeOrder(row))
        : json(res, { error: notFound }, 404);
    } catch (error) {
      if (error instanceof z.ZodError)
        return json(res, { error: "Please enter a valid Order ID and mobile number." }, 400);
      console.error("guest order tracking failed", error);
      return json(res, { error: notFound }, 404);
    }
  };
}

export default createOrderTrackHandler();
