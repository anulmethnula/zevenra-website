import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import {
  cloudinaryEnv,
  json,
  methodNotAllowed,
  rateLimit,
  validOrigin,
} from "./_shared.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const throttle = rateLimit(req, "receipt-sign", 10, 10 * 60 * 1000);
  if (throttle.limited) {
    res.setHeader("Retry-After", String(throttle.retryAfter));
    return json(
      res,
      { error: "Too many receipt upload attempts. Please wait and try again." },
      429,
    );
  }
  try {
    const config = cloudinaryEnv();
    if (!req.headers.origin || !validOrigin(req, config))
      return json(res, { error: "Invalid request origin" }, 403);
    const timestamp = Math.floor(Date.now() / 1000),
      folder = "zevenra/payment-receipts";
    const signature = createHash("sha1")
      .update(
        `folder=${folder}&timestamp=${timestamp}${config.CLOUDINARY_API_SECRET}`,
      )
      .digest("hex");
    return json(res, {
      timestamp,
      folder,
      deliveryType: "authenticated",
      signature,
      apiKey: config.CLOUDINARY_API_KEY,
      cloudName: config.CLOUDINARY_CLOUD_NAME,
      maxBytes: 8_000_000,
      allowed: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });
  } catch {
    return json(
      res,
      { error: "Receipt upload is temporarily unavailable." },
      503,
    );
  }
}
