import { createHmac } from "node:crypto";
import { chromium } from "playwright";

const baseURL = process.env.BROWSER_AUDIT_URL || "http://localhost:3000";
const executablePath = process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const widths = [320, 360, 390, 430, 768, 1024, 1440];
const customerRoutes = ["/", "/shop", "/cart", "/checkout", "/track-order", "/account/login", "/account/register", "/account", "/account/orders", "/about", "/delivery", "/returns", "/contact", "/privacy", "/terms", "/404"];
const adminRoutes = [
  "/admin", "/admin/products", "/admin/categories", "/admin/collections",
  "/admin/products/new", "/admin/orders", "/admin/preorders", "/admin/homepage",
  "/admin/delivery", "/admin/settings", "/admin/login",
];

function adminSession(secret) {
  const payload = Buffer.from(JSON.stringify({ sub: "owner", exp: Date.now() + 3_600_000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

const browser = await chromium.launch({ headless: true, executablePath });
const failures = [];
try {
  const catalogue = await fetch(`${baseURL}/api/products?page=1&pageSize=1`).then(response => response.json());
  const slug = catalogue.items?.[0]?.slug;
  if (slug) customerRoutes.push(`/product/${slug}`,`/preorder/${slug}`);

  for (const route of [...customerRoutes, ...adminRoutes]) {
    const context = await browser.newContext({ viewport: { width: widths[0], height: 900 } });
    if (process.env.SESSION_SECRET) {
      await context.addCookies([{ name: "zevenra_session", value: adminSession(process.env.SESSION_SECRET), url: baseURL, httpOnly: true, sameSite: "Strict" }]);
    }
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") runtimeErrors.push(message.text()); });
    const response = await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_000);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const layout = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const intentionallyClipped = element => {
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const overflow = getComputedStyle(parent).overflowX;
            if (["auto", "scroll", "hidden", "clip"].includes(overflow)) return true;
          }
          return false;
        };
        const offenders = [...document.querySelectorAll("body *")].filter(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          return style.position !== "fixed" && rect.width > 0 && !intentionallyClipped(element) && (rect.right > viewport + 2 || rect.left < -2);
        }).slice(0, 8).map(element => `${element.tagName.toLowerCase()}.${String(element.className).split(/\s+/).slice(0, 2).join(".")}`);
        const clipped = [...document.querySelectorAll("button,a,input,select,textarea")].filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && !intentionallyClipped(element) && (rect.right > viewport + 2 || rect.left < -2);
        }).length;
        const unlabeled=[...document.querySelectorAll("input,select,textarea")].filter(element=>!element.getAttribute("aria-label")&&!element.getAttribute("aria-labelledby")&&!element.id&&!element.closest("label")).length;
        const unnamedButtons=[...document.querySelectorAll("button")].filter(element=>!element.textContent?.trim()&&!element.getAttribute("aria-label")&&!element.getAttribute("aria-labelledby")).length;
        const missingAlt=[...document.querySelectorAll("img")].filter(element=>!element.hasAttribute("alt")).length;
        return { viewport, scrollWidth: document.documentElement.scrollWidth, offenders, clipped, unlabeled, unnamedButtons, missingAlt };
      });
      const status = response?.status() || 0;
      const errors = runtimeErrors.splice(0);
      const ok = status < 400 && layout.scrollWidth <= layout.viewport + 2 && layout.clipped === 0 && layout.unlabeled===0 && layout.unnamedButtons===0 && layout.missingAlt===0 && errors.length === 0;
      console.log(JSON.stringify({ width, route, status, ...layout, errors, ok }));
      if (!ok) failures.push({ width, route, status, ...layout, errors });
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`Browser audit failed for ${failures.length} viewport/page combinations.`);
  process.exitCode = 1;
} else {
  console.log("Browser responsive audit passed.");
}
