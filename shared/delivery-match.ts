export type DeliveryAddress = { district?: string; city?: string; postalCode?: string };
export type DeliveryZoneLike = {
  active: boolean;
  fallback: boolean;
  sortOrder: number;
  districts: string[];
  cities: string[];
  postalCodes: string[];
};

export function normalizeLocation(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bcolombo\s*0*([1-9]|1[0-5])\b/g, "colombo $1");
}

export function normalizePostalCode(value: unknown) {
  const digits=String(value??"").replace(/\D/g,"");
  return digits&&digits.length<5?digits.padStart(5,"0"):digits;
}

function postalMatches(rule: unknown, postalCode: string) {
  const raw=String(rule??"").trim(),wildcard=raw.endsWith("*"),digits=raw.replace(/\D/g,"");
  if(!digits)return false;
  return wildcard?postalCode.startsWith(digits):postalCode===normalizePostalCode(digits);
}

export function matchDeliveryZone<T extends DeliveryZoneLike>(zones:T[],address:DeliveryAddress){
  const active=zones.filter(zone=>zone.active).sort((a,b)=>a.sortOrder-b.sortOrder),
    postalCode=normalizePostalCode(address.postalCode),city=normalizeLocation(address.city),district=normalizeLocation(address.district),
    regular=active.filter(zone=>!zone.fallback);
  if(postalCode){const match=regular.find(zone=>zone.postalCodes.some(rule=>postalMatches(rule,postalCode)));if(match)return match;}
  if(city){const match=regular.find(zone=>zone.cities.some(value=>normalizeLocation(value)===city));if(match)return match;}
  if(district){const match=regular.find(zone=>zone.districts.some(value=>normalizeLocation(value)===district));if(match)return match;}
  return active.find(zone=>zone.fallback);
}
