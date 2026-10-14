export const orderProgress = [
  ["pending", "Order received"],
  ["confirmed", "Confirmed"],
  ["dispatched", "Dispatched"],
  ["delivered", "Delivered"],
] as const;

import { normalizeOrderStatus } from "../../shared/order-status";

export const customerOrderStatus = normalizeOrderStatus;

export function safeHttpsUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
