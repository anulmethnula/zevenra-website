import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticatedReceiptDownloadUrl } from "./_receipt-access-url.js";
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
    const access=authenticatedReceiptDownloadUrl(asset,{cloudName:config.CLOUDINARY_CLOUD_NAME,apiKey:config.CLOUDINARY_API_KEY,apiSecret:config.CLOUDINARY_API_SECRET},Math.floor(Date.now()/1000));
    return json(res, access);
  } catch {
    return json(res, { error: "Receipt access is unavailable." }, 400);
  }
}
