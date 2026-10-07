import { cloudinarySignature } from "./_cloudinary-signature.js";

type ReceiptAsset={payment_receipt_public_id:string;payment_receipt_resource_type?:string;payment_receipt_format?:string};
export function authenticatedReceiptDownloadUrl(asset:ReceiptAsset,config:{cloudName:string;apiKey:string;apiSecret:string},timestamp:number){
  const expiresAt=timestamp+300,params:Record<string,string|number>={expires_at:expiresAt,public_id:asset.payment_receipt_public_id,timestamp,type:"authenticated"};
  if(asset.payment_receipt_format)params.format=asset.payment_receipt_format;
  const query=new URLSearchParams();Object.entries(params).forEach(([key,value])=>query.set(key,String(value)));
  query.set("signature",cloudinarySignature(params,config.apiSecret));query.set("api_key",config.apiKey);
  return{url:`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/${asset.payment_receipt_resource_type||"image"}/download?${query.toString()}`,expiresAt};
}
