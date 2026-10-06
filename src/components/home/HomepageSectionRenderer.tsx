import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ProductCard } from "../ProductCard";
import type { Category, HomepageData, HomepageSection, ProductSummary, SiteSettings } from "../../types";
import { validExternalUrl } from "../../utils/contact";

const videoPattern = /\.(mp4|webm)(?:\?|$)/i;

export function ProductSection({ title, products, link = "/shop" }: { title: string; products: ProductSummary[]; link?: string }) {
  if (!products.length) return null;
  return <section className="section product-section"><div className="container"><div className="section-heading"><h2 className="display">{title}</h2><Link to={link}>VIEW ALL</Link></div><div className="store-product-grid">{products.slice(0, 4).map(product => <ProductCard key={product.id} product={product} />)}</div></div></section>;
}

export function CategorySection({ categories, title = "SHOP BY CATEGORY" }: { categories: Category[]; title?: string }) {
  if (!categories.length) return null;
  return <section className="section home-categories home-categories--editorial"><div className="container"><div className="home-category-heading"><div><p>BUILD YOUR STYLE</p><h2>{title}</h2></div></div><div className={`home-category-rail hide-scrollbar${categories.length === 3 ? " home-category-rail--three" : ""}`}>{categories.slice(0, 10).map(category => <Link key={category.id} to={`/category/${category.slug}`} className="home-category-tile">{category.imageUrl ? <picture>{category.mobileImageUrl && <source media="(max-width: 767px)" srcSet={category.mobileImageUrl}/>}<img src={category.imageUrl} alt={category.name} loading="lazy" decoding="async" /></picture> : <div className="category-grid__placeholder" aria-hidden="true"/>}<span>{category.name.toUpperCase()}</span></Link>)}</div></div></section>;
}

function ResponsiveMedia({ section }: { section: HomepageSection }) {
  const desktop = section.desktopMedia || section.mobileMedia || "", mobile = section.mobileMedia || desktop;
  const [failed, setFailed] = useState(false), video = videoPattern.test(desktop) || videoPattern.test(mobile), ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const node = ref.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => entry.isIntersecting ? void node.play().catch(() => undefined) : node.pause(), { rootMargin: "200px" }); observer.observe(node); return () => observer.disconnect(); }, [desktop, mobile]);
  if (!desktop || failed) return <div className="home-media-fallback" aria-hidden="true"/>;
  if (video) return <video ref={ref} muted loop playsInline preload="none" className="h-full w-full object-cover" onError={() => setFailed(true)}><source media="(max-width: 767px)" src={mobile}/><source src={desktop}/></video>;
  return <picture><source media="(max-width: 767px)" srcSet={mobile}/><img src={desktop} alt={section.title || "ZEVENRA editorial campaign"} loading="lazy" decoding="async" onError={() => setFailed(true)}/></picture>;
}

function Campaign({ section }: { section: HomepageSection }) {
  if (!section.desktopMedia && !section.mobileMedia) return null;
  return <section className={`home-banner home-section--${section.spacing}`}><ResponsiveMedia section={section}/><div className="home-banner__overlay" style={{ background: `rgba(0,0,0,${Math.min(90, Math.max(0, section.overlay))/100})` }}/>{(section.title || section.subtitle) && <div className={`home-banner__copy home-banner__copy--${section.textPosition}`}><h2 className="display">{section.title}</h2>{section.subtitle && <p>{section.subtitle}</p>}</div>}{section.ctaLink && <Link to={section.ctaLink} className="home-banner__link">{section.ctaLabel || "SHOP NOW"}</Link>}</section>;
}

function SplitStory({ section }: { section: HomepageSection }) {
  if (!section.desktopMedia && !section.mobileMedia) return null;
  return <section className={`home-split home-section--${section.spacing}`}><div className="home-split__media"><ResponsiveMedia section={section}/></div><div className={`home-split__copy home-split__copy--${section.textPosition}`}><h2 className="display">{section.title}</h2>{section.subtitle && <p>{section.subtitle}</p>}{section.ctaLink && <Link className="btn mt-6" to={section.ctaLink}>{section.ctaLabel || "DISCOVER"}</Link>}</div></section>;
}

export function HomepageSectionRenderer({ section, data, settings }: { section: HomepageSection; data: HomepageData; settings:SiteSettings }) {
  const products = data.products, activeCategories = data.categories.filter(category => category.active);
  switch (section.type) {
    case "new-arrivals": return <ProductSection title={section.title || "New arrivals"} products={products.filter(product => product.newArrival)} link="/shop?new=true"/>;
    case "featured-products": return <ProductSection title={section.title || "Featured"} products={products.filter(product => product.featured)}/>;
    case "product-grid": { const product = products.find(item => item.id === section.referenceId), category = activeCategories.find(item => item.id === section.referenceId), collection = data.collections.find(item => item.id === section.referenceId && item.active); const selected = product ? [product] : category ? products.filter(item => item.categoryId === category.id || activeCategories.some(child => child.id === item.categoryId && child.parentId === category.id)) : collection ? products.filter(item => item.collectionIds.includes(collection.id)) : []; return <ProductSection title={section.title || "The edit"} products={selected}/>; }
    case "category-grid": return <CategorySection categories={(section.referenceId ? activeCategories.filter(category => category.id === section.referenceId || category.parentId === section.referenceId) : activeCategories.filter(category => category.showOnHomepage || category.featured)).sort((a,b) => a.sortOrder-b.sortOrder)} title={section.title || undefined}/>;
    case "collection-feature": { const collection = data.collections.find(item => item.id === section.referenceId && item.active); if (!collection) return null; const media = section.desktopMedia || collection.heroImage || collection.videoUrl || ""; return <Campaign section={{ ...section, title: section.title || collection.name, subtitle: section.subtitle || collection.description, desktopMedia: media, mobileMedia: section.mobileMedia || collection.mobileImage || media, ctaLink: section.ctaLink || `/collections/${collection.slug}` }}/>; }
    case "editorial-image": case "full-width-campaign": return <Campaign section={section}/>;
    case "split-story": return <SplitStory section={section}/>;
    case "text-statement": return (section.title || section.subtitle) ? <section className={`home-statement home-section--${section.spacing}`}><div className="container"><h2 className="display">{section.title}</h2>{section.subtitle && <p>{section.subtitle}</p>}{section.ctaLink && <Link className="btn mt-6" to={section.ctaLink}>{section.ctaLabel || "DISCOVER"}</Link>}</div></section> : null;
    case "social": { const instagram = validExternalUrl(settings.instagram), tiktok = validExternalUrl(settings.tiktok); return (instagram || tiktok) ? <section className="home-statement home-section--compact"><div className="container"><p className="eyebrow">{section.subtitle || "Follow the story"}</p><h2 className="display">{section.title || "ZEVENRA, in motion."}</h2><div className="mt-6 flex justify-center gap-3">{instagram && <a className="btn" href={instagram} rel="noreferrer noopener" target="_blank">Instagram</a>}{tiktok && <a className="btn" href={tiktok} rel="noreferrer noopener" target="_blank">TikTok</a>}</div></div></section> : null; }
    case "service-strip": return <section className="service-strip"><div className="container"><span>Islandwide delivery</span><span>Secure checkout</span><span>{settings.whatsapp ? "Support on WhatsApp" : "Customer support"}</span></div></section>;
    default: return null;
  }
}
