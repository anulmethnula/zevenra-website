import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest } from "@vercel/node";
import { adminCookie, hashAdminPassword, makeSession, validSession, verifyAdminPassword } from "../api/_shared.ts";
import { changeAdminPassword,generateAdminRecoveryCode,getAdminAuth,loginAdmin,recoverAdminPassword,validAdminSession } from "../api/_admin-auth.ts";

type Row={id:string;username:string;password_hash:string;recovery_code_hash:string|null;session_version:number};
class AuthDb{
  row:Row|null=null;
  async query(text:string,values:unknown[]=[]){
    if(text.startsWith("SELECT"))return{rows:this.row?[{...this.row}]:[]};
    if(text.startsWith("INSERT")){if(!this.row)this.row={id:String(values[0]),username:String(values[1]),password_hash:String(values[2]),recovery_code_hash:null,session_version:1};return{rows:this.row?[{...this.row}]:[]};}
    if(!this.row)return{rows:[]};
    if(text.includes("SET password_hash")&&text.includes("recovery_code_hash=$3")){if(this.row.recovery_code_hash!==values[2])return{rows:[]};this.row.password_hash=String(values[1]);this.row.session_version++;return{rows:[{session_version:this.row.session_version}]};}
    if(text.includes("SET password_hash")){if(this.row.password_hash!==values[2])return{rows:[]};this.row.password_hash=String(values[1]);this.row.session_version++;return{rows:[{session_version:this.row.session_version}]};}
    if(text.includes("SET recovery_code_hash")){if(this.row.password_hash!==values[2])return{rows:[]};this.row.recovery_code_hash=String(values[1]);this.row.session_version++;return{rows:[{session_version:this.row.session_version}]};}
    if(text.includes("SET username")){this.row.username=String(values[1]);this.row.session_version++;return{rows:[{session_version:this.row.session_version}]};}
    return{rows:[]};
  }
}

function requestWithCookie(cookie?: string) {
  return { headers: cookie ? { cookie } : {} } as unknown as VercelRequest;
}

test("admin session cookie validates with the correct secret", () => {
  const secret = "test-admin-session-secret";
  const token = makeSession(secret);
  const cookieHeader = adminCookie(token);
  const cookie = cookieHeader.split(";")[0];
  assert.equal(validSession(requestWithCookie(cookie), secret), true);
});

test("admin session rejects missing, tampered, and wrong-secret cookies", () => {
  const secret = "test-admin-session-secret";
  const token = makeSession(secret);
  const cookie = `zevenra_session=${token}`;
  assert.equal(validSession(requestWithCookie(), secret), false);
  assert.equal(validSession(requestWithCookie(`${cookie}x`), secret), false);
  assert.equal(validSession(requestWithCookie(cookie), "different-secret"), false);
});

test("missing and invalid admin cookies are rejected without database access",async()=>{
  const secret="test-admin-session-secret";
  let queries=0;
  const unavailableDb={query:async()=>{queries++;throw new Error("DATABASE_URL is required");}};
  assert.equal(await validAdminSession(requestWithCookie(),secret,unavailableDb),false);
  assert.equal(await validAdminSession(requestWithCookie("zevenra_session=malformed"),secret,unavailableDb),false);
  assert.equal(await validAdminSession(requestWithCookie(`zevenra_session=${makeSession("wrong-secret")}`),secret,unavailableDb),false);
  assert.equal(queries,0);
});

test("valid signed admin cookie checks the database session version",async()=>{
  const secret="test-admin-session-secret",db=new AuthDb();
  db.row={id:"owner",username:"owner",password_hash:"hash",recovery_code_hash:null,session_version:3};
  assert.equal(await validAdminSession(requestWithCookie(`zevenra_session=${makeSession(secret,3)}`),secret,db),true);
  assert.equal(await validAdminSession(requestWithCookie(`zevenra_session=${makeSession(secret,2)}`),secret,db),false);
});

test("admin logout cookie expires immediately", () => {
  const cookie = adminCookie("", 0);
  assert.match(cookie, /zevenra_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
});

test("existing environment login bootstraps database login compatibility",async()=>{const db=new AuthDb(),password="Existing12345",passwordHash=await hashAdminPassword(password);const first=await loginAdmin("owner",password,{username:"owner",passwordHash},db);assert.equal(first?.sessionVersion,1);assert.equal((await loginAdmin("owner",password,{username:"",passwordHash:""},db))?.username,"owner");assert.notEqual((await getAdminAuth(db))?.passwordHash,password);});

test("password change accepts the current password and rejects a wrong one",async()=>{const db=new AuthDb(),password="Current12345";await loginAdmin("owner",password,{username:"owner",passwordHash:await hashAdminPassword(password)},db);await assert.rejects(()=>changeAdminPassword("wrong","Updated12345",db),/CURRENT_PASSWORD_INVALID/);await changeAdminPassword(password,"Updated12345",db);assert.equal(await verifyAdminPassword("Updated12345",db.row!.password_hash),true);assert.equal(await verifyAdminPassword(password,db.row!.password_hash),false);});

test("recovery reset rejects invalid codes and accepts the generated code",async()=>{const db=new AuthDb(),password="Current12345";await loginAdmin("owner",password,{username:"owner",passwordHash:await hashAdminPassword(password)},db);const generated=await generateAdminRecoveryCode(password,db);await assert.rejects(()=>recoverAdminPassword("owner","wrong-code","Recovered12345",db),/RECOVERY_INVALID/);await recoverAdminPassword("owner",generated.recoveryCode,"Recovered12345",db);assert.equal(await verifyAdminPassword("Recovered12345",db.row!.password_hash),true);});

test("regenerating recovery rejects the old code",async()=>{const db=new AuthDb(),password="Current12345";await loginAdmin("owner",password,{username:"owner",passwordHash:await hashAdminPassword(password)},db);const old=await generateAdminRecoveryCode(password,db),next=await generateAdminRecoveryCode(password,db);await assert.rejects(()=>recoverAdminPassword("owner",old.recoveryCode,"Recovered12345",db),/RECOVERY_INVALID/);await recoverAdminPassword("owner",next.recoveryCode,"Recovered12345",db);});

test("password recovery invalidates an older session version",async()=>{const db=new AuthDb(),password="Current12345",secret="session-secret";await loginAdmin("owner",password,{username:"owner",passwordHash:await hashAdminPassword(password)},db);const recovery=await generateAdminRecoveryCode(password,db),oldVersion=db.row!.session_version,oldCookie=`zevenra_session=${makeSession(secret,oldVersion)}`;assert.equal(validSession(requestWithCookie(oldCookie),secret,oldVersion),true);await recoverAdminPassword("owner",recovery.recoveryCode,"Recovered12345",db);assert.equal(validSession(requestWithCookie(oldCookie),secret,db.row!.session_version),false);});

test("credential changes invalidate an older admin cookie",async()=>{const db=new AuthDb(),password="Current12345",secret="session-secret";await loginAdmin("owner",password,{username:"owner",passwordHash:await hashAdminPassword(password)},db);const oldCookie=`zevenra_session=${makeSession(secret,db.row!.session_version)}`;assert.equal(await validAdminSession(requestWithCookie(oldCookie),secret,db),true);await changeAdminPassword(password,"Updated12345",db);assert.equal(await validAdminSession(requestWithCookie(oldCookie),secret,db),false);});
