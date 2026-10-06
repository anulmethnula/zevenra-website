import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getProductBySlug,getSizeChartById,listRecommendations } from "../_data/catalog.js";
import { json, methodNotAllowed } from "../_shared.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const slug = Array.isArray(req.query.slug)
        ? req.query.slug[0]
        : req.query.slug,
      data = await getProductBySlug(String(slug || ""));
    if(data){const [sizeChart,related]=await Promise.all([getSizeChartById(data.sizeChartId||""),listRecommendations([data.categoryId],[data.id])]);return json(res,{product:data,sizeChart,related:related.slice(0,4)},200,{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"});}
    return json(res, { error: "Not found" }, 404);
  } catch {
    return json(res, { error: "Product temporarily unavailable" }, 503);
  }
}
