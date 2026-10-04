import type { VercelRequest,VercelResponse } from "@vercel/node";
import { getProductBySlug } from "./_data/catalog.js";
import { json,methodNotAllowed } from "./_shared.js";
export default async function handler(req:VercelRequest,res:VercelResponse){if(req.method!=="GET")return methodNotAllowed(res,["GET"]);const product=await getProductBySlug(String(req.query.slug||"").slice(0,160));return product?json(res,product,200,{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}):json(res,{error:"Product not found"},404,{"Cache-Control":"public, max-age=30"});}
