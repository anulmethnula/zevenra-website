import type {VercelRequest,VercelResponse} from '@vercel/node';
import{appsScriptEnv,callScript,json,methodNotAllowed}from'./_shared.js';

type SettingRow={key?:unknown;value?:unknown};
type StoreBootstrap={products:unknown;categories:unknown;collections:unknown;sizeCharts:unknown;navigation:unknown;homepageSections:unknown;settings:unknown;deliveryRates:unknown};
const truthy=(value:unknown)=>value===true||String(value).toLowerCase()==='true';
function publicSettings(source:unknown){
 if(!Array.isArray(source))return source;
 const rows=source as SettingRow[];
 const enabled=truthy(rows.find(row=>row.key==='bankTransferEnabled'||row.key==='bankEnabled')?.value);
 if(enabled)return rows;
 const privateWhenDisabled=new Set(['bankName','bankAccountName','accountName','bankAccountNumber','accountNumber','bankBranch','branch','bankInstructions']);
 return rows.filter(row=>!privateWhenDisabled.has(String(row.key||'')));
}

export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='GET')return methodNotAllowed(res,['GET']);
 try{
  const config=appsScriptEnv();
  let payload:StoreBootstrap;
  try{payload=await callScript(config,'storeBootstrap',{}) as StoreBootstrap}
  catch{
   const[products,categories,collections,sizeCharts,navigation,homepageSections,settings,deliveryRates]=await Promise.all([
    callScript(config,'listPublishedProducts',{}),callScript(config,'listCategories',{}),callScript(config,'listCollections',{}),callScript(config,'listSizeCharts',{}),callScript(config,'listNavigation',{}),callScript(config,'listHomepageSections',{}),callScript(config,'getSettings',{}),callScript(config,'listDeliveryRates',{})
   ]);
   payload={products,categories,collections,sizeCharts,navigation,homepageSections,settings,deliveryRates};
  }
  return json(res,{...payload,settings:publicSettings(payload.settings)},200,{'Cache-Control':'public, max-age=30, stale-while-revalidate=120'});
 }catch{return json(res,{error:'Store data temporarily unavailable'},503)}
}
