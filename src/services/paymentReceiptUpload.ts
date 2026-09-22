type SignedReceiptUpload={timestamp:number;folder:string;signature:string;apiKey:string;cloudName:string;maxBytes:number;allowed:string[];error?:string};

export async function uploadPaymentReceipt(file:File):Promise<string>{
 const signedResponse=await fetch('/api/payment-receipt-sign',{method:'POST'});
 const signed=await signedResponse.json() as SignedReceiptUpload;
 if(!signedResponse.ok)throw new Error(signed.error||'Receipt upload is unavailable.');
 if(!signed.allowed.includes(file.type))throw new Error('Upload a JPG, PNG, WebP or PDF receipt.');
 if(file.size>signed.maxBytes)throw new Error('Receipt must be smaller than 8 MB.');
 const form=new FormData();
 form.append('file',file);
 form.append('api_key',signed.apiKey);
 form.append('timestamp',String(signed.timestamp));
 form.append('folder',signed.folder);
 form.append('signature',signed.signature);
 const response=await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`,{method:'POST',body:form});
 const result=await response.json() as{secure_url?:string;error?:{message?:string}};
 if(!response.ok||!result.secure_url)throw new Error(result.error?.message||'Receipt upload failed.');
 return result.secure_url;
}
