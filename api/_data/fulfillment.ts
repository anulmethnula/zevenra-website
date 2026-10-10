import { randomUUID } from "node:crypto";
import { query, withTransaction, type DatabaseClient } from "../_db.js";
import { normalizeLocation } from "../../shared/delivery-match.js";
import { resolveAreaGroup, type AreaGroup, type AreaLocation, type DistrictDefault } from "../../shared/fulfillment.js";

const text=(v:unknown)=>String(v??"");
const money=(v:unknown)=>v==null?null:Number(v);
const method=(r:Record<string,unknown>)=>({type:text(r.type),displayName:text(r.display_name),active:r.active===true,fee:money(r.fee),minimumDeliveryDays:r.minimum_delivery_days==null?null:Number(r.minimum_delivery_days),maximumDeliveryDays:r.maximum_delivery_days==null?null:Number(r.maximum_delivery_days),sortOrder:Number(r.sort_order)||0});
const group=(r:Record<string,unknown>)=>({id:text(r.id),name:text(r.name),fee:money(r.fee),active:r.active===true,fallback:r.is_fallback===true,sortOrder:Number(r.sort_order)||0});
const location=(r:Record<string,unknown>)=>({id:text(r.id),groupId:text(r.group_id),district:text(r.district),town:text(r.town),postcode:text(r.postcode)||undefined,aliases:Array.isArray(r.aliases)?r.aliases.map(String):[],active:r.active===true});
const pickup=(r:Record<string,unknown>)=>({id:text(r.id),name:text(r.name),address:text(r.address),instructions:text(r.instructions),active:r.active===true,sortOrder:Number(r.sort_order)||0});

async function load(client:{query:DatabaseClient["query"]}|null=null){
  const run=client?.query.bind(client)??query;
  const [methods,groups,locations,defaults,pickups]=await Promise.all([
    run<Record<string,unknown>>("SELECT * FROM delivery_methods ORDER BY sort_order,type"),
    run<Record<string,unknown>>("SELECT * FROM delivery_area_groups ORDER BY sort_order,id"),
    run<Record<string,unknown>>("SELECT * FROM delivery_area_locations ORDER BY district,town,postcode NULLS LAST"),
    run<Record<string,unknown>>("SELECT * FROM delivery_district_defaults ORDER BY district"),
    run<Record<string,unknown>>("SELECT * FROM pickup_locations ORDER BY sort_order,name"),
  ]);
  return {methods:methods.rows.map(method),groups:groups.rows.map(group),locations:locations.rows.map(location),districtDefaults:defaults.rows.map(r=>({district:text(r.district),groupId:text(r.group_id)})),pickupLocations:pickups.rows.map(pickup)};
}
export const listFulfillmentConfig=()=>load();
export async function publicFulfillmentConfig(){const x=await load();return {methods:x.methods.filter(m=>m.active).map(m=>({...m,fee:m.type==="pickup"?0:m.fee})),locations:x.locations.filter(l=>l.active).map(({id,district,town,postcode,aliases})=>({id,district,town,postcode,aliases})),pickupLocations:x.pickupLocations.filter(p=>p.active)};}

export async function saveFulfillmentConfig(input:Record<string,unknown>){
  const methods=Array.isArray(input.methods)?input.methods as Record<string,unknown>[]:[];
  const groups=Array.isArray(input.groups)?input.groups as Record<string,unknown>[]:[];
  const locations=Array.isArray(input.locations)?input.locations as Record<string,unknown>[]:[];
  const defaults=Array.isArray(input.districtDefaults)?input.districtDefaults as Record<string,unknown>[]:[];
  const pickups=Array.isArray(input.pickupLocations)?input.pickupLocations as Record<string,unknown>[]:[];
  return withTransaction(async client=>{
    if(methods.length!==3||new Set(methods.map(m=>text(m.type))).size!==3)throw new Error("Exactly three fulfillment methods are required.");
    const active=methods.filter(m=>m.active===true);
    const ordersEnabled=(await client.query<{value:unknown}>("SELECT value FROM site_settings WHERE key='ordersEnabled'")).rows[0]?.value;
    if(!active.length&&(ordersEnabled===true||String(ordersEnabled).toLowerCase()==="true"))throw new Error("Disable online orders before disabling every fulfillment method.");
    const flat=methods.find(m=>m.type==="flat");
    if(flat?.active===true&&(flat.fee==null||!Number.isFinite(Number(flat.fee))||Number(flat.fee)<0))throw new Error("Enter a valid flat delivery fee before enabling Flat Rate Delivery.");
    const activeGroups=groups.filter(g=>g.active===true);
    if(methods.find(m=>m.type==="area_group")?.active===true){
      if(groups.length!==5)throw new Error("Area Group Delivery requires exactly five groups.");
      if(activeGroups.some(g=>g.fee==null||!Number.isFinite(Number(g.fee))||Number(g.fee)<0))throw new Error("Enter a valid fee for every active area group.");
      if(activeGroups.filter(g=>g.fallback===true).length!==1)throw new Error("Area Group Delivery requires one active fallback group.");
    }
    if(methods.find(m=>m.type==="pickup")?.active===true&&!pickups.some(p=>p.active===true&&text(p.name).trim()&&text(p.address).trim()))throw new Error("Add an active pickup branch before enabling pickup.");
    for(const m of methods)await client.query(`UPDATE delivery_methods SET display_name=$2,active=$3,fee=$4,minimum_delivery_days=$5,maximum_delivery_days=$6,sort_order=$7,updated_at=now() WHERE type=$1`,[m.type,text(m.displayName).trim(),m.active===true,m.type==="flat"&&m.fee!=null?Number(m.fee):null,m.minimumDeliveryDays==null?null:Number(m.minimumDeliveryDays),m.maximumDeliveryDays==null?null:Number(m.maximumDeliveryDays),Number(m.sortOrder)||0]);
    for(const g of groups)await client.query(`UPDATE delivery_area_groups SET name=$2,fee=$3,active=$4,is_fallback=$5,sort_order=$6,updated_at=now() WHERE id=$1`,[g.id,text(g.name).trim(),g.fee==null?null:Number(g.fee),g.active===true,g.fallback===true,Number(g.sortOrder)||0]);
    const seen=new Set<string>();
    for(const l of locations){const district=text(l.district).trim(),town=text(l.town).trim(),postcode=text(l.postcode).trim()||null,key=`${normalizeLocation(district)}\0${normalizeLocation(town)}\0${postcode||""}`;if(l.active===true&&seen.has(key))throw new Error("A district, town and postcode can belong to only one active area group.");seen.add(key);const id=text(l.id)||randomUUID();await client.query(`INSERT INTO delivery_area_locations(id,group_id,district,town,normalized_town,postcode,aliases,active,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::text[],$8,now()) ON CONFLICT(id) DO UPDATE SET group_id=EXCLUDED.group_id,district=EXCLUDED.district,town=EXCLUDED.town,normalized_town=EXCLUDED.normalized_town,postcode=EXCLUDED.postcode,aliases=EXCLUDED.aliases,active=EXCLUDED.active,updated_at=now()`,[id,l.groupId,district,town,normalizeLocation(town),postcode,Array.isArray(l.aliases)?l.aliases.map(String):[],l.active!==false]);}
    await client.query("DELETE FROM delivery_district_defaults");
    for(const d of defaults)await client.query("INSERT INTO delivery_district_defaults(district,group_id) VALUES($1,$2)",[text(d.district).trim(),d.groupId]);
    for(const p of pickups){const id=text(p.id)||randomUUID();if(!text(p.name).trim()||!text(p.address).trim())throw new Error("Every pickup branch needs a name and address.");await client.query(`INSERT INTO pickup_locations(id,name,address,instructions,active,sort_order,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,address=EXCLUDED.address,instructions=EXCLUDED.instructions,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,updated_at=now()`,[id,text(p.name).trim(),text(p.address).trim(),text(p.instructions).trim(),p.active===true,Number(p.sortOrder)||0]);}
    return load(client);
  });
}

export async function resolveFulfillment(client:DatabaseClient,input:{fulfillmentMethod?:string;district?:string;city?:string;postalCode?:string;pickupLocationId?:string}){
  const x=await load(client), active=x.methods.filter(m=>m.active), requested=input.fulfillmentMethod||(active.length===1?active[0].type:(input.district?"area_group":"")), selected=x.methods.find(m=>m.type===requested&&m.active);
  if(!selected)throw new Error("FULFILLMENT_METHOD_UNAVAILABLE");
  if(selected.type==="pickup"){const branch=x.pickupLocations.find(p=>p.id===input.pickupLocationId&&p.active);if(!branch)throw new Error("PICKUP_LOCATION_UNAVAILABLE");return {method:"pickup",methodName:selected.displayName,fee:0,ratePlan:"",areaGroupId:"",areaGroupName:"",pickup:branch,minimumDeliveryDays:null,maximumDeliveryDays:null};}
  if(selected.type==="flat"){if(selected.fee==null)throw new Error("FULFILLMENT_METHOD_UNAVAILABLE");return {method:"flat",methodName:selected.displayName,fee:selected.fee,ratePlan:"flat",areaGroupId:"",areaGroupName:"",pickup:null,minimumDeliveryDays:selected.minimumDeliveryDays,maximumDeliveryDays:selected.maximumDeliveryDays};}
  if(!input.district||!input.city||!/^[0-9]{5}$/.test(input.postalCode||""))throw new Error("DELIVERY_ADDRESS_INVALID");
  const g=resolveAreaGroup(x.groups as AreaGroup[],x.locations as AreaLocation[],x.districtDefaults as DistrictDefault[],{district:input.district,town:input.city,postcode:input.postalCode});
  if(!g||g.fee==null)throw new Error("DELIVERY_AREA_UNAVAILABLE");
  return {method:"area_group",methodName:selected.displayName,fee:g.fee,ratePlan:g.id,areaGroupId:g.id,areaGroupName:g.name,pickup:null,minimumDeliveryDays:selected.minimumDeliveryDays,maximumDeliveryDays:selected.maximumDeliveryDays};
}
