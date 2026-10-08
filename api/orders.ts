import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOrder } from "./_data/orders.js";
import {
  body,
  json,
  methodNotAllowed,
  orderSchema,
  originEnv,
  rateLimit,
  readCustomerSession,
  validOrigin,
} from "./_shared.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const throttle = rateLimit(req, "orders", 10, 10 * 60 * 1000);
  if (throttle.limited) {
    res.setHeader("Retry-After", String(throttle.retryAfter));
    return json(
      res,
      {
        error:
          "Too many order attempts. Please wait a few minutes and try again.",
      },
      429,
    );
  }
  try {
    if (!validOrigin(req, originEnv()))
      return json(res, { error: "Invalid request origin" }, 403);
    const payload = orderSchema.parse(body(req)),
      identity = readCustomerSession(req),
      order = await createOrder({
        ...payload,
        customerId: identity?.id,
        email: identity?.email || payload.email,
      });
    return json(res, order, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("CUSTOMER_AUTH_"))
      return json(
        res,
        { error: "Your customer session is invalid. Please sign in again." },
        401,
      );
    if (error instanceof Error && error.name === "ZodError")
      return json(res, { error: "Please review your order information." }, 400);
    if (/already submitted/i.test(message))
      return json(
        res,
        {
          error:
            "This order appears to have already been submitted. Check your confirmation or My Orders before trying again.",
        },
        409,
      );
    if (/no longer available|insufficient stock/i.test(message))
      return json(
        res,
        {
          error:
            "One or more selected items are no longer available in that quantity. Please review your bag.",
        },
        409,
      );
    if (/temporarily unavailable|not configured/i.test(message))
      return json(
        res,
        { error: "Online ordering is temporarily unavailable." },
        503,
      );
    console.error("order creation failed", error);
    return json(
      res,
      { error: "We could not place the order. Your bag has not been cleared." },
      500,
    );
  }
}
