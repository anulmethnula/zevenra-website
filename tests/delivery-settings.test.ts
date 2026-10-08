import assert from "node:assert/strict";
import test from "node:test";
import { saveAndReloadDeliverySettings } from "../src/services/deliverySettings.ts";
import type { CourierProvider, DeliveryRate } from "../src/types/index.ts";

const courier: CourierProvider = { id:"courier-1",name:"Koombiyo",phone:"",notes:"",pricingMode:"flat",flatRate:450,active:true };
const rate: DeliveryRate = { id:"rate-1",courierProviderId:"courier-1",name:"All districts",fee:450,active:true,districts:[],cities:[],postalCodes:[],fallback:true,sortOrder:1 };

test("delivery save refetches persisted server values", async () => {
  const calls:string[]=[], persisted={couriers:[{...courier,flat_rate:500}],rates:[{...rate,fee:500}],defaultId:"courier-1"};
  const result=await saveAndReloadDeliverySettings([{...courier,flatRate:500}],[{...rate,fee:500}],"courier-1",{
    async post(action){calls.push(`POST ${action}`);return {};},
    async get<T>(action:string){calls.push(`GET ${action}`);if(action==="listCouriers")return persisted.couriers as T;if(action==="listDeliveryRates")return persisted.rates as T;return [{key:"defaultCourierProviderId",value:persisted.defaultId}] as T;},
  });
  assert.deepEqual(calls,["POST saveCourierConfig","GET listCouriers","GET listDeliveryRates","GET getSettings"]);
  assert.equal((result.deliveryRates[0] as {fee:number}).fee,500);
  assert.equal(result.defaultCourierProviderId,"courier-1");
});

test("failed delivery save preserves caller edits", async () => {
  const editedCouriers=[{...courier,flatRate:725}],editedRates=[{...rate,fee:725}],before=JSON.stringify({editedCouriers,editedRates});
  await assert.rejects(()=>saveAndReloadDeliverySettings(editedCouriers,editedRates,"courier-1",{
    async post(){throw new Error("Save failed");},
    async get<T>(){return [] as T;},
  }),/Save failed/);
  assert.equal(JSON.stringify({editedCouriers,editedRates}),before);
});
