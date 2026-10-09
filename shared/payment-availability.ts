export type PaymentSettingRow = { key: string; value: unknown };
export type CheckoutPaymentMethod = "cod" | "bank";

const enabled = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";

export function paymentMethodAvailable(
  settings: PaymentSettingRow[],
  method: CheckoutPaymentMethod,
) {
  const raw = Object.fromEntries(settings.map((row) => [row.key, row.value]));
  if (method === "cod") return enabled(raw.codEnabled);
  return enabled(raw.bankEnabled ?? raw.bankTransferEnabled);
}
