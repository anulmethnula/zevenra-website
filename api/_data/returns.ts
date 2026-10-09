import { randomBytes } from "node:crypto";
import { query, withTransaction } from "../_db.js";
import {
  returnTransitionAllowed,
  validateReturnRequest,
} from "../../shared/return-lifecycle.js";

export async function listReturns(orderId?: string) {
  const rows = (
    await query<Record<string, unknown>>(
      `SELECT r.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ri.id,'orderItemId',ri.order_item_id,'quantity',ri.quantity,'restockable',ri.restockable,'restockedAt',ri.restocked_at,'productName',oi.product_name,'variantId',oi.variant_id,'color',oi.color,'size',oi.size) ORDER BY ri.id) FROM order_return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=r.id),'[]') items FROM order_returns r ${orderId ? "WHERE r.order_id=$1" : ""} ORDER BY r.created_at DESC`,
      orderId ? [orderId] : [],
    )
  ).rows;
  return rows.map((row) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    type: String(row.type),
    status: String(row.status),
    reason: String(row.reason),
    notes: String(row.notes || ""),
    refundRequired: row.refund_required === true,
    createdAt: new Date(String(row.created_at)).toISOString(),
    receivedAt: row.received_at
      ? new Date(String(row.received_at)).toISOString()
      : "",
    items: row.items,
  }));
}

export async function createReturn(input: Record<string, unknown>) {
  const orderId = String(input.orderId || ""),
    type = String(input.type || ""),
    reason = String(input.reason || "").trim(),
    notes = String(input.notes || "").trim(),
    refundRequired = input.refundRequired === true,
    requestedRaw = Array.isArray(input.items)
      ? (input.items as Array<Record<string, unknown>>)
      : [];
  if (!["customer_return", "courier_rto"].includes(type) || !reason || !requestedRaw.length)
    throw new Error("Choose a return type, reason and at least one item.");
  if (reason.length > 500 || notes.length > 1000)
    throw new Error("Return notes are too long.");

  return withTransaction(async (client) => {
    const order = (
      await client.query<Record<string, unknown>>(
        "SELECT * FROM orders WHERE order_id=$1 FOR UPDATE",
        [orderId],
      )
    ).rows[0];
    if (!order) throw new Error("Order not found");
    if (type === "courier_rto" && order.order_status !== "shipped")
      throw new Error("Courier RTO is available only for shipped orders.");
    if (type === "customer_return" && order.order_status !== "delivered")
      throw new Error("Customer returns are available only for delivered orders.");

    if (type === "courier_rto") {
      const existing = await client.query(
        "SELECT 1 FROM order_returns WHERE order_id=$1 AND type='courier_rto' AND status<>'rejected' LIMIT 1",
        [orderId],
      );
      if (existing.rowCount)
        throw new Error("This order already has an active courier RTO.");
    }

    const purchased = (
        await client.query<{ id: number; quantity: number }>(
          "SELECT id,quantity FROM order_items WHERE order_id=$1 ORDER BY id FOR UPDATE",
          [orderId],
        )
      ).rows,
      requested = requestedRaw.map((item) => ({
        orderItemId: Number(item.orderItemId),
        quantity: Number(item.quantity),
      }));
    validateReturnRequest(purchased, requested, type === "courier_rto");

    for (const item of requested) {
      const prior = await client.query<{ quantity: number }>(
        "SELECT COALESCE(sum(ri.quantity),0)::int quantity FROM order_return_items ri JOIN order_returns r ON r.id=ri.return_id WHERE ri.order_item_id=$1 AND r.status<>'rejected'",
        [item.orderItemId],
      );
      const bought = purchased.find((row) => Number(row.id) === item.orderItemId);
      if (Number(prior.rows[0]?.quantity || 0) + item.quantity > Number(bought?.quantity || 0))
        throw new Error("Returned quantity exceeds the quantity purchased.");
    }

    const id = `RET-${randomBytes(6).toString("hex").toUpperCase()}`;
    await client.query(
      "INSERT INTO order_returns(id,order_id,type,status,reason,notes,refund_required) VALUES($1,$2,$3,'requested',$4,$5,$6)",
      [id, orderId, type, reason, notes, refundRequired],
    );
    for (const item of requested)
      await client.query(
        "INSERT INTO order_return_items(return_id,order_item_id,quantity) VALUES($1,$2,$3)",
        [id, item.orderItemId, item.quantity],
      );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','return_created','order_return',$1,$2::jsonb)",
      [id, JSON.stringify({ orderId, type, reason })],
    );
    return { id, orderId, type, status: "requested", reason, notes };
  });
}

export async function updateReturn(input: Record<string, unknown>) {
  const id = String(input.returnId || ""),
    next = String(input.status || "");
  return withTransaction(async (client) => {
    const ret = (
      await client.query<Record<string, unknown>>(
        "SELECT * FROM order_returns WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!ret) throw new Error("Return not found");
    if (!returnTransitionAllowed(String(ret.status), next))
      throw new Error(`Return cannot move from ${ret.status} to ${next}.`);

    let restored = 0;
    if (next === "received") {
      const decisions = Array.isArray(input.items)
          ? (input.items as Array<Record<string, unknown>>)
          : [],
        lines = (
          await client.query<Record<string, unknown>>(
            "SELECT ri.*,oi.variant_id,oi.is_preorder FROM order_return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1 FOR UPDATE OF ri",
            [id],
          )
        ).rows;
      for (const line of lines) {
        const decision = decisions.find(
          (item) => Number(item.id) === Number(line.id),
        );
        if (!decision || typeof decision.restockable !== "boolean")
          throw new Error(
            "Mark every returned item as restockable or not restockable.",
          );
        if (decision.restockable && !line.restocked_at) {
          if (!line.variant_id)
            throw new Error(
              "This returned item no longer has a stock variant. Mark it as not restockable.",
            );
          const updated = await client.query(
            "UPDATE variants SET stock=stock+$2,updated_at=now() WHERE id=$1",
            [line.variant_id, line.quantity],
          );
          if (!updated.rowCount)
            throw new Error(
              "This returned item no longer has a stock variant. Mark it as not restockable.",
            );
          restored += Number(line.quantity) || 0;
          await client.query(
            "UPDATE order_return_items SET restockable=true,restocked_at=now() WHERE id=$1 AND restocked_at IS NULL",
            [line.id],
          );
        } else if (!line.restocked_at) {
          await client.query(
            "UPDATE order_return_items SET restockable=$2 WHERE id=$1",
            [line.id, decision.restockable],
          );
        }
      }

      const order = (
        await client.query<Record<string, unknown>>(
          "SELECT * FROM orders WHERE order_id=$1 FOR UPDATE",
          [ret.order_id],
        )
      ).rows[0];
      if (!order) throw new Error("Order not found");

      if (ret.type === "courier_rto") {
        if (order.order_status !== "shipped")
          throw new Error("Courier RTO can only be received while the order is shipped.");
        const prepaid =
            order.payment_method === "bank" &&
            ["paid", "verified"].includes(
              String(order.payment_status).toLowerCase(),
            ),
          paymentStatus = prepaid ? "refund pending" : order.payment_status,
          stockState =
            order.stock_state === "reserved" ? "restored" : order.stock_state;
        await client.query(
          "UPDATE orders SET order_status='cancelled',stock_state=$2,payment_status=$3,updated_at=now() WHERE order_id=$1",
          [ret.order_id, stockState, paymentStatus],
        );
      } else if (
        ret.refund_required &&
        ["paid", "verified"].includes(
          String(order.payment_status).toLowerCase(),
        )
      ) {
        await client.query(
          "UPDATE orders SET payment_status='refund pending',updated_at=now() WHERE order_id=$1",
          [ret.order_id],
        );
      }
    }

    await client.query(
      "UPDATE order_returns SET status=$2,updated_at=now(),received_at=CASE WHEN $2='received' THEN now() ELSE received_at END,completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END WHERE id=$1",
      [id, next],
    );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','return_status_changed','order_return',$1,$2::jsonb)",
      [
        id,
        JSON.stringify({
          from: ret.status,
          to: next,
          restoredUnits: restored,
          orderId: ret.order_id,
          type: ret.type,
        }),
      ],
    );
    return { returnId: id, status: next, restoredUnits: restored };
  });
}
