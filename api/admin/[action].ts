import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "../../server/api-implementation/admin/[action].js";
import cloudinarySign from "../../server/api-implementation/admin/cloudinary-sign.js";
import login from "../../server/api-implementation/admin/login.js";
import logout from "../../server/api-implementation/admin/logout.js";
import recover from "../../server/api-implementation/admin/recover.js";
import session from "../../server/api-implementation/admin/session.js";

const dedicated = { login, logout, recover, session, "cloudinary-sign": cloudinarySign } as const;

export default function handler(request: VercelRequest, response: VercelResponse) {
  const action = String(request.query.action || "");
  const selected = dedicated[action as keyof typeof dedicated];
  return selected ? selected(request, response) : admin(request, response);
}
