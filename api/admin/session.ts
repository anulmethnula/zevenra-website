import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  authEnv,
  ConfigurationError,
  json,
  methodNotAllowed,
} from "../_shared.js";
import { validAdminSession } from "../_admin-auth.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    return await validAdminSession(req, authEnv().SESSION_SECRET)
      ? json(res, { ok: true })
      : json(res, { error: "Session expired" }, 401);
  } catch (error) {
    return error instanceof ConfigurationError
      ? json(res, { error: "Server configuration unavailable" }, 500)
      : json(res, { error: "Session unavailable" }, 503);
  }
}
