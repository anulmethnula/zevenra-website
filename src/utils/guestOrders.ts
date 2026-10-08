export type RecentGuestOrder = { orderId: string; createdAt: string };

const storageKey = "zevenra:recent-guest-orders:v1";
const maxOrders = 5;

type GuestOrderStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage() {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

export function getRecentGuestOrders(storage: GuestOrderStorage | undefined = browserStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is RecentGuestOrder => Boolean(value && typeof value === "object" && typeof (value as RecentGuestOrder).orderId === "string" && typeof (value as RecentGuestOrder).createdAt === "string"))
      .slice(0, maxOrders)
      .map(({ orderId, createdAt }) => ({ orderId, createdAt }));
  } catch {
    return [];
  }
}

export function rememberGuestOrder(order: RecentGuestOrder, storage: GuestOrderStorage | undefined = browserStorage()) {
  if (!storage || !order.orderId.trim()) return [];
  const normalized = order.orderId.trim().replace(/^#/, "").trim().toUpperCase();
  const next = [
    { orderId: normalized, createdAt: order.createdAt },
    ...getRecentGuestOrders(storage).filter((item) => item.orderId.toUpperCase() !== normalized),
  ].slice(0, maxOrders);
  try {
    storage.setItem(storageKey, JSON.stringify(next));
  } catch {
    return getRecentGuestOrders(storage);
  }
  return next;
}

export function removeRecentGuestOrder(orderId: string, storage: GuestOrderStorage | undefined = browserStorage()) {
  if (!storage) return [];
  const next = getRecentGuestOrders(storage).filter((item) => item.orderId !== orderId);
  try {
    if (next.length) storage.setItem(storageKey, JSON.stringify(next));
    else storage.removeItem(storageKey);
  } catch {
    return getRecentGuestOrders(storage);
  }
  return next;
}

export function orderIdFromSearch(search: string) {
  return new URLSearchParams(search).get("orderId")?.trim() || "";
}
