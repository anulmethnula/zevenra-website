type SettingRow = { key: string; value: unknown };
const enabled = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";

export function buildPublicCheckoutConfig(
  settings: SettingRow[],
) {
  const raw = Object.fromEntries(settings.map((row) => [row.key, row.value])),
    bankEnabled = enabled(raw.bankEnabled ?? raw.bankTransferEnabled),
    publicSettings: SettingRow[] = [
      { key: "codEnabled", value: enabled(raw.codEnabled) },
      { key: "bankEnabled", value: bankEnabled },
      {
        key: "freeDeliveryThreshold",
        value: Number(raw.freeDeliveryThreshold) || 0,
      },
      { key: "currency", value: String(raw.currency || "LKR") },
      { key: "storeOpen", value: enabled(raw.storeOpen) },
      { key: "ordersEnabled", value: enabled(raw.ordersEnabled) },
    ];

  if (bankEnabled)
    publicSettings.push(
      { key: "bankName", value: String(raw.bankName || "") },
      {
        key: "accountName",
        value: String(raw.accountName ?? raw.bankAccountName ?? ""),
      },
      {
        key: "accountNumber",
        value: String(raw.accountNumber ?? raw.bankAccountNumber ?? ""),
      },
      { key: "branch", value: String(raw.branch ?? raw.bankBranch ?? "") },
      {
        key: "bankInstructions",
        value: String(raw.bankInstructions || ""),
      },
    );

  // Delivery methods and pricing are server-authoritative fulfillment data.
  return { settings: publicSettings };
}
