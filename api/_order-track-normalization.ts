export function normalizeOrderIdForLookup(value: string) {
  return value.trim().replace(/^#/, "").trim().toUpperCase();
}

export function normalizeSriLankanPhoneForLookup(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0094")) return digits.slice(2);
  if (digits.startsWith("0")) return `94${digits.slice(1)}`;
  return digits;
}
