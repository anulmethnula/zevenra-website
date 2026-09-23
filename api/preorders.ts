import type {VercelRequest,VercelResponse} from '@vercel/node';
import{appsScriptEnv,body,callScript,json,methodNotAllowed,preorderSchema,readCustomerSession,validOrigin}from'./_shared.js';

export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return methodNotAllowed(res,['POST']);
 try{
  const config=appsScriptEnv();
  if(!validOrigin(req,config))return json(res,{error:'Invalid request origin'},403);
  const payload=preorderSchema.parse(body(req)),identity=readCustomerSession(req);
  const raw=await callScript(config,'createPreorder',identity?{...payload,customerId:identity.id,email:identity.email}:payload) as Record<string,unknown>;
  return json(res,{
   requestId:String(raw.requestId||''),
   createdAt:String(raw.createdAt||new Date().toISOString()),
   customerId:String(raw.customerId||identity?.id||'')||undefined,
   customerName:String(raw.customerName||payload.customerName),
   phone:String(raw.phone||payload.phone),
   whatsapp:String(raw.whatsapp||payload.whatsapp),
   email:String(raw.email||payload.email||'')||undefined,
   city:String(raw.city||payload.city),
   district:String(raw.district||payload.district),
   productId:String(raw.productId||payload.productId),
   variantId:String(raw.variantId||payload.variantId),
   productName:String(raw.productName||''),
   color:String(raw.color||''),
   size:String(raw.size||''),
   quantity:Number(raw.quantity)||payload.quantity,
   requestedPrice:Number(raw.requestedPrice)||0,
   confirmedPrice:raw.confirmedPrice===''||raw.confirmedPrice==null?undefined:Number(raw.confirmedPrice),
   status:String(raw.status||'new'),
   notes:String(raw.notes||payload.notes||'')||undefined,
   batchId:String(raw.batchId||'')||undefined,
   supplierOrderRef:String(raw.supplierOrderRef||'')||undefined,
   expectedArrival:String(raw.expectedArrival||'')||undefined,
   source:String(raw.source||'web'),
   updatedAt:String(raw.updatedAt||new Date().toISOString())
  });
 }catch(error){
  const message=error instanceof Error?error.message:'';
  if(message.includes('not available for pre-order'))return json(res,{error:message},409);
  if(message.includes('selected option'))return json(res,{error:message},409);
  return json(res,{error:message||'Could not submit the pre-order request.'},400);
 }
}
