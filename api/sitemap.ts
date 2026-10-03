import type { VercelRequest, VercelResponse } from "@vercel/node";
import { storeBootstrap } from "./_data/catalog.js";
import { methodNotAllowed } from "./_shared.js";

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[char] || char,
  );
const cleanPath = (value: string) => "/" + value.replace(/^\/+|\/+$/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const host = String(
        req.headers["x-forwarded-host"] ||
          req.headers.host ||
          "zevenra.vercel.app",
      ),
      proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0],
      origin = `${proto}://${host}`;
    const data = await storeBootstrap();
    const paths = new Set<string>([
      "/",
      "/shop",
      "/about",
      "/delivery",
      "/returns",
      "/contact",
      "/privacy",
      "/terms",
    ]);
    for (const row of Array.isArray(data.products) ? data.products : []) {
      const slug = String(row.slug || "").trim();
      if (slug) paths.add("/product/" + encodeURIComponent(slug));
    }
    for (const row of Array.isArray(data.categories) ? data.categories : []) {
      const slug = String(row.slug || "").trim(),
        active =
          row.active === true || String(row.active).toLowerCase() === "true";
      if (slug && active) paths.add("/category/" + encodeURIComponent(slug));
    }
    for (const row of Array.isArray(data.collections) ? data.collections : []) {
      const slug = String(row.slug || "").trim(),
        active =
          row.active === true || String(row.active).toLowerCase() === "true";
      if (slug && active) paths.add("/collections/" + encodeURIComponent(slug));
    }
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      [...paths]
        .map(
          (path) =>
            `  <url><loc>${escapeXml(origin + cleanPath(path))}</loc></url>`,
        )
        .join("\n") +
      "\n</urlset>\n";
    res.status(200);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    return res.send(xml);
  } catch {
    res.status(503);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.send(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    );
  }
}
