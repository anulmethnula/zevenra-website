import type { VercelRequest, VercelResponse } from "@vercel/node";
import cartProducts from "../server/api-implementation/cart-products.js";
import catalog from "../server/api-implementation/catalog.js";
import checkoutConfig from "../server/api-implementation/checkout-config.js";
import deliveryQuote from "../server/api-implementation/delivery-quote.js";
import discountValidate from "../server/api-implementation/discount-validate.js";
import home from "../server/api-implementation/home.js";
import orderTrack from "../server/api-implementation/order-track.js";
import orders from "../server/api-implementation/orders.js";
import receiptAccess from "../server/api-implementation/payment-receipt-access.js";
import receiptSign from "../server/api-implementation/payment-receipt-sign.js";
import preorders from "../server/api-implementation/preorders.js";
import product from "../server/api-implementation/product.js";
import products from "../server/api-implementation/products.js";
import productBySlug from "../server/api-implementation/products/[slug].js";
import recommendations from "../server/api-implementation/recommendations.js";
import robots from "../server/api-implementation/robots.js";
import sitemap from "../server/api-implementation/sitemap.js";
import sizeChart from "../server/api-implementation/size-chart.js";
import store from "../server/api-implementation/store.js";

type Handler = (request: VercelRequest, response: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  "cart-products": cartProducts,
  catalog,
  "checkout-config": checkoutConfig,
  "delivery-quote": deliveryQuote,
  "discount-validate": discountValidate,
  home,
  "order-track": orderTrack,
  orders,
  "payment-receipt-access": receiptAccess,
  "payment-receipt-sign": receiptSign,
  preorders,
  product,
  products,
  "product-by-slug": productBySlug,
  recommendations,
  robots,
  sitemap,
  "size-chart": sizeChart,
  store,
};

export default function handler(request: VercelRequest, response: VercelResponse) {
  const route = String(request.query.route || "");
  const selected = routes[route];
  if (!selected) return response.status(404).json({ error: "Not found" });
  return selected(request, response);
}
