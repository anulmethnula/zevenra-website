type SettingRow = { key: string; value: unknown };
type CourierRow = {
  id: string;
  pricingMode: string;
  flatRate: number;
  active: boolean;
};
type RateRow = {
  id: string;
  name: string;
  courierProviderId?: string;
  fee: number;
  active: boolean;
  districts: string[];
  cities: string[];
  postalCodes: string[];
  fallback: boolean;
  sortOrder: number;
};

const enabled = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";

export function buildPublicCheckoutConfig(
  settings: SettingRow[],
  _couriers: CourierRow[],
  _rates: RateRow[],
) {
  const raw = Object.fromEntries(settings.map((row) => [row.key, row.value])),
    bankEnabled = enabled(raw.bankEnabled ?? raw.bankTransferEnabled),
    publicSettings: SettingRow[] = [
      { key: "codEnabled", value: enabled(raw.codEnabled) },
      { key: "bankEnabled", value: bankEnabled },
      { key: "deliveryEnabled", value: enabled(raw.deliveryEnabled) },
      {
        key: "deliveryFee",
        value: Number(raw.deliveryFee ?? raw.deliveryFlatFee) || 0,
      },
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

  // Delivery pricing and courier selection are server-authoritative through
  // /api/delivery-quote. Do not expose internal courier/rate identifiers here.
  return { settings: publicSettings };
}
