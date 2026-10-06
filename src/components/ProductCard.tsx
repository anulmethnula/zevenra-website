import { useCallback,useEffect,useRef,useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../config/site";
import { useStore } from "../features/store/StoreContext";
import type { Product,ProductSummary } from "../types";
import { cloudinaryImage, cloudinarySrcSet } from "../utils/cloudinary";
import { prefetchPublic } from "../services/publicDataCache";

const MAX_NEAR_VIEWPORT_PREFETCHES=4;
const nearViewportPrefetches=new WeakMap<Element,number>();
function preloadImage(url:string){if(typeof Image==="undefined")return;const image=new Image();image.decoding="async";image.src=url;}
function prefetchProduct(slug:string){return prefetchPublic<{product:Product}>(`/products/${encodeURIComponent(slug)}`,{ttlMs:60_000,persist:true}).then(({product})=>{const first=product.media.find(media=>media.type==="image");if(first)preloadImage(cloudinaryImage(first.url,1200));});}

const swatchMap: Record<string, string> = {
  black: "#171717",
  white: "#f7f7f5",
  ivory: "#f3eee3",
  cream: "#eee4ce",
  beige: "#d7c2a6",
  tan: "#b78f67",
  brown: "#76513e",
  chocolate: "#4e3027",
  grey: "#989da3",
  gray: "#989da3",
  silver: "#adb3bb",
  red: "#c53d45",
  maroon: "#742d3b",
  burgundy: "#6c263a",
  pink: "#ea5f99",
  rose: "#c96d7f",
  orange: "#ed7d31",
  yellow: "#e7b71e",
  gold: "#c79b28",
  green: "#267a4e",
  olive: "#657146",
  blue: "#2e68d7",
  navy: "#22365f",
  sky: "#82bcec",
  purple: "#7240d9",
  lilac: "#a787e8",
  violet: "#7045d9",
};
function swatch(color: string) {
  const value = color.toLowerCase().trim();
  const key = Object.keys(swatchMap).find((name) => value.includes(name));
  return key ? swatchMap[key] : "#8e8377";
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const [secondaryReady,setSecondaryReady]=useState(false);
  const cardRef=useRef<HTMLElement>(null),prefetched=useRef(false);
  const warmProduct=useCallback(()=>{if(prefetched.current)return;prefetched.current=true;void prefetchProduct(product.slug).catch(()=>{prefetched.current=false;});},[product.slug]);
  const showSecondary=useCallback(()=>{setSecondaryReady(true);warmProduct();},[warmProduct]);
  useEffect(()=>{const element=cardRef.current,grid=element?.parentElement;if(!element||!grid||(nearViewportPrefetches.get(grid)||0)>=MAX_NEAR_VIEWPORT_PREFETCHES||!("IntersectionObserver" in window))return;const observer=new IntersectionObserver(entries=>{const count=nearViewportPrefetches.get(grid)||0;if(!entries.some(entry=>entry.isIntersecting)||count>=MAX_NEAR_VIEWPORT_PREFETCHES)return;nearViewportPrefetches.set(grid,count+1);observer.disconnect();warmProduct();},{rootMargin:"240px"});observer.observe(element);return()=>observer.disconnect();},[warmProduct]);
  const { data } = useStore(),
    active = product.variants.filter((variant) => variant.active),
    out = active.length === 0 || active.every((variant) => variant.stock < 1),
    sold = out && !product.preorderEnabled,
    low =
      !out &&
      active.some(
        (variant) =>
          variant.stock > 0 && variant.stock <= variant.lowStockThreshold,
      ),
    badge =
      out && product.preorderEnabled
        ? "PRE-ORDER"
        : sold
          ? "SOLD OUT"
          : product.newArrival
            ? "NEW"
            : low
              ? "LOW STOCK"
              : null,
    images = product.media.filter((media) => media.type === "image"),
    primary = images[0],
    secondary = images[1],
    category = data.categories.find((item) => item.id === product.categoryId),
    parent = category?.parentId
      ? data.categories.find((item) => item.id === category.parentId)
      : undefined,
    colors = [
      ...new Set(active.map((variant) => variant.color).filter(Boolean)),
    ];
  const styleLabel =
    category?.name || product.subcategory || parent?.name || "ZEVENRA";
  return (
    <article className="product-card" ref={cardRef}>
      <Link to={`/product/${product.slug}`} aria-label={`View ${product.name}`} onPointerEnter={showSecondary} onFocus={showSecondary} onTouchStart={showSecondary}>
        <div className="product-card__media">
          {primary ? (
            <>
              <img
                src={cloudinaryImage(primary.url,900)}
                srcSet={cloudinarySrcSet(primary.url,[320,480,640,900])}
                sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                alt={primary.alt || product.name}
                loading="lazy"
                decoding="async"
                width="800"
                height="1000"
              />
              {secondary && secondaryReady && (
                <img
                  className="product-card__secondary"
                  src={cloudinaryImage(secondary.url,900)}
                  srcSet={cloudinarySrcSet(secondary.url,[320,480,640,900])}
                  sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width="800"
                  height="1000"
                />
              )}
            </>
          ) : (
            <div className="grid h-full place-content-center bg-[#e7e1d7] px-4 text-center">
              <span className="eyebrow text-black/35">Image coming soon</span>
            </div>
          )}
          {badge && (
            <span
              className={
                "product-card__badge product-card__badge--" +
                badge.toLowerCase().replace(/\s+/g, "-")
              }
            >
              {badge}
            </span>
          )}
        </div>
        <div className="product-card__info">
          {colors.length > 0 && (
            <div
              className="product-card__swatches"
              aria-label={colors.length + " colours available"}
            >
              {colors.slice(0, 10).map((color) => (
                <span
                  key={color}
                  title={color}
                  style={{ background: swatch(color) }}
                  className={
                    color.toLowerCase().includes("white") ||
                    color.toLowerCase().includes("ivory")
                      ? "is-light"
                      : ""
                  }
                />
              ))}
              {colors.length > 10 && <small>+{colors.length - 10}</small>}
            </div>
          )}
          <h3>{product.name}</h3>
          <p className="product-card__style">{styleLabel}</p>
          <div className="product-card__price">
            <b>{money(product.price)}</b>
            {product.compareAtPrice &&
              product.compareAtPrice > product.price && (
                <del>{money(product.compareAtPrice)}</del>
              )}
          </div>
        </div>
      </Link>
    </article>
  );
}
