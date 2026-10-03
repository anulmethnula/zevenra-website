import type {VercelRequest,VercelResponse} from '@vercel/node';
import {createHash} from 'node:crypto';
import {authEnv,cloudinaryEnv,json,methodNotAllowed,validSession} from './_shared.js';

function parseReceiptUrl(value:string,cloudName:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='res.cloudinary.com')throw new Error('Invalid receipt URL');
 const parts=url.pathname.split('/').filter(Boolean).map(part=>decodeURIComponent(part));
 if(parts[0]!==cloudName||!['image','raw','video'].includes(parts[1]||'')||!['authenticated','upload'].includes(parts[2]||''))throw new Error('Invalid receipt asset');
 let rest=parts.slice(3);if(/^v\d+$/.test(rest[0]||''))rest=rest.slice(1);
 const joined=rest.join('/');if(!joined.startsWith('zevenra/payment-receipts/'))throw new Error('Invalid receipt folder');
 const last=rest[rest.length-1]||'',dot=last.lastIndexOf('.'),format=dot>0?last.slice(dot+1):'',publicPath=dot>0?[...rest.slice(0,-1),last.slice(0,dot)].join('/'):joined;
 return{resourceType:parts[1],deliveryType:parts[2],format,publicId:publicPath,original:url.toString()}
}

export default function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='GET')return methodNotAllowed(res,['GET']);
 try{
  const auth=authEnv();if(!validSession(req,auth.SESSION_SECRET))return json(res,{error:'Session expired'},401);
  const config=cloudinaryEnv(),raw=Array.isArray(req.query.url)?req.query.url[0]:req.query.url,url=String(raw||'');
  if(!url)return json(res,{error:'Receipt URL is required.'},400);
  const asset=parseReceiptUrl(url,config.CLOUDINARY_CLOUD_NAME);
  if(asset.deliveryType==='upload')return json(res,{url:asset.original,legacy:true});
  const timestamp=Math.floor(Date.now()/1000),expiresAt=timestamp+300;
  const params:Record<string,string|number>={expires_at:expiresAt,public_id:asset.publicId,timestamp,type:'authenticated'};
  if(asset.format)params.format=asset.format;
  const serialized=Object.entries(params).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('&');
  const signature=createHash('sha1').update(serialized+config.CLOUDINARY_API_SECRET).digest('hex');
  const query=new URLSearchParams();Object.entries(params).forEach(([key,value])=>query.set(key,String(value)));query.set('signature',signature);query.set('api_key',config.CLOUDINARY_API_KEY);
  const signedUrl=`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.CLOUDINARY_CLOUD_NAME)}/${asset.resourceType}/download?${query.toString()}`;
  return json(res,{url:signedUrl,expiresAt});
 }catch{return json(res,{error:'Receipt access is unavailable.'},400)}
}
