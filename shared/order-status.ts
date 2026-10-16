export const orderStatuses = [
  "pending",
  "confirmed",
  "dispatched",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

const legacyDispatchedStatuses = new Set(["sourcing", "packed", "shipped"]);

export function normalizeOrderStatus(value: unknown): OrderStatus {
  const status = String(value ?? "pending").trim().toLowerCase();
  if (status === "processing") return "confirmed";
  if (legacyDispatchedStatuses.has(status)) return "dispatched";
  return orderStatuses.includes(status as OrderStatus)
    ? (status as OrderStatus)
    : "pending";
}

export function orderStatusLabel(value: unknown) {
  const status = normalizeOrderStatus(value);
  if (status === "confirmed") return "Processing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function convertedOrderStatusLabel(value: unknown) {
  const status = normalizeOrderStatus(value);
  return status === "pending" ? "Pending dispatch" : orderStatusLabel(status);
}
