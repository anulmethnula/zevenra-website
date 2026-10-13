import type { VercelRequest, VercelResponse } from "@vercel/node";
import { methodNotAllowed } from "./_shared.js";
import { isPreviewDeployment,publicOrigin } from "./_public-origin.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const origin=publicOrigin(req),preview=isPreviewDeployment();
  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400",
  );
  return res.send(
    preview
      ? "User-agent: *\nDisallow: /\n"
      : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order/\nDisallow: /preorder/\nSitemap: ${origin}/sitemap.xml\n`,
  );
}
