import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getProductBySlug } from "../_data/catalog.js";
import { json, methodNotAllowed } from "../_shared.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const slug = Array.isArray(req.query.slug)
        ? req.query.slug[0]
        : req.query.slug,
      started=performance.now(),data = await getProductBySlug(String(slug || "")),databaseMs=performance.now()-started;
    res.setHeader("Server-Timing",`db;dur=${databaseMs.toFixed(1)}`);
    if(data)return json(res,{product:data},200,{"Cache-Control":"public, max-age=0, s-maxage=60, stale-while-revalidate=300"});
    return json(res, { error: "Not found" }, 404);
  } catch (error) {
    console.error("product detail failed",error);
    return json(res, { error: "Product temporarily unavailable" }, 503);
  }
}
