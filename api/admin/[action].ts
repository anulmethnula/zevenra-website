import type {VercelRequest,VercelResponse} from '@vercel/node';
import{appsScriptEnv,body,callScript,json,validOrigin,validSession}from'../_shared.js';

const allowed=new Set(['adminBootstrap','dashboard','listProducts','saveProduct','archiveProduct','deleteProduct','listCategories','saveCategory','deleteCategory','listCollections','saveCollection','deleteCollection','listSizeCharts','saveSizeChart','deleteSizeChart','listNavigation','saveNavigation','deleteNavigation','listHomepageSections','saveHomepageSection','deleteHomepageSection','listOrders','getOrder','updateOrder','getSettings','saveSettings','listDeliveryRates','saveDeliveryRates']);

export default async function handler(req:VercelRequest,res:VercelResponse){
 try{
  const config=appsScriptEnv();
  if(!validSession(req,config.SESSION_SECRET))return json(res,{error:'Session expired'},401);
  if(!validOrigin(req,config))return json(res,{error:'Invalid request origin'},403);
  const value=Array.isArray(req.query.action)?req.query.action[0]:req.query.action,action=String(value||'');
  if(!allowed.has(action))return json(res,{error:'Unknown action'},404);
  if(!['GET','POST'].includes(req.method||'')){res.setHeader('Allow','GET, POST');return json(res,{error:'Method not allowed'},405)}
  const payload=req.method==='GET'
   ?Object.fromEntries(Object.entries(req.query).filter(([key])=>key!=='action').map(([key,item])=>[key,Array.isArray(item)?item[0]:item]))
   :body(req);
  return json(res,await callScript(config,action,payload));
 }catch(error){
  const message=error instanceof Error?error.message:'';
  if(message==='Upstream unavailable')return json(res,{error:'Google Sheets backend is temporarily unreachable.'},503);
  if(message==='Unknown action')return json(res,{error:'The live Apps Script backend is out of date. Redeploy the latest apps-script/Code.gs version.'},503);
  if(message==='Unauthorized')return json(res,{error:'Apps Script authentication is not configured correctly.'},503);
  return json(res,{error:'The operation could not be completed.'},400);
 }
}
