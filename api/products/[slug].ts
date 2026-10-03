import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getProductBySlug } from "../_data/catalog.js";
import { json, methodNotAllowed } from "../_shared.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const slug = Array.isArray(req.query.slug)
        ? req.query.slug[0]
        : req.query.slug,
      data = await getProductBySlug(String(slug || ""));
    return data
      ? json(res, data, 200, { "Cache-Control": "public, max-age=60" })
      : json(res, { error: "Not found" }, 404);
  } catch {
    return json(res, { error: "Product temporarily unavailable" }, 503);
  }
}
