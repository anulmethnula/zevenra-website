export function enforceOnlineStoreAvailability(source?: unknown) {
  const normalized = String(source ?? "web").trim().toLowerCase();
  return !normalized || normalized === "web";
}
