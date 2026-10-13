type ProductMetadata = { slug:string; name:string; shortDescription?:string; price:number; preorderEnabled?:boolean; media?:Array<{type?:string;url?:string}>; variants?:Array<{active?:boolean;stock?:number}> };

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]||character);
const jsonForHtml=(value:unknown)=>JSON.stringify(value).replace(/</g,"\\u003c");

export function productDocument(template:string,product:ProductMetadata,origin:string){
  const cleanOrigin=origin.replace(/\/+$/g,""),title=`${product.name} — ZEVENRA`,description=product.shortDescription?.trim()||"Selected beyond borders. Curated for here.",canonical=`${cleanOrigin}/product/${encodeURIComponent(product.slug)}`,
    image=product.media?.find(item=>item.type==="image"&&item.url)?.url||`${cleanOrigin}/brand/og-image.jpg`,absoluteImage=new URL(image,origin).toString(),available=product.variants?.some(item=>item.active&&Number(item.stock)>0),
    schema={"@context":"https://schema.org","@type":"Product",name:product.name,description,image:absoluteImage,url:canonical,offers:{"@type":"Offer",priceCurrency:"LKR",price:product.price,url:canonical,availability:`https://schema.org/${available?"InStock":product.preorderEnabled?"PreOrder":"OutOfStock"}`}};
  const replacements:[RegExp,string][]=[
    [/<title>[\s\S]*?<\/title>/i,`<title>${escapeHtml(title)}</title>`],
    [/<meta name="description"[^>]*>/i,`<meta name="description" content="${escapeHtml(description)}" />`],
    [/<link rel="canonical"[^>]*>/i,`<link rel="canonical" href="${escapeHtml(canonical)}" />`],
    [/<meta property="og:type"[^>]*>/i,'<meta property="og:type" content="product" />'],
    [/<meta property="og:title"[^>]*>/i,`<meta property="og:title" content="${escapeHtml(title)}" />`],
    [/<meta property="og:description"[^>]*>/i,`<meta property="og:description" content="${escapeHtml(description)}" />`],
    [/<meta property="og:url"[^>]*>/i,`<meta property="og:url" content="${escapeHtml(canonical)}" />`],
    [/<meta property="og:image"[^>]*>/i,`<meta property="og:image" content="${escapeHtml(absoluteImage)}" />`],
    [/<meta property="og:image:alt"[^>]*>/i,`<meta property="og:image:alt" content="${escapeHtml(product.name)}" />`],
    [/<meta name="twitter:title"[^>]*>/i,`<meta name="twitter:title" content="${escapeHtml(title)}" />`],
    [/<meta name="twitter:description"[^>]*>/i,`<meta name="twitter:description" content="${escapeHtml(description)}" />`],
    [/<meta name="twitter:image"[^>]*>/i,`<meta name="twitter:image" content="${escapeHtml(absoluteImage)}" />`],
  ];
  let html=template;
  for(const [pattern,replacement] of replacements)html=html.replace(pattern,replacement);
  return html.replace("</head>",`<script type="application/ld+json" data-zevenra-seo="server">${jsonForHtml(schema)}</script>\n  </head>`);
}
