import type { VercelRequest, VercelResponse } from "@vercel/node";
import { convertPreorderToOrder,createPreorder,getPreorderClaim,quotePreorderClaim } from "./_data/preorders.js";
import {
  body,
  json,
  methodNotAllowed,
  originEnv,
  preorderClaimCheckoutSchema,
  preorderClaimQuoteSchema,
  preorderSchema,
  rateLimit,
  readCustomerSession,
  validOrigin,
} from "./_shared.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action=String(req.query.action||"");
  if (req.method !== "POST"&&req.method!=="GET") return methodNotAllowed(res, ["GET","POST"]);
  if(req.method==="GET"&&action!=="claim")return methodNotAllowed(res,["POST"]);
  const throttle = rateLimit(req, action==="claim"?"preorder-claim":"preorders", action==="claim"?20:6, 10 * 60 * 1000);
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
    if(req.method==="GET"){
      const claim=await getPreorderClaim(String(req.query.token||""));
      return claim?json(res,claim,200,{"Cache-Control":"private, no-store"}):json(res,{error:"This preorder link is invalid or expired."},404,{"Cache-Control":"private, no-store"});
    }
    if (!validOrigin(req, originEnv()))
      return json(res, { error: "Invalid request origin" }, 403);
    if(action==="checkout"){
      const order=await convertPreorderToOrder(preorderClaimCheckoutSchema.parse(body(req)));
      return json(res,order,201,{"Cache-Control":"private, no-store"});
    }
    if(action==="quote")return json(res,await quotePreorderClaim(preorderClaimQuoteSchema.parse(body(req))),200,{"Cache-Control":"private, no-store"});
    if(action)return json(res,{error:"Invalid request"},400);
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
    if(action==="checkout"||action==="quote"){
      if(error instanceof Error&&error.name==="ZodError")return json(res,{error:"Please review your checkout details."},400);
      if(/claim unavailable|not found/i.test(message))return json(res,{error:"This preorder link is invalid or expired."},409);
      console.error("preorder checkout failed",error);
      return json(res,{error:"We could not complete this preorder. Please try again."},400);
    }
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
