export function receiptAsset(value:string|undefined,cloudName=process.env.CLOUDINARY_CLOUD_NAME){
  if(!value)return{publicId:"",resourceType:"",format:""};
  const url=new URL(value),parts=url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if(url.protocol!=="https:"||url.hostname!=="res.cloudinary.com"||!["image","raw","video"].includes(parts[1]||"")||parts[2]!=="authenticated"||parts[0]!==cloudName)throw new Error("Invalid payment receipt URL.");
  let rest=parts.slice(3);
  if((rest[0]||"").startsWith("s--")){if(!/^s--[A-Za-z0-9_-]+--$/.test(rest[0]))throw new Error("Invalid payment receipt URL.");rest=rest.slice(1);}
  if(/^v\d+$/.test(rest[0]||""))rest=rest.slice(1);
  const last=rest.pop()||"",dot=last.lastIndexOf("."),name=dot>0?last.slice(0,dot):last,format=dot>0?last.slice(dot+1):"",publicId=[...rest,name].join("/");
  if(!publicId.startsWith("zevenra/payment-receipts/"))throw new Error("Invalid payment receipt URL.");
  return{publicId,resourceType:parts[1],format};
}
