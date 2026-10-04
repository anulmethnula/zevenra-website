import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CategorySection, HomepageSectionRenderer, ProductSection } from "../components/home/HomepageSectionRenderer";
import { Seo } from "../components/Seo";
import { useStore } from "../features/store/StoreContext";

const defaultVideo = "/media/hero-final-v2.mp4", defaultPoster = "/brand/hero.jpg";

export default function HomePage() {
  const { data, loading, error, retry } = useStore(), hero = data.settings.hero, videoRef = useRef<HTMLVideoElement>(null), [videoFailed, setVideoFailed] = useState(false);
  const enabled = data.homepageSections.filter(section => section.enabled).sort((a,b) => a.sortOrder-b.sortOrder);
  useEffect(() => {
    const video = videoRef.current; if (!video || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let attempts = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const play = () => { if (document.hidden || attempts >= 3) return; attempts += 1; void video.play().catch(() => { timer = setTimeout(play, 700 * attempts); }); };
    const visibility = () => document.hidden ? video.pause() : play();
    video.addEventListener("canplay", play, { once: true }); document.addEventListener("visibilitychange", visibility); play();
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [hero.desktopVideo, hero.mobileVideo]);
  const poster = hero.poster || hero.fallbackImage || defaultPoster, showVideo = hero.videoEnabled && !videoFailed && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const products = data.products.filter(product => product.status === "published"), activeCategories = data.categories.filter(category => category.active), categories = activeCategories.filter(category => category.showOnHomepage || category.featured).sort((a,b)=>a.sortOrder-b.sortOrder);
  return <><Seo title="The Art of Becoming" description={data.settings.defaultDescription} image={poster}/><section className="home-hero"><img className="home-hero__fallback" src={poster} alt="ZEVENRA fashion and lifestyle collection" fetchPriority="high" decoding="async"/>{showVideo && <video ref={videoRef} className="home-hero__video" autoPlay muted loop playsInline preload="metadata" poster={poster} onError={() => setVideoFailed(true)}><source media="(max-width: 767px)" src={hero.mobileVideo || hero.desktopVideo || defaultVideo}/><source src={hero.desktopVideo || defaultVideo}/></video>}<div className="home-hero__shade"/><Link to={hero.ctaLink || "/shop"} className="home-hero__cta">{hero.ctaLabel || "EXPLORE SHOP"}</Link></section>
    {error && <section className="store-notice" role="status"><span>Live store content could not be refreshed.</span><button onClick={retry}>Retry</button></section>}
    {loading ? <div className="container home-skeleton" aria-label="Loading homepage content"><div/><div/><div/><div/></div> : enabled.length ? enabled.map(section => <HomepageSectionRenderer key={section.id} section={section} data={data}/>) : <><ProductSection title="New arrivals" products={products.filter(product => product.newArrival)} link="/shop?new=true"/><CategorySection categories={categories.length ? categories : activeCategories.filter(category => !category.parentId).sort((a,b)=>a.sortOrder-b.sortOrder)}/><ProductSection title="Featured" products={products.filter(product => product.featured)}/></>}
  </>;
}
