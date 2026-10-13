import type { VercelRequest,VercelResponse } from "@vercel/node";
import { durableRateLimit } from "../_rate-limit.js";
import { recoverAdminPassword,validAdminPassword,validAdminUsername } from "../_admin-auth.js";
import { authEnv,body,json,methodNotAllowed,validOrigin } from "../_shared.js";

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=="POST")return methodNotAllowed(res,["POST"]);
  try{
    const config=authEnv();
    if(!validOrigin(req,config))return json(res,{error:"Invalid request"},403);
    const throttle=await durableRateLimit(req,"admin-recovery",5,15*60*1000);
    if(throttle.limited){res.setHeader("Retry-After",String(throttle.retryAfter));return json(res,{error:"Too many recovery attempts. Try again later."},429);}
    const input=body(req) as Record<string,unknown>,username=String(input?.username||"").trim(),recoveryCode=String(input?.recoveryCode||""),newPassword=String(input?.newPassword||""),confirmPassword=String(input?.confirmPassword||"");
    if(!validAdminUsername(username)||!recoveryCode||newPassword!==confirmPassword||!validAdminPassword(newPassword))return json(res,{error:"Recovery details could not be verified."},400);
    await recoverAdminPassword(username,recoveryCode,newPassword);
    return json(res,{ok:true,message:"Password reset. You can now sign in with your new password."});
  }catch{return json(res,{error:"Recovery details could not be verified."},400);}
}
