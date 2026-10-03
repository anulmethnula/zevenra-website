import type {VercelRequest,VercelResponse} from '@vercel/node';
import{adminCookie,adminLoginSchema,authEnv,body,ConfigurationError,json,makeSession,methodNotAllowed,sha256,validOrigin}from'../_shared.js';

const attempts=new Map<string,{count:number;resetAt:number}>();
const WINDOW_MS=15*60*1000,MAX_ATTEMPTS=5;
function clientKey(req:VercelRequest){const forwarded=req.headers['x-forwarded-for'];return String(Array.isArray(forwarded)?forwarded[0]:forwarded||req.headers['x-real-ip']||'unknown').split(',')[0].trim()}
function blocked(key:string){const now=Date.now(),entry=attempts.get(key);if(!entry)return false;if(entry.resetAt<=now){attempts.delete(key);return false}return entry.count>=MAX_ATTEMPTS}
function fail(key:string){const now=Date.now(),entry=attempts.get(key);if(!entry||entry.resetAt<=now)attempts.set(key,{count:1,resetAt:now+WINDOW_MS});else attempts.set(key,{...entry,count:entry.count+1})}

export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return methodNotAllowed(res,['POST']);
 try{
  const config=authEnv();if(!validOrigin(req,config))return json(res,{error:'Invalid request'},403);
  const key=clientKey(req);if(blocked(key)){res.setHeader('Retry-After','900');return json(res,{error:'Too many login attempts. Try again later.'},429)}
  const parsed=adminLoginSchema.safeParse(body(req));if(!parsed.success){fail(key);return json(res,{error:'Invalid credentials'},401)}
  const credentials=parsed.data,usernameMatch=credentials.username===config.ADMIN_USERNAME,passwordHashMatch=await sha256(credentials.password)===config.ADMIN_PASSWORD_HASH;
  if(!usernameMatch||!passwordHashMatch){fail(key);return json(res,{error:'Invalid credentials'},401)}
  attempts.delete(key);return json(res,{ok:true},200,{'Set-Cookie':adminCookie(makeSession(config.SESSION_SECRET))})
 }catch(error){return error instanceof ConfigurationError?json(res,{error:'Server configuration unavailable'},500):json(res,{error:'Authentication service unavailable'},500)}
}
