import { randomBytes } from "node:crypto";
import type { DatabaseClient } from "../_db.js";
import { withTransaction } from "../_db.js";
import { receiptAsset } from "../_receipt-asset.js";
import { mapOrder } from "./mappers.js";
import { validateDiscount } from "./discounts.js";
import { calculateShippingWeight } from "../../shared/shipping-weight.js";
import { weightBasedDeliveryFee } from "../../shared/delivery-weight-fee.js";
import { normalizeLocation } from "../../shared/delivery-match.js";

export {
  createReturn,
  findGuestOrder,
  getOrder,
  listOrders,
  listReturns,
  receiptForOrder,
  recentOrders,
  updateOrder,
  updateOrderDetails,
  updateReturn,
} from "./orders-legacy.js";

type OrderInput = {
  customerId?: string;
  customerName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address1: string;
  address2?: string;
  city: string;
  district: string;
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
  shippingWeightGrams: number;
};

const orderWithItems = `SELECT o.*,COALESCE((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.order_id),'[]') AS items,(SELECT count(*)::int FROM order_returns r WHERE r.order_id=o.order_id) AS return_count FROM orders o`;
const settingValue = (
  rows: Array<{ key: string; value: unknown }>,
  key: string,
  fallback: unknown,
) => rows.find((row) => row.key === key)?.value ?? fallback;
const truthy = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";

export async function deliverySnapshot(
  client: DatabaseClient,
  input: Pick<OrderInput, "city" | "district" | "postalCode">,
  subtotal: number,
  totalShippingWeightGrams: number,
  enforceStoreAvailability = true,
) {
  const settings = (
    await client.query<{ key: string; value: unknown }>(
      "SELECT key,value FROM site_settings",
    )
  ).rows;
  if (enforceStoreAvailability &&
    !truthy(settingValue(settings, "storeOpen", true)) ||
    !truthy(settingValue(settings, "ordersEnabled", true))
  )
    throw new Error("Online ordering is temporarily unavailable.");

  const defaultId = String(settingValue(settings, "defaultCourierProviderId", ""));
  const courier = (
    await client.query<Record<string, unknown>>(
      "SELECT * FROM courier_providers WHERE id=$1 AND active=true",
      [defaultId],
    )
  ).rows[0];
  if (!courier) throw new Error("Online ordering is temporarily unavailable.");

  const rates = (await client.query<Record<string, unknown>>(
    `SELECT r.* FROM courier_rates r
     JOIN courier_rate_cards card ON card.id=r.rate_card_id
     WHERE r.courier_provider_id=$1 AND r.active=true AND card.status='active'`,
    [defaultId],
  )).rows;
  const city = normalizeLocation(input.city), district = normalizeLocation(input.district);
  const selected = rates.find(rate => normalizeLocation(rate.destination_city) === city && normalizeLocation(rate.destination_district) === district)
    ?? rates.find(rate => !normalizeLocation(rate.destination_city) && normalizeLocation(rate.destination_district) === district)
    ?? rates.find(rate => normalizeLocation(rate.destination_district) === district);
  if (!selected) throw new Error("Delivery is not configured for this address.");
  let fee = weightBasedDeliveryFee(totalShippingWeightGrams, Number(selected.first_kg_charge), Number(selected.additional_kg_charge));
  const zoneName = [selected.destination_city, selected.destination_district].map(String).filter(Boolean).join(", "),
    ratePlan = String(selected.rate_card_id);

  if (!truthy(settingValue(settings, "deliveryEnabled", true))) fee = 0;
  const threshold = Number(settingValue(settings, "freeDeliveryThreshold", 0)) || 0;
  if (threshold > 0 && subtotal >= threshold) fee = 0;

  return {
    courierProviderId: String(courier.id),
    courierName: String(courier.name),
    pricingMode: String(courier.pricing_mode),
    ratePlan,
    zoneName,
    fee,
    minimumDeliveryDays: Number(courier.minimum_delivery_days) || 2,
    maximumDeliveryDays: Number(courier.maximum_delivery_days) || 4,
  };
}

async function shippingWeightSnapshot(client: DatabaseClient, lines: Line[]) {
  const row = (await client.query<{value:unknown}>("SELECT value FROM site_settings WHERE key='packagingWeightGrams'")).rows[0];
  if (!row) throw new Error("Packaging weight is not configured. Ask an administrator to configure delivery settings.");
  const result = calculateShippingWeight(lines.map(line=>({productId:line.productId,productName:line.productName,quantity:line.quantity,shippingWeightGrams:line.shippingWeightGrams||undefined})),Number(row.value));
  if (!result.ready) throw new Error(`Shipping weight is not configured for: ${result.missing.map(item=>item.productName||item.productId).join(", ")}.`);
  return result;
}

async function loadLines(
  client: DatabaseClient,
  input: OrderInput,
  trustProvidedPrice = false,
) {
  const ids = new Set<string>(),
    lines: Line[] = [];
  for (const item of input.items) {
    if (ids.has(item.variantId)) throw new Error("Duplicate cart variant.");
    ids.add(item.variantId);
    const row = (
      await client.query<Record<string, unknown>>(
        `SELECT v.*,p.name AS product_name,p.price,p.status,p.preorder_enabled,p.shipping_weight_grams,c.default_shipping_weight_grams FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE v.id=$1 AND v.product_id=$2 AND v.active=true FOR UPDATE OF v,p`,
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
    const resolvedShippingWeight = row.shipping_weight_grams ?? row.default_shipping_weight_grams;
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
      shippingWeightGrams: resolvedShippingWeight == null ? 0 : Number(resolvedShippingWeight),
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
  return withTransaction(async (client) => {
    const lines = await loadLines(client, input, options.trustProvidedPrice),
      subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0),
      shippingWeight = await shippingWeightSnapshot(client, lines),
      discount = input.discountCode ? await validateDiscount(client,input.discountCode,subtotal,true) : null,
      delivery = await deliverySnapshot(client, input, subtotal, shippingWeight.totalShippingWeightGrams),
      asset = receiptAsset(input.paymentReceiptUrl),
      orderId = newOrderId();

    if (input.discountCode && !discount) throw new Error("DISCOUNT_INVALID");
    const discountAmount=discount?.amount||0,total=Math.max(0,subtotal-discountAmount+delivery.fee);

    if (
      input.paymentMethod === "bank" &&
      options.requireReceipt !== false &&
      !asset.publicId
    )
      throw new Error("Bank transfer receipt is required.");

    const phoneKey = input.phone.replace(/\D/g, ""),
      duplicate = await client.query(
        `SELECT 1 FROM orders o WHERE regexp_replace(o.phone,'\\D','','g')=$1 AND o.order_status<>'cancelled' AND o.created_at>now()-interval '2 minutes' AND EXISTS(SELECT 1 FROM order_items oi WHERE oi.order_id=o.order_id AND oi.variant_id=$2) LIMIT 1`,
        [phoneKey, lines[0].variantId],
      );
    if (duplicate.rowCount)
      throw new Error("This order was already submitted recently.");

    for (const line of lines)
      if (!line.isPreorder && !options.preorderReservedArrival)
        await client.query(
          "UPDATE variants SET stock=stock-$2,updated_at=now() WHERE id=$1 AND stock>=$2",
          [line.variantId, line.quantity],
        );

    const stockState = options.preorderReservedArrival ? "not_applicable" : "reserved",
      hasPreorder = lines.some((line) => line.isPreorder);

    await client.query(
      `INSERT INTO orders(order_id,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,delivery_notes,courier_provider_id,courier_name,delivery_pricing_mode,delivery_rate_plan,delivery_zone_name,payment_method,payment_status,payment_reference,payment_receipt_public_id,payment_receipt_resource_type,payment_receipt_format,subtotal,discount_code,discount_amount,discount_type,discount_value,delivery_fee,total,total_product_weight_grams,total_shipping_weight_grams,minimum_delivery_days,maximum_delivery_days,stock_state,order_status,source,has_preorder) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,'pending',$36,$37)`,
      [
        orderId,
        input.customerId || null,
        input.customerName,
        input.phone,
        input.whatsapp || "",
        input.email || "",
        input.address1,
        input.address2 || "",
        input.city,
        input.district,
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
        discount?.code||"",
        discountAmount,
        discount?.type||"",
        discount?.value||0,
        delivery.fee,
        total,
        shippingWeight.totalProductWeightGrams,
        shippingWeight.totalShippingWeightGrams,
        delivery.minimumDeliveryDays,
        delivery.maximumDeliveryDays,
        stockState,
        input.source || "web",
        hasPreorder,
      ],
    );
    if(discount) await client.query("UPDATE discount_codes SET usage_count=usage_count+1,updated_at=now() WHERE upper(btrim(code))=$1",[discount.code]);

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
          line.shippingWeightGrams,
        ],
      );

    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('system','create','order',$1,$2::jsonb)",
      [
        orderId,
        JSON.stringify({
          total,
          deliveryZone: delivery.zoneName,
          totalShippingWeightGrams: shippingWeight.totalShippingWeightGrams,
        }),
      ],
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

export async function quoteDelivery(input: Pick<OrderInput,"city"|"district"|"postalCode"|"items">) {
  return withTransaction(async client => {
    const lines = await loadLines(client, input as OrderInput),
      subtotal = lines.reduce((sum,line)=>sum+line.lineTotal,0),
      shippingWeight = await shippingWeightSnapshot(client,lines),
      delivery = await deliverySnapshot(client,input,subtotal,shippingWeight.totalShippingWeightGrams);
    return {fee:delivery.fee,minimumDeliveryDays:delivery.minimumDeliveryDays,maximumDeliveryDays:delivery.maximumDeliveryDays};
  });
}
