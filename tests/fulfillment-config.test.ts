import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FulfillmentConfigError, resolveFulfillment, validateFulfillmentConfig } from "../api/_data/fulfillment.ts";
import { clearCheckoutToastSource, selectActiveFulfillment } from "../src/utils/checkoutFulfillment.ts";

const method=(type:"flat"|"area_group"|"pickup",active=false)=>({type,displayName:type,active,fee:type==="flat"?425:null,minimumDeliveryDays:type==="pickup"?null:2,maximumDeliveryDays:type==="pickup"?null:3,sortOrder:1});
const config=(patch:Record<string,unknown>={})=>({methods:[method("flat",true),method("area_group"),method("pickup")],groups:[],locations:[],districtDefaults:[],pickupLocations:[],...patch});
const rejects=(value:Record<string,unknown>,message:RegExp)=>assert.throws(()=>validateFulfillmentConfig(value,true),(error:unknown)=>error instanceof FulfillmentConfigError&&message.test(error.message));

test("fulfillment validation exposes only specific safe business errors",()=>{
  rejects(config({methods:[method("flat"),method("area_group"),method("pickup")]}),/disabling every fulfillment method/);
  rejects(config({methods:[{...method("flat",true),fee:null},method("area_group"),method("pickup")]}),/valid flat delivery fee/);
  rejects(config({methods:[{...method("flat",true),minimumDeliveryDays:4,maximumDeliveryDays:2},method("area_group"),method("pickup")]}),/minimum and maximum delivery days/);
  rejects(config({methods:[method("flat"),method("area_group"),method("pickup",true)]}),/active pickup branch/);
  rejects(config({methods:[method("flat"),method("area_group",true),method("pickup")]}),/exactly five groups/);
  rejects(config({locations:[{id:"1",groupId:"a",district:"Colombo",town:"Moratuwa",postcode:"10400",active:true},{id:"2",groupId:"b",district:" Colombo ",town:"moratuwa",postcode:"10400",active:true}]}),/only one active area group/);
});

test("flat Domex quote is independent of area mappings for Moratuwa",async()=>{
  const rows=(sql:string)=>sql.includes("delivery_methods")?[
    {type:"flat",display_name:"Domex",active:true,fee:425,minimum_delivery_days:2,maximum_delivery_days:3,sort_order:1},
    {type:"area_group",display_name:"Area Group",active:false,fee:null,minimum_delivery_days:2,maximum_delivery_days:3,sort_order:2},
    {type:"pickup",display_name:"Pickup",active:true,fee:null,minimum_delivery_days:null,maximum_delivery_days:null,sort_order:3},
  ]:sql.includes("pickup_locations")?[{id:"branch",name:"Branch",address:"1 Test Lane",instructions:"",active:true,sort_order:1}]:[];
  const client={query:async(sql:string)=>({rows:rows(sql),rowCount:rows(sql).length})} as never;
  const flat=await resolveFulfillment(client,{fulfillmentMethod:"flat",city:"Moratuwa",district:"Colombo",postalCode:"10400"});
  assert.deepEqual({name:flat.methodName,fee:flat.fee,min:flat.minimumDeliveryDays,max:flat.maximumDeliveryDays},{name:"Domex",fee:425,min:2,max:3});
  const pickup=await resolveFulfillment(client,{fulfillmentMethod:"pickup",pickupLocationId:"branch"});
  assert.equal(pickup.fee,0);
});

test("selected fulfillment stays valid and deterministically falls back",()=>{
  const methods=[{type:"flat" as const},{type:"pickup" as const}];
  assert.equal(selectActiveFulfillment(methods,"pickup"),"pickup");
  assert.equal(selectActiveFulfillment(methods,"area_group"),"flat");
  assert.equal(selectActiveFulfillment([],"flat"),null);
});

test("successful pickup quote clears an old delivery toast only",()=>{
  const oldDelivery={source:"delivery" as const,message:"Enter a valid Sri Lankan district and 5-digit postal code."};
  const afterMethodChange=clearCheckoutToastSource(oldDelivery,"delivery");
  assert.equal(afterMethodChange,null);
  const pickupFailure={source:"delivery" as const,message:"Temporary pickup quote failure"};
  assert.equal(clearCheckoutToastSource(pickupFailure,"delivery"),null);
  const unrelated={source:"receipt" as const,message:"Receipt upload failed"};
  assert.deepEqual(clearCheckoutToastSource(unrelated,"delivery"),unrelated);
});

test("checkout config and checkout notifications are never stale or hidden",async()=>{
  const endpoint=await readFile(new URL("../api/checkout-config.ts",import.meta.url),"utf8");
  const hook=await readFile(new URL("../src/hooks/usePublicData.ts",import.meta.url),"utf8");
  const checkout=await readFile(new URL("../src/pages/CheckoutPage.tsx",import.meta.url),"utf8");
  assert.match(endpoint,/private, no-store/);assert.doesNotMatch(endpoint,/stale-while-revalidate/);
  assert.match(hook,/useCheckoutConfig=.*noStore:true/);
  assert.match(checkout,/role="alert" aria-live="assertive"/);
  assert.match(checkout,/z-\[1000\]/);
  assert.match(checkout,/setDeliveryQuoteError\(""\)/);
  assert.doesNotMatch(checkout,/\|\| "Fulfilment"/);
});
