type SignedUpload={timestamp:number;folder:string;signature:string;apiKey:string;cloudName:string;maxBytes?:number;allowed?:string[]};

export async function uploadAdminMedia(file:File):Promise<string>{
 const signedResponse=await fetch('/api/admin/cloudinary-sign',{method:'POST'});
 const signed=await signedResponse.json() as SignedUpload&{error?:string};
 if(!signedResponse.ok)throw new Error(signed.error||'Media upload is not configured.');
 if(signed.allowed?.length&&!signed.allowed.includes(file.type))throw new Error('This file type is not supported.');
 if(signed.maxBytes&&file.size>signed.maxBytes)throw new Error('This file is too large. Maximum upload size is 20 MB.');
 const form=new FormData();
 form.append('file',file);
 form.append('api_key',signed.apiKey);
 form.append('timestamp',String(signed.timestamp));
 form.append('folder',signed.folder);
 form.append('signature',signed.signature);
 const kind=file.type.startsWith('video/')?'video':'image';
 const response=await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/${kind}/upload`,{method:'POST',body:form});
 const result=await response.json() as{secure_url?:string;error?:{message?:string}};
 if(!response.ok||!result.secure_url)throw new Error(result.error?.message||'Upload failed.');
 return result.secure_url;
}
