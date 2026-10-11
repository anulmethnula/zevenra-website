import type { VercelRequest,VercelResponse } from "@vercel/node";
import { publicCheckoutConfig } from "./_data/catalog.js";
import { json,methodNotAllowed } from "./_shared.js";
export default async function handler(req:VercelRequest,res:VercelResponse){if(req.method!=="GET")return methodNotAllowed(res,["GET"]);try{return json(res,await publicCheckoutConfig(),200,{"Cache-Control":"private, no-store, max-age=0"});}catch(error){console.error("checkout config failed",error);return json(res,{error:"Checkout configuration temporarily unavailable"},503,{"Cache-Control":"private, no-store, max-age=0"});}}
