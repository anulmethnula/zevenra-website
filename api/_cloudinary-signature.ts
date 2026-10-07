import { createHash } from "node:crypto";

export function cloudinarySignature(params:Record<string,string|number>,secret:string){
  const serialized=Object.entries(params).filter(([,value])=>value!=="").sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join("&");
  return createHash("sha1").update(serialized+secret).digest("hex");
}
