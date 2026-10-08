import test from "node:test";
import assert from "node:assert/strict";
import { fetchPublic,getCachedPublic,invalidatePublic,revalidatePublic } from "../src/services/publicDataCache.ts";
import { serializeShopQuery,shopSearchPolicy } from "../src/services/shopSearchPolicy.ts";

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

test("invalidation prevents an older response from repopulating a search cache",async()=>{
  let finishOld:(response:Response)=>void=()=>{};
  globalThis.fetch=()=>new Promise<Response>(resolve=>{finishOld=resolve;});
  const path="/products?page=1&q=classic";
  const old=fetchPublic<{total:number}>(path,{ttlMs:25_000});
  invalidatePublic("/products");
  finishOld(new Response(JSON.stringify({total:0}),{status:200,headers:{"content-type":"application/json"}}));
  assert.equal((await old).total,0);
  assert.equal(getCachedPublic(path),undefined);
});

test("manual revalidation bypasses an older in-flight search request",async()=>{
  const resolvers:Array<(response:Response)=>void>=[];
  globalThis.fetch=()=>new Promise<Response>(resolve=>resolvers.push(resolve));
  const path="/products?page=1&q=porcelain";
  const old=fetchPublic<{total:number}>(path,{ttlMs:25_000});
  await new Promise(resolve=>setTimeout(resolve,0));
  const retry=revalidatePublic<{total:number}>(path,{ttlMs:25_000});
  assert.equal(resolvers.length,2);
  resolvers[1](new Response(JSON.stringify({total:1}),{status:200,headers:{"content-type":"application/json"}}));
  assert.equal((await retry).total,1);
  resolvers[0](new Response(JSON.stringify({total:0}),{status:200,headers:{"content-type":"application/json"}}));
  await old;
  assert.equal(getCachedPublic<{total:number}>(path)?.total,1);
  invalidatePublic();
});

test("cached zero-result searches force revalidation and stay loading",async()=>{
  const query="page=1&pageSize=24&sort=newest&q=classic",path=`/products?${query}`;
  let requests=0;
  globalThis.fetch=async()=>{requests+=1;return new Response(JSON.stringify(requests===1?{items:[],total:0}:{items:[{slug:"the-classic-fit"}],total:1}),{status:200,headers:{"content-type":"application/json"}});};
  const cached=await fetchPublic<{items:Array<{slug:string}>;total:number}>(path,{ttlMs:25_000});
  const policy=shopSearchPolicy(query,cached);
  assert.deepEqual(policy,{search:true,revalidateFresh:true,loadingWhileRevalidate:true});
  const fresh=await revalidatePublic<{items:Array<{slug:string}>;total:number}>(path,{ttlMs:25_000});
  assert.equal(requests,2);
  assert.equal(fresh.items[0]?.slug,"the-classic-fit");
  assert.equal(getCachedPublic<typeof fresh>(path)?.total,1);
  invalidatePublic();
});

test("cached search items may remain visible during forced revalidation",()=>{
  const policy=shopSearchPolicy("page=1&q=fit",{items:[{slug:"classic-fit"}]});
  assert.equal(policy.revalidateFresh,true);
  assert.equal(policy.loadingWhileRevalidate,false);
});

test("one-word searches use the complete query string as their cache key",async()=>{
  const urls:string[]=[];
  globalThis.fetch=async input=>{urls.push(String(input));return new Response(JSON.stringify({items:[],total:0}),{status:200,headers:{"content-type":"application/json"}});};
  const first="/products?page=1&pageSize=24&sort=newest&q=bloom",second="/products?page=2&pageSize=24&sort=newest&q=bloom";
  await fetchPublic(first,{ttlMs:25_000});await fetchPublic(first,{ttlMs:25_000});await fetchPublic(second,{ttlMs:25_000});
  assert.deepEqual(urls,[`/api${first}`,`/api${second}`]);
  invalidatePublic();
});

test("no-store search bypasses cached empty data and replaces it with the fresh response",async()=>{
  const path="/products?page=1&q=classic";let requests=0;
  globalThis.fetch=async()=>new Response(JSON.stringify(++requests===1?{items:[],total:0}:{items:[{slug:"the-classic-fit"}],total:1}),{status:200});
  await fetchPublic(path);const fresh=await fetchPublic<{items:Array<{slug:string}>;total:number}>(path,{noStore:true});
  assert.equal(fresh.items[0]?.slug,"the-classic-fit");assert.equal(requests,2);invalidatePublic();
});

test("no-store search bypasses an older in-flight request and cannot be overwritten",async()=>{
  const resolvers:Array<(response:Response)=>void>=[];const path="/products?page=1&q=porcelain";
  globalThis.fetch=(_input,init)=>{assert.equal(init?.cache,"no-store");return new Promise<Response>(resolve=>resolvers.push(resolve));};
  const old=fetchPublic<{total:number}>(path,{noStore:true});const fresh=fetchPublic<{total:number}>(path,{noStore:true});
  assert.equal(resolvers.length,2);resolvers[1](new Response(JSON.stringify({total:1}),{status:200}));assert.equal((await fresh).total,1);
  resolvers[0](new Response(JSON.stringify({total:0}),{status:200}));assert.equal((await old).total,0);assert.equal(getCachedPublic(path),undefined);invalidatePublic();
});

test("ordinary browsing retains memory caching and default fetch cache mode",async()=>{
  const calls:Array<RequestInit|undefined>=[];globalThis.fetch=async(_input,init)=>{calls.push(init);return new Response(JSON.stringify({items:[],total:0}),{status:200});};
  const path="/products?page=1&pageSize=24&sort=newest";await fetchPublic(path);await fetchPublic(path);
  assert.equal(calls.length,1);assert.equal(calls[0],undefined);invalidatePublic();
});

test("shop queries encode exact-name spaces as percent escapes, not plus signs",()=>{
  const query=new URLSearchParams({page:"1",pageSize:"24",sort:"newest",q:"PORCELAIN BLOOM TWIST TOP"});
  assert.equal(serializeShopQuery(query),"page=1&pageSize=24&sort=newest&q=PORCELAIN%20BLOOM%20TWIST%20TOP");
});
