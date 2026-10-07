import { useCallback,useEffect,useRef,useState } from "react";
import type { HomepageData,Product,ProductSummary,ShopResponse,SizeChart } from "../types";
import { fetchPublic,getCachedPublic,revalidatePublic,subscribePublic } from "../services/publicDataCache";
type RequestOptions={ttlMs?:number;persist?:boolean;maxEntries?:number;revalidateFresh?:boolean};
function useRequest<T>(path:string,options:RequestOptions={}){const cached=path?getCachedPublic<T>(path,options):undefined,[data,setData]=useState<T|null>(cached??null),[loading,setLoading]=useState(Boolean(path&&!cached)),[error,setError]=useState(""),requestId=useRef(0);const {ttlMs,persist,maxEntries,revalidateFresh}=options;
  const load=useCallback(async(force=false)=>{const id=++requestId.current;if(!path){setLoading(false);return;}const current=getCachedPublic<T>(path,{persist});if(!current)setLoading(true);setError("");try{const payload=force?await revalidatePublic<T>(path,{ttlMs,persist,maxEntries}):await fetchPublic<T>(path,{ttlMs,persist,maxEntries});if(id===requestId.current)setData(payload);}catch(reason){if(id===requestId.current)setError(reason instanceof Error?reason.message:"Content temporarily unavailable");}finally{if(id===requestId.current)setLoading(false);}},[maxEntries,path,persist,ttlMs]);
  useEffect(()=>{if(!path){setData(null);setLoading(false);return;}const current=getCachedPublic<T>(path,{persist});setData(current??null);setLoading(!current);const unsubscribe=subscribePublic<T>(path,next=>{setData(next);setLoading(false);setError("");});void load(Boolean(current&&revalidateFresh));return unsubscribe;},[load,path,persist,revalidateFresh]);return{data,loading,error,retry:()=>load(true)};}
export const useHomepageData=()=>useRequest<Pick<HomepageData,"products">>("/home",{ttlMs:60_000,persist:true,revalidateFresh:true});
export const useProduct=(slug:string)=>useRequest<{product:Product}>(slug?`/products/${encodeURIComponent(slug)}`:"",{ttlMs:60_000,persist:true});
export const useRecommendations=(categoryId:string,productId:string)=>useRequest<ProductSummary[]>(categoryId&&productId?`/recommendations?category=${encodeURIComponent(categoryId)}&exclude=${encodeURIComponent(productId)}`:"",{ttlMs:300_000});
export const getSizeChart=(id:string)=>fetchPublic<SizeChart>(`/size-chart?id=${encodeURIComponent(id)}`,{ttlMs:300_000});
export const useShopProducts=(query:string)=>useRequest<ShopResponse>(`/products?${query}`,{ttlMs:25_000,maxEntries:40});
export type PublicCourier={id:string;pricingMode:"zone"|"flat";flatRate:number;active:boolean};
export type PublicDeliveryRate={courierProviderId?:string;fee:number;active:boolean;districts:string[];cities:string[];postalCodes:string[];fallback:boolean;sortOrder:number};
export const useCheckoutConfig=()=>useRequest<{settings:Array<{key:string;value:unknown}>;couriers:PublicCourier[];deliveryRates:PublicDeliveryRate[]}>("/checkout-config",{ttlMs:15_000});
