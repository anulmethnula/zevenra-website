import { createHmac } from "node:crypto";
import { spawn,spawnSync } from "node:child_process";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright";

const connectionString=process.env.E2E_DATABASE_URL;
if(!connectionString)throw new Error("E2E_DATABASE_URL is required. Refusing to use DATABASE_URL for destructive E2E testing.");
const localEnv=await readFile(".env.local","utf8").catch(()=>""),localValue=name=>{const line=localEnv.split(/\r?\n/).find(item=>item.startsWith(`${name}=`));return line?line.slice(name.length+1).trim().replace(/^(['"])(.*)\1$/,"$2"):"";},sessionSecret=localValue("SESSION_SECRET")||"e2e-session-secret",cloudName=localValue("CLOUDINARY_CLOUD_NAME")||"e2e-cloud";
const sql=neon(connectionString,{fullResults:true}),baseURL="http://localhost:3000",prefix="e2e-checkout-",productId=`${prefix}product`,variantId=`${prefix}variant`,categoryId=`${prefix}category`,pickupId=`${prefix}pickup`,slug=`${prefix}product`,settingsKeys=["brandName","storeOpen","ordersEnabled","codEnabled","bankEnabled","bankTransferEnabled","bankName","bankAccountName","bankAccountNumber","bankBranch","bankInstructions","packagingWeightGrams"],createdOrders=[];
let browser,server,previousSettings=[],previousMethods=[];
const query=(text,values=[])=>sql.query(text,values);
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function adminSession(secret){const payload=Buffer.from(JSON.stringify({sub:"owner",exp:Date.now()+3_600_000})).toString("base64url");return `${payload}.${createHmac("sha256",secret).update(payload).digest("base64url")}`;}
async function cleanup(){
  await query("DELETE FROM audit_logs WHERE entity_id LIKE $1",[`${prefix}%`]);
  await query("DELETE FROM orders WHERE order_id = ANY($1::text[]) OR order_id IN (SELECT order_id FROM order_items WHERE product_id=$2)",[createdOrders,productId]);
  await query("DELETE FROM products WHERE id=$1",[productId]);
  await query("DELETE FROM categories WHERE id=$1",[categoryId]);
  await query("DELETE FROM pickup_locations WHERE id=$1",[pickupId]);
  if(previousMethods.length)for(const row of previousMethods)await query("UPDATE delivery_methods SET display_name=$2,active=$3,fee=$4,minimum_delivery_days=$5,maximum_delivery_days=$6,sort_order=$7,updated_at=now() WHERE type=$1",[row.type,row.display_name,row.active,row.fee,row.minimum_delivery_days,row.maximum_delivery_days,row.sort_order]);
  await query("DELETE FROM site_settings WHERE key=ANY($1::text[])",[settingsKeys]);
  for(const row of previousSettings)await query("INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2::jsonb,$3)",[row.key,JSON.stringify(row.value),row.updated_at]);
}
async function seed(){
  await query("DELETE FROM audit_logs WHERE entity_id LIKE $1",[`${prefix}%`]);
  await query("DELETE FROM orders WHERE order_id IN (SELECT order_id FROM order_items WHERE product_id=$1)",[productId]);
  await query("DELETE FROM products WHERE id=$1",[productId]);
  await query("DELETE FROM categories WHERE id=$1",[categoryId]);
  await query("DELETE FROM pickup_locations WHERE id=$1",[pickupId]);
  previousSettings=(await query("SELECT key,value,updated_at FROM site_settings WHERE key=ANY($1::text[])",[settingsKeys])).rows;
  previousMethods=(await query("SELECT type,display_name,active,fee,minimum_delivery_days,maximum_delivery_days,sort_order FROM delivery_methods ORDER BY type")).rows;
  await query("INSERT INTO categories(id,name,slug,description,active,default_shipping_weight_grams) VALUES($1,'E2E Test','e2e-test','Browser-only fixture',true,250)",[categoryId]);
  await query("INSERT INTO products(id,slug,name,short_description,description,price,category_id,media,status,shipping_weight_grams) VALUES($1,$2,'E2E Checkout Piece','Test-only checkout product','Removed after E2E',6500,$3,$4::jsonb,'draft',250)",[productId,slug,categoryId,JSON.stringify([{type:"image",url:"/brand/og-image.jpg",alt:"E2E Checkout Piece"}])]);
  await query("INSERT INTO variants(id,product_id,sku,color,size,stock,active) VALUES($1,$2,$3,'Black','M',10,true)",[variantId,productId,`${prefix}sku`]);
  await query("UPDATE products SET status='published' WHERE id=$1",[productId]);
  await query("UPDATE delivery_methods SET active=false,updated_at=now()");
  await query("UPDATE delivery_methods SET display_name='E2E Flat Delivery',active=true,fee=350,minimum_delivery_days=2,maximum_delivery_days=4,sort_order=1,updated_at=now() WHERE type='flat'");
  await query("UPDATE delivery_methods SET display_name='E2E Pickup',active=true,fee=0,minimum_delivery_days=1,maximum_delivery_days=1,sort_order=2,updated_at=now() WHERE type='pickup'");
  await query("INSERT INTO pickup_locations(id,name,address,instructions,active,sort_order) VALUES($1,'E2E Test Branch','1 Test Lane, Colombo','Bring the order ID.',true,1)",[pickupId]);
  const settings={brandName:"ZEVENRA E2E",storeOpen:true,ordersEnabled:true,codEnabled:true,bankEnabled:true,bankTransferEnabled:true,bankName:"E2E Bank",bankAccountName:"ZEVENRA Test",bankAccountNumber:"0000000000",bankBranch:"Test Branch",bankInstructions:"Test transfer only.",packagingWeightGrams:50};
  for(const [key,value] of Object.entries(settings))await query("INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",[key,JSON.stringify(value)]);
}
async function waitForServer(){for(let attempt=0;attempt<60;attempt++){try{const response=await fetch(`${baseURL}/api/products?page=1&pageSize=1`);if(response.ok)return;}catch{}await delay(500);}throw new Error("Local application server did not become ready.");}
function cart(){return [{productId,variantId,slug,name:"E2E Checkout Piece",image:"/brand/og-image.jpg",color:"Black",size:"M",quantity:1,unitPrice:6500,sku:`${prefix}sku`,maxStock:10}];}
async function checkout({payment,fulfillment,phone}){
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addInitScript(items=>localStorage.setItem("zevenra-cart-v1",JSON.stringify(items)),cart());
  if(payment==="bank"){
    await context.route("**/api/payment-receipt-sign",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({timestamp:1,folder:"zevenra/payment-receipts",type:"authenticated",signature:"e2e",apiKey:"e2e",cloudName,maxBytes:5_000_000,allowed:["image/png"]})}));
    await context.route("https://api.cloudinary.com/**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({secure_url:`https://res.cloudinary.com/${cloudName}/image/authenticated/v1/zevenra/payment-receipts/e2e-receipt.png`,type:"authenticated"})}));
  }
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`${baseURL}/checkout`,{waitUntil:"domcontentloaded"});await page.getByRole("heading",{name:"Checkout",exact:true}).waitFor();
  await page.locator('[name="customerName"]').fill("Browser Customer");await page.locator('[name="phone"]').fill(phone);await page.locator('[name="email"]').fill("browser@example.com");
  if(fulfillment==="pickup"){
    await page.locator("label").filter({hasText:"E2E Pickup"}).first().click();await page.locator("select").filter({has:page.locator(`option[value="${pickupId}"]`)}).first().selectOption(pickupId);
  }else{
    await page.locator("label").filter({hasText:"E2E Flat Delivery"}).first().click();await page.locator('[name="address1"]').first().fill("1 Browser Test Lane");await page.locator('[name="city"]').first().fill("Colombo");await page.locator('[name="district"]').first().selectOption("Colombo");await page.locator('[name="postalCode"]').first().fill("00100");
  }
  if(payment==="bank"){
    await page.getByText("Bank Transfer",{exact:true}).click();await page.locator('[name="paymentReference"]').fill("E2E-TRANSFER");await page.locator('input[type="file"]').setInputFiles({name:"receipt.png",mimeType:"image/png",buffer:Buffer.from("e2e receipt")});await page.getByText("Receipt uploaded",{exact:true}).waitFor();
  }
  const button=page.getByRole("button",{name:"PLACE ORDER"});await button.waitFor();await button.waitFor({state:"visible"});await page.waitForFunction(()=>{const button=[...document.querySelectorAll("button")].find(item=>item.textContent?.trim()==="PLACE ORDER");return button&&!button.disabled;});
  const responsePromise=page.waitForResponse(response=>response.url().endsWith("/api/orders")&&response.request().method()==="POST",{timeout:15_000});await button.click();let response;try{response=await responsePromise;}catch(error){const alerts=await page.locator('[role="alert"]').allTextContents(),values=await page.locator("form").evaluate(form=>Object.fromEntries(new FormData(form)));throw new Error(`Checkout did not submit. alerts=${JSON.stringify(alerts)} values=${JSON.stringify(values)} pageErrors=${JSON.stringify(errors)} cause=${error.message}`);}const result=await response.json();assert(response.ok(),`Checkout failed: ${JSON.stringify(result)} payload=${response.request().postData()}`);createdOrders.push(result.orderId);await page.getByText("Order submitted successfully",{exact:true}).waitFor();assert(errors.length===0,`Browser errors: ${errors.join("; ")}`);await context.close();return result;
}
async function advanceLifecycle(orderId,paymentMethod){
  const context=await browser.newContext();await context.addCookies([{name:"zevenra_session",value:adminSession(sessionSecret),url:baseURL,httpOnly:true,sameSite:"Strict"}]);const page=await context.newPage();await page.goto(`${baseURL}/admin/orders`,{waitUntil:"domcontentloaded"});await page.waitForTimeout(1_000);assert(!page.url().includes("/admin/login"),"Admin browser session was rejected");
  const update=async payload=>{let response;for(let attempt=0;attempt<3;attempt++){response=await page.evaluate(async({orderId,payload})=>{const result=await fetch("/api/admin/updateOrder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId,...payload})});return {status:result.status,body:await result.json()};},{orderId,payload});if(response.status===200)return response.body;if(response.status<500)break;await delay(750*(attempt+1));}throw new Error(`Lifecycle update failed: ${JSON.stringify(response?.body)}`);};
  if(paymentMethod==="bank")await update({paymentStatus:"verified"});await update({orderStatus:"confirmed"});await update({orderStatus:"packed"});await update({orderStatus:"shipped",fulfilmentCourierName:"E2E Courier",trackingNumber:`TRACK-${orderId}`});const delivered=await update({orderStatus:"delivered"});assert(delivered.orderStatus==="delivered","Order did not reach delivered");assert(String(delivered.paymentStatus).toLowerCase()==="paid"||paymentMethod==="bank","COD was not marked paid on delivery");await context.close();
}

try{
  await seed();console.log("seeded test-only fixtures");
  const childEnv={...process.env,E2E_DATABASE_URL:connectionString,SESSION_SECRET:sessionSecret,ADMIN_USERNAME:"e2e-admin",ADMIN_PASSWORD_HASH:"e2e-unused",ALLOWED_ORIGIN:baseURL,CLOUDINARY_CLOUD_NAME:cloudName,PUBLIC_SITE_URL:baseURL,VERCEL_ENV:"development",CI:"1"};delete childEnv.DATABASE_URL;delete childEnv.DATABASE_URL_UNPOOLED;
  server=process.platform==="win32"
    ?spawn(process.execPath,[path.join(process.env.APPDATA,"npm","node_modules","vercel","dist","vc.js"),"dev","--local-config","vercel.local.json","--listen","3000"],{env:childEnv,stdio:["ignore","pipe","pipe"]})
    :spawn("vercel",["dev","--local-config","vercel.local.json","--listen","3000"],{env:childEnv,stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",data=>process.stdout.write(data));server.stderr.on("data",data=>process.stderr.write(data));await waitForServer();
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const metadata=await (await fetch(`${baseURL}/product/${slug}`)).text();assert(metadata.includes("E2E Checkout Piece — ZEVENRA")&&metadata.includes('og:type" content="product"')&&metadata.includes("schema.org/InStock"),"Non-JS product metadata is incomplete");console.log("verified non-JS product metadata");
  const cod=await checkout({payment:"cod",fulfillment:"flat",phone:"0771111111"});assert(cod.fulfillmentMethod==="flat"&&cod.paymentMethod==="cod","COD/flat snapshots are incorrect");await advanceLifecycle(cod.orderId,"cod");console.log(`verified COD flat-delivery lifecycle ${cod.orderId}`);
  const bank=await checkout({payment:"bank",fulfillment:"pickup",phone:"0772222222"});assert(bank.fulfillmentMethod==="pickup"&&bank.paymentMethod==="bank","Bank/pickup snapshots are incorrect");await advanceLifecycle(bank.orderId,"bank");console.log(`verified bank pickup lifecycle ${bank.orderId}`);
  const rows=(await query("SELECT order_id,order_status,payment_status,stock_state,fulfillment_method,payment_receipt_public_id,total_product_weight_grams,total_shipping_weight_grams FROM orders WHERE order_id=ANY($1::text[]) ORDER BY order_id",[createdOrders])).rows,bankRow=rows.find(row=>row.order_id===bank.orderId);assert(rows.length===2&&rows.every(row=>row.order_status==="delivered"&&row.stock_state==="fulfilled")&&bankRow?.payment_receipt_public_id==="zevenra/payment-receipts/e2e-receipt","Database lifecycle snapshots are incorrect");console.log("browser checkout/payment/fulfillment E2E passed");
}finally{
  if(browser)await browser.close();if(server){if(process.platform==="win32")spawnSync("taskkill",["/pid",String(server.pid),"/t","/f"],{stdio:"ignore"});else server.kill("SIGTERM");await delay(750);}await cleanup();console.log("cleaned E2E fixtures and restored settings");
}
