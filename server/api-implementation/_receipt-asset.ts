const imageFormats=new Set(["jpg","jpeg","png","webp","pdf"]);
export type ReceiptAsset={publicId:string;resourceType:"image"|"raw"|"";format:string};
export function receiptAsset(value:string|undefined,cloudName=process.env.CLOUDINARY_CLOUD_NAME):ReceiptAsset{
  if(!value)return{publicId:"",resourceType:"",format:""};
  const url=new URL(value),parts=url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if(url.protocol!=="https:"||url.hostname!=="res.cloudinary.com"||!["image","raw"].includes(parts[1]||"")||parts[2]!=="authenticated"||parts[0]!==cloudName)throw new Error("Invalid payment receipt URL.");
  let rest=parts.slice(3);
  if((rest[0]||"").startsWith("s--")){if(!/^s--[A-Za-z0-9_-]+--$/.test(rest[0]))throw new Error("Invalid payment receipt URL.");rest=rest.slice(1);}
  if(/^v\d+$/.test(rest[0]||""))rest=rest.slice(1);
  const last=rest.pop()||"",dot=last.lastIndexOf("."),name=dot>0?last.slice(0,dot):last,format=dot>0?last.slice(dot+1):"",publicId=[...rest,name].join("/");
  const resourceType=parts[1] as "image"|"raw";
  if(!/^zevenra\/payment-receipts\/[A-Za-z0-9_-]+$/.test(publicId)||!format||resourceType==="raw"&&format!=="pdf"||resourceType==="image"&&!imageFormats.has(format.toLowerCase()))throw new Error("Invalid payment receipt URL.");
  return{publicId,resourceType,format:format.toLowerCase()};
}

export async function verifyReceiptAsset(value:string|undefined,config:{CLOUDINARY_CLOUD_NAME:string;CLOUDINARY_API_KEY:string;CLOUDINARY_API_SECRET:string},request:typeof fetch=fetch){
  const asset=receiptAsset(value,config.CLOUDINARY_CLOUD_NAME);
  if(!asset.publicId)throw new Error("Invalid payment receipt URL.");
  if(process.env.VERCEL_ENV==="development"&&process.env.E2E_ALLOW_RECEIPT_METADATA_FIXTURE==="1")return asset;
  const endpoint=`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.CLOUDINARY_CLOUD_NAME)}/resources/${asset.resourceType}/authenticated/${encodeURIComponent(asset.publicId)}`;
  const response=await request(endpoint,{headers:{Authorization:`Basic ${Buffer.from(`${config.CLOUDINARY_API_KEY}:${config.CLOUDINARY_API_SECRET}`).toString("base64")}`},signal:AbortSignal.timeout(8_000)});
  if(!response.ok)throw new Error("Invalid payment receipt URL.");
  const metadata=await response.json() as Record<string,unknown>;
  const secureUrl=String(metadata.secure_url||""),bytes=Number(metadata.bytes),format=String(metadata.format||"").toLowerCase(),type=String(metadata.type||""),resourceType=String(metadata.resource_type||"");
  const verified=receiptAsset(secureUrl,config.CLOUDINARY_CLOUD_NAME);
  if(type!=="authenticated"||resourceType!==asset.resourceType||verified.publicId!==asset.publicId||format!==asset.format||!Number.isFinite(bytes)||bytes<1||bytes>10_000_000)throw new Error("Invalid payment receipt URL.");
  return asset;
}
