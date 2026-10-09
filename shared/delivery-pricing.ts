import {
  matchDeliveryZone,
  normalizeLocation,
  type DeliveryAddress,
} from "./delivery-match.js";
import { weightBasedDeliveryFee } from "./delivery-weight-fee.js";

export type CourierPricingInput = {
  pricingMode: string;
  flatRate: number;
};

export type WeightRateInput = {
  rateCardId: string;
  destinationDistrict: string;
  destinationCity: string;
  firstKgCharge: number;
  additionalKgCharge: number;
};

export type LegacyDeliveryRateInput = {
  id: string;
  name: string;
  fee: number;
  active: boolean;
  districts: string[];
  cities: string[];
  postalCodes: string[];
  fallback: boolean;
  sortOrder: number;
};

export type ResolvedDeliveryPricing = {
  fee: number;
  ratePlan: string;
  zoneName: string;
  source: "flat" | "rate-card" | "legacy-zone";
};

const validMoney = (value: number) => Number.isFinite(value) && value >= 0;

export function resolveDeliveryPricing(
  courier: CourierPricingInput,
  address: DeliveryAddress,
  totalShippingWeightGrams: number,
  weightRates: WeightRateInput[],
  legacyRates: LegacyDeliveryRateInput[],
): ResolvedDeliveryPricing {
  if (courier.pricingMode === "flat") {
    if (!validMoney(courier.flatRate))
      throw new Error("Courier flat rate is invalid.");
    return {
      fee: courier.flatRate,
      ratePlan: "flat",
      zoneName: "Flat rate",
      source: "flat",
    };
  }

  if (courier.pricingMode !== "zone")
    throw new Error("Courier pricing mode is invalid.");

  const city = normalizeLocation(address.city),
    district = normalizeLocation(address.district),
    selected =
      weightRates.find(
        (rate) =>
          normalizeLocation(rate.destinationCity) === city &&
          normalizeLocation(rate.destinationDistrict) === district,
      ) ??
      weightRates.find(
        (rate) =>
          !normalizeLocation(rate.destinationCity) &&
          normalizeLocation(rate.destinationDistrict) === district,
      ) ??
      weightRates.find(
        (rate) => normalizeLocation(rate.destinationDistrict) === district,
      );

  if (selected) {
    if (
      !validMoney(selected.firstKgCharge) ||
      !validMoney(selected.additionalKgCharge)
    )
      throw new Error("Courier weight rate is invalid.");
    return {
      fee: weightBasedDeliveryFee(
        totalShippingWeightGrams,
        selected.firstKgCharge,
        selected.additionalKgCharge,
      ),
      ratePlan: selected.rateCardId,
      zoneName: [selected.destinationCity, selected.destinationDistrict]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(", "),
      source: "rate-card",
    };
  }

  const legacy = matchDeliveryZone(legacyRates, address);
  if (legacy) {
    if (!validMoney(legacy.fee))
      throw new Error("Delivery zone rate is invalid.");
    return {
      fee: legacy.fee,
      ratePlan: legacy.id,
      zoneName: legacy.name,
      source: "legacy-zone",
    };
  }

  throw new Error("Delivery is not configured for this address.");
}
