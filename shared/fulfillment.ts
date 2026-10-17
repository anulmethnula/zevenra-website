import { normalizeLocation, normalizePostalCode } from "./delivery-match.js";

export type AreaGroup = { id:string; name:string; fee:number|null; active:boolean; fallback:boolean; sortOrder:number };
export type AreaLocation = { id:string; groupId:string; district:string; town:string; postcode?:string; aliases:string[]; active:boolean };
export type DistrictDefault = { district:string; groupId:string };
export type FulfillmentMethodChoice = { type:string; active:boolean };

export function selectImplicitFulfillmentMethod(methods:FulfillmentMethodChoice[], input:{fulfillmentMethod?:string;district?:string;city?:string;postalCode?:string}) {
  const explicit=String(input.fulfillmentMethod||"").trim();
  if(explicit)return explicit;
  const active=methods.filter(item=>item.active),area=active.find(item=>item.type==="area_group"),flat=active.find(item=>item.type==="flat"),completeAddress=Boolean(String(input.district||"").trim()&&String(input.city||"").trim()&&/^\d{5}$/.test(String(input.postalCode||"").trim()));
  if(area&&completeAddress)return "area_group";
  if(flat)return "flat";
  return active.length===1?active[0].type:"";
}

export function resolveAreaGroup(groups:AreaGroup[], locations:AreaLocation[], defaults:DistrictDefault[], address:{district:string;town:string;postcode?:string}) {
  const district=normalizeLocation(address.district), town=normalizeLocation(address.town), postcode=normalizePostalCode(address.postcode);
  const activeGroups=new Map(groups.filter(g=>g.active).map(g=>[g.id,g]));
  if(district==="colombo" && /^0(0[1-9]|1[0-5])00$/.test(postcode)) return activeGroups.get("colombo-city") ?? null;
  const colomboAlias=town.match(/^(?:colombo|col)\s*0*([1-9]|1[0-5])$/);
  if(district==="colombo" && colomboAlias) return activeGroups.get("colombo-city") ?? null;
  const candidates=locations.filter(l=>l.active&&activeGroups.has(l.groupId)&&normalizeLocation(l.district)===district);
  const exact=candidates.find(l=>{
    const names=[l.town,...l.aliases].map(normalizeLocation);
    return names.includes(town) && (!l.postcode || normalizePostalCode(l.postcode)===postcode);
  });
  if(exact)return activeGroups.get(exact.groupId) ?? null;
  const defaultGroup=defaults.find(d=>normalizeLocation(d.district)===district);
  if(defaultGroup&&activeGroups.has(defaultGroup.groupId))return activeGroups.get(defaultGroup.groupId)!;
  return groups.filter(g=>g.active&&g.fallback).sort((a,b)=>a.sortOrder-b.sortOrder)[0] ?? null;
}
