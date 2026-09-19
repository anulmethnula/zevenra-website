import type {VercelRequest,VercelResponse} from '@vercel/node';
import{env,json,methodNotAllowed,validOrigin}from'../_shared.js';
export default function handler(req:VercelRequest,res:VercelResponse){if(req.method!=='POST')return methodNotAllowed(res,['POST']);try{if(!validOrigin(req,env()))return json(res,{error:'Invalid request'},403);return json(res,{ok:true},200,{'Set-Cookie':'zevenra_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'})}catch{return json(res,{error:'Invalid request'},403)}}
