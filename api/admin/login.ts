import type { VercelRequest, VercelResponse } from "@vercel/node";
import { durableRateLimit } from "../_rate-limit.js";
import {
  adminCookie,
  adminLoginSchema,
  authEnv,
  body,
  ConfigurationError,
  json,
  makeSession,
  methodNotAllowed,
  validOrigin,
  verifyAdminPassword,
} from "../_shared.js";
import { loginAdmin } from "../_admin-auth.js";

const WINDOW_MS = 15 * 60 * 1000,
  MAX_ATTEMPTS = 5;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const config = authEnv();
    if (!validOrigin(req, config))
      return json(res, { error: "Invalid request" }, 403);
    const throttle=await durableRateLimit(req,"admin-login",MAX_ATTEMPTS,WINDOW_MS);
    if (throttle.limited) {
      res.setHeader("Retry-After", String(throttle.retryAfter));
      return json(
        res,
        { error: "Too many login attempts. Try again later." },
        429,
      );
    }
    const parsed = adminLoginSchema.safeParse(body(req));
    if (!parsed.success) {
      return json(res, { error: "Invalid credentials" }, 401);
    }
    const credentials = parsed.data;
    let credential;
    try{credential=await loginAdmin(credentials.username,credentials.password,{username:config.ADMIN_USERNAME,passwordHash:config.ADMIN_PASSWORD_HASH});}
    catch(error){
      const missingTable=error&&typeof error==="object"&&"code" in error&&(error as {code?:unknown}).code==="42P01";
      if(!missingTable)throw error;
      const matches=credentials.username===config.ADMIN_USERNAME&&await verifyAdminPassword(credentials.password,config.ADMIN_PASSWORD_HASH);
      if(matches)credential={sessionVersion:0};
    }
    if (!credential) {
      return json(res, { error: "Invalid credentials" }, 401);
    }
    return json(res, { ok: true }, 200, {
      "Set-Cookie": adminCookie(makeSession(config.SESSION_SECRET,credential.sessionVersion)),
    });
  } catch (error) {
    return error instanceof ConfigurationError
      ? json(res, { error: "Server configuration unavailable" }, 500)
      : json(res, { error: "Authentication service unavailable" }, 500);
  }
}
