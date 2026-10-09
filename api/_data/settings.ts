import { query, withTransaction } from "../_db.js";

type SettingRow = { key: string; value: unknown };

export async function listSettings() {
  return (
    await query<SettingRow>("SELECT key,value FROM site_settings ORDER BY key")
  ).rows;
}

const isTrue = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";

export async function saveSettings(patch: Record<string, unknown>) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("Settings update is invalid.");
  const entries = Object.entries(patch);
  if (!entries.length) throw new Error("No settings were provided.");
  if (entries.length > 100) throw new Error("Too many settings were submitted at once.");
  if (entries.some(([key]) => !/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(key)))
    throw new Error("One or more setting keys are invalid.");

  const currentRows = await listSettings(),
    current = Object.fromEntries(currentRows.map((row) => [row.key, row.value])),
    next = { ...current, ...patch };

  if (!String(next.brandName || "").trim())
    throw new Error("Brand name is required.");
  if (
    Number(next.deliveryFlatFee ?? next.deliveryFee ?? 0) < 0 ||
    Number(next.freeDeliveryThreshold ?? 0) < 0 ||
    Number(next.packagingWeightGrams ?? 0) < 0
  )
    throw new Error("Delivery amounts cannot be negative.");
  if (
    patch.packagingWeightGrams !== undefined &&
    (!Number.isInteger(Number(patch.packagingWeightGrams)) ||
      Number(patch.packagingWeightGrams) <= 0)
  )
    throw new Error("Packaging weight must be a whole number greater than zero.");

  const ordersEnabled = isTrue(next.ordersEnabled ?? true),
    codEnabled = isTrue(next.codEnabled),
    bankEnabled = isTrue(next.bankEnabled ?? next.bankTransferEnabled);
  if (ordersEnabled && !codEnabled && !bankEnabled)
    throw new Error("Enable at least one payment method before online orders.");
  if (
    bankEnabled &&
    (!String(next.bankName || "").trim() ||
      !String(next.bankAccountName ?? next.accountName ?? "").trim() ||
      !String(next.bankAccountNumber ?? next.accountNumber ?? "").trim())
  )
    throw new Error("Complete bank details before enabling bank transfer.");

  await withTransaction(async (client) => {
    for (const [key, value] of entries)
      await client.query(
        "INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
        [key, JSON.stringify(value)],
      );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','settings_saved','site_settings','site',$1::jsonb)",
      [JSON.stringify({ keys: entries.map(([key]) => key) })],
    );
  });
  return listSettings();
}
