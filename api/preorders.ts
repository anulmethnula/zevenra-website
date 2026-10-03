import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPreorder } from "./_data/preorders.js";
import {
  body,
  json,
  methodNotAllowed,
  originEnv,
  preorderSchema,
  rateLimit,
  readCustomerSession,
  validOrigin,
} from "./_shared.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const throttle = rateLimit(req, "preorders", 6, 10 * 60 * 1000);
  if (throttle.limited) {
    res.setHeader("Retry-After", String(throttle.retryAfter));
    return json(
      res,
      {
        error:
          "Too many pre-order requests. Please wait a few minutes and try again.",
      },
      429,
    );
  }
  try {
    if (!validOrigin(req, originEnv()))
      return json(res, { error: "Invalid request origin" }, 403);
    const payload = preorderSchema.parse(body(req)),
      identity = readCustomerSession(req),
      created = await createPreorder({
        ...payload,
        phone: payload.phone?.trim() || payload.whatsapp,
        address1: payload.address1 || "",
        address2: payload.address2 || "",
        district: payload.district || "",
        postalCode: payload.postalCode || "",
        customerId: identity?.id,
        email: identity?.email || payload.email,
      });
    return json(res, created, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("CUSTOMER_AUTH_"))
      return json(
        res,
        { error: "Your customer session is invalid. Please sign in again." },
        401,
      );
    if (error instanceof Error && error.name === "ZodError")
      return json(
        res,
        { error: "Please review the preorder information." },
        400,
      );
    if (/already have an active/i.test(message))
      return json(res, { error: message }, 409);
    if (/unavailable/i.test(message))
      return json(
        res,
        { error: "This option is not available for preorder right now." },
        409,
      );
    return json(
      res,
      { error: "We could not submit the preorder request. Please try again." },
      400,
    );
  }
}
