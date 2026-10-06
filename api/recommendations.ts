import type { VercelRequest,VercelResponse } from "@vercel/node";
import { listRecommendations } from "./_data/catalog.js";
import { json,methodNotAllowed } from "./_shared.js";
const list=(value:unknown)=>String(Array.isArray(value)?value[0]:value||"").split(",").map(item=>item.trim()).filter(Boolean).slice(0,30);
export default async function handler(req:VercelRequest,res:VercelResponse){if(req.method!=="GET")return methodNotAllowed(res,["GET"]);try{return json(res,await listRecommendations(list(req.query.category),list(req.query.exclude)),200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=120"});}catch(error){console.error("recommendations failed",error);return json(res,{error:"Recommendations temporarily unavailable"},503);}}
