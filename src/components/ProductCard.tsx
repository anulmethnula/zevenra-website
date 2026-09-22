import {Link} from 'react-router-dom';
import {money} from '../config/site';
import type {Product} from '../types';

export function ProductCard({product}:{product:Product}){
 const active=product.variants.filter(variant=>variant.active),out=active.length===0||active.every(variant=>variant.stock<1),sold=out&&!product.preorderEnabled,low=!out&&active.some(variant=>variant.stock>0&&variant.stock<=variant.lowStockThreshold),badge=out&&product.preorderEnabled?'PRE-ORDER':sold?'SOLD OUT':low?'LOW STOCK':product.newArrival?'NEW':null,images=product.media.filter(media=>media.type==='image'),primary=images[0],secondary=images[1];
 return <article className="product-card"><Link to={`/product/${product.slug}`} aria-label={`View ${product.name}`}><div className="product-card__media">{primary?<><img src={primary.url} alt={primary.alt||product.name} loading="lazy" width="800" height="1000"/>{secondary&&<img className="product-card__secondary" src={secondary.url} alt="" loading="lazy" width="800" height="1000"/>}</>:<div className="grid h-full place-content-center bg-[#e7e1d7] px-4 text-center"><span className="eyebrow text-black/35">Image coming soon</span></div>}{badge&&<span>{badge}</span>}</div><div className="product-card__details"><h3>{product.name}</h3><div><p>{money(product.price)}</p>{product.compareAtPrice&&product.compareAtPrice>product.price&&<del>{money(product.compareAtPrice)}</del>}</div></div></Link></article>
}
