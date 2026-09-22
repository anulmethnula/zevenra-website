import {useEffect,useState,type FormEvent} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,Copy,ImagePlus,Plus,Star,Trash2} from 'lucide-react';
import {useStore} from '../../features/store/StoreContext';
import {uploadAdminMedia} from '../../services/cloudinaryUpload';
import type {Media,Product,SizeChart,Variant} from '../../types';

const blank:Product={id:'',slug:'',name:'',shortDescription:'',description:'',price:0,categoryId:'',collectionIds:[],media:[],material:'',fit:'',care:'',tags:[],featured:false,newArrival:false,preorderEnabled:false,preorderMessage:'Available for pre-order. We will confirm the expected delivery time after your order.',status:'draft',sortOrder:0,variants:[]};
const slugify=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const mediaType=(url:string):Media['type']=>/\.(mp4|webm|mov)(\?|$)/i.test(url)?'video':'image';

export default function ProductEditor(){
 const{id}=useParams(),nav=useNavigate(),store=useStore(),found=store.data.products.find(x=>x.id===id);
 const[product,setProduct]=useState<Product>(found?structuredClone(found):{...blank,id:crypto.randomUUID(),sortOrder:store.data.products.length+1}),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[mediaBusy,setMediaBusy]=useState(false),[chartBusy,setChartBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}};addEventListener('beforeunload',warn);return()=>removeEventListener('beforeunload',warn)},[dirty]);
 useEffect(()=>{if(found&&!dirty)setProduct(structuredClone(found))},[found,dirty]);
 const set=<K extends keyof Product>(key:K,value:Product[K])=>{setDirty(true);setProduct(x=>({...x,[key]:value}))};
 const setName=(value:string)=>{setDirty(true);setProduct(x=>({...x,name:value,slug:!x.slug||x.slug===slugify(x.name)?slugify(value):x.slug}))};
 const variant=(variantId:string,patch:Partial<Variant>)=>set('variants',product.variants.map(v=>v.id===variantId?{...v,...patch}:v));
 const addVariant=()=>set('variants',[...product.variants,{id:crypto.randomUUID(),sku:'',color:product.variants[0]?.color||'Default',size:'',stock:0,lowStockThreshold:1,active:true}]);

 const activeCategories=store.data.categories.filter(category=>category.active),mainCategories=activeCategories.filter(category=>!category.parentId).sort((a,b)=>a.sortOrder-b.sortOrder),selectedCategory=activeCategories.find(category=>category.id===product.categoryId);
 const mainCategoryId=selectedCategory?.parentId||selectedCategory?.id||'',subcategories=activeCategories.filter(category=>category.parentId===mainCategoryId).sort((a,b)=>a.sortOrder-b.sortOrder),subcategoryId=selectedCategory?.parentId?selectedCategory.id:'';
 const selectedChart=store.data.sizeCharts.find(chart=>chart.id===product.sizeChartId);

 function selectMain(id:string){set('categoryId',id)}
 function selectSub(id:string){set('categoryId',id||mainCategoryId)}
 async function uploadSizeChart(file?:File){
  if(!file)return;
  setChartBusy(true);setError('');
  try{
   const imageUrl=await uploadAdminMedia(file);
   const chart:SizeChart=selectedChart?{...selectedChart,imageUrl,columns:[],rows:[],unit:'',notes:''}:{id:crypto.randomUUID(),name:(product.name||'Product')+' — Size Chart',unit:'',columns:[],rows:[],imageUrl,notes:''};
   await store.commit('sizeCharts',chart);
   set('sizeChartId',chart.id);
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not upload size chart.')}finally{setChartBusy(false)}
 }
 async function uploadMedia(files:FileList|null){
  if(!files?.length)return;
  setMediaBusy(true);setError('');
  try{
   const uploaded:Media[]=[];
   for(const file of Array.from(files)){
    const url=await uploadAdminMedia(file);
    uploaded.push({url,alt:product.name||'ZEVENRA product',type:file.type.startsWith('video/')?'video':'image'});
   }
   set('media',[...product.media,...uploaded]);
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not upload media.')}finally{setMediaBusy(false)}
 }
 function addMedia(){
  const url=prompt('Paste an image or video URL');
  if(!url?.trim())return;
  set('media',[...product.media,{url:url.trim(),alt:product.name||'ZEVENRA product',type:mediaType(url.trim())}])
 }
 function makePrimary(index:number){if(index===0)return;const media=[...product.media],chosen=media.splice(index,1)[0];set('media',[chosen,...media])}
 function moveMedia(index:number,direction:-1|1){const target=index+direction;if(target<0||target>=product.media.length)return;const media=[...product.media];[media[index],media[target]]=[media[target],media[index]];set('media',media)}

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');
  const activeVariants=product.variants.filter(v=>v.active);
  if(!product.name.trim()||!product.categoryId||product.price<=0){setError('Name, category and a valid selling price are required.');return}
  if(!activeVariants.length){setError('Add at least one active size / stock variant.');return}
  if(activeVariants.some(v=>!v.color.trim()||!v.size.trim()||v.stock<0)){setError('Every active variant needs a colour, size and valid stock quantity.');return}
  setBusy(true);
  try{await store.commit('products',{...product,slug:product.slug||slugify(product.name)});setDirty(false);nav('/admin/products')}catch(reason){setError(reason instanceof Error?reason.message:'Could not save product. Your changes are still here—try again.')}finally{setBusy(false)}
 }
 function cancel(){if(!dirty||confirm('Discard unsaved changes?'))nav('/admin/products')}

 return <form onSubmit={submit}>
  <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-4 border-b border-black/10 bg-[#e9e5de]/95 px-4 py-4 backdrop-blur sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10">
   <div><p className="eyebrow text-black/45">Catalogue / {found?'Edit':'New'}</p><h1 className="display mt-1 text-3xl">{product.name||'Add a product'}</h1></div>
   <div className="flex flex-wrap items-center gap-2">{dirty&&<span className="mr-2 text-xs text-amber-900">Unsaved changes</span>}<button type="button" onClick={cancel} className="btn">Cancel</button><button disabled={busy} className="btn btn-dark disabled:opacity-50">{busy?'Saving…':found?'Save Changes':'Save Product'}</button></div>
  </div>
  {error&&<p role="alert" className="mt-5 bg-red-950 p-4 text-sm text-white">{error}</p>}

  <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
   <div className="space-y-6">
    <Card title="Basic information">
     <Field label="Product name" value={product.name} set={setName} required/>
     <Field label="Slug" value={product.slug} set={value=>set('slug',slugify(value))} placeholder={slugify(product.name)}/>
     <Field label="Short description" value={product.shortDescription} set={value=>set('shortDescription',value)}/>
     <label className="block text-xs">Full description<textarea rows={6} className="field mt-2" value={product.description} onChange={e=>set('description',e.target.value)}/></label>
    </Card>

    <Card title="Product images & video">
     <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {product.media.map((media,index)=><div key={media.url+'-'+index} className="group relative overflow-hidden border border-black/10 bg-white">
       {media.type==='video'?<video src={media.url} muted playsInline controls preload="metadata" className="aspect-[4/5] w-full object-cover"/>:<img src={media.url} alt={media.alt||product.name} className="aspect-[4/5] w-full object-cover" loading="lazy" decoding="async"/>}
       <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent p-2 text-white"><span className="text-[8px] tracking-[.14em]">{index===0?'PRIMARY':media.type.toUpperCase()}</span>{index!==0&&<button type="button" onClick={()=>makePrimary(index)} title="Make primary image" className="grid h-9 w-9 place-items-center bg-black/35"><Star size={14}/></button>}</div>
       <div className="absolute inset-x-2 bottom-2 flex justify-between gap-1"><div className="flex gap-1"><button type="button" disabled={index===0} onClick={()=>moveMedia(index,-1)} aria-label="Move media left" className="grid h-9 w-9 place-items-center bg-white/95 disabled:opacity-40"><ArrowLeft size={14}/></button><button type="button" disabled={index===product.media.length-1} onClick={()=>moveMedia(index,1)} aria-label="Move media right" className="grid h-9 w-9 place-items-center bg-white/95 disabled:opacity-40"><ArrowRight size={14}/></button></div><button type="button" aria-label="Remove media" onClick={()=>set('media',product.media.filter((_,i)=>i!==index))} className="grid h-9 w-9 place-items-center bg-white/95 text-red-800"><Trash2 size={15}/></button></div>
      </div>)}
      <label className="grid aspect-[4/5] cursor-pointer place-content-center border border-dashed border-black/25 bg-black/[.02] text-center text-xs">
       <ImagePlus className="mx-auto mb-2"/>{mediaBusy?'Uploading…':'Upload images / video'}
       <input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" disabled={mediaBusy} onChange={e=>{void uploadMedia(e.target.files);e.currentTarget.value=''}}/>
      </label>
     </div>
     <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={addMedia} className="text-xs underline underline-offset-4">Or paste media URL</button>{mediaBusy&&<span className="text-xs text-black/45">Uploading securely to Cloudinary…</span>}</div>
     <p className="text-xs leading-6 text-black/45">Upload product images here directly. The first tile is the main storefront image; use the star or arrow controls to reorder.</p>
    </Card>

    <Card title="Product details"><div className="grid gap-3 sm:grid-cols-3"><Field label="Material" value={product.material} set={value=>set('material',value)}/><Field label="Fit" value={product.fit} set={value=>set('fit',value)}/><Field label="Care" value={product.care} set={value=>set('care',value)}/></div></Card>

    <Card title="Size, colour & stock">
     <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-black/10 bg-white/45 p-4"><div><p className="text-sm">Stock is controlled per colour + size.</p><p className="mt-1 text-xs text-black/45">Add each real size you sell and its available stock. The size-chart image is only a customer reference.</p></div><button type="button" onClick={addVariant} className="btn"><Plus size={14}/> Add variant</button></div>
     <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr>{['Colour','Size','SKU','Stock','Low stock','Active',''].map(x=><th key={x} className="p-2 text-left text-xs font-normal">{x}</th>)}</tr></thead><tbody>{product.variants.map(v=><tr key={v.id} className="border-t border-black/10"><td><input className="field my-2" value={v.color} placeholder="Black" onChange={e=>variant(v.id,{color:e.target.value})}/></td><td><input className="field" value={v.size} placeholder="S" onChange={e=>variant(v.id,{size:e.target.value})}/></td><td><input className="field" value={v.sku} placeholder="Optional" onChange={e=>variant(v.id,{sku:e.target.value})}/></td><td><input className="field w-24" type="number" min="0" value={v.stock} onChange={e=>variant(v.id,{stock:Math.max(0,Number(e.target.value))})}/></td><td><input className="field w-24" type="number" min="0" value={v.lowStockThreshold} onChange={e=>variant(v.id,{lowStockThreshold:Math.max(0,Number(e.target.value))})}/></td><td><input type="checkbox" checked={v.active} onChange={e=>variant(v.id,{active:e.target.checked})}/></td><td><div className="flex"><button type="button" title="Duplicate variant" onClick={()=>set('variants',[...product.variants,{...v,id:crypto.randomUUID(),sku:v.sku?v.sku+'-COPY':''}])}><Copy size={15}/></button><button type="button" title="Remove variant" onClick={()=>set('variants',product.variants.filter(x=>x.id!==v.id))} className="ml-3 text-red-800"><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>
     {!product.variants.length&&<p className="py-8 text-center text-sm text-black/45">No variants yet. Add the actual colour, size and stock combinations you are selling.</p>}
    </Card>
   </div>

   <aside className="space-y-6">
    <Card title="Status"><label className="text-xs">Publication status<select className="field mt-2" value={product.status} onChange={e=>set('status',e.target.value as Product['status'])}><option>draft</option><option>published</option><option>archived</option></select></label><Check label="Featured" checked={product.featured} set={value=>set('featured',value)}/><Check label="New arrival" checked={product.newArrival} set={value=>set('newArrival',value)}/><Check label="Allow pre-order when a size is out of stock" checked={Boolean(product.preorderEnabled)} set={value=>set('preorderEnabled',value)}/>{product.preorderEnabled&&<Field label="Pre-order message" value={product.preorderMessage||''} set={value=>set('preorderMessage',value)}/>}</Card>

    <Card title="Category">
     <label className="text-xs">Main category<select required className="field mt-2" value={mainCategoryId} onChange={e=>selectMain(e.target.value)}><option value="">Select main category</option>{mainCategories.map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>
     {mainCategoryId&&<label className="text-xs">Subcategory<select className="field mt-2" value={subcategoryId} onChange={e=>selectSub(e.target.value)}><option value="">General / main category</option>{subcategories.map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>}
     <p className="text-xs leading-5 text-black/45">Choose the exact group when possible. Example: WOMEN → Crop Tops. If a product does not need a subcategory, leave it under the main category.</p>
     <Field label="Tags (optional, comma separated)" value={product.tags.join(', ')} set={value=>set('tags',value.split(',').map(x=>x.trim()).filter(Boolean))}/>
    </Card>

    <Card title="Collections"><div className="grid gap-1">{store.data.collections.length?store.data.collections.map(col=><Check key={col.id} label={col.name} checked={product.collectionIds.includes(col.id)} set={yes=>set('collectionIds',yes?[...product.collectionIds,col.id]:product.collectionIds.filter(x=>x!==col.id))}/>):<p className="text-xs text-black/45">No collections yet.</p>}</div></Card>

    <Card title="Pricing"><Field label="Selling price (LKR)" value={String(product.price||'')} set={value=>set('price',Number(value))}/><Field label="Compare-at price" value={String(product.compareAtPrice||'')} set={value=>set('compareAtPrice',value?Number(value):undefined)}/></Card>

    <Card title="Size chart image">
     <label className="btn btn-dark cursor-pointer justify-center">{chartBusy?'Uploading…':selectedChart?.imageUrl?'Replace size chart image':'Upload size chart image'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={chartBusy} onChange={e=>{void uploadSizeChart(e.target.files?.[0]);e.currentTarget.value=''}}/></label>
     {selectedChart?.imageUrl&&<div className="border border-black/10 bg-white p-2"><img src={selectedChart.imageUrl} alt={selectedChart.name} className="mx-auto max-h-64 w-full object-contain"/></div>}
     {product.sizeChartId&&<button type="button" className="text-left text-xs underline underline-offset-4" onClick={()=>set('sizeChartId',undefined)}>Remove size chart from this product</button>}
     <p className="text-xs leading-5 text-black/45">Upload the supplier's size-chart image only. No measurement table needs to be typed manually.</p>
    </Card>
   </aside>
  </div>
 </form>
}

function Card({title,children}:{title:string;children:React.ReactNode}){return <section className="bg-[#f6f3ed] p-5 sm:p-6"><p className="eyebrow mb-5">{title}</p><div className="grid gap-4">{children}</div></section>}
function Field({label,value,set,required,placeholder}:{label:string;value:string;set:(value:string)=>void;required?:boolean;placeholder?:string}){return <label className="block text-xs">{label}<input required={required} placeholder={placeholder} className="field mt-2" value={value} onChange={e=>set(e.target.value)}/></label>}
function Check({label,checked,set}:{label:string;checked:boolean;set:(value:boolean)=>void}){return <label className="flex min-h-11 items-center gap-3 text-xs"><input type="checkbox" className="h-5 w-5 accent-black" checked={checked} onChange={e=>set(e.target.checked)}/>{label}</label>}
