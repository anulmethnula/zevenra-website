import type { VercelRequest,VercelResponse } from "@vercel/node";
import { listCategories,listCollections,listHomepageProducts,listHomepageSections } from "./_data/catalog.js";
import { json,methodNotAllowed } from "./_shared.js";
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=="GET")return methodNotAllowed(res,["GET"]);
  try{const [sections,categories,collections]=await Promise.all([listHomepageSections(),listCategories(),listCollections()]),enabled=sections.filter(section=>section.enabled),products=await listHomepageProducts(enabled);return json(res,{sections,products,categories:categories.filter(category=>category.active),collections:collections.filter(collection=>collection.active)},200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=120"});}
  catch(error){console.error("homepage data failed",error);return json(res,{error:"Homepage content temporarily unavailable"},503);}
}
