import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLocation } from "../shared/delivery-match.ts";
import { resolveAreaGroup, type AreaGroup, type AreaLocation } from "../shared/fulfillment.ts";

const groups:AreaGroup[]=[
 {id:"colombo-city",name:"Colombo City 01–15",fee:1,active:true,fallback:false,sortOrder:1},
 {id:"colombo-suburbs",name:"Colombo Suburbs",fee:2,active:true,fallback:false,sortOrder:2},
 {id:"western-other",name:"Western Province Other",fee:3,active:true,fallback:false,sortOrder:3},
 {id:"major-outstation",name:"Major Outstation Cities",fee:4,active:true,fallback:false,sortOrder:4},
 {id:"other-outstation",name:"Other Outstation",fee:5,active:true,fallback:true,sortOrder:5},
];
const locations:AreaLocation[]=[
 {id:"d",groupId:"colombo-suburbs",district:"Colombo",town:"Dehiwala",aliases:[],active:true},
 {id:"k",groupId:"major-outstation",district:"Kandy",town:"Kandy",aliases:[],active:true},
 {id:"same-c",groupId:"colombo-suburbs",district:"Colombo",town:"Springfield",aliases:[],active:true},
 {id:"same-g",groupId:"major-outstation",district:"Galle",town:"Springfield",aliases:[],active:true},
];
const defaults=[{district:"Colombo",groupId:"western-other"},{district:"Gampaha",groupId:"western-other"},{district:"Kalutara",groupId:"western-other"}];
const match=(district:string,town:string,postcode="99999")=>resolveAreaGroup(groups,locations,defaults,{district,town,postcode})?.id;

test("Colombo 01 through 15 resolve before all other rules",()=>{for(let n=1;n<=15;n++)assert.equal(match("Colombo",`Colombo ${n}`,`${String(n).padStart(3,"0")}00`),"colombo-city");});
test("Colombo postcode endpoints and aliases resolve",()=>{assert.equal(match("Colombo","Other","00100"),"colombo-city");assert.equal(match("Colombo","Col 15","01500"),"colombo-city");});
test("explicit, Western defaults, major city, and final fallback resolve deterministically",()=>{assert.equal(match("Colombo","Dehiwala"),"colombo-suburbs");assert.equal(match("Gampaha","Tiny Village"),"western-other");assert.equal(match("Kalutara","Tiny Village"),"western-other");assert.equal(match("Kandy","Kandy"),"major-outstation");assert.equal(match("Badulla","Tiny Village"),"other-outstation");});
test("same town names remain district scoped",()=>{assert.equal(match("Colombo","Springfield"),"colombo-suburbs");assert.equal(match("Galle","Springfield"),"major-outstation");});
test("Unicode-safe normalization preserves Sinhala and Tamil combining marks",()=>{assert.equal(normalizeLocation("කොළඹ"),"කොළඹ");assert.equal(normalizeLocation("கொழும்பு"),"கொழும்பு");});
