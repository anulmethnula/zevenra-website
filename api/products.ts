import type {VercelRequest,VercelResponse} from '@vercel/node';
import{callScript,env,json,methodNotAllowed}from'./_shared.js';
export default async function handler(req:VercelRequest,res:VercelResponse){if(req.method!=='GET')return methodNotAllowed(res,['GET']);try{return json(res,await callScript(env(),'listPublishedProducts',{}),200,{'Cache-Control':'public, max-age=60, stale-while-revalidate=300'})}catch{return json(res,{error:'Catalogue temporarily unavailable'},503)}}
