import test from "node:test";
import assert from "node:assert/strict";
import { fetchPublic,getCachedPublic,invalidatePublic } from "../src/services/publicDataCache.ts";

class SessionStorageMock {
  private values=new Map<string,string>();
  get length(){return this.values.size;}
  key(index:number){return [...this.values.keys()][index]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
  removeItem(key:string){this.values.delete(key);}
  clear(){this.values.clear();}
}
Object.defineProperty(globalThis,"sessionStorage",{value:new SessionStorageMock(),configurable:true});

test("deduplicates concurrent public GETs and serves the fresh result from memory",async()=>{
  let requests=0;
  globalThis.fetch=async()=>{requests+=1;await new Promise(resolve=>setTimeout(resolve,25));return new Response(JSON.stringify({product:{id:"one"}}),{status:200,headers:{"content-type":"application/json"}});};
  const path="/products/cache-test";
  const [first,second]=await Promise.all([fetchPublic<{product:{id:string}}>(path,{persist:true}),fetchPublic<{product:{id:string}}>(path,{persist:true})]);
  const started=performance.now(),repeat=await fetchPublic<{product:{id:string}}>(path,{persist:true});
  assert.equal(requests,1);assert.deepEqual(first,second);assert.equal(repeat.product.id,"one");assert.ok(performance.now()-started<5);
  assert.ok(sessionStorage.length>0);
  invalidatePublic(path);
});

test("does not cache failed requests or persist non-allowlisted payloads",async()=>{
  let requests=0;
  globalThis.fetch=async()=>{requests+=1;if(requests===1)return new Response(JSON.stringify({error:"unavailable"}),{status:503,headers:{"content-type":"application/json"}});return new Response(JSON.stringify({secret:"not persisted"}),{status:200,headers:{"content-type":"application/json"}});};
  await assert.rejects(fetchPublic("/checkout-config",{persist:true}),/unavailable/);
  assert.equal(getCachedPublic("/checkout-config",{persist:true}),undefined);
  await fetchPublic("/checkout-config",{persist:true});
  assert.equal(requests,2);assert.equal(sessionStorage.length,0);
  invalidatePublic();
});
