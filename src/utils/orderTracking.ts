export const orderProgress = [
  ["pending", "Order received"],
  ["confirmed", "Confirmed"],
  ["sourcing", "Preparing"],
  ["packed", "Packed"],
  ["shipped", "Shipped"],
  ["delivered", "Delivered"],
] as const;

export function safeHttpsUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
