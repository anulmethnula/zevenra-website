import assert from "node:assert/strict";
import test from "node:test";
import { checkoutCourier, defaultCourier, defaultDeliveryZones, deliveryQuote, findDeliveryZone } from "../src/utils/delivery.ts";
import { matchDeliveryZone, normalizeLocation, normalizePostalCode } from "../shared/delivery-match.ts";

test("normalizes case, spacing, Colombo numbers, and postal codes",()=>{
  assert.equal(normalizeLocation("  COLOMBO   01 "),"colombo 1");
  assert.equal(normalizeLocation("Mount-Lavinia"),"mount lavinia");
  assert.equal(normalizePostalCode("100"),"00100");
});

test("matches Colombo 1-15 before fallback",()=>{
  assert.equal(findDeliveryZone(defaultDeliveryZones,{city:"Colombo 01",district:" colombo ",postalCode:"00100"},defaultCourier.id)?.id,"zone-colombo-1-15");
});

test("matches Colombo suburbs by normalized city",()=>{
  assert.equal(findDeliveryZone(defaultDeliveryZones,{city:"  NUGEgoda ",district:"Colombo",postalCode:""},defaultCourier.id)?.id,"zone-colombo-suburbs");
});

test("matches Greater Colombo",()=>{
  assert.equal(findDeliveryZone(defaultDeliveryZones,{city:"Malabe",district:"Colombo",postalCode:"10115"},defaultCourier.id)?.id,"zone-greater-colombo");
});

test("matches outstation and unknown locations to fallback",()=>{
  assert.equal(findDeliveryZone(defaultDeliveryZones,{city:"Kandy",district:"Kandy",postalCode:"20000"},defaultCourier.id)?.id,"zone-outstation");
  assert.equal(findDeliveryZone(defaultDeliveryZones,{city:"Unknown Place",district:"Ampara",postalCode:""},defaultCourier.id)?.id,"zone-outstation");
});

test("postal code has priority over city and district",()=>{
  const zones=[
    {id:"postal",active:true,fallback:false,sortOrder:3,districts:["Galle"],cities:[],postalCodes:["00100"]},
    {id:"city",active:true,fallback:false,sortOrder:1,districts:["Colombo"],cities:["Fort"],postalCodes:[]},
    {id:"district",active:true,fallback:false,sortOrder:2,districts:["Colombo"],cities:[],postalCodes:[]},
    {id:"fallback",active:true,fallback:true,sortOrder:99,districts:[],cities:[],postalCodes:[]},
  ];
  assert.equal(matchDeliveryZone(zones,{postalCode:"00100",city:"Fort",district:"Colombo"})?.id,"postal");
});

test("flat-rate courier applies one fee and inactive courier is unavailable",()=>{
  const flat={id:"flat",pricingMode:"flat" as const,flatRate:400,active:true};
  assert.deepEqual(deliveryQuote(flat,[],{city:"Jaffna",district:"Jaffna",postalCode:"40000"}),{fee:400,zone:undefined});
  assert.equal(checkoutCourier([{...flat,active:false}],"flat"),undefined);
});
