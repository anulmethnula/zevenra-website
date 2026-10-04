import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { ProductCard } from "../components/ProductCard";
import { Seo } from "../components/Seo";
import { useStore } from "../features/store/StoreContext";
import type { Category } from "../types";

const defaultVideo = "/media/hero-final-v2.mp4";

export default function HomePage() {
  const { data } = useStore(),
    hero = data.settings.hero,
    videoRef = useRef<HTMLVideoElement>(null),
    heroVideo = hero.desktopVideo || defaultVideo,
    heroMobileVideo = hero.mobileVideo || heroVideo,
    products = data.products.filter(
      (product) => product.status === "published",
    ),
    newArrivals = products.filter((product) => product.newArrival).slice(0, 4),
    featured = products.filter((product) => product.featured).slice(0, 4),
    activeCategories = data.categories.filter((category) => category.active),
    homepageConfigured = activeCategories.some(
      (category) => category.showOnHomepage,
    ),
    homeCategories = (
      homepageConfigured
        ? activeCategories.filter((category) => category.showOnHomepage)
        : activeCategories.filter((category) => category.featured)
    ).sort((a, b) => a.sortOrder - b.sortOrder),
    fallbackCategories = activeCategories
      .filter((category) => !category.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    categories = (
      homeCategories.length ? homeCategories : fallbackCategories
    ).slice(0, 10),
    banners = data.homepageSections
      .filter(
        (section) =>
          section.enabled &&
          (section.type === "full-width-campaign" ||
            section.type === "editorial-image") &&
          (section.desktopMedia || section.mobileMedia),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const play = async () => {
      video.muted = true;
      video.defaultMuted = true;
      try {
        await video.play();
      } catch (reason) {
        if (import.meta.env.DEV)
          console.warn("[ZEVENRA hero] autoplay retry", reason);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void play(), 700);
      }
    };
    const resume = () => {
      if (document.visibilityState === "visible") void play();
    };
    video.addEventListener("loadedmetadata", play);
    video.addEventListener("canplay", play);
    document.addEventListener("visibilitychange", resume);
    void play();
    return () => {
      clearTimeout(retryTimer);
      video.removeEventListener("loadedmetadata", play);
      video.removeEventListener("canplay", play);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return (
    <>
      <Seo
        title="The Art of Becoming"
        description={data.settings.defaultDescription}
      />
      <section className="home-hero home-hero--video-only">
        {hero.videoEnabled ? (
          <video
            ref={videoRef}
            className="home-hero__video"
            autoPlay
            muted
            loop
            playsInline
            controls={false}
            disablePictureInPicture
            preload="metadata"
            poster={hero.poster || hero.fallbackImage || undefined}
            aria-label="ZEVENRA fashion and lifestyle collection"
          >
            <source media="(max-width: 767px)" src={heroMobileVideo} />
            <source src={heroVideo} />
          </video>
        ) : (
          <img
            className="home-hero__video"
            src={hero.fallbackImage || hero.poster || "/brand/hero.jpg"}
            alt="ZEVENRA fashion and lifestyle collection"
            fetchPriority="high"
          />
        )}
        <div className="home-hero__shade" />
        <Link to={hero.ctaLink || "/shop"} className="home-hero__cta">
          {hero.ctaLabel || "EXPLORE SHOP"}
        </Link>
      </section>
      {newArrivals.length > 0 && (
        <ProductSection
          title="New arrivals"
          products={newArrivals}
          link="/shop?new=true"
        />
      )}
      {categories.length > 0 && <CategorySection categories={categories} />}{" "}
      {banners.map((banner) => <HomeBanner key={banner.id} section={banner} />)}
      {featured.length > 0 && (
        <ProductSection title="Featured" products={featured} link="/shop" />
      )}
      {products.length === 0 && (
        <section className="container section text-center">
          <p className="eyebrow">The next edit is arriving soon</p>
          <h2 className="display mx-auto mt-4 max-w-2xl text-4xl sm:text-6xl">
            Something considered is taking shape.
          </h2>
          <Link to="/contact" className="btn mt-7">
            Stay in touch
          </Link>
        </section>
      )}
      <section className="service-strip">
        <div className="container">
          <span>Islandwide delivery</span>
          <span>Secure order request</span>
          <span>
            {data.settings.whatsapp
              ? "Support on WhatsApp"
              : "Customer support"}
          </span>
        </div>
      </section>
    </>
  );
}

function HomeBanner({ section }: { section: ReturnType<typeof useStore>["data"]["homepageSections"][number] }) {
  const desktop=section.desktopMedia||section.mobileMedia||"",mobile=section.mobileMedia||desktop,isVideo=/\.(mp4|webm|mov)(\?|$)/i.test(desktop);
  return <section className={`home-banner relative ${section.spacing === "compact" ? "my-8" : section.spacing === "generous" ? "my-24" : "my-14"}`}>
    {isVideo?<video src={desktop} muted autoPlay loop playsInline preload="metadata" className="h-full w-full object-cover"/>:<picture>{mobile!==desktop&&<source media="(max-width: 767px)" srcSet={mobile}/>}<img src={desktop} alt={section.title||"ZEVENRA editorial campaign"} loading="lazy" decoding="async"/></picture>}
    <div className="absolute inset-0" style={{background:`rgba(0,0,0,${Math.min(90,Math.max(0,section.overlay))/100})`}}/>
    {(section.title||section.subtitle)&&<div className={`absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-6 text-white ${section.textPosition==="center"?"text-center":section.textPosition==="right"?"text-right":"text-left"}`}><h2 className="display text-4xl sm:text-6xl">{section.title}</h2>{section.subtitle&&<p className="mt-3 text-sm">{section.subtitle}</p>}</div>}
    {section.ctaLink&&<Link to={section.ctaLink} className="home-banner__link">{section.ctaLabel||"SHOP NOW"}</Link>}
  </section>;
}

function CategorySection({ categories }: { categories: Category[] }) {
  const rail = useRef<HTMLDivElement>(null),
    move = (direction: -1 | 1) =>
      rail.current?.scrollBy({
        left: direction * (rail.current.clientWidth * 0.78),
        behavior: "smooth",
      });
  return (
    <section className="section home-categories home-categories--editorial">
      <div className="container">
        <div className="home-category-heading">
          <div>
            <p>BUILD YOUR STYLE</p>
            <h2>SHOP BY CATEGORY</h2>
          </div>
          <div className="home-category-arrows">
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label="Previous categories"
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label="Next categories"
            >
              <ChevronRight />
            </button>
          </div>
        </div>
        <div ref={rail} className="home-category-rail hide-scrollbar">
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/category/${category.slug}`}
              className="home-category-tile"
            >
              {category.imageUrl ? (
                <picture>
                  {category.mobileImageUrl && (
                    <source
                      media="(max-width: 767px)"
                      srcSet={category.mobileImageUrl}
                    />
                  )}
                  <img
                    src={category.imageUrl}
                    alt={category.name}
                    loading="lazy"
                  />
                </picture>
              ) : (
                <div
                  className="category-grid__placeholder"
                  aria-hidden="true"
                />
              )}
              <span>{category.name.toUpperCase()}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductSection({
  title,
  products,
  link,
}: {
  title: string;
  products: ReturnType<typeof useStore>["data"]["products"];
  link: string;
}) {
  if (!products.length) return null;
  return (
    <section className="section product-section">
      <div className="container">
        <div className="section-heading">
          <h2 className="display">{title}</h2>
          <Link to={link}>VIEW ALL</Link>
        </div>
        <div className="store-product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
