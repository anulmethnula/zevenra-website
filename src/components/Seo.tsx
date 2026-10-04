import { useEffect } from "react";

export function Seo({
  title,
  description,
  image,
}: {
  title: string;
  description?: string;
  image?: string;
}) {
  useEffect(() => {
    const copy = description || "Selected beyond borders. Curated for here.",
      fullTitle = title.toLowerCase().includes("zevenra")
        ? title
        : title + " — ZEVENRA",
      siteUrl = String(import.meta.env.VITE_PUBLIC_SITE_URL || location.origin).replace(/\/$/, ""),
      absoluteImage = image
        ? image.startsWith("http")
          ? image
          : siteUrl + (image.startsWith("/") ? image : "/" + image)
        : "";
    document.title = fullTitle;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", copy);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", fullTitle);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute("content", copy);
    if (absoluteImage) {
      document
        .querySelector('meta[property="og:image"]')
        ?.setAttribute("content", absoluteImage);
      document
        .querySelector('meta[name="twitter:image"]')
        ?.setAttribute("content", absoluteImage);
    }
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", siteUrl + location.pathname);
  }, [title, description, image]);
  return null;
}
