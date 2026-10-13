export const preorderActiveStatuses = [
  "new",
  "awaiting_payment",
  "payment_submitted",
  "paid",
  "contacted",
  "confirmed",
  "batched",
  "ordered",
  "in_transit",
  "arrived",
  "ready",
  "notified",
] as const;

const transitions: Record<string, readonly string[]> = {
  new: ["new", "awaiting_payment", "contacted", "cancelled"],
  awaiting_payment: ["awaiting_payment", "payment_submitted", "cancelled"],
  payment_submitted: ["payment_submitted", "paid", "awaiting_payment", "cancelled"],
  paid: ["paid", "confirmed", "cancelled"],
  contacted: ["contacted", "confirmed", "cancelled"],
  confirmed: ["confirmed", "in_transit", "ordered", "cancelled"],
  batched: ["batched", "ordered", "cancelled"],
  ordered: ["ordered", "in_transit", "cancelled"],
  in_transit: ["in_transit", "arrived"],
  arrived: ["arrived", "ready", "cancelled"],
  ready: ["ready", "cancelled"],
  notified: ["notified", "cancelled", "expired"],
  converted: ["converted"],
  cancelled: ["cancelled"],
  expired: ["expired"],
};

export function isPreorderTransitionAllowed(current: unknown, next: unknown) {
  return transitions[String(current)]?.includes(String(next)) ?? false;
}

export function resolvePreorderConfirmedPrice(
  submitted: unknown,
  current: unknown,
): number | null {
  const value = submitted === undefined ? current : submitted;
  if (value === null || value === "") return null;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Confirmed selling price must be a positive whole LKR amount.");
  return amount;
}

export function normalizePreorderPaymentMethod(
  value: unknown,
): "cod" | "bank" {
  if (value === undefined || value === null || value === "") return "cod";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "cod" || normalized === "bank") return normalized;
  throw new Error("Choose a valid payment method.");
}

export function preorderDeliveryAddressReady(value: {
  address1?: unknown;
  city?: unknown;
  district?: unknown;
  postalCode?: unknown;
}) {
  return Boolean(
    String(value.address1 || "").trim() &&
      String(value.city || "").trim() &&
      String(value.district || "").trim() &&
      /^\d{5}$/.test(String(value.postalCode || "")),
  );
}
