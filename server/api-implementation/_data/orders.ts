import { randomBytes } from "node:crypto";
import type { DatabaseClient } from "../_db.js";
import { withTransaction } from "../_db.js";
import { normalizeSriLankanPhoneForLookup } from "../_order-track-normalization.js";
import { receiptAsset, verifyReceiptAsset } from "../_receipt-asset.js";
import { cloudinaryEnv } from "../_shared.js";
import { mapOrder } from "./mappers.js";
import { validateDiscount } from "./discounts.js";
import { resolveFulfillment } from "./fulfillment.js";
import { paymentMethodAvailable } from "../../../shared/payment-availability.js";
import { enforceOnlineStoreAvailability } from "../../../shared/order-source.js";
import { createAdminNotification } from "./notifications.js";

export {
  findGuestOrder,
  getOrder,
  listOrders,
  receiptForOrder,
  receiptForPreorder,
  recentOrders,
  updateOrder,
  updateOrderDetails,
} from "./orders-legacy.js";
export { createReturn, listReturns, updateReturn } from "./returns.js";

export type OrderInput = {
  customerId?: string;
  customerName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  fulfillmentMethod?: "flat" | "area_group" | "pickup";
  pickupLocationId?: string;
  address1?: string;
  address2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  deliveryNotes?: string;
  paymentMethod: "cod" | "bank";
  paymentStatus?: string;
  paymentReference?: string;
  paymentReceiptUrl?: string;
  discountCode?: string;
  source?: string;
  items: Array<{
    productId: string;
    variantId: string;
    quantity: number;
    unitPrice?: number;
    isPreorder?: boolean;
  }>;
};

type Line = {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isPreorder: boolean;
};

const orderWithItems = `SELECT o.*,COALESCE((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.order_id),'[]') AS items,(SELECT count(*)::int FROM order_returns r WHERE r.order_id=o.order_id) AS return_count FROM orders o`;
const settingValue = (
  rows: Array<{ key: string; value: unknown }>,
  key: string,
  fallback: unknown,
) => rows.find((row) => row.key === key)?.value ?? fallback;
const truthy = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";

export async function assertPaymentMethodAvailable(
  client: DatabaseClient,
  paymentMethod: OrderInput["paymentMethod"],
) {
  const settings = (
    await client.query<{ key: string; value: unknown }>(
      "SELECT key,value FROM site_settings WHERE key=ANY($1::text[])",
      [["codEnabled", "bankEnabled", "bankTransferEnabled"]],
    )
  ).rows;
  if (!paymentMethodAvailable(settings, paymentMethod))
    throw new Error("PAYMENT_METHOD_UNAVAILABLE");
}

async function assertCheckoutPaymentAvailable(
  client: DatabaseClient,
  input: Pick<OrderInput, "paymentMethod" | "source">,
) {
  if (input.source && input.source !== "web") return;
  await assertPaymentMethodAvailable(client,input.paymentMethod);
}

export async function deliverySnapshot(
  client: DatabaseClient,
  input: Pick<OrderInput, "fulfillmentMethod" | "pickupLocationId" | "city" | "district" | "postalCode">,
  subtotal: number,
  enforceStoreAvailability = true,
) {
  const settings = (
    await client.query<{ key: string; value: unknown }>(
      "SELECT key,value FROM site_settings",
    )
  ).rows;
  if (
    enforceStoreAvailability &&
    (!truthy(settingValue(settings, "storeOpen", true)) ||
      !truthy(settingValue(settings, "ordersEnabled", true)))
  )
    throw new Error("Online ordering is temporarily unavailable.");

  const pricing=await resolveFulfillment(client,input);
  let fee = pricing.fee;
  const threshold =
    Number(settingValue(settings, "freeDeliveryThreshold", 0)) || 0;
  if (threshold > 0 && subtotal >= threshold) fee = 0;

  return {
    courierProviderId: null,
    courierName: pricing.methodName,
    pricingMode: pricing.method,
    ratePlan: pricing.ratePlan,
    zoneName: pricing.areaGroupName,
    method: pricing.method,
    methodName: pricing.methodName,
    areaGroupId: pricing.areaGroupId,
    areaGroupName: pricing.areaGroupName,
    pickup: pricing.pickup,
    fee,
    minimumDeliveryDays: pricing.minimumDeliveryDays,
    maximumDeliveryDays: pricing.maximumDeliveryDays,
  };
}

async function loadLines(
  client: DatabaseClient,
  input: OrderInput,
  trustProvidedPrice = false,
  lockRows = true,
) {
  const ids = new Set<string>(),
    lines: Line[] = [];
  for (const item of input.items) {
    if (ids.has(item.variantId)) throw new Error("Duplicate cart variant.");
    ids.add(item.variantId);
    const row = (
      await client.query<Record<string, unknown>>(
        `SELECT v.*,p.name AS product_name,p.price,p.status,p.preorder_enabled FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND v.product_id=$2 AND v.active=true${lockRows ? " FOR UPDATE OF v,p" : ""}`,
        [item.variantId, item.productId],
      )
    ).rows[0];
    if (!row || row.status !== "published")
      throw new Error("One or more selected items are no longer available.");
    const quantity = Number(item.quantity) || 0,
      isPreorder = Boolean(item.isPreorder),
      available = Number(row.stock) || 0;
    if (quantity < 1 || (!isPreorder && available < quantity))
      throw new Error(
        "One or more selected items are no longer available in that quantity.",
      );
    const unitPrice =
      trustProvidedPrice && Number(item.unitPrice) > 0
        ? Number(item.unitPrice)
        : Number(row.price);
    lines.push({
      productId: String(row.product_id),
      variantId: String(row.id),
      sku: String(row.sku),
      productName: String(row.product_name),
      color: String(row.color),
      size: String(row.size),
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      isPreorder,
    });
  }
  return lines;
}

function newOrderId() {
  const day = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  return `ZEV-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createOrder(
  input: OrderInput,
  options: {
    trustProvidedPrice?: boolean;
    preorderReservedArrival?: boolean;
    requireReceipt?: boolean;
  } = {},
) {
  const asset=input.paymentMethod==="bank"&&options.requireReceipt!==false
    ?await verifyReceiptAsset(input.paymentReceiptUrl,cloudinaryEnv())
    :receiptAsset(input.paymentReceiptUrl);
  return withTransaction(async (client) => {
    await assertCheckoutPaymentAvailable(client, input);
    const lines = await loadLines(client, input, options.trustProvidedPrice),
      subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0),
      discount = input.discountCode
        ? await validateDiscount(client, input.discountCode, subtotal, true)
        : null,
      delivery = await deliverySnapshot(
        client,
        input,
        subtotal,
        enforceOnlineStoreAvailability(input.source),
      ),
      orderId = newOrderId();

    if (input.discountCode && !discount) throw new Error("DISCOUNT_INVALID");
    const discountAmount = discount?.amount || 0,
      total = Math.max(0, subtotal - discountAmount + delivery.fee);

    if (
      input.paymentMethod === "bank" &&
      options.requireReceipt !== false &&
      !asset.publicId
    )
      throw new Error("Bank transfer receipt is required.");

    const phoneKey = normalizeSriLankanPhoneForLookup(input.phone),
      duplicate = await client.query(
        `SELECT 1 FROM orders o
         WHERE CASE
           WHEN regexp_replace(o.phone,'\\D','','g') LIKE '0094%' THEN substring(regexp_replace(o.phone,'\\D','','g') from 3)
           WHEN regexp_replace(o.phone,'\\D','','g') ~ '^7[0-9]{8}$' THEN '94' || regexp_replace(o.phone,'\\D','','g')
           WHEN regexp_replace(o.phone,'\\D','','g') LIKE '0%' THEN '94' || substring(regexp_replace(o.phone,'\\D','','g') from 2)
           ELSE regexp_replace(o.phone,'\\D','','g')
         END=$1
           AND o.order_status<>'cancelled'
           AND o.created_at>now()-interval '2 minutes'
           AND EXISTS(
             SELECT 1 FROM order_items oi
             WHERE oi.order_id=o.order_id AND oi.variant_id=$2
           )
         LIMIT 1`,
        [phoneKey, lines[0].variantId],
      );
    if (duplicate.rowCount)
      throw new Error("This order was already submitted recently.");

    for (const line of lines)
      if (!line.isPreorder && !options.preorderReservedArrival) {
        const updated = await client.query(
          "UPDATE variants SET stock=stock-$2,updated_at=now() WHERE id=$1 AND stock>=$2",
          [line.variantId, line.quantity],
        );
        if (!updated.rowCount)
          throw new Error(
            "One or more selected items are no longer available in that quantity.",
          );
      }

    const stockState = options.preorderReservedArrival
        ? "not_applicable"
        : "reserved",
      hasPreorder = lines.some((line) => line.isPreorder);

    await client.query(
      `INSERT INTO orders(order_id,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,delivery_notes,courier_provider_id,courier_name,delivery_pricing_mode,delivery_rate_plan,delivery_zone_name,payment_method,payment_status,payment_reference,payment_receipt_public_id,payment_receipt_resource_type,payment_receipt_format,subtotal,discount_code,discount_amount,discount_type,discount_value,delivery_fee,total,total_product_weight_grams,total_shipping_weight_grams,minimum_delivery_days,maximum_delivery_days,stock_state,order_status,source,has_preorder,fulfillment_method,delivery_method_name,delivery_area_group_id,delivery_area_group_name,pickup_location_id,pickup_branch_name,pickup_branch_address,pickup_instructions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,'pending',$36,$37,$38,$39,$40,$41,$42,$43,$44,$45)`,
      [
        orderId,
        input.customerId || null,
        input.customerName,
        input.phone,
        input.whatsapp || "",
        input.email || "",
        input.address1 || "",
        input.address2 || "",
        input.city || "",
        input.district || "",
        input.postalCode || "",
        input.deliveryNotes || "",
        delivery.courierProviderId,
        delivery.courierName,
        delivery.pricingMode,
        delivery.ratePlan,
        delivery.zoneName,
        input.paymentMethod,
        input.paymentStatus ||
          (input.paymentMethod === "cod" ? "COD" : "receipt submitted"),
        input.paymentReference || "",
        asset.publicId,
        asset.resourceType,
        asset.format,
        subtotal,
        discount?.code || "",
        discountAmount,
        discount?.type || "",
        discount?.value || 0,
        delivery.fee,
        total,
        null,
        null,
        delivery.minimumDeliveryDays,
        delivery.maximumDeliveryDays,
        stockState,
        input.source || "web",
        hasPreorder,
        delivery.method,
        delivery.methodName,
        delivery.areaGroupId || null,
        delivery.areaGroupName,
        delivery.pickup?.id || null,
        delivery.pickup?.name || "",
        delivery.pickup?.address || "",
        delivery.pickup?.instructions || "",
      ],
    );
    if (discount)
      await client.query(
        "UPDATE discount_codes SET usage_count=usage_count+1,updated_at=now() WHERE upper(btrim(code))=$1",
        [discount.code],
      );

    for (const line of lines)
      await client.query(
        `INSERT INTO order_items(order_id,product_id,variant_id,sku,product_name,color,size,quantity,unit_price,line_total,is_preorder,shipping_weight_grams) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          orderId,
          line.productId,
          line.variantId,
          line.sku,
          line.productName,
          line.color,
          line.size,
          line.quantity,
          line.unitPrice,
          line.lineTotal,
          line.isPreorder,
          null,
        ],
      );

    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('system','create','order',$1,$2::jsonb)",
      [
        orderId,
        JSON.stringify({
          total,
          deliveryZone: delivery.zoneName,
        }),
      ],
    );
    await createAdminNotification(client,{type:input.paymentMethod==="bank"?"payment_verification":"new_order",title:input.paymentMethod==="bank"?"Payment awaiting verification":"New order received",description:`${orderId} · ${input.customerName}`,href:`/admin/orders/${encodeURIComponent(orderId)}`,entityType:"order",entityId:orderId});

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

export async function quoteDelivery(
  input: Pick<OrderInput, "fulfillmentMethod" | "pickupLocationId" | "city" | "district" | "postalCode" | "items">,
) {
  return withTransaction(async (client) => {
    const lines = await loadLines(client, input as OrderInput, false, false),
      subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0),
      delivery = await deliverySnapshot(
        client,
        input,
        subtotal,
      );
    return {
      fee: delivery.fee,
      fulfillmentMethod: delivery.method,
      methodName: delivery.methodName,
      areaGroupName: delivery.areaGroupName,
      pickupLocationId: delivery.pickup?.id || "",
      minimumDeliveryDays: delivery.minimumDeliveryDays,
      maximumDeliveryDays: delivery.maximumDeliveryDays,
    };
  });
}
