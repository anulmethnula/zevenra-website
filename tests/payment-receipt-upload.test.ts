import test from "node:test";
import assert from "node:assert/strict";
import { cloudinarySignature } from "../api/_cloudinary-signature.ts";
import { authenticatedReceiptDownloadUrl } from "../api/_receipt-access-url.ts";
import { receiptAsset } from "../api/_receipt-asset.ts";
import { uploadPaymentReceipt } from "../src/services/paymentReceiptUpload.ts";

const allowed=["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf"];
const signed={timestamp:1,folder:"zevenra/payment-receipts",type:"authenticated" as const,signature:"signed",apiKey:"key",cloudName:"cloud",maxBytes:15_000_000,allowed};
const uploaded={secure_url:"https://res.cloudinary.com/cloud/image/authenticated/v1/zevenra/payment-receipts/receipt.jpg",type:"authenticated"};

function mockFetch(upload:Response|Error=new Response(JSON.stringify(uploaded),{status:200})){
  const calls:Array<{input:RequestInfo|URL;init?:RequestInit}>=[];
  globalThis.fetch=(async(input,init)=>{calls.push({input,init});if(calls.length===1)return new Response(JSON.stringify(signed),{status:200});if(upload instanceof Error)throw upload;return upload;}) as typeof fetch;
  return calls;
}

for(const type of allowed)test(`accepts ${type}`,async()=>{mockFetch();const url=await uploadPaymentReceipt(new File(["receipt"],`receipt.${type.split("/")[1]}`,{type}));assert.equal(url,uploaded.secure_url);});

test("posts the signed authenticated upload contract to /auto/upload",async()=>{
  const calls=mockFetch();await uploadPaymentReceipt(new File(["receipt"],"receipt.jpg",{type:"image/jpeg"}));
  assert.equal(String(calls[1].input),"https://api.cloudinary.com/v1_1/cloud/auto/upload");
  const form=calls[1].init?.body as FormData;
  assert.equal(form.get("type"),"authenticated");assert.equal(form.get("folder"),signed.folder);assert.equal(form.get("timestamp"),"1");assert.equal(form.get("api_key"),"key");assert.equal(form.get("signature"),"signed");assert.ok(form.get("file") instanceof File);
});

test("rejects unsupported files before Cloudinary upload",async()=>{const calls=mockFetch();await assert.rejects(uploadPaymentReceipt(new File(["receipt"],"receipt.txt",{type:"text/plain"})),/Upload an image or PDF receipt/);assert.equal(calls.length,1);});
test("rejects files above 15 MB before Cloudinary upload",async()=>{const calls=mockFetch();await assert.rejects(uploadPaymentReceipt(new File([new Uint8Array(15_000_001)],"receipt.pdf",{type:"application/pdf"})),{message:"This receipt file is too large. Try a smaller file."});assert.equal(calls.length,1);});
test("maps Cloudinary validation failures to a friendly message",async()=>{mockFetch(new Response(JSON.stringify({error:{message:"Invalid image file"}}),{status:400}));await assert.rejects(uploadPaymentReceipt(new File(["bad"],"receipt.jpg",{type:"image/jpeg"})),{message:"Upload a valid image or PDF receipt."});});
test("maps Cloudinary network rejection without exposing Failed to fetch",async()=>{mockFetch(new TypeError("Failed to fetch"));await assert.rejects(uploadPaymentReceipt(new File(["receipt"],"receipt.pdf",{type:"application/pdf"})),{message:"Receipt upload failed. Please try again."});});
test("rejects a public delivery response",async()=>{mockFetch(new Response(JSON.stringify({secure_url:"https://res.cloudinary.com/cloud/image/upload/receipt.jpg",type:"upload"}),{status:200}));await assert.rejects(uploadPaymentReceipt(new File(["receipt"],"receipt.jpg",{type:"image/jpeg"})),/Receipt upload failed/);});

test("signs the sorted authenticated upload parameters deterministically",()=>{assert.equal(cloudinarySignature({type:"authenticated",timestamp:1700000000,folder:"zevenra/payment-receipts"},"test-secret"),"601f9b6499156a1af0f428cd94e073a140eb2128");});
test("authenticated upload output remains compatible with stored receipt fields",()=>{assert.deepEqual(receiptAsset(uploaded.secure_url,"cloud"),{publicId:"zevenra/payment-receipts/receipt",resourceType:"image",format:"jpg"});});
test("authorized admin access remains an expiring authenticated signed download",()=>{const access=authenticatedReceiptDownloadUrl({payment_receipt_public_id:"zevenra/payment-receipts/receipt",payment_receipt_resource_type:"image",payment_receipt_format:"jpg"},{cloudName:"cloud",apiKey:"key",apiSecret:"test-secret"},1700000000),url=new URL(access.url);assert.equal(url.pathname,"/v1_1/cloud/image/download");assert.equal(url.searchParams.get("type"),"authenticated");assert.equal(url.searchParams.get("public_id"),"zevenra/payment-receipts/receipt");assert.equal(url.searchParams.get("format"),"jpg");assert.ok(url.searchParams.get("signature"));assert.equal(access.expiresAt,1700000300);});
