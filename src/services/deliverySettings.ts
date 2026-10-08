import type { CourierProvider, DeliveryRate } from "../types";

type SettingsRow = { key: string; value: unknown };
type DeliveryClient = {
  post<T>(action: string, payload: unknown): Promise<T>;
  get<T>(action: string): Promise<T>;
};

export async function saveAndReloadDeliverySettings(
  couriers: CourierProvider[],
  rates: DeliveryRate[],
  defaultCourierProviderId: string,
  client: DeliveryClient,
) {
  await client.post("saveCourierConfig", { couriers, rates, defaultCourierProviderId });
  const [savedCouriers, savedRates, settings] = await Promise.all([
    client.get<unknown[]>("listCouriers"),
    client.get<unknown[]>("listDeliveryRates"),
    client.get<SettingsRow[]>("getSettings"),
  ]);
  return {
    couriers: savedCouriers,
    deliveryRates: savedRates,
    defaultCourierProviderId: String(settings.find((row) => row.key === "defaultCourierProviderId")?.value || ""),
  };
}

export function initialCourierSelection(couriers: CourierProvider[], initialCourierId = "") {
  return initialCourierId && couriers.some((courier) => courier.id === initialCourierId)
    ? initialCourierId
    : "";
}
