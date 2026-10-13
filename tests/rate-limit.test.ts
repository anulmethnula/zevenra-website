import test from "node:test";
import assert from "node:assert/strict";
import { durableRateLimit,requestClientKey,type RateLimitQuery } from "../server/api-implementation/_rate-limit.ts";

const request=(ip="203.0.113.10")=>({headers:{"x-forwarded-for":ip},socket:{remoteAddress:"127.0.0.1"}} as never);
test("client keys use the first platform forwarded address",()=>assert.equal(requestClientKey(request("203.0.113.10, 10.0.0.1")),"203.0.113.10"));
test("durable limiter reports shared database counts and retry-after",async()=>{let count=0;const run:RateLimitQuery=async()=>({rows:[{count:++count,reset_at:new Date(Date.now()+60_000).toISOString()}]});assert.deepEqual(await durableRateLimit(request(),"login",2,60_000,run),{limited:false,retryAfter:0});assert.deepEqual(await durableRateLimit(request(),"login",2,60_000,run),{limited:false,retryAfter:0});const blocked=await durableRateLimit(request(),"login",2,60_000,run);assert.equal(blocked.limited,true);assert.ok(blocked.retryAfter>0&&blocked.retryAfter<=60);});
test("limiter stores only a hash of scope and client address",async()=>{let values:unknown[]=[];const run:RateLimitQuery=async(_sql,input)=>{values=input;return{rows:[{count:1,reset_at:new Date().toISOString()}]};};await durableRateLimit(request(),"orders",10,60_000,run);assert.match(String(values[0]),/^[a-f0-9]{64}$/);assert.equal(String(values[0]).includes("203.0.113.10"),false);});
