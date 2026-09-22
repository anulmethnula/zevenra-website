import type {VercelRequest,VercelResponse} from '@vercel/node';
import{appsScriptEnv,body,callScript,json,methodNotAllowed,orderSchema,readCustomerSession,validOrigin}from'./_shared.js';

type ScriptOrderItem={productId?:unknown;variantId?:unknown;sku?:unknown;productName?:unknown;name?:unknown;color?:unknown;size?:unknown;quantity?:unknown;unitPrice?:unknown;isPreorder?:unknown};
type ScriptOrder={orderId?:unknown;createdAt?:unknown;customerName?:unknown;phone?:unknown;whatsapp?:unknown;email?:unknown;address1?:unknown;address2?:unknown;city?:unknown;district?:unknown;postalCode?:unknown;deliveryNotes?:unknown;paymentMethod?:unknown;paymentReference?:unknown;paymentReceiptUrl?:unknown;subtotal?:unknown;deliveryFee?:unknown;total?:unknown;orderStatus?:unknown;paymentStatus?:unknown;items?:ScriptOrderItem[]};

export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return methodNotAllowed(res,['POST']);
 try{
  const config=appsScriptEnv();
  if(!validOrigin(req,config))return json(res,{error:'Invalid request origin'},403);
  const payload=orderSchema.parse(body(req)),identity=readCustomerSession(req);
  const orderPayload=identity?{...payload,email:identity.email,customerId:identity.id}:payload;
  const raw=await callScript(config,'createOrder',orderPayload) as ScriptOrder;
  const order={
   orderId:String(raw.orderId||''),
   createdAt:String(raw.createdAt||new Date().toISOString()),
   customerName:String(raw.customerName||payload.customerName),
   phone:String(raw.phone||payload.phone),
   whatsapp:String(raw.whatsapp||payload.whatsapp||''),
   email:String(raw.email||payload.email||''),
   address1:String(raw.address1||payload.address1||''),
   address2:String(raw.address2||payload.address2||''),
   city:String(raw.city||payload.city),
   district:String(raw.district||payload.district),
   postalCode:String(raw.postalCode||payload.postalCode||''),
   deliveryNotes:String(raw.deliveryNotes||payload.deliveryNotes||''),
   paymentMethod:raw.paymentMethod==='bank'?'bank':'cod',
   paymentReference:String(raw.paymentReference||payload.paymentReference||''),
   paymentReceiptUrl:String(raw.paymentReceiptUrl||payload.paymentReceiptUrl||''),
   subtotal:Number(raw.subtotal)||0,
   deliveryFee:Number(raw.deliveryFee)||0,
   total:Number(raw.total)||0,
   orderStatus:String(raw.orderStatus||'pending'),
   paymentStatus:String(raw.paymentStatus||''),
   items:(Array.isArray(raw.items)?raw.items:[]).map(item=>({
    productId:String(item.productId||''),
    variantId:String(item.variantId||''),
    slug:'',
    name:String(item.productName||item.name||'Item'),
    image:'',
    color:String(item.color||''),
    size:String(item.size||''),
    quantity:Number(item.quantity)||1,
    unitPrice:Number(item.unitPrice)||0,
    sku:String(item.sku||''),
    isPreorder:item.isPreorder===true||String(item.isPreorder).toLowerCase()==='true'
   }))
  };
  return json(res,order,201);
 }catch(error){
  const message=error instanceof Error?error.message:'';
  if(message.startsWith('CUSTOMER_AUTH_'))return json(res,{error:'Your customer session is invalid. Please sign in again.'},401);
  if(error instanceof Error&&error.name==='ZodError')return json(res,{error:'Please review your order information.'},400);
  if(/no longer available|insufficient stock/i.test(message))return json(res,{error:'One or more selected items are no longer available in that quantity. Please review your bag.'},409);
  if(/store|orders.*unavailable/i.test(message))return json(res,{error:'Online ordering is temporarily unavailable.'},503);
  return json(res,{error:'We could not place the order. Your bag has not been cleared.'},400);
 }
}
