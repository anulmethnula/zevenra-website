import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {Search,SlidersHorizontal,X} from 'lucide-react';
import {AnimatePresence,motion} from 'framer-motion';
import {ProductCard} from '../components/ProductCard';
import {Seo} from '../components/Seo';
import {useStore} from '../features/store/StoreContext';
import {getDescendantCategoryIds} from '../services/navigation';

export default function ShopPage(){
 const{slug}=useParams(),[params,setParams]=useSearchParams(),{data}=useStore();
 const all=data.products.filter(p=>p.status==='published');
 const activeCategories=data.categories.filter(c=>c.active);
 const populatedCategories=activeCategories.filter(c=>all.some(p=>getDescendantCategoryIds(c.id,data.categories).includes(p.categoryId)));
 const activeCollections=data.collections.filter(c=>c.active);
 const collections=activeCollections.filter(c=>all.some(p=>p.collectionIds.includes(c.id)));
 const routeCategory=activeCategories.find(c=>c.slug===slug);
 const routeCollection=activeCollections.find(c=>c.slug===slug);
 const categories=routeCategory&&!populatedCategories.some(c=>c.id===routeCategory.id)?[routeCategory,...populatedCategories]:populatedCategories;
 const priceCeiling=Math.max(1000,Math.ceil(Math.max(0,...all.map(p=>p.price))/1000)*1000);
 const[cat,setCat]=useState(routeCategory?.slug||'all'),[collection,setCollection]=useState(routeCollection?.id||'all'),[sort,setSort]=useState('newest'),[available,setAvailable]=useState(false),[size,setSize]=useState('all'),[color,setColor]=useState('all'),[maxPrice,setMaxPrice]=useState(priceCeiling),[filters,setFilters]=useState(false),[search,setSearch]=useState(params.get('q')||'');
 const query=(params.get('q')||'').trim().toLowerCase();
 useEffect(()=>{setCat(routeCategory?.slug||'all');setCollection(routeCollection?.id||'all')},[slug,routeCategory?.slug,routeCollection?.id]);
 useEffect(()=>setSearch(params.get('q')||''),[params]);
 const sizes=[...new Set(all.flatMap(p=>p.variants.filter(v=>v.active).map(v=>v.size)))];
 const colors=[...new Set(all.flatMap(p=>p.variants.filter(v=>v.active).map(v=>v.color)))];
 const title=routeCollection?.name||routeCategory?.name||(query?'Search':'Shop');
 const subcategories=routeCategory?activeCategories.filter(c=>c.parentId===routeCategory.id):[];
 const list=useMemo(()=>all.filter(p=>{
  const selected=activeCategories.find(c=>c.slug===cat),categoryIds=selected?getDescendantCategoryIds(selected.id,data.categories):[];
  const categoryName=activeCategories.find(c=>c.id===p.categoryId)?.name||'';
  const haystack=[p.name,p.shortDescription,categoryName,...p.tags].join(' ').toLowerCase();
  return(cat==='all'||categoryIds.includes(p.categoryId))&&(collection==='all'||p.collectionIds.includes(collection))&&(size==='all'||p.variants.some(v=>v.active&&v.size===size))&&(color==='all'||p.variants.some(v=>v.active&&v.color===color))&&p.price<=maxPrice&&(!available||p.variants.some(v=>v.active&&v.stock>0))&&(!params.has('new')||p.newArrival)&&(!query||haystack.includes(query));
 }).sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:b.sortOrder-a.sortOrder),[all,activeCategories,cat,collection,size,color,maxPrice,available,params,query,sort,data.categories]);
 function submitSearch(event:FormEvent<HTMLFormElement>){event.preventDefault();const next=new URLSearchParams(params);const value=search.trim();if(value)next.set('q',value);else next.delete('q');next.delete('focusSearch');setParams(next)}
 const controls=<div className="space-y-6"><Filter label="Category" value={cat} onChange={setCat} options={categories.map(c=>[c.slug,c.name])}/><Filter label="Collection" value={collection} onChange={setCollection} options={collections.map(c=>[c.id,c.name])}/><Filter label="Size" value={size} onChange={setSize} options={sizes.map(x=>[x,x])}/><Filter label="Colour" value={color} onChange={setColor} options={colors.map(x=>[x,x])}/><div><p className="eyebrow mb-3">Up to LKR {maxPrice.toLocaleString()}</p><input aria-label="Maximum price" className="w-full accent-black" type="range" min="1000" max={priceCeiling} step="1000" value={maxPrice} onChange={e=>setMaxPrice(Number(e.target.value))}/></div><Filter label="Sort" value={sort} onChange={setSort} options={[["newest","Newest"],["low","Price low–high"],["high","Price high–low"]]}/><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)} className="h-5 w-5 accent-black"/> Available only</label></div>;
 return <><Seo title={query?'Search: '+(params.get('q')||''):title}/><div className="container pb-24 pt-36 lg:pt-44">
  <div className="mb-8 flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow text-bronze">The ZEVENRA edit</p><h1 className="display mt-3 text-6xl md:text-8xl">{title}</h1><p className="mt-4 text-xs tracking-[.16em] text-ink/45">{list.length} PIECES{query?' · “'+(params.get('q')||'')+'”':''}</p></div><button onClick={()=>setFilters(true)} className="btn lg:hidden"><SlidersHorizontal size={15}/> Filter</button></div>
  <form onSubmit={submitSearch} className="mb-10 flex max-w-2xl border-b border-black/20" role="search"><Search size={18} className="my-auto mr-3 shrink-0"/><input aria-label="Search products" autoFocus={params.has('focusSearch')} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search pieces, categories, tags…" className="min-h-12 flex-1 bg-transparent text-sm outline-none"/>{search&&<button type="button" onClick={()=>{setSearch('');const next=new URLSearchParams(params);next.delete('q');setParams(next)}} aria-label="Clear search" className="min-h-11 min-w-11"><X size={16}/></button>}<button className="px-3 text-[10px] tracking-[.18em]">SEARCH</button></form>
  {subcategories.length>0&&<nav aria-label={title+' subcategories'} className="mb-12 flex flex-wrap gap-x-7 gap-y-3 border-y hairline py-5"><Link to={'/category/'+routeCategory?.slug} className="text-[10px] tracking-[.18em]">SHOP ALL</Link>{subcategories.sort((a,b)=>a.sortOrder-b.sortOrder).map(child=><Link key={child.id} to={'/category/'+child.slug} className="text-[10px] tracking-[.18em]">{child.name.toUpperCase()}</Link>)}</nav>}
  <div className="grid gap-12 lg:grid-cols-[220px_1fr]"><aside className="hidden lg:block">{controls}</aside><div>{list.length?<div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 lg:gap-x-5">{list.map(p=><ProductCard key={p.id} product={p}/>)}</div>:<div className="grid min-h-96 place-content-center text-center"><h2 className="display text-4xl">{routeCategory||routeCollection?'This edit is still taking shape.':'Nothing found.'}</h2><p className="mt-3 text-sm text-ink/50">{query?'Try another search or clear your filters.':routeCategory||routeCollection?'New pieces will appear here when they are published.':'Try adjusting your filters.'}</p>{query&&<button className="btn mx-auto mt-6" onClick={()=>{setSearch('');const next=new URLSearchParams(params);next.delete('q');setParams(next)}}>Clear search</button>}</div>}</div></div>
 </div><AnimatePresence>{filters&&<><motion.button aria-label="Close filters" className="fixed inset-0 z-50 bg-black/60" onClick={()=>setFilters(false)} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}/><motion.div role="dialog" aria-modal="true" aria-label="Product filters" className="fixed inset-x-0 bottom-0 z-50 max-h-[88svh] overflow-auto bg-paper p-6" initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}}><div className="mb-7 flex items-center justify-between"><p className="eyebrow">Filter the edit</p><button onClick={()=>setFilters(false)} aria-label="Close filters" className="min-h-11 min-w-11"><X/></button></div>{controls}<button onClick={()=>setFilters(false)} className="btn btn-dark mt-8 w-full">Show {list.length} pieces</button></motion.div></>}</AnimatePresence></>
}
function Filter({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:string[][]}){return <div><p className="eyebrow mb-3">{label}</p><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)} className="field"><option value="all">All</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>}
