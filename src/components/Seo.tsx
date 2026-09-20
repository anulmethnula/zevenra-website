import {useEffect} from 'react';

export function Seo({title,description}:{title:string;description?:string}){
 useEffect(()=>{
  const copy=description||'Selected beyond borders. Curated for here.',fullTitle=title.toLowerCase().includes('zevenra')?title:title+' — ZEVENRA';
  document.title=fullTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content',copy);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content',fullTitle);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content',copy);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href',location.origin+location.pathname);
 },[title,description]);
 return null
}
