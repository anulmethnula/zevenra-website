import type {VercelRequest,VercelResponse} from '@vercel/node';
import{customerCookie,json,methodNotAllowed,required,validOrigin}from'../_shared.js';
export default function handler(req:VercelRequest,res:VercelResponse){if(req.method!=='POST')return methodNotAllowed(res,['POST']);try{if(!validOrigin(req,{ALLOWED_ORIGIN:required('ALLOWED_ORIGIN')}))return json(res,{error:'Invalid request origin'},403);res.setHeader('Set-Cookie',customerCookie('',0));return json(res,{ok:true})}catch{return json(res,{error:'Unable to sign out.'},500)}}
