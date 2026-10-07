type SignedReceiptUpload = {
  timestamp: number;
  folder: string;
  type: "authenticated";
  signature: string;
  apiKey: string;
  cloudName: string;
  maxBytes: number;
  allowed: string[];
  error?: string;
};

export async function uploadPaymentReceipt(file: File): Promise<string> {
  let signedResponse:Response;
  try{signedResponse=await fetch("/api/payment-receipt-sign",{method:"POST"});}catch{throw new Error("Receipt upload failed. Please try again.");}
  const signed = (await signedResponse.json()) as SignedReceiptUpload;
  if (!signedResponse.ok)
    throw new Error(signed.error || "Receipt upload is unavailable.");
  if (!signed.allowed.includes(file.type))
    throw new Error("Upload an image or PDF receipt.");
  if (file.size > signed.maxBytes)
    throw new Error("This receipt file is too large. Try a smaller file.");
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("folder", signed.folder);
  form.append("type", signed.type);
  form.append("signature", signed.signature);
  let response:Response;
  try{response=await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`,{method:"POST",body:form});}catch{throw new Error("Receipt upload failed. Please try again.");}
  const result = (await response.json()) as {
    secure_url?: string;
    type?:string;
    error?: { message?: string };
  };
  if(!response.ok){const message=result.error?.message||"";if(/file size|too large/i.test(message))throw new Error("This receipt file is too large. Try a smaller file.");if(/invalid|format|file type/i.test(message))throw new Error("Upload a valid image or PDF receipt.");throw new Error("Receipt upload failed. Please try again.");}
  const secureUrl=result.secure_url;let authenticated=false;
  try{const url=new URL(secureUrl||""),parts=url.pathname.split("/").filter(Boolean);authenticated=url.protocol==="https:"&&url.hostname==="res.cloudinary.com"&&parts[0]===signed.cloudName&&["image","raw","video"].includes(parts[1]||"")&&parts[2]==="authenticated"&&result.type==="authenticated";}catch{/* Invalid upload response. */}
  if(!authenticated||!secureUrl)throw new Error("Receipt upload failed. Please try again.");
  return secureUrl;
}
