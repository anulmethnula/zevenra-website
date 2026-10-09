import type { VercelRequest,VercelResponse } from "@vercel/node";
import { z } from "zod";
import { quoteDelivery } from "./_data/orders.js";
import { body,json,methodNotAllowed,originEnv,rateLimit,sriLankaDistricts,validOrigin } from "./_shared.js";

const schema=z.object({
  city:z.string().trim().min(2).max(80),
  district:z.enum(sriLankaDistricts),
  postalCode:z.string().trim().regex(/^\d{5}$/),
  items:z.array(z.object({productId:z.string().min(1),variantId:z.string().min(1),quantity:z.number().int().min(1).max(10)}).strict()).min(1).max(30),
}).strict();

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=="POST")return methodNotAllowed(res,["POST"]);
  const throttle=rateLimit(req,"delivery-quote",30,60_000);
  if(throttle.limited){res.setHeader("Retry-After",String(throttle.retryAfter));return json(res,{error:"Too many delivery quote requests."},429);}
  try{
    if(!validOrigin(req,originEnv()))return json(res,{error:"Invalid request origin"},403);
    return json(res,await quoteDelivery(schema.parse(body(req))),200,{"Cache-Control":"private, no-store"});
  }catch(error){
    const message=error instanceof Error?error.message:"";
    if(error instanceof Error&&error.name==="ZodError")return json(res,{error:"Enter a valid Sri Lankan district and 5-digit postal code."},400);
    if(/not configured|temporarily unavailable|delivery is not configured/i.test(message))return json(res,{error:"Delivery is not configured for this address."},400);
    if(/no longer available|quantity/i.test(message))return json(res,{error:"Review the items in your bag."},409);
    console.error("delivery quote failed",error);
    return json(res,{error:"Delivery could not be calculated."},500);
  }
}
