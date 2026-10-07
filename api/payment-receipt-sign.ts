import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cloudinarySignature } from "./_cloudinary-signature.js";
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
    const timestamp = Math.floor(Date.now() / 1000),folder = "zevenra/payment-receipts",type="authenticated";
    const signature=cloudinarySignature({folder,timestamp,type},config.CLOUDINARY_API_SECRET);
    return json(res, {
      timestamp,
      folder,
      type,
      signature,
      apiKey: config.CLOUDINARY_API_KEY,
      cloudName: config.CLOUDINARY_CLOUD_NAME,
      maxBytes: 15_000_000,
      allowed: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"],
    });
  } catch {
    return json(
      res,
      { error: "Receipt upload is temporarily unavailable." },
      503,
    );
  }
}
