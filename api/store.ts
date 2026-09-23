import type {VercelRequest,VercelResponse} from '@vercel/node';
import{appsScriptEnv,callScript,json,methodNotAllowed}from'./_shared.js';

type SettingRow={key?:unknown;value?:unknown};
type StoreBootstrap={products:unknown[];categories:unknown[];collections:unknown[];sizeCharts:unknown[];navigation:unknown[];homepageSections:unknown[];settings:unknown;deliveryRates:unknown[]};
const truthy=(value:unknown)=>value===true||String(value).toLowerCase()==='true';
function publicSettings(source:unknown){
 if(!Array.isArray(source))return source;
 const rows=source as SettingRow[];
 const enabled=truthy(rows.find(row=>row.key==='bankTransferEnabled'||row.key==='bankEnabled')?.value);
 if(enabled)return rows;
 const privateWhenDisabled=new Set(['bankName','bankAccountName','accountName','bankAccountNumber','accountNumber','bankBranch','branch','bankInstructions']);
 return rows.filter(row=>!privateWhenDisabled.has(String(row.key||'')));
}
async function legacyStore(config:ReturnType<typeof appsScriptEnv>):Promise<StoreBootstrap>{
 const specs=[
  ['products','listPublishedProducts'],['categories','listCategories'],['collections','listCollections'],
  ['sizeCharts','listSizeCharts'],['navigation','listNavigation'],['homepageSections','listHomepageSections'],
  ['settings','getSettings'],['deliveryRates','listDeliveryRates']
 ] as const;
 const result:Record<string,unknown>={};
 for(let index=0;index<specs.length;index+=3){
  const batch=specs.slice(index,index+3);
  const values=await Promise.all(batch.map(([,action])=>callScript(config,action,{})));
  batch.forEach(([key],offset)=>{result[key]=values[offset]});
 }
 return result as unknown as StoreBootstrap;
}

export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='GET')return methodNotAllowed(res,['GET']);
 try{
  const config=appsScriptEnv();let payload:StoreBootstrap;
  try{payload=await callScript(config,'storeBootstrap',{}) as StoreBootstrap}
  catch(error){if(!(error instanceof Error)||error.message!=='Unknown action')throw error;payload=await legacyStore(config)}
  return json(res,{...payload,settings:publicSettings(payload.settings)},200,{'Cache-Control':'public, max-age=10, stale-while-revalidate=30'});
 }catch{return json(res,{error:'Store data temporarily unavailable'},503)}
}
