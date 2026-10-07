import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CategorySection, HomepageSectionRenderer, ProductSection } from "../components/home/HomepageSectionRenderer";
import { Seo } from "../components/Seo";
import { useStore } from "../features/store/StoreContext";
import { useHomepageData } from "../hooks/usePublicData";
import "../styles/hero-cta.css";

const defaultDesktopVideo = "/media/hero-desktop-v1.mp4";
const defaultMobileVideo = "/media/hero-mobile-v1.mp4";
const heroPoster = "/media/hero-poster-v1.webp";
const legacyHeroVideo = "/media/hero-final-v2.mp4";

const optimizedSource = (value: string | undefined, fallback: string) =>
  !value || value === legacyHeroVideo ? fallback : value;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HomePage() {
  const { data, error:storeError, retry:retryStore } = useStore(), home=useHomepageData(), hero = data.settings.hero, videoRef = useRef<HTMLVideoElement>(null), [videoReady, setVideoReady] = useState(false), [videoFailed, setVideoFailed] = useState(false), [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const desktopVideo=optimizedSource(hero.desktopVideo,defaultDesktopVideo),mobileVideo=optimizedSource(hero.mobileVideo,defaultMobileVideo);
  const content=home.data?{products:home.data.products,sections:data.homepageSections,categories:data.categories,collections:data.collections}:null,enabled = data.homepageSections.filter(section => section.enabled).sort((a,b) => a.sortOrder-b.sortOrder);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)"), updatePreference = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);
  useEffect(() => {
    setVideoReady(false); setVideoFailed(false);
  }, [desktopVideo, mobileVideo, hero.videoEnabled]);
  useEffect(() => {
    const video = videoRef.current; if (!video || reducedMotion) return;
    const visibility = () => document.hidden ? video.pause() : void video.play().catch(() => undefined);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [desktopVideo, mobileVideo, reducedMotion]);
  const showVideo = hero.videoEnabled && !videoFailed && !reducedMotion;
  const products = content?.products||[], activeCategories = data.categories, categories = activeCategories.filter(category => category.showOnHomepage || category.featured).sort((a,b)=>a.sortOrder-b.sortOrder);
  return <><Seo title="The Art of Becoming" description={data.settings.defaultDescription}/><section className="home-hero"><img className="home-hero__poster" src={heroPoster} alt="" fetchPriority="high"/>{showVideo && <video ref={videoRef} className={"home-hero__video " + (videoReady ? "home-hero__video--ready" : "")} autoPlay muted loop playsInline preload="auto" poster={heroPoster} onPlaying={()=>setVideoReady(true)} onError={()=>setVideoFailed(true)}><source media="(max-width: 767px)" src={mobileVideo} type="video/mp4"/><source src={desktopVideo} type="video/mp4"/></video>}<div className="home-hero__shade"/><Link to={hero.ctaLink || "/shop"} className="home-hero__cta"><span>{hero.ctaLabel || "EXPLORE SHOP"}</span><ArrowRight size={15} aria-hidden="true"/></Link></section>
    {(storeError||home.error) && <section className="store-notice" role="status"><span>Live store content could not be refreshed.</span><button onClick={()=>{void retryStore();void home.retry();}}>Retry</button></section>}
    {home.loading ? <div className="container home-skeleton" aria-label="Loading homepage content"><div/><div/><div/><div/></div> : content && enabled.length ? enabled.map(section => <HomepageSectionRenderer key={section.id} section={section} data={content} settings={data.settings}/>) : <><ProductSection title="New arrivals" products={products.filter(product => product.newArrival)} link="/shop?new=true"/><CategorySection categories={categories.length ? categories : activeCategories.filter(category => !category.parentId).sort((a,b)=>a.sortOrder-b.sortOrder)}/><ProductSection title="Featured" products={products.filter(product => product.featured)}/></>}
  </>;
}
