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
function prefersMobileHero() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

export default function HomePage() {
  const { data, error:storeError, retry:retryStore } = useStore(), home=useHomepageData(), hero = data.settings.hero, videoRef = useRef<HTMLVideoElement>(null), [videoReady, setVideoReady] = useState(false), [videoFailed, setVideoFailed] = useState(false), [reducedMotion, setReducedMotion] = useState(prefersReducedMotion),[mobileHero,setMobileHero]=useState(prefersMobileHero);
  const desktopVideo=optimizedSource(hero.desktopVideo,defaultDesktopVideo),mobileVideo=optimizedSource(hero.mobileVideo,defaultMobileVideo);
  const selectedVideo=mobileHero?mobileVideo:desktopVideo;
  const content=home.data?{products:home.data.products,sections:data.homepageSections,categories:data.categories,collections:data.collections}:null,enabled = data.homepageSections.filter(section => section.enabled).sort((a,b) => a.sortOrder-b.sortOrder);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)"), updatePreference = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);
  useEffect(() => {
    const viewport=matchMedia("(max-width: 767px)"),updateViewport=()=>setMobileHero(viewport.matches);
    viewport.addEventListener("change",updateViewport);
    return()=>viewport.removeEventListener("change",updateViewport);
  },[]);
  useEffect(() => {
    setVideoReady(false); setVideoFailed(false);
  }, [selectedVideo, hero.videoEnabled]);
  useEffect(() => {
    const video = videoRef.current; if (!video || reducedMotion) return;
    let played=false,reloads=0,playAttempts=0,timer:ReturnType<typeof setTimeout>|undefined;
    const markPlaying=()=>{played=true;setVideoReady(true);setVideoFailed(false);};
    const attemptPlay=()=>{if(document.hidden||played||playAttempts>=3)return;playAttempts+=1;void video.play().catch(()=>{if(playAttempts<3)timer=setTimeout(attemptPlay,350*playAttempts);});};
    const stalled=()=>{if(played||reloads>=1)return;reloads+=1;video.load();};
    const visibility=()=>{if(document.hidden)video.pause();else if(played)void video.play().catch(()=>undefined);else attemptPlay();};
    video.addEventListener("canplay",attemptPlay);video.addEventListener("loadeddata",attemptPlay);video.addEventListener("playing",markPlaying);video.addEventListener("stalled",stalled);document.addEventListener("visibilitychange",visibility);
    if(video.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA)attemptPlay();else video.load();
    return()=>{clearTimeout(timer);video.removeEventListener("canplay",attemptPlay);video.removeEventListener("loadeddata",attemptPlay);video.removeEventListener("playing",markPlaying);video.removeEventListener("stalled",stalled);document.removeEventListener("visibilitychange",visibility);};
  }, [selectedVideo, reducedMotion]);
  const showVideo = hero.videoEnabled && !videoFailed && !reducedMotion;
  const products = content?.products||[], activeCategories = data.categories, categories = activeCategories.filter(category => category.showOnHomepage || category.featured).sort((a,b)=>a.sortOrder-b.sortOrder);
  return <><Seo title="The Art of Becoming" description={data.settings.defaultDescription}/><section className="home-hero"><img className="home-hero__poster" src={heroPoster} alt="" {...{fetchpriority:"high"}}/>{showVideo && <video key={selectedVideo} ref={videoRef} src={selectedVideo} className={"home-hero__video " + (videoReady ? "home-hero__video--ready" : "")} autoPlay muted loop playsInline preload="auto" poster={heroPoster} onError={()=>setVideoFailed(true)}/>}<div className="home-hero__shade"/><Link to={hero.ctaLink || "/shop"} className="home-hero__cta"><span>{hero.ctaLabel || "EXPLORE SHOP"}</span><ArrowRight size={15} aria-hidden="true"/></Link></section>
    {(storeError||home.error) && <section className="store-notice" role="status"><span>Live store content could not be refreshed.</span><button onClick={()=>{void retryStore();void home.retry();}}>Retry</button></section>}
    {home.loading ? <div className="container home-skeleton" aria-label="Loading homepage content"><div/><div/><div/><div/></div> : content && enabled.length ? enabled.map(section => <HomepageSectionRenderer key={section.id} section={section} data={content} settings={data.settings}/>) : <><ProductSection title="New arrivals" products={products.filter(product => product.newArrival)} link="/shop?new=true"/><CategorySection categories={categories.length ? categories : activeCategories.filter(category => !category.parentId).sort((a,b)=>a.sortOrder-b.sortOrder)}/><ProductSection title="Featured" products={products.filter(product => product.featured)}/></>}
  </>;
}
