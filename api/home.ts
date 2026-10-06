import type { VercelRequest,VercelResponse } from "@vercel/node";
import { listHomepageProducts,listHomepageSections } from "./_data/catalog.js";
import { json,methodNotAllowed } from "./_shared.js";
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=="GET")return methodNotAllowed(res,["GET"]);
  try{const sections=await listHomepageSections(),enabled=sections.filter(section=>section.enabled),products=await listHomepageProducts(enabled);return json(res,{products},200,{"Cache-Control":"public, max-age=0, s-maxage=120, stale-while-revalidate=600"});}
  catch(error){console.error("homepage data failed",error);return json(res,{error:"Homepage content temporarily unavailable"},503);}
}
