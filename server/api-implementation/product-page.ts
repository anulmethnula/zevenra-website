import type { VercelRequest,VercelResponse } from "@vercel/node";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProductBySlug } from "./_data/catalog.js";
import { publicOrigin } from "./_public-origin.js";
import { productDocument } from "./_product-document.js";
import { methodNotAllowed } from "./_shared.js";

async function template(){
  const local=process.env.VERCEL_ENV==="development"||process.env.NODE_ENV!=="production",candidates=local?[path.resolve("index.html"),path.resolve("dist/index.html")]:[path.resolve("dist/index.html"),path.resolve("index.html")];
  for(const candidate of candidates)try{
    const html=await readFile(candidate,"utf8");
    if(local&&candidate.endsWith("index.html")&&!html.includes("/@vite/client"))return html.replace("</head>",`<script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/@vite/client"></script></head>`);
    return html;
  }catch{/* try the fallback template */}
  throw new Error("Application HTML template is unavailable.");
}
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=="GET")return methodNotAllowed(res,["GET"]);
  try{
    const slug=Array.isArray(req.query.slug)?req.query.slug[0]:req.query.slug,product=await getProductBySlug(String(slug||"")),html=await template();
    if(!product)return res.status(404).setHeader("Content-Type","text/html; charset=utf-8").send(html.replace('<meta name="robots" content="index, follow" />','<meta name="robots" content="noindex, nofollow" />'));
    res.setHeader("Content-Type","text/html; charset=utf-8");res.setHeader("Cache-Control","public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).send(productDocument(html,product,publicOrigin(req)));
  }catch(error){console.error("product page metadata failed",error);return res.status(503).send("Product temporarily unavailable");}
}
