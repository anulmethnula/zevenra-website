import type { VercelRequest,VercelResponse } from "@vercel/node";
import { getSizeChartById } from "./_data/catalog.js";
import { json,methodNotAllowed } from "./_shared.js";

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=="GET")return methodNotAllowed(res,["GET"]);
  try{const chart=await getSizeChartById(String(req.query.id||"").slice(0,100));return chart?json(res,chart,200,{"Cache-Control":"public, max-age=300, stale-while-revalidate=600"}):json(res,{error:"Size guide not found"},404);}
  catch(error){console.error("size chart read failed",error);return json(res,{error:"Size guide temporarily unavailable"},503);}
}
