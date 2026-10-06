const widths=(values:number[])=>[...new Set(values)].sort((a,b)=>a-b);

export function cloudinaryImage(url:string,width:number){
  if(!url)return url;
  try{
    const parsed=new URL(url,typeof window==="undefined"?"https://example.invalid":window.location.origin);
    if(parsed.protocol!=="https:"||parsed.hostname!=="res.cloudinary.com"||!parsed.pathname.includes("/image/upload/"))return url;
    parsed.pathname=parsed.pathname.replace("/image/upload/",`/image/upload/f_auto,q_auto,c_limit,w_${Math.max(1,Math.round(width))}/`);
    return parsed.toString();
  }catch{return url;}
}

export function cloudinarySrcSet(url:string,values:number[]){
  return widths(values).map(width=>`${cloudinaryImage(url,width)} ${width}w`).join(", ");
}
