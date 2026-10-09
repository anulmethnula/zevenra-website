import assert from "node:assert/strict";
import test from "node:test";
import { checkoutCourier, defaultCourier, defaultDeliveryZones, deliveryQuote, findDeliveryZone } from "../src/utils/delivery.ts";
import { matchDeliveryZone, normalizeLocation, normalizePostalCode } from "../shared/delivery-match.ts";
import { resolveDeliveryPricing } from "../shared/delivery-pricing.ts";

test("normalizes case, spacing, punctuation, Colombo numbers, and postal codes",()=>{
  assert.equal(normalizeLocation("  COLOMBO   01 "),"colombo 1");
  assert.equal(normalizeLocation("Colombo1"),"colombo 1");
  assert.equal(normalizeLocation("Colombo-01"),"colombo 1");
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

test("server pricing keeps flat couriers working without a rate card",()=>{
  assert.deepEqual(
    resolveDeliveryPricing(
      {pricingMode:"flat",flatRate:400},
      {city:"Jaffna",district:"Jaffna",postalCode:"40000"},
      1400,
      [],
      [],
    ),
    {fee:400,ratePlan:"flat",zoneName:"Flat rate",source:"flat"},
  );
});

test("server pricing uses active weight rate when one matches",()=>{
  const result=resolveDeliveryPricing(
    {pricingMode:"zone",flatRate:0},
    {city:"Nugegoda",district:"Colombo",postalCode:"10250"},
    1400,
    [{rateCardId:"card-1",destinationDistrict:"Colombo",destinationCity:"Nugegoda",firstKgCharge:400,additionalKgCharge:100}],
    [],
  );
  assert.deepEqual(result,{fee:500,ratePlan:"card-1",zoneName:"Nugegoda, Colombo",source:"rate-card"});
});

test("server pricing accepts normalized Colombo city aliases",()=>{
  const result=resolveDeliveryPricing(
    {pricingMode:"zone",flatRate:0},
    {city:"Colombo1",district:"Colombo",postalCode:"00100"},
    900,
    [{rateCardId:"card-1",destinationDistrict:"Colombo",destinationCity:"Colombo 01",firstKgCharge:350,additionalKgCharge:100}],
    [],
  );
  assert.equal(result.fee,350);
  assert.equal(result.source,"rate-card");
});

test("mixed city rates never guess an arbitrary district rate",()=>{
  const result=resolveDeliveryPricing(
    {pricingMode:"zone",flatRate:0},
    {city:"Unknown Colombo Area",district:"Colombo",postalCode:""},
    900,
    [
      {rateCardId:"card-1",destinationDistrict:"Colombo",destinationCity:"Colombo 01",firstKgCharge:350,additionalKgCharge:100},
      {rateCardId:"card-1",destinationDistrict:"Colombo",destinationCity:"Nugegoda",firstKgCharge:400,additionalKgCharge:100},
    ],
    [{id:"fallback",name:"Outstation",fee:500,active:true,districts:[],cities:[],postalCodes:[],fallback:true,sortOrder:99}],
  );
  assert.deepEqual(result,{fee:500,ratePlan:"fallback",zoneName:"Outstation",source:"legacy-zone"});
});

test("uniform district rate is safe when every imported city has the same price",()=>{
  const result=resolveDeliveryPricing(
    {pricingMode:"zone",flatRate:0},
    {city:"Unlisted Area",district:"Jaffna",postalCode:""},
    1001,
    [
      {rateCardId:"card-2",destinationDistrict:"Jaffna",destinationCity:"Jaffna",firstKgCharge:500,additionalKgCharge:100},
      {rateCardId:"card-2",destinationDistrict:"Jaffna",destinationCity:"Chavakachcheri",firstKgCharge:500,additionalKgCharge:100},
    ],
    [],
  );
  assert.equal(result.fee,600);
  assert.equal(result.source,"rate-card");
});

test("server pricing falls back to the saved legacy delivery zones when no rate card matches",()=>{
  const result=resolveDeliveryPricing(
    {pricingMode:"zone",flatRate:0},
    {city:"Unknown Place",district:"Kandy",postalCode:"20000"},
    900,
    [],
    [{id:"outstation",name:"Outstation",fee:500,active:true,districts:[],cities:[],postalCodes:[],fallback:true,sortOrder:99}],
  );
  assert.deepEqual(result,{fee:500,ratePlan:"outstation",zoneName:"Outstation",source:"legacy-zone"});
});

test("server pricing rejects an unconfigured zone address",()=>{
  assert.throws(()=>resolveDeliveryPricing(
    {pricingMode:"zone",flatRate:0},
    {city:"Unknown",district:"Kandy",postalCode:"20000"},
    900,
    [],
    [],
  ),/Delivery is not configured/);
});
