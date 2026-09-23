import type {VercelRequest,VercelResponse} from '@vercel/node';
import{createHash}from'node:crypto';
import{cloudinaryEnv,json,methodNotAllowed,validOrigin}from'./_shared.js';

export default function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return methodNotAllowed(res,['POST']);
 try{
  const config=cloudinaryEnv();
  if(!req.headers.origin||!validOrigin(req,config))return json(res,{error:'Invalid request origin'},403);
  const timestamp=Math.floor(Date.now()/1000),folder='zevenra/payment-receipts';
  const signature=createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${config.CLOUDINARY_API_SECRET}`).digest('hex');
  return json(res,{timestamp,folder,signature,apiKey:config.CLOUDINARY_API_KEY,cloudName:config.CLOUDINARY_CLOUD_NAME,maxBytes:8_000_000,allowed:['image/jpeg','image/png','image/webp','application/pdf']});
 }catch{return json(res,{error:'Receipt upload is temporarily unavailable.'},503)}
}
