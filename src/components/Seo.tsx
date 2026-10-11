import { useEffect } from "react";
import { buildSeoState } from "../utils/seo";

type StructuredData = Record<string, unknown> | Array<Record<string, unknown>>;
const setMeta=(selector:string,attribute:"name"|"property",key:string,content:string)=>{let element=document.querySelector<HTMLMetaElement>(selector);if(!element){element=document.createElement("meta");element.setAttribute(attribute,key);document.head.appendChild(element);}element.content=content;};

export function Seo({
  title,
  description,
  image,
  imageAlt,
  noindex = false,
  type = "website",
  structuredData,
}: {
  title: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  noindex?: boolean;
  type?: "website" | "product";
  structuredData?: StructuredData;
}) {
  useEffect(() => {
    const searchResults=location.pathname==="/shop"&&new URLSearchParams(location.search).has("q");
    const state=buildSeoState({title,description,image,imageAlt,noindex:noindex||searchResults,type,path:location.pathname,siteUrl:String(import.meta.env.VITE_PUBLIC_SITE_URL||location.origin)});
    document.title=state.title;
    setMeta('meta[name="description"]',"name","description",state.description);setMeta('meta[name="robots"]',"name","robots",state.robots);
    setMeta('meta[property="og:title"]',"property","og:title",state.title);setMeta('meta[property="og:description"]',"property","og:description",state.description);setMeta('meta[property="og:url"]',"property","og:url",state.canonical);setMeta('meta[property="og:type"]',"property","og:type",state.type);setMeta('meta[property="og:image"]',"property","og:image",state.image);setMeta('meta[property="og:image:alt"]',"property","og:image:alt",state.imageAlt);
    setMeta('meta[name="twitter:card"]',"name","twitter:card","summary_large_image");setMeta('meta[name="twitter:title"]',"name","twitter:title",state.title);setMeta('meta[name="twitter:description"]',"name","twitter:description",state.description);setMeta('meta[name="twitter:image"]',"name","twitter:image",state.image);
    let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement("link");canonical.rel="canonical";document.head.appendChild(canonical);}canonical.href=state.canonical;
    document.querySelectorAll('script[data-zevenra-seo="route"],script[data-zevenra-seo="server"]').forEach(node=>node.remove());
    if(structuredData){const script=document.createElement("script");script.type="application/ld+json";script.dataset.zevenraSeo="route";script.text=JSON.stringify(structuredData).replace(/</g,"\\u003c");document.head.appendChild(script);}
    return()=>{document.querySelectorAll('script[data-zevenra-seo="route"]').forEach(node=>node.remove());};
  }, [title,description,image,imageAlt,noindex,type,structuredData]);
  return null;
}
