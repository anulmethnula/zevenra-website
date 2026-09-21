import {useEffect,useState,type ReactNode} from 'react';
import {Link,NavLink,Outlet,useLocation} from 'react-router-dom';
import {AnimatePresence,motion} from 'framer-motion';
import {ArrowRight,ArrowUpRight,ChevronDown,Instagram,Menu,MessageCircle,PackageCheck,Search,ShoppingBag,Truck,UserRound,X} from 'lucide-react';
import {CartDrawer} from '../components/CartDrawer';
import {useCart} from '../features/cart/CartContext';
import {navigationHref,useStore} from '../features/store/StoreContext';
import {getNavigationCategories} from '../services/navigation';
import {useCustomerAuth} from '../features/account/CustomerAuthContext';
import type {Category} from '../types';

function TikTokIcon({size=16}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4v10.2a4.8 4.8 0 1 1-4.1-4.75"/><path d="M15 4c.55 2.75 2.15 4.35 5 5"/></svg>}
type NavEntry={id:string;label:string;to:string;children?:Category[];external?:boolean};

export function StoreLayout(){
 const cart=useCart(),{user}=useCustomerAuth(),{data}=useStore(),location=useLocation(),[menu,setMenu]=useState(false),[solid,setSolid]=useState(location.pathname!=='/');
 useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'auto'});setMenu(false);const update=()=>setSolid(location.pathname!=='/'||scrollY>48);update();addEventListener('scroll',update,{passive:true});return()=>removeEventListener('scroll',update)},[location.pathname,location.search]);
 const categories=getNavigationCategories(data.categories,data.products);
 const configured=data.navigation.filter(item=>item.visible).sort((a,b)=>a.sortOrder-b.sortOrder);
 const configuredEntries:NavEntry[]=configured.map(item=>{const href=navigationHref(item,data.categories,data.collections),raw=String(item.target??'').replace(/^\/category\//,'');const category=item.linkType==='category'?categories.find(c=>c.id===raw||c.slug===raw):undefined;return{id:item.id,label:item.label.toUpperCase(),to:href,children:category?.children,external:item.linkType==='url'&&/^https?:\/\//i.test(href)}});
 const representedCategories=new Set(configured.filter(item=>item.linkType==='category').map(item=>{const raw=String(item.target??'').replace(/^\/category\//,'');return categories.find(c=>c.id===raw||c.slug===raw)?.id}).filter(Boolean));
 const missingCategories:NavEntry[]=categories.filter(category=>!representedCategories.has(category.id)).map(category=>({id:'auto-'+category.id,label:category.name.toUpperCase(),to:'/category/'+category.slug,children:category.children}));
 let nav:NavEntry[];
 if(configuredEntries.length){const aboutIndex=configuredEntries.findIndex(item=>item.to==='/about');nav=aboutIndex>=0?[...configuredEntries.slice(0,aboutIndex),...missingCategories,...configuredEntries.slice(aboutIndex)]:[...configuredEntries,...missingCategories]}else nav=[{id:'new',label:'NEW',to:'/shop?new=true'},{id:'shop',label:'SHOP',to:'/shop'},...missingCategories,{id:'about',label:'ABOUT',to:'/about'}];
 const instagram=validExternalUrl(data.settings.instagram||''),tiktok=validExternalUrl(data.settings.tiktok||'');
 return <div>{data.settings.announcement&&<div className="announcement">{data.settings.announcement}</div>}<header className={'site-header '+(solid?'site-header--solid':'site-header--hero')}><div className="site-header__inner"><button onClick={()=>setMenu(true)} aria-label="Open menu" className="nav-icon lg:hidden"><Menu size={20}/></button><Link to="/" className="site-logo" aria-label="ZEVENRA home"><img src="/brand/zevenraname-nav.png" alt="ZEVENRA"/></Link><DesktopNavigation items={nav}/><div className="header-actions"><Link to="/shop?focusSearch=1" aria-label="Search products" className="nav-icon"><Search size={19}/></Link><Link to={user?'/account':'/account/login'} aria-label={user?'Your account':'Sign in or create account'} className={'nav-icon '+(user?'nav-icon--active':'')}><UserRound size={19}/></Link><button onClick={()=>cart.setOpen(true)} aria-label={'Bag with '+cart.count+' items'} className="nav-icon"><ShoppingBag size={19}/><span className="bag-count">{cart.count}</span></button></div></div></header><AnimatePresence>{menu&&<MobileMenu items={nav} close={()=>setMenu(false)} logo="/brand/zevenraname-nav.png" instagram={instagram} tiktok={tiktok}/>}</AnimatePresence><main><Outlet/></main><Footer/><CartDrawer/></div>
}

function NavEntryLink({item,children,className}:{item:NavEntry;children:ReactNode;className?:string}){return item.external?<a href={item.to} target="_blank" rel="noreferrer noopener" className={className}>{children}</a>:<NavLink to={item.to} className={className}>{children}</NavLink>}
function DesktopNavigation({items}:{items:NavEntry[]}){return <nav className="desktop-nav" aria-label="Primary navigation">{items.map(item=>item.children?.length?<div className="desktop-category" key={item.id}><NavEntryLink item={item}>{item.label}<ChevronDown size={12}/></NavEntryLink><div className="category-menu"><Link className="category-menu__all" to={item.to}>SHOP ALL {item.label}</Link>{item.children.map(child=><Link key={child.id} to={'/category/'+child.slug}>{child.name.toUpperCase()}</Link>)}</div></div>:<NavEntryLink key={item.id} item={item}>{item.label}</NavEntryLink>)}</nav>}

function MobileMenu({items,close,logo,instagram,tiktok}:{items:NavEntry[];close:()=>void;logo:string;instagram:string;tiktok:string}){return <motion.div className="mobile-menu" initial={{clipPath:'inset(0 0 100% 0)'}} animate={{clipPath:'inset(0 0 0% 0)'}} exit={{clipPath:'inset(0 0 100% 0)'}} transition={{duration:.55,ease:[.76,0,.24,1]}}><div className="mobile-menu__top"><img src={logo} alt="ZEVENRA"/><button onClick={close} aria-label="Close menu"><X/></button></div><nav>{items.map((item,index)=><motion.div key={item.id} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.15+index*.045}}>{item.external?<a href={item.to} target="_blank" rel="noreferrer noopener"><span>{String(index+1).padStart(2,'0')}</span>{item.label}<ArrowUpRight/></a>:<Link to={item.to}><span>{String(index+1).padStart(2,'0')}</span>{item.label}<ArrowUpRight/></Link>}{item.children&&item.children.length>0&&<div className="mobile-subcategories">{item.children.map(child=><Link key={child.id} to={'/category/'+child.slug}>{child.name.toUpperCase()}</Link>)}</div>}</motion.div>)}</nav><div className="mobile-menu__foot">{instagram&&<a href={instagram} target="_blank" rel="noreferrer noopener">INSTAGRAM</a>}{tiktok&&<a href={tiktok} target="_blank" rel="noreferrer noopener">TIKTOK</a>}<Link to="/contact">CONTACT</Link></div></motion.div>}

function validExternalUrl(value:string){try{const url=new URL(value.trim());return url.protocol==='https:'||url.protocol==='http:'?url.toString():''}catch{return''}}
function whatsappUrl(value:string){const digits=value.replace(/\D/g,'');return digits.length>=8?`https://wa.me/${digits}`:''}

function Footer(){
 const{data}=useStore(),settings=data.settings;
 const instagram=validExternalUrl(settings.instagram||''),tiktok=validExternalUrl(settings.tiktok||''),whatsapp=whatsappUrl(settings.whatsapp||'');
 const topCategories=data.categories.filter(category=>category.active&&!category.parentId).sort((a,b)=>a.sortOrder-b.sortOrder);
 const supportContent=<><MessageCircle/><span><b>{whatsapp?'WhatsApp support':'Customer care'}</b><small>{whatsapp?'Need help before ordering? Talk to us.':'Need help before ordering? Visit our contact page.'}</small></span></>;
 return <>
  <section className="footer-assurances" aria-label="Shopping assurances"><div className="container">
   <div><Truck/><span><b>Islandwide delivery</b><small>Delivery across Sri Lanka.</small></span></div>
   <div><PackageCheck/><span><b>Sourced with care</b><small>Selected pieces from trusted sources.</small></span></div>
   {whatsapp?<a href={whatsapp} target="_blank" rel="noreferrer noopener">{supportContent}</a>:<Link to="/contact">{supportContent}</Link>}
  </div></section>
  <footer className="site-footer"><div className="container footer-main">
   <div className="footer-brand"><img src={settings.logoLight} alt={settings.brandName||'ZEVENRA'} className="footer-logo"/><p className="footer-title">The art of<br/><em>becoming.</em></p><p className="footer-description">Selected beyond borders.<br/>Curated for here.</p><p className="footer-supporting">Fashion, people, stories — always becoming.</p><Link className="footer-brand-cta" to="/shop"><span>Explore the collection</span><ArrowRight size={16}/></Link></div>
   <div className="footer-column footer-shop"><p className="footer-label">Shop</p><Link to="/shop">Shop All</Link><Link to="/shop?new=true">New Arrivals</Link>{topCategories.map(category=><Link key={category.id} to={`/category/${category.slug}`}>{category.name}</Link>)}<Link to="/about">About</Link></div>
   <div className="footer-column footer-care"><p className="footer-label">Customer Care</p><Link to="/delivery">Delivery</Link><Link to="/returns">Returns &amp; Exchanges</Link><Link to="/contact">Contact</Link></div>
   {(instagram||tiktok||whatsapp)&&<div className="footer-column footer-follow"><p className="footer-label">Follow ZEVENRA</p>{instagram&&<a href={instagram} target="_blank" rel="noreferrer noopener"><Instagram size={16}/>Instagram</a>}{tiktok&&<a href={tiktok} target="_blank" rel="noreferrer noopener"><TikTokIcon/>TikTok</a>}{whatsapp&&<a href={whatsapp} target="_blank" rel="noreferrer noopener"><MessageCircle size={16}/>WhatsApp</a>}</div>}
   <div className="footer-column footer-legal"><p className="footer-label">Legal</p><Link to="/privacy">Privacy</Link><Link to="/terms">Terms &amp; Conditions</Link></div>
  </div><div className="container footer-bottom"><span>© {new Date().getFullYear()} ZEVENRA. ALL RIGHTS RESERVED.</span><span>SRI LANKA</span><span><Link to="/privacy">PRIVACY</Link><Link to="/terms">TERMS</Link></span></div></footer>
 </>
}
