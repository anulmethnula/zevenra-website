export function shopSearchPolicy(query:string,cached?:{items:unknown[]}) {
  const q=new URLSearchParams(query).get("q")?.trim()||"",search=Boolean(q);
  return {search,revalidateFresh:search,loadingWhileRevalidate:Boolean(search&&cached?.items.length===0)};
}

export const serializeShopQuery=(query:URLSearchParams)=>query.toString().replace(/\+/g,"%20");
