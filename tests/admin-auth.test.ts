import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest } from "@vercel/node";
import { adminCookie, makeSession, validSession } from "../api/_shared.ts";

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

test("admin logout cookie expires immediately", () => {
  const cookie = adminCookie("", 0);
  assert.match(cookie, /zevenra_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
});
