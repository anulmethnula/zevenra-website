import {useEffect,useRef,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,ChevronDown,Minus,Plus,Ruler,X} from 'lucide-react';
import {AnimatePresence,motion} from 'framer-motion';
import {money} from '../config/site';
import {useCart} from '../features/cart/CartContext';
import {useStore} from '../features/store/StoreContext';
import {ProductCard} from '../components/ProductCard';
import {Seo} from '../components/Seo';
import type {Media} from '../types';

export default function ProductPage(){
 const {slug}=useParams(),cart=useCart(),{data}=useStore();
 const products=data.products.filter(p=>p.status==='published'),product=products.find(p=>p.slug===slug);
 const[color,setColor]=useState(product?.variants.find(v=>v.active&&v.stock>0)?.color||''),
  [size,setSize]=useState(''),
  [qty,setQty]=useState(1),
  [guide,setGuide]=useState(false),
  [activeMedia,setActiveMedia]=useState(0);
 const touchStart=useRef<number|null>(null);

 useEffect(()=>{
  setColor(product?.variants.find(v=>v.active&&v.stock>0)?.color||'');
  setSize('');
  setQty(1);
  setGuide(false);
  setActiveMedia(0);
 },[product]);

 if(!product)return <div className="container grid min-h-[70vh] place-content-center pt-28 text-center"><h1 className="display text-5xl">Piece not found.</h1><Link to="/shop" className="mt-5 underline">Return to shop</Link></div>;

 const colors=[...new Set(product.variants.filter(v=>v.active).map(v=>v.color))],
  options=product.variants.filter(v=>v.active&&v.color===color),
  variant=options.find(v=>v.size===size),
  sold=product.variants.filter(v=>v.active).every(v=>v.stock<1),
  chart=product.sizeChartId?data.sizeCharts.find(x=>x.id===product.sizeChartId):undefined,
  primaryImage=product.media.find(media=>media.type==='image')?.url||'',
  inCart=variant?cart.items.find(item=>item.variantId===variant.id)?.quantity||0:0,
  maxAdd=variant?Math.max(0,variant.stock-inCart):0,
  media=product.media,
  current=media[activeMedia];

 const add=()=>variant&&maxAdd>0&&cart.add({productId:product.id,variantId:variant.id,slug:product.slug,name:product.name,image:primaryImage,color,size,quantity:Math.min(qty,maxAdd),unitPrice:product.price,sku:variant.sku,maxStock:variant.stock});
 const previous=()=>media.length&&setActiveMedia(index=>(index-1+media.length)%media.length);
 const next=()=>media.length&&setActiveMedia(index=>(index+1)%media.length);
 const onTouchStart=(x:number)=>{touchStart.current=x};
 const onTouchEnd=(x:number)=>{if(touchStart.current==null)return;const delta=x-touchStart.current;touchStart.current=null;if(Math.abs(delta)<45)return;delta<0?next():previous()};

 return <>
  <Seo title={product.name} description={product.shortDescription}/>
  <div className="product-page pb-28 pt-[102px] lg:container lg:pt-36">
   <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(360px,.9fr)]">
    <ProductGallery media={media} current={current} active={activeMedia} setActive={setActiveMedia} previous={previous} next={next} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} name={product.name}/>
    <div className="px-4 lg:sticky lg:top-32 lg:self-start lg:px-8 xl:px-10">
     <p className="eyebrow text-bronze">{product.newArrival?'New arrival':'Chosen piece'}</p>
     <h1 className="display mt-4 text-[clamp(2.7rem,5vw,5rem)] leading-[.98]">{product.name}</h1>
     <div className="mt-5 flex gap-3"><p>{money(product.price)}</p>{product.compareAtPrice&&product.compareAtPrice>product.price&&<del className="text-ink/40">{money(product.compareAtPrice)}</del>}</div>
     <p className="mt-7 text-sm leading-7 text-ink/60">{product.shortDescription}</p>

     <Option title="Colour" value={color}>{colors.map(c=><button key={c} onClick={()=>{setColor(c);setSize('');setQty(1)}} className={`min-h-12 border px-5 text-xs ${color===c?'border-ink bg-ink text-paper':'border-line'}`}>{c}</button>)}</Option>

     <div className="mt-7">
      <div className="mb-3 flex items-center justify-between">
       <span className="eyebrow">Size</span>
       {chart&&<button onClick={()=>setGuide(true)} className="size-guide-link"><Ruler size={14}/> Size guide</button>}
      </div>
      <div className="flex flex-wrap gap-2">{options.map(v=><button key={v.id} disabled={v.stock<1} onClick={()=>{setSize(v.size);setQty(1)}} className={`min-h-12 min-w-14 border px-4 text-xs ${size===v.size?'border-ink bg-ink text-paper':'border-line'} disabled:opacity-25 disabled:line-through`}>{v.size}</button>)}</div>
     </div>

     <div className="mt-7 flex gap-3">
      <div className="flex min-h-12 items-center border border-line"><button className="px-3" onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={15}/></button><span className="w-8 text-center text-sm">{qty}</span><button className="px-3" disabled={!variant||qty>=Math.max(1,maxAdd)} onClick={()=>setQty(Math.min(Math.max(1,maxAdd),qty+1))}><Plus size={15}/></button></div>
      <button disabled={sold||!variant||maxAdd<1} onClick={add} className="btn btn-dark flex-1 disabled:opacity-35">{sold?'Sold out':!size?'Select a size':maxAdd<1?'Already in bag':'Add to bag'}</button>
     </div>

     <div className="mt-9 divide-y divide-line border-y border-line">{[['DETAILS',product.description],['FIT',product.fit],['CARE',product.care],['DELIVERY & RETURNS','Delivery fee is calculated at checkout. See the current delivery and returns policies for full terms.']].map(([a,b])=><details key={a} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between text-[10px] tracking-[.2em]">{a}<ChevronDown size={15} className="transition group-open:rotate-180"/></summary><p className="pt-4 text-sm leading-7 text-ink/55">{b}</p></details>)}</div>
    </div>
   </div>

   <section className="container pt-24">
    <p className="eyebrow text-bronze">Continue exploring</p>
    <h2 className="display mt-3 text-5xl">You may also like</h2>
    <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{products.filter(p=>p.id!==product.id).slice(0,4).map(p=><ProductCard key={p.id} product={p}/>)}</div>
   </section>
  </div>

  <div className="fixed inset-x-0 bottom-0 z-30 border-t hairline bg-paper p-3 lg:hidden"><button disabled={sold||!variant||maxAdd<1} onClick={add} className="btn btn-dark w-full disabled:opacity-40">{sold?'Sold out':!size?'Select a size':maxAdd<1?'Already in bag':`Add to bag · ${money(product.price)}`}</button></div>

  <AnimatePresence>{guide&&chart&&<SizeGuide chart={chart} close={()=>setGuide(false)}/>}</AnimatePresence>
 </>;
}

function ProductGallery({media,current,active,setActive,previous,next,onTouchStart,onTouchEnd,name}:{media:Media[];current?:Media;active:number;setActive:(index:number)=>void;previous:()=>void;next:()=>void;onTouchStart:(x:number)=>void;onTouchEnd:(x:number)=>void;name:string}){
 return <div className="product-gallery">
  <div className="product-gallery__stage" onTouchStart={event=>onTouchStart(event.changedTouches[0].clientX)} onTouchEnd={event=>onTouchEnd(event.changedTouches[0].clientX)}>
   {current?current.type==='video'?<video key={current.url} src={current.url} aria-label={current.alt||name} muted playsInline controls className="product-gallery__media"/>:<img key={current.url} src={current.url} alt={current.alt||name} className="product-gallery__media"/>:<div className="product-gallery__empty">Image coming soon</div>}
   {media.length>1&&<>
    <button type="button" onClick={previous} className="product-gallery__arrow product-gallery__arrow--left" aria-label="Previous image"><ArrowLeft size={17}/></button>
    <button type="button" onClick={next} className="product-gallery__arrow product-gallery__arrow--right" aria-label="Next image"><ArrowRight size={17}/></button>
    <div className="product-gallery__counter">{String(active+1).padStart(2,'0')} / {String(media.length).padStart(2,'0')}</div>
   </>}
  </div>
  {media.length>1&&<div className="product-gallery__thumbs hide-scrollbar">{media.map((item,index)=><button type="button" key={item.url+'-'+index} onClick={()=>setActive(index)} className={`product-gallery__thumb ${active===index?'is-active':''}`} aria-label={`View media ${index+1}`}>{item.type==='video'?<video src={item.url} muted playsInline preload="metadata"/>:<img src={item.url} alt=""/>}</button>)}</div>}
  {media.length>1&&<div className="product-gallery__dots" aria-hidden="true">{media.map((_,index)=><span key={index} className={active===index?'is-active':''}/>)}</div>}
 </div>
}

function SizeGuide({chart,close}:{chart:{name:string;unit:string;imageUrl?:string;columns:string[];rows:string[][];notes?:string};close:()=>void}){
 return <>
  <motion.button className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" onClick={close} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} aria-label="Close size guide"/>
  <motion.aside role="dialog" aria-modal="true" aria-label="Size guide" className="size-guide-panel" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{duration:.38,ease:[.22,1,.36,1]}}>
   <div className="size-guide-panel__top">
    <div><p className="eyebrow text-bronze">Product measurements</p><h2 className="display mt-2 text-4xl sm:text-5xl">Size &amp; fit.</h2></div>
    <button onClick={close} className="size-guide-panel__close" aria-label="Close size guide"><X/></button>
   </div>
   <p className="mt-5 text-sm text-ink/55">{chart.name} · {chart.unit}</p>
   {chart.imageUrl&&<div className="size-guide-panel__image"><img src={chart.imageUrl} alt={chart.name+' size chart'}/></div>}
   {chart.columns.length>0&&chart.rows.length>0&&<div className="mt-6 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr>{chart.columns.map(x=><th key={x} className="border-b hairline p-3 text-[10px] font-medium uppercase tracking-[.14em]">{x}</th>)}</tr></thead><tbody>{chart.rows.map((row,i)=><tr key={i}>{row.map((x,j)=><td key={j} className="border-b hairline p-3">{x}</td>)}</tr>)}</tbody></table></div>}
   {chart.notes&&<p className="mt-6 border-l border-bronze pl-4 text-xs leading-6 text-ink/50">{chart.notes}</p>}
  </motion.aside>
 </>;
}

function Option({title,value,children}:{title:string;value:string;children:React.ReactNode}){return <div className="mt-8"><div className="mb-3 flex justify-between"><span className="eyebrow">{title}</span><span className="text-xs">{value}</span></div><div className="flex flex-wrap gap-2">{children}</div></div>}
