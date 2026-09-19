import type {VercelRequest,VercelResponse} from '@vercel/node';
import{authEnv,ConfigurationError,json,methodNotAllowed,validSession}from'../_shared.js';
export default function handler(req:VercelRequest,res:VercelResponse){if(req.method!=='GET')return methodNotAllowed(res,['GET']);try{return validSession(req,authEnv().SESSION_SECRET)?json(res,{ok:true}):json(res,{error:'Session expired'},401)}catch(error){return error instanceof ConfigurationError?json(res,{error:'Server configuration unavailable'},500):json(res,{error:'Session unavailable'},503)}}
