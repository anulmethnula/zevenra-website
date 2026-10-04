import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listProducts, listPublicProducts } from "./_data/catalog.js";
import { json, methodNotAllowed } from "./_shared.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const paginated = Object.keys(req.query).some(key => ["page","pageSize","search","category","collection","new","sort"].includes(key));
    return json(res, paginated ? await listPublicProducts(req.query) : await listProducts(true), 200, {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    });
  } catch {
    return json(res, { error: "Catalogue temporarily unavailable" }, 503);
  }
}
