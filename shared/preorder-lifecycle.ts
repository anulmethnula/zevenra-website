export const preorderActiveStatuses = [
  "new",
  "contacted",
  "confirmed",
  "batched",
  "ordered",
  "in_transit",
  "arrived",
  "ready",
] as const;

const transitions: Record<string, readonly string[]> = {
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
