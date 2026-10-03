import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import { receiptForOrder } from "./_data/orders.js";
import {
  body,
  cloudinaryEnv,
  json,
  methodNotAllowed,
  validOrigin,
  validSession,
} from "./_shared.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const config = cloudinaryEnv();
    if (!validSession(req, config.SESSION_SECRET))
      return json(res, { error: "Session expired" }, 401);
    if (!validOrigin(req, config))
      return json(res, { error: "Invalid request origin" }, 403);
    const input = body(req) as { url?: unknown },
      reference = String(input?.url || "");
    if (!reference.startsWith("order:"))
      return json(res, { error: "Receipt reference is required." }, 400);
    const asset = await receiptForOrder(reference.slice(6));
    if (!asset?.payment_receipt_public_id)
      return json(res, { error: "Receipt not found." }, 404);
    const timestamp = Math.floor(Date.now() / 1000),
      expiresAt = timestamp + 300;
    const params: Record<string, string | number> = {
      expires_at: expiresAt,
      public_id: asset.payment_receipt_public_id,
      timestamp,
      type: "authenticated",
    };
    if (asset.payment_receipt_format)
      params.format = asset.payment_receipt_format;
    const serialized = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const signature = createHash("sha1")
      .update(serialized + config.CLOUDINARY_API_SECRET)
      .digest("hex");
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) =>
      query.set(key, String(value)),
    );
    query.set("signature", signature);
    query.set("api_key", config.CLOUDINARY_API_KEY);
    const signedUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.CLOUDINARY_CLOUD_NAME)}/${asset.payment_receipt_resource_type || "image"}/download?${query.toString()}`;
    return json(res, { url: signedUrl, expiresAt });
  } catch {
    return json(res, { error: "Receipt access is unavailable." }, 400);
  }
}
