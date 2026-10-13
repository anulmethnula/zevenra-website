import { randomBytes } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { query } from "./_db.js";
import { hashAdminPassword, validSession, verifyAdminPassword } from "./_shared.js";

export type AdminAuthRecord={id:string;username:string;passwordHash:string;recoveryCodeHash:string;sessionVersion:number};
type Runner={query:(text:string,values?:unknown[])=>Promise<{rows:Array<Record<string,unknown>>}>};
const defaultRunner:Runner={query:async(text,values=[])=>query(text,values)};

function record(row:Record<string,unknown>):AdminAuthRecord{return{id:String(row.id),username:String(row.username),passwordHash:String(row.password_hash),recoveryCodeHash:String(row.recovery_code_hash||""),sessionVersion:Number(row.session_version)}}
export function validAdminUsername(value:string){return /^[A-Za-z0-9._-]{3,50}$/.test(value);}
export function validAdminPassword(value:string){return value.length>=10&&value.length<=200&&/[A-Za-z]/.test(value)&&/\d/.test(value);}

export async function getAdminAuth(run:Runner=defaultRunner):Promise<AdminAuthRecord|null>{
  const result=await run.query("SELECT id,username,password_hash,recovery_code_hash,session_version FROM admin_auth ORDER BY created_at LIMIT 1");
  return result.rows[0]?record(result.rows[0] as Record<string,unknown>):null;
}

export async function validAdminSession(request:VercelRequest,secret:string,run:Runner=defaultRunner){
  try{return validSession(request,secret,(await getAdminAuth(run))?.sessionVersion??0);}
  catch(error){if(error&&typeof error==="object"&&"code" in error&&(error as {code?:unknown}).code==="42P01")return validSession(request,secret,0);throw error;}
}

export async function loginAdmin(username:string,password:string,bootstrap:{username:string;passwordHash:string},run:Runner=defaultRunner){
  const existing=await getAdminAuth(run);
  if(existing)return existing.username===username&&await verifyAdminPassword(password,existing.passwordHash)?existing:null;
  if(!bootstrap.username||!bootstrap.passwordHash||username!==bootstrap.username||!await verifyAdminPassword(password,bootstrap.passwordHash))return null;
  const passwordHash=await hashAdminPassword(password),id="owner";
  const inserted=await run.query("INSERT INTO admin_auth(id,username,password_hash,session_version) VALUES($1,$2,$3,1) ON CONFLICT DO NOTHING RETURNING id,username,password_hash,recovery_code_hash,session_version",[id,username,passwordHash]);
  return inserted.rows[0]?record(inserted.rows[0] as Record<string,unknown>):getAdminAuth(run);
}

export async function changeAdminPassword(currentPassword:string,newPassword:string,run:Runner=defaultRunner){
  if(!validAdminPassword(newPassword))throw new Error("PASSWORD_INVALID");
  const current=await getAdminAuth(run);
  if(!current||!await verifyAdminPassword(currentPassword,current.passwordHash))throw new Error("CURRENT_PASSWORD_INVALID");
  const passwordHash=await hashAdminPassword(newPassword),result=await run.query("UPDATE admin_auth SET password_hash=$2,session_version=session_version+1,updated_at=now() WHERE id=$1 AND password_hash=$3 RETURNING session_version",[current.id,passwordHash,current.passwordHash]);
  if(!result.rows[0])throw new Error("CURRENT_PASSWORD_INVALID");
  return Number(result.rows[0].session_version);
}

export async function changeAdminUsername(currentPassword:string,newUsername:string,run:Runner=defaultRunner){
  if(!validAdminUsername(newUsername))throw new Error("USERNAME_INVALID");
  const current=await getAdminAuth(run);
  if(!current||!await verifyAdminPassword(currentPassword,current.passwordHash))throw new Error("CURRENT_PASSWORD_INVALID");
  const result=await run.query("UPDATE admin_auth SET username=$2,session_version=session_version+1,updated_at=now() WHERE id=$1 AND password_hash=$3 RETURNING session_version",[current.id,newUsername,current.passwordHash]);
  if(!result.rows[0])throw new Error("CURRENT_PASSWORD_INVALID");
  return Number(result.rows[0].session_version);
}

export async function generateAdminRecoveryCode(currentPassword:string,run:Runner=defaultRunner){
  const current=await getAdminAuth(run);
  if(!current||!await verifyAdminPassword(currentPassword,current.passwordHash))throw new Error("CURRENT_PASSWORD_INVALID");
  const recoveryCode=randomBytes(24).toString("base64url"),recoveryCodeHash=await hashAdminPassword(recoveryCode),result=await run.query("UPDATE admin_auth SET recovery_code_hash=$2,session_version=session_version+1,updated_at=now() WHERE id=$1 AND password_hash=$3 RETURNING session_version",[current.id,recoveryCodeHash,current.passwordHash]);
  if(!result.rows[0])throw new Error("CURRENT_PASSWORD_INVALID");
  return{recoveryCode,sessionVersion:Number(result.rows[0].session_version)};
}

export async function recoverAdminPassword(username:string,recoveryCode:string,newPassword:string,run:Runner=defaultRunner){
  if(!validAdminPassword(newPassword))throw new Error("PASSWORD_INVALID");
  const current=await getAdminAuth(run);
  if(!current||current.username!==username||!current.recoveryCodeHash||!await verifyAdminPassword(recoveryCode,current.recoveryCodeHash))throw new Error("RECOVERY_INVALID");
  const passwordHash=await hashAdminPassword(newPassword),result=await run.query("UPDATE admin_auth SET password_hash=$2,session_version=session_version+1,updated_at=now() WHERE id=$1 AND recovery_code_hash=$3 RETURNING session_version",[current.id,passwordHash,current.recoveryCodeHash]);
  if(!result.rows[0])throw new Error("RECOVERY_INVALID");
  return Number(result.rows[0].session_version);
}
