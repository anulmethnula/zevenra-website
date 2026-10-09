export type ReturnStatus =
  | "requested"
  | "approved"
  | "in_transit"
  | "received"
  | "completed"
  | "rejected";

const transitions: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected", "in_transit"],
  approved: ["in_transit", "rejected"],
  in_transit: ["received"],
  received: ["completed"],
  completed: [],
  rejected: [],
};

export function returnTransitionAllowed(from: string, to: string) {
  return (transitions[from as ReturnStatus] || []).includes(to as ReturnStatus);
}

export function validateReturnRequest(
  purchased: Array<{ id: number; quantity: number }>,
  requested: Array<{ orderItemId: number; quantity: number }>,
  requireFullOrder = false,
) {
  const purchasedById = new Map(purchased.map((item) => [item.id, item.quantity]));
  const seen = new Set<number>();
  for (const item of requested) {
    if (!Number.isInteger(item.orderItemId) || !purchasedById.has(item.orderItemId))
      throw new Error("Invalid return item.");
    if (!Number.isInteger(item.quantity) || item.quantity < 1)
      throw new Error("Return quantities must be whole numbers.");
    if (seen.has(item.orderItemId))
      throw new Error("A return item cannot be added twice.");
    seen.add(item.orderItemId);
    if (item.quantity > Number(purchasedById.get(item.orderItemId)))
      throw new Error("Returned quantity exceeds the quantity purchased.");
  }
  if (requireFullOrder) {
    if (requested.length !== purchased.length)
      throw new Error("Courier RTO must include the complete shipped order.");
    for (const item of purchased) {
      const returned = requested.find((row) => row.orderItemId === item.id);
      if (!returned || returned.quantity !== item.quantity)
        throw new Error("Courier RTO must include the complete shipped order.");
    }
  }
}
