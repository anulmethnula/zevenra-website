type CacheOptions = { ttlMs?:number; persist?:boolean; maxEntries?:number; force?:boolean };
type CacheEntry = { data:unknown; updatedAt:number; lastUsed:number; persist:boolean };
type PersistedEntry = { version:1; path:string; updatedAt:number; data:unknown };

const base=(import.meta.env?.VITE_API_BASE as string|undefined)||"/api",storagePrefix="zevenra:public:v1:",memory=new Map<string,CacheEntry>(),inFlight=new Map<string,Promise<unknown>>(),listeners=new Map<string,Set<(data:unknown)=>void>>(),DEFAULT_TTL=60_000,MAX_STALE_AGE=30*60_000;
const canPersist=(path:string)=>path==="/store"||path==="/home"||/^\/products\/[^/?]+$/.test(path);
const storageKey=(path:string)=>storagePrefix+encodeURIComponent(path);

function readSession(path:string):CacheEntry|undefined{if(!canPersist(path)||typeof sessionStorage==="undefined")return;try{const raw=sessionStorage.getItem(storageKey(path));if(!raw)return;const saved=JSON.parse(raw) as PersistedEntry;if(saved.version!==1||saved.path!==path||!saved.data||Date.now()-saved.updatedAt>MAX_STALE_AGE){sessionStorage.removeItem(storageKey(path));return;}return{data:saved.data,updatedAt:saved.updatedAt,lastUsed:Date.now(),persist:true};}catch{return;}}
function writeSession(path:string,entry:CacheEntry){if(!entry.persist||!canPersist(path)||typeof sessionStorage==="undefined")return;try{sessionStorage.setItem(storageKey(path),JSON.stringify({version:1,path,updatedAt:entry.updatedAt,data:entry.data} satisfies PersistedEntry));}catch{/* Memory caching still works when storage is restricted or full. */}}
function trim(maxEntries:number){if(memory.size<=maxEntries)return;const oldest=[...memory.entries()].sort((a,b)=>a[1].lastUsed-b[1].lastUsed);for(const [path] of oldest.slice(0,memory.size-maxEntries))memory.delete(path);}
function cachedEntry(path:string,persist=false){let entry=memory.get(path);if(!entry&&persist){entry=readSession(path);if(entry)memory.set(path,entry);}if(entry)entry.lastUsed=Date.now();return entry;}

export function getCachedPublic<T>(path:string,options:CacheOptions={}):T|undefined{return cachedEntry(path,Boolean(options.persist))?.data as T|undefined;}
export function isPublicCacheFresh(path:string,ttlMs=DEFAULT_TTL){const entry=memory.get(path);return Boolean(entry&&Date.now()-entry.updatedAt<ttlMs);}
export function subscribePublic<T>(path:string,listener:(data:T)=>void){const set=listeners.get(path)||new Set();set.add(listener as (data:unknown)=>void);listeners.set(path,set);return()=>{set.delete(listener as (data:unknown)=>void);if(!set.size)listeners.delete(path);};}
function publish(path:string,data:unknown){listeners.get(path)?.forEach(listener=>listener(data));}
async function requestPublic<T>(path:string,options:CacheOptions):Promise<T>{const existing=inFlight.get(path);if(existing)return existing as Promise<T>;const request=(async()=>{const response=await fetch(base+path),payload=await response.json() as T&{error?:string};if(!response.ok)throw new Error(payload.error||"Content temporarily unavailable");const entry:CacheEntry={data:payload,updatedAt:Date.now(),lastUsed:Date.now(),persist:Boolean(options.persist&&canPersist(path))};memory.set(path,entry);trim(options.maxEntries||80);writeSession(path,entry);publish(path,payload);return payload;})().finally(()=>inFlight.delete(path));inFlight.set(path,request);return request;}
export async function fetchPublic<T>(path:string,options:CacheOptions={}):Promise<T>{const ttlMs=options.ttlMs??DEFAULT_TTL,entry=cachedEntry(path,Boolean(options.persist));if(entry&&!options.force&&Date.now()-entry.updatedAt<ttlMs)return entry.data as T;return requestPublic<T>(path,options);}
export const prefetchPublic=<T,>(path:string,options:CacheOptions={})=>fetchPublic<T>(path,options);
export const revalidatePublic=<T,>(path:string,options:CacheOptions={})=>requestPublic<T>(path,{...options,force:true});
export function invalidatePublic(prefix=""){for(const path of [...memory.keys()])if(!prefix||path.startsWith(prefix))memory.delete(path);if(typeof sessionStorage!=="undefined")try{for(let index=sessionStorage.length-1;index>=0;index-=1){const key=sessionStorage.key(index);if(!key?.startsWith(storagePrefix))continue;const path=decodeURIComponent(key.slice(storagePrefix.length));if(!prefix||path.startsWith(prefix))sessionStorage.removeItem(key);}}catch{/* Ignore restricted storage environments. */}}
