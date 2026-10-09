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
const ratePair = (rate: WeightRateInput) =>
  `${rate.firstKgCharge}\u0000${rate.additionalKgCharge}`;

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
    districtRates = weightRates.filter(
      (rate) => normalizeLocation(rate.destinationDistrict) === district,
    ),
    exact = districtRates.find(
      (rate) => normalizeLocation(rate.destinationCity) === city,
    ),
    districtOnly = districtRates.find(
      (rate) => !normalizeLocation(rate.destinationCity),
    ),
    uniformDistrictRate =
      districtRates.length > 0 &&
      new Set(districtRates.map(ratePair)).size === 1
        ? districtRates[0]
        : undefined,
    selected = exact ?? districtOnly ?? uniformDistrictRate;

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
