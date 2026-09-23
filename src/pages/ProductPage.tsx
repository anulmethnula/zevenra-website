import {useEffect,useRef,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,CheckCircle2,ChevronDown,Minus,Plus,RotateCcw,Ruler,X,ZoomIn,ZoomOut} from 'lucide-react';
import {AnimatePresence,motion} from 'framer-motion';
import {money} from '../config/site';
import {useCart} from '../features/cart/CartContext';
import {useStore} from '../features/store/StoreContext';
import {ProductCard} from '../components/ProductCard';
import {Seo} from '../components/Seo';
import {useCustomerAuth} from '../features/account/CustomerAuthContext';
import {api} from '../services/api';
import type {Media,Product,Variant} from '../types';

export default function ProductPage(){
 const {slug}=useParams(),cart=useCart(),{data}=useStore(),{user}=useCustomerAuth();
 const products=data.products.filter(p=>p.status==='published'),product=products.find(p=>p.slug===slug);
 const[color,setColor]=useState(product?.variants.find(v=>v.active&&(v.stock>0||product?.preorderEnabled))?.color||''),
  [size,setSize]=useState(''),
  [qty,setQty]=useState(1),
  [guide,setGuide]=useState(false),
  [preorderOpen,setPreorderOpen]=useState(false),
  [activeMedia,setActiveMedia]=useState(0);
 const touchStart=useRef<number|null>(null);

 useEffect(()=>{
  setColor(product?.variants.find(v=>v.active&&(v.stock>0||product?.preorderEnabled))?.color||'');
  setSize('');
  setQty(1);
  setGuide(false);
  setPreorderOpen(false);
  setActiveMedia(0);
 },[product]);

 if(!product)return <div className="container grid min-h-[70vh] place-content-center pt-28 text-center"><h1 className="display text-5xl">Piece not found.</h1><Link to="/shop" className="mt-5 underline">Return to shop</Link></div>;

 const colors=[...new Set(product.variants.filter(v=>v.active).map(v=>v.color))],
  options=product.variants.filter(v=>v.active&&v.color===color),
  variant=options.find(v=>v.size===size),
  sold=product.variants.filter(v=>v.active).every(v=>v.stock<1)&&!product.preorderEnabled,
  chart=product.sizeChartId?data.sizeCharts.find(x=>x.id===product.sizeChartId):undefined,
  primaryImage=product.media.find(media=>media.type==='image')?.url||'',
  inCart=variant?cart.items.find(item=>item.variantId===variant.id)?.quantity||0:0,
  selectedPreorder=Boolean(variant&&variant.stock<1&&product.preorderEnabled),
  maxAdd=variant&&!selectedPreorder?Math.max(0,variant.stock-inCart):0,
  maxQty=selectedPreorder?10:Math.max(1,maxAdd),
  galleryMedia=product.media.filter(media=>!chart?.imageUrl||media.url!==chart.imageUrl),
  media=galleryMedia.length?galleryMedia:product.media,
  current=media[activeMedia];

 const add=()=>variant&&!selectedPreorder&&maxAdd>0&&cart.add({productId:product.id,variantId:variant.id,slug:product.slug,name:product.name,image:primaryImage,color,size,quantity:Math.min(qty,maxAdd),unitPrice:product.price,sku:variant.sku,maxStock:variant.stock});
 const previous=()=>media.length&&setActiveMedia(index=>(index-1+media.length)%media.length);
 const next=()=>media.length&&setActiveMedia(index=>(index+1)%media.length);
 const onTouchStart=(x:number)=>{touchStart.current=x};
 const onTouchEnd=(x:number)=>{if(touchStart.current==null)return;const delta=x-touchStart.current;touchStart.current=null;if(Math.abs(delta)<45)return;if(delta<0)next();else previous()};

 return <>
  <Seo title={product.name} description={product.shortDescription}/>
  <div className="product-page pb-28 pt-[102px] lg:container lg:pt-36">
   <div className="product-detail-grid">
    <ProductGallery media={media} current={current} active={activeMedia} setActive={setActiveMedia} previous={previous} next={next} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} name={product.name}/>
    <div className="product-detail-panel">
     <p className="eyebrow text-bronze">{product.newArrival?'New arrival':'Chosen piece'}</p>
     <h1 className="display mt-4 text-[clamp(2.6rem,4.2vw,4.35rem)] leading-[.96]">{product.name}</h1>
     <div className="mt-5 flex gap-3"><p>{money(product.price)}</p>{product.compareAtPrice&&product.compareAtPrice>product.price&&<del className="text-ink/40">{money(product.compareAtPrice)}</del>}</div>
     <p className="mt-7 text-sm leading-7 text-ink/60">{product.shortDescription}</p>

     <Option title="Colour" value={color}>{colors.map(c=><button key={c} onClick={()=>{setColor(c);setSize('');setQty(1)}} className={`min-h-12 border px-5 text-xs ${color===c?'border-ink bg-ink text-paper':'border-line'}`}>{c}</button>)}</Option>

     <div className="mt-7">
      <div className="mb-3 flex items-center justify-between">
       <span className="eyebrow">Size</span>
       {chart?.imageUrl&&<button onClick={()=>setGuide(true)} className="size-guide-link"><Ruler size={14}/> Size guide</button>}
      </div>
      <div className="flex flex-wrap gap-2">{options.map(v=>{const canChoose=v.stock>0||product.preorderEnabled;return <button key={v.id} disabled={!canChoose} onClick={()=>{setSize(v.size);setQty(1)}} className={`min-h-12 min-w-14 border px-4 text-xs ${size===v.size?'border-ink bg-ink text-paper':'border-line'} disabled:opacity-25 disabled:line-through`}>{v.size}{v.stock<1&&product.preorderEnabled?' · PRE-ORDER':''}</button>})}</div>{selectedPreorder&&<div className="mt-3 border-l-2 border-bronze bg-bronze/[.05] px-3 py-2.5"><p className="text-xs leading-5 text-ink/65">{product.preorderMessage||'Request this item now. No payment is required. We will contact you on WhatsApp before placing our supplier order.'}</p><p className="mt-1 text-[10px] font-medium tracking-[.12em] text-bronze">NO PAYMENT NOW · CONFIRMATION BY WHATSAPP</p></div>}
     </div>

     <div className="mt-7 flex gap-3">
      <div className="flex min-h-12 items-center border border-line"><button className="px-3" onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={15}/></button><span className="w-8 text-center text-sm">{qty}</span><button className="px-3" disabled={!variant||qty>=maxQty} onClick={()=>setQty(Math.min(maxQty,qty+1))}><Plus size={15}/></button></div>
      <button disabled={sold||!variant||(!selectedPreorder&&maxAdd<1)} onClick={()=>selectedPreorder?setPreorderOpen(true):add()} className="btn btn-dark flex-1 disabled:opacity-35">{sold?'Sold out':!size?'Select a size':selectedPreorder?'Request pre-order':maxAdd<1?'Already in bag':'Add to bag'}</button>
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

  <div className="fixed inset-x-0 bottom-0 z-30 border-t hairline bg-paper p-3 lg:hidden"><button disabled={sold||!variant||(!selectedPreorder&&maxAdd<1)} onClick={()=>selectedPreorder?setPreorderOpen(true):add()} className="btn btn-dark w-full disabled:opacity-40">{sold?'Sold out':!size?'Select a size':selectedPreorder?'Request pre-order':maxAdd<1?'Already in bag':`Add to bag · ${money(product.price)}`}</button></div>

  <AnimatePresence>{guide&&chart?.imageUrl&&<SizeGuide chart={chart} close={()=>setGuide(false)}/>}</AnimatePresence>
  <AnimatePresence>{preorderOpen&&variant&&selectedPreorder&&<PreorderRequestModal product={product} variant={variant} quantity={qty} user={user} close={()=>setPreorderOpen(false)}/>}</AnimatePresence>
 </>;
}

function ProductGallery({media,current,active,setActive,previous,next,onTouchStart,onTouchEnd,name}:{media:Media[];current?:Media;active:number;setActive:(index:number)=>void;previous:()=>void;next:()=>void;onTouchStart:(x:number)=>void;onTouchEnd:(x:number)=>void;name:string}){
 return <div className="product-gallery">
  <div className="product-gallery__stage" onTouchStart={event=>onTouchStart(event.changedTouches[0].clientX)} onTouchEnd={event=>onTouchEnd(event.changedTouches[0].clientX)}>
   {current?current.type==='video'?<video key={current.url} src={current.url} aria-label={current.alt||name} muted playsInline controls className="product-gallery__media"/>:<motion.img key={current.url} src={current.url} alt={current.alt||name} className="product-gallery__media" initial={{opacity:0,scale:.992}} animate={{opacity:1,scale:1}} transition={{duration:.25}}/>:<div className="product-gallery__empty">Image coming soon</div>}
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

function SizeGuide({chart,close}:{chart:{name:string;imageUrl?:string};close:()=>void}){
 const[zoom,setZoom]=useState(1);
 const adjust=(delta:number)=>setZoom(value=>Math.min(3,Math.max(1,Math.round((value+delta)*10)/10)));
 return <>
  <motion.button className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" onClick={close} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} aria-label="Close size guide"/>
  <motion.aside role="dialog" aria-modal="true" aria-label="Size guide" className="size-guide-panel size-guide-panel--image" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{duration:.38,ease:[.22,1,.36,1]}}>
   <div className="size-guide-panel__top">
    <div><p className="eyebrow text-bronze">Product sizing</p><h2 className="display mt-2 text-4xl sm:text-5xl">Size guide.</h2></div>
    <button onClick={close} className="size-guide-panel__close" aria-label="Close size guide"><X/></button>
   </div>
   <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink/55">{chart.name}</p><div className="flex items-center gap-1"><button type="button" className="grid h-10 w-10 place-items-center border border-line disabled:opacity-30" disabled={zoom<=1} onClick={()=>adjust(-.25)} aria-label="Zoom out"><ZoomOut size={16}/></button><span className="min-w-14 text-center text-xs">{Math.round(zoom*100)}%</span><button type="button" className="grid h-10 w-10 place-items-center border border-line disabled:opacity-30" disabled={zoom>=3} onClick={()=>adjust(.25)} aria-label="Zoom in"><ZoomIn size={16}/></button><button type="button" className="grid h-10 w-10 place-items-center border border-line" onClick={()=>setZoom(1)} aria-label="Reset zoom"><RotateCcw size={15}/></button></div></div>
   <p className="mt-2 text-[10px] tracking-[.12em] text-ink/40">MOUSE WHEEL OR + / − TO ZOOM · SCROLL TO MOVE AROUND</p>
   <div className="size-guide-panel__image size-guide-panel__image--only overflow-auto" onWheel={event=>{event.preventDefault();adjust(event.deltaY<0?.15:-.15)}}>
    <img src={chart.imageUrl} alt={chart.name+' size chart'} draggable={false} style={{width:`${zoom*100}%`,maxWidth:'none',height:'auto'}} className="mx-auto select-none"/>
   </div>
  </motion.aside>
 </>;
}

const preorderDistricts=['Ampara','Anuradhapura','Badulla','Batticaloa','Colombo','Galle','Gampaha','Hambantota','Jaffna','Kalutara','Kandy','Kegalle','Kilinochchi','Kurunegala','Mannar','Matale','Matara','Monaragala','Mullaitivu','Nuwara Eliya','Polonnaruwa','Puttalam','Ratnapura','Trincomalee','Vavuniya'];
function PreorderRequestModal({product,variant,quantity,user,close}:{product:Product;variant:Variant;quantity:number;user:{firstName?:string;lastName?:string;email:string;mobile?:string;city?:string;district?:string}|null;close:()=>void}){
 const[name,setName]=useState([user?.firstName,user?.lastName].filter(Boolean).join(' ')),[phone,setPhone]=useState(user?.mobile||''),[whatsapp,setWhatsapp]=useState(user?.mobile||''),[email,setEmail]=useState(user?.email||''),[city,setCity]=useState(user?.city||''),[district,setDistrict]=useState(user?.district||''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[requestId,setRequestId]=useState('');
 async function submit(event:React.FormEvent){
  event.preventDefault();setError('');
  if(name.trim().length<2||phone.trim().length<9||whatsapp.trim().length<9||city.trim().length<2||!district){setError('Please complete your name, mobile, WhatsApp, city and district.');return}
  setBusy(true);
  try{const result=await api.createPreorder({customerName:name,phone,whatsapp,email:email||undefined,city,district,productId:product.id,variantId:variant.id,quantity,notes:notes||undefined});setRequestId(result.requestId)}
  catch(reason){setError(reason instanceof Error?reason.message:'Could not send the pre-order request.')}
  finally{setBusy(false)}
 }
 return <><motion.button className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px]" onClick={close} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} aria-label="Close pre-order form"/><motion.aside role="dialog" aria-modal="true" aria-label="Pre-order request" className="fixed inset-x-0 bottom-0 z-[71] max-h-[92svh] overflow-y-auto rounded-t-[24px] bg-[#f4f0e8] p-5 shadow-2xl sm:left-auto sm:right-5 sm:top-5 sm:bottom-5 sm:w-[520px] sm:rounded-[18px] sm:p-7" initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{duration:.3,ease:[.22,1,.36,1]}}>
  <div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-bronze">Pre-order request</p><h2 className="display mt-2 text-3xl sm:text-4xl">{product.name}</h2><p className="mt-2 text-xs text-ink/55">{variant.color} / {variant.size} · Qty {quantity} · {money(product.price)} each</p></div><button onClick={close} className="grid h-11 w-11 shrink-0 place-items-center border border-line" aria-label="Close"><X size={18}/></button></div>
  {requestId?<div className="grid min-h-[360px] place-content-center text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald-800/30 text-emerald-800"><CheckCircle2 size={28}/></span><p className="eyebrow mt-6 text-emerald-800">Request received</p><h3 className="display mt-2 text-4xl">{requestId}</h3><p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-ink/60">No payment has been taken. ZEVENRA will contact you on WhatsApp before this item is added to a SHEIN supplier batch.</p><button className="btn btn-dark mx-auto mt-7" onClick={close}>Continue shopping</button></div>:<form onSubmit={submit} className="mt-6 space-y-5">
   <div className="border-l-2 border-bronze bg-white/40 p-4 text-xs leading-6 text-ink/60"><b className="text-ink">No payment now.</b> This is only a request. We will confirm the final price and your interest on WhatsApp before spending money on the supplier order.</div>
   <div className="grid gap-4 sm:grid-cols-2"><PreField label="Full name *" value={name} set={setName}/><PreField label="Mobile number *" value={phone} set={setPhone} type="tel"/><PreField label="WhatsApp number *" value={whatsapp} set={setWhatsapp} type="tel"/><PreField label="Email (optional)" value={email} set={setEmail} type="email"/><PreField label="City *" value={city} set={setCity}/><label className="text-xs">District *<select className="field mt-2" value={district} onChange={e=>setDistrict(e.target.value)} required><option value="">Select district</option>{preorderDistricts.map(value=><option key={value}>{value}</option>)}</select></label></div>
   <label className="block text-xs">Note (optional)<textarea className="field mt-2 min-h-20 resize-none" maxLength={300} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Anything we should know?"/></label>
   {error&&<p className="bg-red-950 p-3 text-xs leading-5 text-white">{error}</p>}
   <button disabled={busy} className="btn btn-dark w-full disabled:opacity-50">{busy?'Sending request…':'Request pre-order'}</button><p className="text-center text-[10px] leading-5 text-ink/45">You are not committing to payment at this stage.</p>
  </form>}
 </motion.aside></>;
}
function PreField({label,value,set,type='text'}:{label:string;value:string;set:(value:string)=>void;type?:string}){return <label className="text-xs">{label}<input className="field mt-2" type={type} inputMode={type==='tel'?'tel':undefined} value={value} onChange={e=>set(e.target.value)}/></label>}

function Option({title,value,children}:{title:string;value:string;children:React.ReactNode}){return <div className="mt-8"><div className="mb-3 flex justify-between"><span className="eyebrow">{title}</span><span className="text-xs">{value}</span></div><div className="flex flex-wrap gap-2">{children}</div></div>}
