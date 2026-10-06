import test from "node:test";
import assert from "node:assert/strict";
import { uploadPaymentReceipt } from "../src/services/paymentReceiptUpload.ts";

const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const signed = { timestamp:1, folder:"zevenra/payment-receipts", deliveryType:"authenticated", signature:"signed", apiKey:"key", cloudName:"cloud", maxBytes:15_000_000, allowed };

function mockFetch() {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify(signed), {status:200})
      : new Response(JSON.stringify({secure_url:"https://res.cloudinary.com/cloud/image/authenticated/receipt"}), {status:200});
  }) as typeof fetch;
  return () => calls;
}

for (const type of allowed) test(`accepts ${type}`, async () => {
  mockFetch();
  const url = await uploadPaymentReceipt(new File(["receipt"], `receipt.${type.split("/")[1]}`, {type}));
  assert.match(url, /cloudinary/);
});

test("rejects unsupported files before upload", async () => {
  const calls = mockFetch();
  await assert.rejects(uploadPaymentReceipt(new File(["receipt"], "receipt.txt", {type:"text/plain"})), /Upload an image or PDF receipt/);
  assert.equal(calls(), 1);
});

test("uses the friendly message above 15 MB", async () => {
  const calls = mockFetch();
  await assert.rejects(uploadPaymentReceipt(new File([new Uint8Array(15_000_001)], "receipt.pdf", {type:"application/pdf"})), {message:"This receipt file is too large. Try a smaller file."});
  assert.equal(calls(), 1);
});
