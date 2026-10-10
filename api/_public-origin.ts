import type { VercelRequest } from "@vercel/node";

const productionUrl=()=>process.env.PUBLIC_SITE_URL||process.env.VERCEL_PROJECT_PRODUCTION_URL||"zevenra.vercel.app";
export function publicOrigin(req?:VercelRequest){
  if(process.env.VERCEL_ENV==="development"&&req){const host=String(req.headers.host||"localhost:3000").split(",")[0].trim();return `http://${host}`;}
  const value=productionUrl().trim();
  try{const url=new URL(value.includes("://")?value:`https://${value}`);if(url.protocol!=="https:")throw new Error("Production origin must use HTTPS");return url.origin;}catch{return "https://zevenra.vercel.app";}
}

export const isPreviewDeployment=()=>process.env.VERCEL_ENV==="preview";
