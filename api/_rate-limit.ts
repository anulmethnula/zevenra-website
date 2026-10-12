import { createHash } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { query } from "./_db.js";

export type RateLimitResult={limited:boolean;retryAfter:number};
export type RateLimitQuery=(text:string,values:unknown[])=>Promise<{rows:Array<{count:unknown;reset_at:unknown}>}>;
const developmentBuckets=new Map<string,{count:number;resetAt:number}>();

export function requestClientKey(request:Pick<VercelRequest,"headers"|"socket">){
  const forwarded=request.headers["x-forwarded-for"],value=Array.isArray(forwarded)?forwarded[0]:forwarded||request.headers["x-real-ip"]||request.socket?.remoteAddress||"unknown";
  return String(value).split(",")[0].trim();
}

export async function durableRateLimit(request:Pick<VercelRequest,"headers"|"socket">,scope:string,limit:number,windowMs:number,run:RateLimitQuery=query):Promise<RateLimitResult>{
  const key=createHash("sha256").update(`${scope}:${requestClientKey(request)}`).digest("hex"),seconds=Math.max(1,Math.ceil(windowMs/1000));
  if(run===query&&!process.env.DATABASE_URL&&process.env.NODE_ENV!=="production"){
    const now=Date.now(),current=developmentBuckets.get(key);
    if(!current||current.resetAt<=now){developmentBuckets.set(key,{count:1,resetAt:now+windowMs});return{limited:false,retryAfter:0};}
    current.count+=1;return{limited:current.count>limit,retryAfter:current.count>limit?Math.max(1,Math.ceil((current.resetAt-now)/1000)):0};
  }
  const result=await run(`INSERT INTO request_rate_limits(key,count,reset_at) VALUES($1,1,now()+($2::text||' seconds')::interval)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_rate_limits.reset_at<=now() THEN 1 ELSE request_rate_limits.count+1 END,
      reset_at=CASE WHEN request_rate_limits.reset_at<=now() THEN now()+($2::text||' seconds')::interval ELSE request_rate_limits.reset_at END
    RETURNING count,reset_at`,[key,seconds]);
  const row=result.rows[0],count=Number(row?.count)||1,resetAt=new Date(String(row?.reset_at)).getTime();
  return{limited:count>limit,retryAfter:count>limit?Math.max(1,Math.ceil((resetAt-Date.now())/1000)):0};
}
