import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cloudinarySignature } from "../server/api-implementation/_cloudinary-signature.ts";
import { authenticatedReceiptDownloadUrl } from "../server/api-implementation/_receipt-access-url.ts";
import { receiptAsset,verifyReceiptAsset } from "../server/api-implementation/_receipt-asset.ts";
import { uploadPaymentReceipt } from "../src/services/paymentReceiptUpload.ts";

const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
const signed={timestamp:1,folder:"zevenra/payment-receipts",type:"authenticated" as const,signature:"signed",apiKey:"key",cloudName:"cloud",maxBytes:10_000_000,allowed};
const uploaded={secure_url:"https://res.cloudinary.com/cloud/image/authenticated/v1/zevenra/payment-receipts/receipt.jpg",type:"authenticated",resource_type:"image",format:"jpg",bytes:7};

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
test("rejects files above 10 MB before Cloudinary upload",async()=>{const calls=mockFetch();await assert.rejects(uploadPaymentReceipt(new File([new Uint8Array(10_000_001)],"receipt.pdf",{type:"application/pdf"})),{message:"This receipt file is too large. Try a smaller file."});assert.equal(calls.length,1);});
test("maps Cloudinary validation failures to a friendly message",async()=>{mockFetch(new Response(JSON.stringify({error:{message:"Invalid image file"}}),{status:400}));await assert.rejects(uploadPaymentReceipt(new File(["bad"],"receipt.jpg",{type:"image/jpeg"})),{message:"Upload a valid image or PDF receipt."});});
test("maps Cloudinary network rejection without exposing Failed to fetch",async()=>{mockFetch(new TypeError("Failed to fetch"));await assert.rejects(uploadPaymentReceipt(new File(["receipt"],"receipt.pdf",{type:"application/pdf"})),{message:"Receipt upload failed. Please try again."});});
test("rejects a public delivery response",async()=>{mockFetch(new Response(JSON.stringify({secure_url:"https://res.cloudinary.com/cloud/image/upload/receipt.jpg",type:"upload"}),{status:200}));await assert.rejects(uploadPaymentReceipt(new File(["receipt"],"receipt.jpg",{type:"image/jpeg"})),/Receipt upload failed/);});

test("signs the sorted authenticated upload parameters deterministically",()=>{assert.equal(cloudinarySignature({type:"authenticated",timestamp:1700000000,folder:"zevenra/payment-receipts"},"test-secret"),"601f9b6499156a1af0f428cd94e073a140eb2128");});
test("authenticated upload output remains compatible with stored receipt fields",()=>{assert.deepEqual(receiptAsset(uploaded.secure_url,"cloud"),{publicId:"zevenra/payment-receipts/receipt",resourceType:"image",format:"jpg"});});
test("parses signed image authenticated delivery URLs",()=>{assert.deepEqual(receiptAsset("https://res.cloudinary.com/cloud/image/authenticated/s--abc_DEF123--/v123456789/zevenra/payment-receipts/test.png","cloud"),{publicId:"zevenra/payment-receipts/test",resourceType:"image",format:"png"});});
test("parses versioned image authenticated delivery URLs",()=>{assert.deepEqual(receiptAsset("https://res.cloudinary.com/cloud/image/authenticated/v123456789/zevenra/payment-receipts/test.png","cloud"),{publicId:"zevenra/payment-receipts/test",resourceType:"image",format:"png"});});
test("parses signed raw authenticated delivery URLs",()=>{assert.deepEqual(receiptAsset("https://res.cloudinary.com/cloud/raw/authenticated/s--abc123--/v123/zevenra/payment-receipts/test.pdf","cloud"),{publicId:"zevenra/payment-receipts/test",resourceType:"raw",format:"pdf"});});
test("rejects receipt URLs for the wrong cloud",()=>{assert.throws(()=>receiptAsset("https://res.cloudinary.com/other/image/authenticated/v1/zevenra/payment-receipts/test.png","cloud"),/Invalid payment receipt URL/);});
test("rejects public upload delivery URLs",()=>{assert.throws(()=>receiptAsset("https://res.cloudinary.com/cloud/image/upload/v1/zevenra/payment-receipts/test.png","cloud"),/Invalid payment receipt URL/);});
test("rejects receipt URLs outside the protected folder",()=>{assert.throws(()=>receiptAsset("https://res.cloudinary.com/cloud/image/authenticated/v1/other/test.png","cloud"),/Invalid payment receipt URL/);});
test("rejects nested receipt folders",()=>{assert.throws(()=>receiptAsset("https://res.cloudinary.com/cloud/image/authenticated/v1/zevenra/payment-receipts/nested/test.png","cloud"),/Invalid payment receipt URL/);});
test("rejects video and arbitrary raw receipt assets",()=>{assert.throws(()=>receiptAsset("https://res.cloudinary.com/cloud/video/authenticated/v1/zevenra/payment-receipts/test.mp4","cloud"),/Invalid payment receipt URL/);assert.throws(()=>receiptAsset("https://res.cloudinary.com/cloud/raw/authenticated/v1/zevenra/payment-receipts/test.zip","cloud"),/Invalid payment receipt URL/);});
test("rejects malformed signed delivery components",()=>{assert.throws(()=>receiptAsset("https://res.cloudinary.com/cloud/image/authenticated/s--bad!/v1/zevenra/payment-receipts/test.png","cloud"),/Invalid payment receipt URL/);});
test("server metadata verification rejects oversized, mismatched, and unavailable assets",async()=>{const config={CLOUDINARY_CLOUD_NAME:"cloud",CLOUDINARY_API_KEY:"key",CLOUDINARY_API_SECRET:"secret"},url=uploaded.secure_url;const response=(body:unknown,status=200)=>async()=>new Response(JSON.stringify(body),{status});await assert.rejects(verifyReceiptAsset(url,config,response({...uploaded,bytes:10_000_001}) as typeof fetch),/Invalid payment receipt URL/);await assert.rejects(verifyReceiptAsset(url,config,response({...uploaded,format:"png"}) as typeof fetch),/Invalid payment receipt URL/);await assert.rejects(verifyReceiptAsset(url,config,response({},404) as typeof fetch),/Invalid payment receipt URL/);});
test("server metadata verification accepts the exact authenticated receipt",async()=>{const config={CLOUDINARY_CLOUD_NAME:"cloud",CLOUDINARY_API_KEY:"key",CLOUDINARY_API_SECRET:"secret"},request=(async()=>new Response(JSON.stringify(uploaded),{status:200})) as typeof fetch;assert.deepEqual(await verifyReceiptAsset(uploaded.secure_url,config,request),{publicId:"zevenra/payment-receipts/receipt",resourceType:"image",format:"jpg"});});
test("authorized admin access remains an expiring authenticated signed download",()=>{const access=authenticatedReceiptDownloadUrl({payment_receipt_public_id:"zevenra/payment-receipts/receipt",payment_receipt_resource_type:"image",payment_receipt_format:"jpg"},{cloudName:"cloud",apiKey:"key",apiSecret:"test-secret"},1700000000),url=new URL(access.url);assert.equal(url.pathname,"/v1_1/cloud/image/download");assert.equal(url.searchParams.get("type"),"authenticated");assert.equal(url.searchParams.get("public_id"),"zevenra/payment-receipts/receipt");assert.equal(url.searchParams.get("format"),"jpg");assert.ok(url.searchParams.get("signature"));assert.equal(access.expiresAt,1700000300);});
test("receipt signing contract exposes only the four supported formats and 10 MB limit",async()=>{const source=await readFile(new URL("../server/api-implementation/payment-receipt-sign.ts",import.meta.url),"utf8");assert.match(source,/maxBytes: 10_000_000/);assert.match(source,/\["image\/jpeg", "image\/png", "image\/webp", "application\/pdf"\]/);assert.doesNotMatch(source,/image\/heic|image\/heif/);});


test("public receipt configuration does not require the admin session secret", async () => {
  const source = await readFile(new URL("../server/api-implementation/_shared.ts", import.meta.url), "utf8");
  const start = source.indexOf("export function cloudinaryEnv");
  const end = source.indexOf("export function originEnv", start);
  const cloudinaryBlock = source.slice(start, end);
  assert.match(cloudinaryBlock, /\.\.\.originEnv\(\)/);
  assert.doesNotMatch(cloudinaryBlock, /authEnv\(\)/);
});
