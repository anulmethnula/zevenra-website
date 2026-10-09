import { randomBytes } from "node:crypto";
import { query, withTransaction } from "../_db.js";
import { mapOrder, mapPreorder } from "./mappers.js";
import { matchDeliveryZone } from "../../shared/delivery-match.js";

const activeStatuses = [
  "new",
  "contacted",
  "confirmed",
  "batched",
  "ordered",
  "in_transit",
  "arrived",
  "ready",
];
const transitions: Record<string, string[]> = {
  new: ["new", "contacted", "cancelled"],
  contacted: ["contacted", "confirmed", "cancelled"],
  confirmed: ["confirmed", "cancelled"],
  batched: ["batched", "ordered", "cancelled"],
  ordered: ["ordered", "in_transit", "cancelled"],
  in_transit: ["in_transit", "arrived"],
  arrived: ["arrived", "ready", "cancelled"],
  ready: ["ready", "cancelled"],
  converted: ["converted"],
  cancelled: ["cancelled"],
};
const orderWithItems = `SELECT o.*,COALESCE((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.order_id),'[]') AS items FROM orders o`;
const newId = (prefix: string) =>
  `${prefix}-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

export async function createPreorder(input: Record<string, unknown>) {
  return withTransaction(async (client) => {
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
    const duplicate = await client.query(
      "SELECT 1 FROM preorders WHERE variant_id=$1 AND status=ANY($2::text[]) AND (($3::text IS NOT NULL AND customer_id=$3) OR regexp_replace(whatsapp,'\\D','','g')=$4) LIMIT 1",
      [
        input.variantId,
        activeStatuses,
        input.customerId || null,
        String(input.whatsapp || "").replace(/\D/g, ""),
      ],
    );
    if (duplicate.rowCount)
      throw new Error(
        "You already have an active pre-order request for this size. Contact ZEVENRA if you want to change it.",
      );
    const requestId = newId("PRE"),
      result = await client.query<Record<string, unknown>>(
        `INSERT INTO preorders(request_id,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,product_id,variant_id,product_name,sku,color,size,quantity,requested_price,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'new') RETURNING *`,
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
        ],
      );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('system','create','preorder',$1,$2::jsonb)",
      [
        requestId,
        JSON.stringify({
          productId: product.product_id,
          quantity: input.quantity,
        }),
      ],
    );
    return mapPreorder(result.rows[0]);
  });
}

export async function listPreorders(status?: string) {
  const values = status ? [status] : [],
    where = status ? " WHERE status=$1" : "";
  return (
    await query<Record<string, unknown>>(
      `SELECT * FROM preorders${where} ORDER BY created_at DESC`,
      values,
    )
  ).rows.map(mapPreorder);
}

export async function updatePreorder(input: Record<string, unknown>) {
  const current = (
    await query<Record<string, unknown>>(
      "SELECT * FROM preorders WHERE request_id=$1",
      [input.requestId],
    )
  ).rows[0];
  if (!current) throw new Error("Pre-order not found");
  const nextStatus = String(input.status ?? current.status),
    confirmedPrice =
      input.confirmedPrice === undefined
        ? current.confirmed_price
        : Number(input.confirmedPrice) || null;
  if (!transitions[String(current.status)]?.includes(nextStatus))
    throw new Error(
      "Invalid pre-order step. Follow the next action shown in the admin panel.",
    );
  if (nextStatus === "confirmed" && !Number(confirmedPrice))
    throw new Error(
      "Set the confirmed selling price before confirming the customer.",
    );
  const result = await query<Record<string, unknown>>(
    `UPDATE preorders SET status=$2,confirmed_price=$3,batch_id=$4,notes=$5,customer_name=$6,phone=$7,whatsapp=$8,email=$9,address1=$10,address2=$11,city=$12,district=$13,postal_code=$14,updated_at=now() WHERE request_id=$1 RETURNING *`,
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
  await query(
    "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','update','preorder',$1,$2::jsonb)",
    [input.requestId, JSON.stringify(input)],
  );
  return mapPreorder(result.rows[0]);
}

export async function createPreorderBatch() {
  return withTransaction(async (client) => {
    const rows = await client.query<Record<string, unknown>>(
        "SELECT * FROM preorders WHERE status='confirmed' AND batch_id='' FOR UPDATE",
      ),
      pieces = rows.rows.reduce((sum, row) => sum + Number(row.quantity), 0);
    if (pieces < 5)
      throw new Error(
        "Confirm at least 5 pieces before creating a supplier batch.",
      );
    const batchId = `SHEIN-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
    await client.query(
      "UPDATE preorders SET batch_id=$1,status='batched',updated_at=now() WHERE status='confirmed' AND batch_id=''",
      [batchId],
    );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','batch','preorder',$1,$2::jsonb)",
      [batchId, JSON.stringify({ requests: rows.rowCount, items: pieces })],
    );
    return { batchId, requests: rows.rowCount || 0, items: pieces };
  });
}

export async function convertPreorderToOrder(input: Record<string, unknown>) {
  return withTransaction(async (client) => {
    const preorder = (
      await client.query<Record<string, unknown>>(
        "SELECT * FROM preorders WHERE request_id=$1 FOR UPDATE",
        [input.requestId],
      )
    ).rows[0];
    if (!preorder) throw new Error("Pre-order not found");
    if (!["arrived", "ready"].includes(String(preorder.status)))
      throw new Error(
        "Mark the pre-order as arrived or ready before conversion.",
      );
    if (Number(preorder.confirmed_price) <= 0)
      throw new Error("Confirmed selling price is required before conversion.");
    if (!preorder.address1 || !preorder.city || !preorder.district)
      throw new Error(
        "Complete the customer delivery address before conversion.",
      );
    const settings = (
        await client.query<{ key: string; value: unknown }>(
          "SELECT key,value FROM site_settings",
        )
      ).rows,
      setting = (key: string, fallback: unknown) =>
        settings.find((row) => row.key === key)?.value ?? fallback,
      defaultCourier = String(setting("defaultCourierProviderId", "")),
      courier = (
        await client.query<Record<string, unknown>>(
          "SELECT * FROM courier_providers WHERE id=$1 AND active=true",
          [defaultCourier],
        )
      ).rows[0];
    if (!courier) throw new Error("Delivery courier is not configured.");
    let fee = Number(courier.flat_rate) || 0,
      zoneName = "Flat rate",
      ratePlan = "flat";
    if (courier.pricing_mode === "zone") {
      const zones=(await client.query<Record<string,unknown>>("SELECT * FROM delivery_rates WHERE courier_provider_id=$1 AND active=true ORDER BY sort_order",[defaultCourier])).rows.map(zone=>({id:String(zone.id),name:String(zone.name),fee:Number(zone.fee)||0,active:Boolean(zone.active),fallback:Boolean(zone.fallback),sortOrder:Number(zone.sort_order)||0,districts:Array.isArray(zone.districts)?zone.districts.map(String):[],cities:Array.isArray(zone.cities)?zone.cities.map(String):[],postalCodes:Array.isArray(zone.postal_codes)?zone.postal_codes.map(String):[]}));
      const zone=matchDeliveryZone(zones,{district:String(preorder.district),city:String(preorder.city),postalCode:String(preorder.postal_code||"")});
      if (!zone)
        throw new Error("Delivery is not configured for this address.");
      fee = Number(zone.fee);
      zoneName = String(zone.name);
      ratePlan = String(zone.id);
    }
    const price = Number(preorder.confirmed_price),
      threshold = Number(setting("freeDeliveryThreshold", 0));
    if (!(setting("deliveryEnabled", true) === true || String(setting("deliveryEnabled", true)).toLowerCase() === "true")) fee=0;
    if (threshold > 0 && price * Number(preorder.quantity) >= threshold)
      fee = 0;
    const orderId = newId("ZEV");
    await client.query(
      `INSERT INTO orders(order_id,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,courier_provider_id,courier_name,delivery_pricing_mode,delivery_rate_plan,delivery_zone_name,payment_method,payment_status,subtotal,delivery_fee,total,stock_state,order_status,source,has_preorder) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'not_applicable','pending','preorder',true)`,
      [
        orderId,
        preorder.customer_id,
        preorder.customer_name,
        preorder.phone,
        preorder.whatsapp,
        preorder.email,
        preorder.address1,
        preorder.address2,
        preorder.city,
        preorder.district,
        preorder.postal_code,
        courier.id,
        courier.name,
        courier.pricing_mode,
        ratePlan,
        zoneName,
        input.paymentMethod === "bank" ? "bank" : "cod",
        input.paymentMethod === "bank" ? "verification required" : "COD",
        price * Number(preorder.quantity),
        fee,
        price * Number(preorder.quantity) + fee,
      ],
    );
    await client.query(
      `INSERT INTO order_items(order_id,product_id,variant_id,sku,product_name,color,size,quantity,unit_price,line_total,is_preorder) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
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
      ],
    );
    await client.query(
      "UPDATE preorders SET status='converted',converted_order_id=$2,notes=concat_ws(' | ',nullif(notes,''),$3),updated_at=now() WHERE request_id=$1",
      [input.requestId, orderId, `Converted to ${orderId}`],
    );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','convert','preorder',$1,$2::jsonb)",
      [input.requestId, JSON.stringify({ orderId })],
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
