export const orderProgress = [
  ["pending", "Order received"],
  ["confirmed", "Confirmed"],
  ["dispatched", "Dispatched"],
  ["delivered", "Delivered"],
] as const;

export function customerOrderStatus(value:string){const normalized=String(value||"pending").toLowerCase();return ["sourcing","packed","shipped"].includes(normalized)?"dispatched":normalized;}

export function safeHttpsUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
