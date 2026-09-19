import type {VercelRequest,VercelResponse} from '@vercel/node';
import{env,json,methodNotAllowed,validSession}from'../_shared.js';
export default function handler(req:VercelRequest,res:VercelResponse){if(req.method!=='GET')return methodNotAllowed(res,['GET']);try{return validSession(req,env().SESSION_SECRET)?json(res,{ok:true}):json(res,{error:'Session expired'},401)}catch{return json(res,{error:'Session unavailable'},503)}}
