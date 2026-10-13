import type { VercelRequest, VercelResponse } from "@vercel/node";
import cartProducts from "./_route-cart-products.js";
import catalog from "./_route-catalog.js";
import checkoutConfig from "./_route-checkout-config.js";
import deliveryQuote from "./_route-delivery-quote.js";
import discountValidate from "./_route-discount-validate.js";
import home from "./_route-home.js";
import orderTrack from "./_route-order-track.js";
import orders from "./_route-orders.js";
import paymentReceiptAccess from "./_route-payment-receipt-access.js";
import paymentReceiptSign from "./_route-payment-receipt-sign.js";
import preorders from "./_route-preorders.js";
import product from "./_route-product.js";
import products from "./_route-products.js";
import recommendations from "./_route-recommendations.js";
import robots from "./_route-robots.js";
import sitemap from "./_route-sitemap.js";
import sizeChart from "./_route-size-chart.js";
import store from "./_route-store.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;

const handlers: Record<string, Handler> = {
  "cart-products": cartProducts,
  catalog,
  "checkout-config": checkoutConfig,
  "delivery-quote": deliveryQuote,
  "discount-validate": discountValidate,
  home,
  "order-track": orderTrack,
  orders,
  "payment-receipt-access": paymentReceiptAccess,
  "payment-receipt-sign": paymentReceiptSign,
  preorders,
  product,
  products,
  recommendations,
  robots,
  sitemap,
  "size-chart": sizeChart,
  store,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = String(req.query.route || "");
  const selected = handlers[route];
  if (!selected) {
    res.status(404).setHeader("Cache-Control", "no-store");
    return res.json({ error: "API route not found" });
  }
  return await selected(req, res);
}
