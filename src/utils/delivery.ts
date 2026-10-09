import type { CourierProvider, DeliveryRate } from "../types";
import { matchDeliveryZone, normalizeLocation } from "../../shared/delivery-match";
type PublicCourier=Pick<CourierProvider,"id"|"pricingMode"|"flatRate"|"active">;
type PublicDeliveryRate=Pick<DeliveryRate,"id"|"name"|"courierProviderId"|"fee"|"active"|"districts"|"cities"|"postalCodes"|"fallback"|"sortOrder">;

export const legacyCourierId = "courier-legacy-zone";
export const defaultCourier: CourierProvider = {
  id: legacyCourierId,
  name: "ZEVENRA Delivery",
  phone: "",
  notes: "Migrated delivery zones",
  pricingMode: "zone",
  flatRate: 0,
  active: true,
};
export const defaultDeliveryZones: DeliveryRate[] = [
  {
    id: "zone-colombo-1-15",
    courierProviderId: legacyCourierId,
    name: "Colombo 1–15",
    fee: 350,
    active: true,
    districts: ["Colombo"],
    cities: [
      "Colombo 1",
      "Colombo 2",
      "Colombo 3",
      "Colombo 4",
      "Colombo 5",
      "Colombo 6",
      "Colombo 7",
      "Colombo 8",
      "Colombo 9",
      "Colombo 10",
      "Colombo 11",
      "Colombo 12",
      "Colombo 13",
      "Colombo 14",
      "Colombo 15",
      "Fort",
      "Slave Island",
      "Kollupitiya",
      "Bambalapitiya",
      "Havelock Town",
      "Wellawatte",
      "Cinnamon Gardens",
      "Borella",
      "Dematagoda",
      "Maradana",
      "Pettah",
      "Hulftsdorp",
      "Kotahena",
      "Grandpass",
      "Mattakkuliya",
      "Modara",
    ],
    postalCodes: [
      "00100",
      "00200",
      "00300",
      "00400",
      "00500",
      "00600",
      "00700",
      "00800",
      "00900",
      "01000",
      "01100",
      "01200",
      "01300",
      "01400",
      "01500",
    ],
    fallback: false,
    sortOrder: 10,
  },
  {
    id: "zone-colombo-suburbs",
    courierProviderId: legacyCourierId,
    name: "Colombo Suburbs",
    fee: 400,
    active: true,
    districts: ["Colombo", "Gampaha"],
    cities: [
      "Dehiwala",
      "Mount Lavinia",
      "Mt Lavinia",
      "Ratmalana",
      "Nugegoda",
      "Rajagiriya",
      "Battaramulla",
      "Sri Jayawardenepura Kotte",
      "Kotte",
      "Boralesgamuwa",
      "Maharagama",
      "Pelawatte",
      "Nawala",
      "Kohuwala",
    ],
    postalCodes: [
      "10100",
      "10107",
      "10120",
      "10250",
      "10280",
      "10290",
      "10350",
      "10370",
      "10390",
    ],
    fallback: false,
    sortOrder: 20,
  },
  {
    id: "zone-greater-colombo",
    courierProviderId: legacyCourierId,
    name: "Greater Colombo",
    fee: 425,
    active: true,
    districts: ["Colombo", "Gampaha"],
    cities: [
      "Homagama",
      "Kaduwela",
      "Malabe",
      "Athurugiriya",
      "Kottawa",
      "Pannipitiya",
      "Piliyandala",
      "Kesbewa",
      "Mulleriyawa",
      "Kelaniya",
      "Wattala",
      "Kadawatha",
    ],
    postalCodes: [
      "10115",
      "10150",
      "10200",
      "10230",
      "10300",
      "10620",
      "10640",
      "11300",
      "11380",
      "11600",
    ],
    fallback: false,
    sortOrder: 30,
  },
  {
    id: "zone-outstation",
    courierProviderId: legacyCourierId,
    name: "Outstation",
    fee: 500,
    active: true,
    districts: [],
    cities: [],
    postalCodes: [],
    fallback: true,
    sortOrder: 999,
  },
];
export function findDeliveryZone(
  zones: PublicDeliveryRate[],
  address: { district: string; city: string; postalCode: string },
  courierProviderId?: string,
) {
  return matchDeliveryZone(zones.filter(zone=>!courierProviderId||zone.courierProviderId===courierProviderId),address);
}
export function checkoutCourier(
  couriers: PublicCourier[],
  defaultId: string,
) {
  return couriers.find((courier) => courier.id === defaultId && courier.active);
}
export function deliveryQuote(
  courier: PublicCourier | undefined,
  zones: PublicDeliveryRate[],
  address: { district: string; city: string; postalCode: string },
) {
  if (!courier) return undefined;
  if (courier.pricingMode === "flat")
    return { fee: courier.flatRate, zone: undefined };
  const zone = findDeliveryZone(zones, address, courier.id);
  return zone ? { fee: zone.fee, zone } : undefined;
}

export function cityDistrictMismatch(zones:PublicDeliveryRate[],address:{district:string;city:string},courierProviderId?:string){
  const city=normalizeLocation(address.city),district=normalizeLocation(address.district);
  if(!city||!district)return false;
  return zones.some(zone=>zone.active&&!zone.fallback&&(!courierProviderId||zone.courierProviderId===courierProviderId)&&zone.cities.some(value=>normalizeLocation(value)===city)&&zone.districts.length>0&&!zone.districts.some(value=>normalizeLocation(value)===district));
}
