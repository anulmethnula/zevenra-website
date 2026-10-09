export type ShippingWeightItem = {
  productId: string;
  productName?: string;
  quantity: number;
  shippingWeightGrams?: number | null;
  categoryDefaultShippingWeightGrams?: number | null;
};

export type ShippingWeightResult =
  | { ready: true; totalProductWeightGrams: number; totalShippingWeightGrams: number }
  | { ready: false; missing: Array<{ productId: string; productName?: string }> };

const configuredWeight = (value: number | null | undefined) =>
  Number.isFinite(value) && Number(value) > 0 ? Number(value) : undefined;

export function calculateShippingWeight(
  items: ShippingWeightItem[],
  packagingWeightGrams: number,
): ShippingWeightResult {
  const missing: Array<{ productId: string; productName?: string }> = [];
  let totalProductWeightGrams = 0;

  for (const item of items) {
    const itemWeight =
      configuredWeight(item.shippingWeightGrams) ??
      configuredWeight(item.categoryDefaultShippingWeightGrams);
    if (itemWeight === undefined) {
      missing.push({ productId: item.productId, productName: item.productName });
      continue;
    }
    totalProductWeightGrams += itemWeight * item.quantity;
  }

  if (missing.length) return { ready: false, missing };
  return {
    ready: true,
    totalProductWeightGrams,
    totalShippingWeightGrams:
      totalProductWeightGrams + Math.max(0, Number(packagingWeightGrams) || 0),
  };
}
