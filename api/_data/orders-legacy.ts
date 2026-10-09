import { randomBytes } from "node:crypto";
import type { DatabaseClient } from "../_db.js";
import { query, withTransaction } from "../_db.js";
import { sriLankaDistricts } from "../_shared.js";
import { receiptAsset } from "../_receipt-asset.js";
import {
  normalizeOrderIdForLookup,
  normalizeSriLankanPhoneForLookup,
} from "../_order-track-normalization.js";
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
  paymentStatus?: string;
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

const orderWithItems = `SELECT o.*,COALESCE((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.order_id),'[]') AS items,(SELECT count(*)::int FROM order_returns r WHERE r.order_id=o.order_id) AS return_count FROM orders o`;
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
    requireReceipt?: boolean;
  } = {},
) {
  return withTransaction(async (client) => {
    const lines = await loadLines(client, input, options.trustProvidedPrice),
      subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0),
      delivery = await deliverySnapshot(client, input, subtotal),
      asset = receiptAsset(input.paymentReceiptUrl),
      orderId = newOrderId();
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
        input.paymentStatus ||
          (input.paymentMethod === "cod" ? "COD" : "receipt submitted"),
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
export async function recentOrders(limit = 10) {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  return (await query<Record<string, unknown>>(
    "SELECT * FROM orders ORDER BY created_at DESC LIMIT $1",
    [safeLimit],
  )).rows.map(mapOrder);
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

export async function findGuestOrder(orderId: string, phone: string) {
  const orderKey = normalizeOrderIdForLookup(orderId),
    phoneKey = normalizeSriLankanPhoneForLookup(phone);
  const row = (
    await query<Record<string, unknown>>(
      `SELECT o.order_id,o.created_at,o.customer_name,o.address1,o.address2,o.city,o.district,o.postal_code,o.order_status,o.discount_code,o.discount_amount,
        o.payment_method,o.payment_status,o.delivery_zone_name,o.subtotal,o.delivery_fee,o.total,
        o.fulfilment_courier_name,o.tracking_number,o.tracking_url,o.courier_sent_date,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'name',oi.product_name,'color',oi.color,'size',oi.size,'quantity',oi.quantity,
          'unitPrice',oi.unit_price,'isPreorder',oi.is_preorder,
          'productSlug',p.slug,
          'imageUrl',(SELECT media.value->>'url' FROM jsonb_array_elements(COALESCE(p.media,'[]'::jsonb)) WITH ORDINALITY media(value,ordinality) WHERE media.value->>'type'='image' ORDER BY media.ordinality LIMIT 1)
        ) ORDER BY oi.id) FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id AND p.status='published' WHERE oi.order_id=o.order_id),'[]') AS items
       FROM orders o
       WHERE upper(o.order_id)=$1
         AND CASE
            WHEN regexp_replace(o.phone,'\\D','','g') LIKE '0094%' THEN substring(regexp_replace(o.phone,'\\D','','g') from 3)
            WHEN regexp_replace(o.phone,'\\D','','g') ~ '^7[0-9]{8}$' THEN '94' || regexp_replace(o.phone,'\\D','','g')
            WHEN regexp_replace(o.phone,'\\D','','g') LIKE '0%' THEN '94' || substring(regexp_replace(o.phone,'\\D','','g') from 2)
           ELSE regexp_replace(o.phone,'\\D','','g')
         END=$2
       LIMIT 1`,
      [orderKey, phoneKey],
    )
  ).rows[0];
  return row || null;
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
    const currentStatus = String(current.order_status),
      nextStatus = String(input.orderStatus ?? currentStatus).toLowerCase(),
      transitions: Record<string, string[]> = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["sourcing", "packed", "cancelled"],
        sourcing: ["packed", "cancelled"],
        packed: ["shipped", "cancelled"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: [],
      };
    if (nextStatus !== currentStatus && !transitions[currentStatus]?.includes(nextStatus))
      throw new Error(`Order cannot move from ${currentStatus} to ${nextStatus}.`);
    const nextPayment = String(input.paymentStatus ?? current.payment_status),
      bankReady = ["paid", "verified"].includes(nextPayment.toLowerCase());
    const paymentOptions = current.payment_method === "bank"
      ? ["verification required", "receipt submitted", "verified", "paid", "rejected", "refund pending", "refunded"]
      : ["cod", "paid", "refund pending", "refunded"];
    if (!paymentOptions.includes(nextPayment.toLowerCase()))
      throw new Error("That payment status is not valid for this payment method.");
    if (current.payment_method === "bank" && nextStatus === "confirmed" && !bankReady)
      throw new Error("Verify or mark the bank payment paid before confirming this order.");
    if (current.payment_method === "bank" && nextPayment.toLowerCase() === "rejected" && !["pending", "cancelled"].includes(nextStatus))
      throw new Error("A rejected bank payment cannot progress through fulfilment.");
    const fulfilmentName = String(input.fulfilmentCourierName ?? current.fulfilment_courier_name ?? "").trim();
    if (nextStatus === "shipped" && !fulfilmentName)
      throw new Error("Select the actual fulfilment courier before marking this order shipped.");
    let restoredUnits = 0;
    if (nextStatus === "cancelled" && currentStatus !== "cancelled" && current.stock_state === "reserved") {
      const items = await client.query<Record<string, unknown>>(
        "SELECT * FROM order_items WHERE order_id=$1 FOR UPDATE",
        [orderId],
      );
      for (const item of items.rows)
        if (!item.is_preorder && item.variant_id) {
          await client.query(
            "UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",
            [item.variant_id, item.quantity],
          );
          restoredUnits += Number(item.quantity) || 0;
        }
    }
    const stockState =
      nextStatus === "cancelled" && current.stock_state === "reserved"
        ? "restored"
        : nextStatus === "delivered" && current.stock_state === "reserved"
          ? "fulfilled"
        : current.stock_state;
    const fields = [
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
    const automaticCodPaid = current.payment_method === "cod" && nextStatus === "delivered",
      paymentStatus = automaticCodPaid ? "paid" : nextPayment;
    const updates = ["order_status=$2", "stock_state=$3", "payment_status=$4", "updated_at=now()"],
      values: unknown[] = [orderId, nextStatus, stockState, paymentStatus];
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
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','order_update','order',$1,$2::jsonb)",
      [orderId, JSON.stringify({ before: { orderStatus: currentStatus, paymentStatus: current.payment_status, stockState: current.stock_state }, after: { orderStatus: nextStatus, paymentStatus, stockState }, restoredUnits })],
    );
    if (automaticCodPaid && current.payment_status !== "paid")
      await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('system','cod_payment_paid','order',$1,$2::jsonb)", [orderId, JSON.stringify({ trigger: "delivered" })]);
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

export async function updateOrderDetails(input: Record<string, unknown>) {
  const orderId = String(input.orderId || "");
  return withTransaction(async (client) => {
    const current = (await client.query<Record<string, unknown>>("SELECT * FROM orders WHERE order_id=$1 FOR UPDATE", [orderId])).rows[0];
    if (!current) throw new Error("Order not found");
    if (["shipped", "delivered", "cancelled"].includes(String(current.order_status)))
      throw new Error("Customer and delivery details are locked after shipment.");
    const fields = ["customerName","phone","whatsapp","email","address1","address2","city","district","postalCode","deliveryNotes"] as const,
      columns: Record<(typeof fields)[number], string> = { customerName:"customer_name",phone:"phone",whatsapp:"whatsapp",email:"email",address1:"address1",address2:"address2",city:"city",district:"district",postalCode:"postal_code",deliveryNotes:"delivery_notes" },
      updates: string[] = [], values: unknown[] = [orderId], before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
    for (const key of fields) if (input[key] !== undefined) {
      const value = String(input[key] || "").trim();
      if (key === "customerName" && (value.length < 2 || !/^[\p{L}\p{M} .'-]+$/u.test(value))) throw new Error("Enter a valid full name.");
      if (key === "phone" && !/^[+\d][\d\s-]{8,14}$/.test(value)) throw new Error("Enter a valid mobile number.");
      if (key === "whatsapp" && value && !/^[+\d][\d\s-]{8,14}$/.test(value)) throw new Error("Enter a valid WhatsApp number.");
      if (key === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Enter a valid email address.");
      if (key === "address1" && value.length < 5) throw new Error("Enter the delivery address.");
      if (key === "city" && value.length < 2) throw new Error("Enter the city or area.");
      if (key === "district" && !(sriLankaDistricts as readonly string[]).includes(value)) throw new Error("Choose a valid Sri Lankan district.");
      if (key === "postalCode" && value && !/^\d{5}$/.test(value)) throw new Error("Postal code must be 5 digits.");
      if (["customerName","city","district"].includes(key) && value.length > 100) throw new Error("One or more details are too long.");
      if (["address1","address2"].includes(key) && value.length > 180) throw new Error("Address lines must be 180 characters or fewer.");
      if (key === "deliveryNotes" && value.length > 300) throw new Error("Delivery notes must be 300 characters or fewer.");
      values.push(value); updates.push(`${columns[key]}=$${values.length}`); before[key] = current[columns[key]]; after[key] = value;
    }
    if (!updates.length) throw new Error("No editable details were provided.");
    await client.query(`UPDATE orders SET ${updates.join(",")},updated_at=now() WHERE order_id=$1`, values);
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','details_edited','order',$1,$2::jsonb)", [orderId, JSON.stringify({ before, after })]);
    return getOrderWithClient(client, orderId);
  });
}

async function getOrderWithClient(client: DatabaseClient, orderId: string) {
  return mapOrder((await client.query<Record<string, unknown>>(`${orderWithItems} WHERE o.order_id=$1`, [orderId])).rows[0]);
}

export async function listReturns(orderId?: string) {
  const rows = (await query<Record<string, unknown>>(`SELECT r.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ri.id,'orderItemId',ri.order_item_id,'quantity',ri.quantity,'restockable',ri.restockable,'restockedAt',ri.restocked_at,'productName',oi.product_name,'variantId',oi.variant_id,'color',oi.color,'size',oi.size) ORDER BY ri.id) FROM order_return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=r.id),'[]') items FROM order_returns r ${orderId ? "WHERE r.order_id=$1" : ""} ORDER BY r.created_at DESC`, orderId ? [orderId] : [])).rows;
  return rows.map((row) => ({ id:String(row.id), orderId:String(row.order_id), type:String(row.type), status:String(row.status), reason:String(row.reason), notes:String(row.notes||""), createdAt:new Date(String(row.created_at)).toISOString(), receivedAt:row.received_at ? new Date(String(row.received_at)).toISOString() : "", items:row.items }));
}

export async function createReturn(input: Record<string, unknown>) {
  const orderId=String(input.orderId||""), type=String(input.type||""), reason=String(input.reason||"").trim(), notes=String(input.notes||"").trim(), refundRequired=input.refundRequired===true, requested=Array.isArray(input.items)?input.items as Array<Record<string,unknown>>:[];
  if(!["customer_return","courier_rto"].includes(type)||!reason||!requested.length) throw new Error("Choose a return type, reason and at least one item.");
  return withTransaction(async(client)=>{
    const order=(await client.query<Record<string,unknown>>("SELECT * FROM orders WHERE order_id=$1 FOR UPDATE",[orderId])).rows[0];
    if(!order) throw new Error("Order not found");
    if(type==="courier_rto"&&order.order_status!=="shipped") throw new Error("Courier RTO is available only for shipped orders.");
    if(type==="customer_return"&&order.order_status!=="delivered") throw new Error("Customer returns are available only for delivered orders.");
    const id=`RET-${randomBytes(6).toString("hex").toUpperCase()}`;
    await client.query("INSERT INTO order_returns(id,order_id,type,status,reason,notes,refund_required) VALUES($1,$2,$3,'requested',$4,$5,$6)",[id,orderId,type,reason,notes,refundRequired]);
    for(const requestedItem of requested){const itemId=Number(requestedItem.orderItemId), qty=Number(requestedItem.quantity);if(!Number.isInteger(qty)||qty<1)throw new Error("Return quantities must be whole numbers.");const item=(await client.query<Record<string,unknown>>("SELECT * FROM order_items WHERE id=$1 AND order_id=$2 FOR UPDATE",[itemId,orderId])).rows[0];if(!item)throw new Error("Invalid return item.");const prior=await client.query<{quantity:number}>("SELECT COALESCE(sum(ri.quantity),0)::int quantity FROM order_return_items ri JOIN order_returns r ON r.id=ri.return_id WHERE ri.order_item_id=$1 AND r.status<>'rejected'",[itemId]);if(Number(prior.rows[0]?.quantity||0)+qty>Number(item.quantity))throw new Error("Returned quantity exceeds the quantity purchased.");await client.query("INSERT INTO order_return_items(return_id,order_item_id,quantity) VALUES($1,$2,$3)",[id,itemId,qty]);}
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','return_created','order_return',$1,$2::jsonb)",[id,JSON.stringify({orderId,type,reason})]);return {id,orderId,type,status:"requested",reason,notes};
  });
}

export async function updateReturn(input: Record<string, unknown>) {
  const id=String(input.returnId||""), next=String(input.status||"");
  return withTransaction(async(client)=>{const ret=(await client.query<Record<string,unknown>>("SELECT * FROM order_returns WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!ret)throw new Error("Return not found");const allowed:Record<string,string[]>={requested:["approved","rejected","in_transit"],approved:["in_transit","rejected"],in_transit:["received"],received:["completed"],completed:[],rejected:[]};if(!allowed[String(ret.status)]?.includes(next))throw new Error(`Return cannot move from ${ret.status} to ${next}.`);
    let restored=0;if(next==="received"){const decisions=Array.isArray(input.items)?input.items as Array<Record<string,unknown>>:[];const lines=(await client.query<Record<string,unknown>>("SELECT ri.*,oi.variant_id FROM order_return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1 FOR UPDATE",[id])).rows;for(const line of lines){const decision=decisions.find(item=>Number(item.id)===Number(line.id));if(!decision||typeof decision.restockable!=="boolean")throw new Error("Mark every returned item as restockable or not restockable.");if(decision.restockable&&!line.restocked_at&&line.variant_id){await client.query("UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",[line.variant_id,line.quantity]);restored+=Number(line.quantity);await client.query("UPDATE order_return_items SET restockable=true,restocked_at=now() WHERE id=$1 AND restocked_at IS NULL",[line.id]);}else await client.query("UPDATE order_return_items SET restockable=$2 WHERE id=$1",[line.id,decision.restockable]);}
      const order=(await client.query<Record<string,unknown>>("SELECT * FROM orders WHERE order_id=$1 FOR UPDATE",[ret.order_id])).rows[0];if(ret.refund_required&&["paid","verified"].includes(String(order.payment_status).toLowerCase()))await client.query("UPDATE orders SET payment_status='refund pending',updated_at=now() WHERE order_id=$1",[ret.order_id]);}
    await client.query("UPDATE order_returns SET status=$2,updated_at=now(),received_at=CASE WHEN $2='received' THEN now() ELSE received_at END,completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END WHERE id=$1",[id,next]);await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','return_status_changed','order_return',$1,$2::jsonb)",[id,JSON.stringify({from:ret.status,to:next,restoredUnits:restored,orderId:ret.order_id})]);return { returnId:id,status:next,restoredUnits:restored };});
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
