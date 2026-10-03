import { randomBytes } from "node:crypto";
import type { DatabaseClient } from "../_db.js";
import { query, withTransaction } from "../_db.js";
import { mapOrder } from "./mappers.js";

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
  paymentReference?: string;
  paymentReceiptUrl?: string;
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

const orderWithItems = `SELECT o.*,COALESCE((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.order_id),'[]') AS items FROM orders o`;
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const postalMatches = (rule: string, postal: string) =>
  rule.endsWith("*") ? postal.startsWith(rule.slice(0, -1)) : postal === rule;
const settingValue = (
  rows: Array<{ key: string; value: unknown }>,
  key: string,
  fallback: unknown,
) => rows.find((row) => row.key === key)?.value ?? fallback;
const truthy = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";

function receiptAsset(value: string | undefined) {
  if (!value) return { publicId: "", resourceType: "", format: "" };
  const url = new URL(value),
    parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    !["image", "raw", "video"].includes(parts[1] || "") ||
    parts[2] !== "authenticated" ||
    parts[0] !== process.env.CLOUDINARY_CLOUD_NAME
  )
    throw new Error("Invalid payment receipt URL.");
  let rest = parts.slice(3);
  if (/^v\d+$/.test(rest[0] || "")) rest = rest.slice(1);
  const last = rest.pop() || "",
    dot = last.lastIndexOf("."),
    name = dot > 0 ? last.slice(0, dot) : last,
    format = dot > 0 ? last.slice(dot + 1) : "",
    publicId = [...rest, name].join("/");
  if (!publicId.startsWith("zevenra/payment-receipts/"))
    throw new Error("Invalid payment receipt URL.");
  return { publicId, resourceType: parts[1], format };
}

async function deliverySnapshot(
  client: DatabaseClient,
  input: OrderInput,
  subtotal: number,
) {
  const settings = (
    await client.query<{ key: string; value: unknown }>(
      "SELECT key,value FROM site_settings",
    )
  ).rows;
  if (
    !truthy(settingValue(settings, "storeOpen", true)) ||
    !truthy(settingValue(settings, "ordersEnabled", true))
  )
    throw new Error("Online ordering is temporarily unavailable.");
  const defaultId = String(
    settingValue(settings, "defaultCourierProviderId", ""),
  );
  const courier = (
    await client.query<Record<string, unknown>>(
      "SELECT * FROM courier_providers WHERE id=$1 AND active=true",
      [defaultId],
    )
  ).rows[0];
  if (!courier) throw new Error("Online ordering is temporarily unavailable.");
  let fee = Number(courier.flat_rate) || 0,
    zoneName = "Flat rate",
    ratePlan = "flat";
  if (courier.pricing_mode === "zone") {
    const rates = (
      await client.query<Record<string, unknown>>(
        "SELECT * FROM delivery_rates WHERE courier_provider_id=$1 AND active=true ORDER BY sort_order",
        [defaultId],
      )
    ).rows;
    const postal = String(input.postalCode || "").replace(/\D/g, ""),
      city = normalize(input.city),
      district = normalize(input.district);
    const matches = rates
      .map((rate) => {
        const postals = rate.postal_codes as string[],
          cities = rate.cities as string[],
          districts = rate.districts as string[];
        if (rate.fallback) return { rate, score: 0 };
        if (
          districts.length &&
          !districts.some((item) => normalize(item) === district)
        )
          return { rate, score: -1 };
        if (
          postal &&
          postals.some((item) =>
            postalMatches(String(item).replace(/\s/g, ""), postal),
          )
        )
          return { rate, score: 300 };
        if (city && cities.some((item) => normalize(item) === city))
          return { rate, score: 200 };
        if (districts.length && !cities.length && !postals.length)
          return { rate, score: 100 };
        return { rate, score: -1 };
      })
      .filter((item) => item.score >= 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(a.rate.sort_order) - Number(b.rate.sort_order),
      );
    const selected = matches[0]?.rate;
    if (!selected)
      throw new Error("Delivery is not configured for this address.");
    fee = Number(selected.fee) || 0;
    zoneName = String(selected.name);
    ratePlan = String(selected.id);
  }
  if (!truthy(settingValue(settings, "deliveryEnabled", true))) fee = 0;
  const threshold =
    Number(settingValue(settings, "freeDeliveryThreshold", 0)) || 0;
  if (threshold > 0 && subtotal >= threshold) fee = 0;
  return {
    courierProviderId: String(courier.id),
    courierName: String(courier.name),
    pricingMode: String(courier.pricing_mode),
    ratePlan,
    zoneName,
    fee,
  };
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
        `SELECT v.*,p.name AS product_name,p.price,p.status,p.preorder_enabled FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND v.product_id=$2 AND v.active=true FOR UPDATE`,
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
  } = {},
) {
  return withTransaction(async (client) => {
    const lines = await loadLines(client, input, options.trustProvidedPrice),
      subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0),
      delivery = await deliverySnapshot(client, input, subtotal),
      asset = receiptAsset(input.paymentReceiptUrl),
      orderId = newOrderId();
    if (input.paymentMethod === "bank" && !asset.publicId)
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
    const stockState = options.preorderReservedArrival
        ? "not_applicable"
        : "reserved",
      hasPreorder = lines.some((line) => line.isPreorder);
    await client.query(
      `INSERT INTO orders(order_id,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,delivery_notes,courier_provider_id,courier_name,delivery_pricing_mode,delivery_rate_plan,delivery_zone_name,payment_method,payment_status,payment_reference,payment_receipt_public_id,payment_receipt_resource_type,payment_receipt_format,subtotal,delivery_fee,total,stock_state,order_status,source,has_preorder) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'pending',$28,$29)`,
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
        input.paymentMethod === "cod" ? "COD" : "receipt submitted",
        input.paymentReference || "",
        asset.publicId,
        asset.resourceType,
        asset.format,
        subtotal,
        delivery.fee,
        subtotal + delivery.fee,
        stockState,
        input.source || "web",
        hasPreorder,
      ],
    );
    for (const line of lines)
      await client.query(
        `INSERT INTO order_items(order_id,product_id,variant_id,sku,product_name,color,size,quantity,unit_price,line_total,is_preorder) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
        ],
      );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('system','create','order',$1,$2::jsonb)",
      [
        orderId,
        JSON.stringify({
          total: subtotal + delivery.fee,
          deliveryZone: delivery.zoneName,
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

export async function listOrders() {
  return (
    await query<Record<string, unknown>>(
      `${orderWithItems} ORDER BY o.created_at DESC`,
    )
  ).rows.map(mapOrder);
}
export async function getOrder(orderId: string) {
  const row = (
    await query<Record<string, unknown>>(
      `${orderWithItems} WHERE o.order_id=$1`,
      [orderId],
    )
  ).rows[0];
  return row ? mapOrder(row) : null;
}

export async function updateOrder(input: Record<string, unknown>) {
  const orderId = String(input.orderId || "");
  return withTransaction(async (client) => {
    const current = (
      await client.query<Record<string, unknown>>(
        "SELECT * FROM orders WHERE order_id=$1 FOR UPDATE",
        [orderId],
      )
    ).rows[0];
    if (!current) throw new Error("Order not found");
    const nextStatus = String(
        input.orderStatus ?? current.order_status,
      ).toLowerCase(),
      wasCancelled = current.order_status === "cancelled";
    if (
      nextStatus === "cancelled" &&
      !wasCancelled &&
      current.stock_state === "reserved"
    ) {
      const items = await client.query<Record<string, unknown>>(
        "SELECT * FROM order_items WHERE order_id=$1",
        [orderId],
      );
      for (const item of items.rows)
        if (!item.is_preorder && item.variant_id)
          await client.query(
            "UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",
            [item.variant_id, item.quantity],
          );
    }
    if (nextStatus !== "cancelled" && wasCancelled)
      throw new Error("Cancelled orders cannot be reopened automatically.");
    const stockState =
      nextStatus === "cancelled" && current.stock_state === "reserved"
        ? "restored"
        : current.stock_state;
    const fields = [
        "paymentStatus",
        "fulfilmentCourierProviderId",
        "fulfilmentCourierName",
        "trackingNumber",
        "trackingUrl",
        "courierSentDate",
      ] as const,
      map = {
        paymentStatus: "payment_status",
        fulfilmentCourierProviderId: "fulfilment_courier_provider_id",
        fulfilmentCourierName: "fulfilment_courier_name",
        trackingNumber: "tracking_number",
        trackingUrl: "tracking_url",
        courierSentDate: "courier_sent_date",
      } as const;
    const updates = ["order_status=$2", "stock_state=$3", "updated_at=now()"],
      values: unknown[] = [orderId, nextStatus, stockState];
    for (const key of fields)
      if (input[key] !== undefined) {
        values.push(input[key] || null);
        updates.push(`${map[key]}=$${values.length}`);
      }
    await client.query(
      `UPDATE orders SET ${updates.join(",")} WHERE order_id=$1`,
      values,
    );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','update','order',$1,$2::jsonb)",
      [orderId, JSON.stringify(input)],
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

export async function receiptForOrder(orderId: string) {
  return (
    (
      await query<{
        payment_receipt_public_id: string;
        payment_receipt_resource_type: string;
        payment_receipt_format: string;
      }>(
        "SELECT payment_receipt_public_id,payment_receipt_resource_type,payment_receipt_format FROM orders WHERE order_id=$1",
        [orderId],
      )
    ).rows[0] || null
  );
}
