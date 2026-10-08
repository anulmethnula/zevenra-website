export const productsCacheControl=(query:Record<string,unknown>)=>String(query.q||"").trim()
  ?"private, no-store, max-age=0"
  :"public, max-age=0, s-maxage=30, stale-while-revalidate=120";
