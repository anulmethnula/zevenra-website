export function weightBasedDeliveryFee(
  totalShippingWeightGrams: number,
  firstKgFee: number,
  additionalKgFee: number,
) {
  if (!Number.isFinite(totalShippingWeightGrams) || totalShippingWeightGrams <= 0)
    throw new Error("Total shipping weight must be greater than zero.");
  const additionalKilograms = Math.max(
    0,
    Math.ceil((totalShippingWeightGrams - 1000) / 1000),
  );
  return firstKgFee + additionalKilograms * additionalKgFee;
}
