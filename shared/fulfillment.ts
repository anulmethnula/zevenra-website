import { normalizeLocation, normalizePostalCode } from "./delivery-match.js";

export type AreaGroup = { id:string; name:string; fee:number|null; active:boolean; fallback:boolean; sortOrder:number };
export type AreaLocation = { id:string; groupId:string; district:string; town:string; postcode?:string; aliases:string[]; active:boolean };
export type DistrictDefault = { district:string; groupId:string };

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
