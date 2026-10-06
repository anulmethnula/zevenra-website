import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CategorySection, HomepageSectionRenderer, ProductSection } from "../components/home/HomepageSectionRenderer";
import { Seo } from "../components/Seo";
import { useStore } from "../features/store/StoreContext";
import { useHomepageData } from "../hooks/usePublicData";

const defaultVideo = "/media/hero-final-v2.mp4";
const videoLoadTimeout = 15000;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HomePage() {
  const { data, error:storeError, retry:retryStore } = useStore(), home=useHomepageData(), hero = data.settings.hero, videoRef = useRef<HTMLVideoElement>(null), everReadyRef = useRef(false), [videoReady, setVideoReady] = useState(false), [videoFailed, setVideoFailed] = useState(false), [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const content=home.data,enabled = (content?.sections||[]).filter(section => section.enabled).sort((a,b) => a.sortOrder-b.sortOrder);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)"), updatePreference = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);
  useEffect(() => {
    everReadyRef.current = false; setVideoReady(false); setVideoFailed(false);
  }, [hero.desktopVideo, hero.mobileVideo, hero.videoEnabled]);
  useEffect(() => {
    const video = videoRef.current; if (!video || reducedMotion) return;
    let attempts = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const ready = () => { everReadyRef.current = true; setVideoReady(true); setVideoFailed(false); };
    const play = () => { if (document.hidden || attempts >= 3) return; attempts += 1; void video.play().catch(() => { timer = setTimeout(play, 700 * attempts); }); };
    const visibility = () => document.hidden ? video.pause() : play();
    video.addEventListener("loadeddata", ready, { once: true }); video.addEventListener("canplay", ready, { once: true }); video.addEventListener("playing", ready, { once: true }); video.addEventListener("canplay", play, { once: true }); document.addEventListener("visibilitychange", visibility); play();
    const loadTimer = setTimeout(() => { if (!everReadyRef.current && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) setVideoFailed(true); }, videoLoadTimeout);
    return () => { clearTimeout(timer); clearTimeout(loadTimer); video.removeEventListener("loadeddata", ready); video.removeEventListener("canplay", ready); video.removeEventListener("playing", ready); document.removeEventListener("visibilitychange", visibility); };
  }, [hero.desktopVideo, hero.mobileVideo, reducedMotion]);
  const showVideo = hero.videoEnabled && !videoFailed && !reducedMotion;
  const products = content?.products||[], activeCategories = content?.categories||data.categories, categories = activeCategories.filter(category => category.showOnHomepage || category.featured).sort((a,b)=>a.sortOrder-b.sortOrder);
  return <><Seo title="The Art of Becoming" description={data.settings.defaultDescription}/><section className="home-hero">{showVideo && <video ref={videoRef} className={"home-hero__video " + (videoReady ? "home-hero__video--ready" : "")} autoPlay muted loop playsInline preload="auto" onLoadedData={()=>{everReadyRef.current=true;setVideoReady(true);}} onCanPlay={()=>{everReadyRef.current=true;setVideoReady(true);}} onError={()=>{if(!everReadyRef.current)setVideoFailed(true);}}><source media="(max-width: 767px)" src={hero.mobileVideo || hero.desktopVideo || defaultVideo}/><source src={hero.desktopVideo || defaultVideo}/></video>}<div className="home-hero__shade"/><Link to={hero.ctaLink || "/shop"} className="home-hero__cta">{hero.ctaLabel || "EXPLORE SHOP"}</Link></section>
    {(storeError||home.error) && <section className="store-notice" role="status"><span>Live store content could not be refreshed.</span><button onClick={()=>{void retryStore();void home.retry();}}>Retry</button></section>}
    {home.loading ? <div className="container home-skeleton" aria-label="Loading homepage content"><div/><div/><div/><div/></div> : content && enabled.length ? enabled.map(section => <HomepageSectionRenderer key={section.id} section={section} data={content} settings={data.settings}/>) : <><ProductSection title="New arrivals" products={products.filter(product => product.newArrival)} link="/shop?new=true"/><CategorySection categories={categories.length ? categories : activeCategories.filter(category => !category.parentId).sort((a,b)=>a.sortOrder-b.sortOrder)}/><ProductSection title="Featured" products={products.filter(product => product.featured)}/></>}
  </>;
}
