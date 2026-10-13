import type { VercelRequest,VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getCartProducts } from "./_data/catalog.js";
import { body,json,methodNotAllowed,originEnv,validOrigin } from "./_shared.js";
const schema=z.object({variantIds:z.array(z.string().trim().min(1).max(100)).max(50)}).strict();
export default async function handler(req:VercelRequest,res:VercelResponse){if(req.method!=="POST")return methodNotAllowed(res,["POST"]);try{if(!validOrigin(req,originEnv()))return json(res,{error:"Invalid request origin"},403);const input=schema.parse(body(req)),items=await getCartProducts([...new Set(input.variantIds)]);return json(res,{items},200,{"Cache-Control":"private, no-store"});}catch(error){if(error instanceof z.ZodError)return json(res,{error:"Invalid cart lookup"},400);console.error("cart hydration failed",error);return json(res,{error:"Cart availability temporarily unavailable"},503);}}
