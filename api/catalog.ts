import type { VercelRequest,VercelResponse } from "@vercel/node";
import { listPublicProducts } from "./_data/catalog.js";
import { json,methodNotAllowed } from "./_shared.js";
export default async function handler(req:VercelRequest,res:VercelResponse){if(req.method!=="GET")return methodNotAllowed(res,["GET"]);try{return json(res,await listPublicProducts(req.query),200,{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"});}catch(error){console.error("catalogue failed",error);return json(res,{error:"Catalogue temporarily unavailable"},503);}}
