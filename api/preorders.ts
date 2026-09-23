import type {VercelRequest,VercelResponse} from '@vercel/node';
import{appsScriptEnv,body,callScript,json,methodNotAllowed,preorderSchema,readCustomerSession,validOrigin}from'./_shared.js';

export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return methodNotAllowed(res,['POST']);
 try{
  const config=appsScriptEnv();
  if(!validOrigin(req,config))return json(res,{error:'Invalid request origin'},403);
  const payload=preorderSchema.parse(body(req)),identity=readCustomerSession(req);
  const requestPayload=identity?{...payload,email:identity.email,customerId:identity.id}:payload;
  const created=await callScript(config,'createPreorderRequest',requestPayload);
  return json(res,created,201);
 }catch(error){
  const message=error instanceof Error?error.message:'';
  if(message.startsWith('CUSTOMER_AUTH_'))return json(res,{error:'Your customer session is invalid. Please sign in again.'},401);
  if(error instanceof Error&&error.name==='ZodError')return json(res,{error:'Please review the preorder information.'},400);
  if(/pre.?order.*unavailable|not available|invalid variant/i.test(message))return json(res,{error:'This option is not available for preorder right now.'},409);
  return json(res,{error:'We could not submit the preorder request. Please try again.'},400);
 }
}
