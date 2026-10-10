export const defaultSeoDescription = "Selected beyond borders. Curated for here.";
export const defaultSeoImage = "/brand/zevenraname.png";

export type SeoInput = { title:string; description?:string; image?:string; imageAlt?:string; noindex?:boolean; type?:"website"|"product"; path:string; siteUrl:string };

const absolute=(value:string,origin:string)=>{try{const url=new URL(value,origin+"/");return url.protocol==="https:"||url.hostname==="localhost"?url.toString():"";}catch{return "";}};

export function buildSeoState(input:SeoInput){
  const origin=input.siteUrl.replace(/\/+$/, ""),title=input.title.toLowerCase().includes("zevenra")?input.title:`${input.title} — ZEVENRA`,description=input.description?.trim()||defaultSeoDescription,image=absolute(input.image||defaultSeoImage,origin),canonical=absolute(input.path.split(/[?#]/)[0]||"/",origin);
  return {title,description,image,imageAlt:input.imageAlt?.trim()||`${input.title} — ZEVENRA`,canonical,robots:input.noindex?"noindex, nofollow":"index, follow",type:input.type||"website"};
}
