import type {
  CheckoutData,
  CustomerOrder,
  CustomerPreorder,
  GuestTrackedOrder,
  Order,
  PreorderRequest,
  Product,
} from "../types";
import { products } from "../data/demo";
import { siteConfig } from "../config/site";
import { safeHttpsUrl } from "../utils/orderTracking";
const base = import.meta.env.VITE_API_BASE || "/api";
const demo = import.meta.env.VITE_DEMO_MODE === "true";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init?.headers },
    }),
    payload = (await r
      .json()
      .catch(() => ({ error: "Service temporarily unavailable" }))) as T & {
      error?: string;
    };
  if (!r.ok)
    throw new Error(payload.error || "Service temporarily unavailable");
  return payload;
}
export const api = {
  validateDiscount: (data: { code: string; items: Array<{ productId: string; variantId: string; quantity: number }> }) =>
    demo ? Promise.resolve<{ valid: boolean; code?: string; discountAmount?: number; message: string }>({valid:false,message:"Discount codes are unavailable in demo mode."}) : request<{ valid: boolean; code?: string; discountAmount?: number; message: string }>("/discount-validate", { method: "POST", body: JSON.stringify(data) }),
  listProducts: async () => (demo ? products : request<Product[]>("/products")),
  getProduct: async (slug: string) =>
    demo
      ? products.find((p) => p.slug === slug)
      : request<Product>(`/products/${encodeURIComponent(slug)}`),
  customerOrders: async () => {
    if (demo) return [];
    const orders = await request<CustomerOrder[]>("/account/orders");
    return orders.map((order) => ({
      ...order,
      trackingUrl: safeHttpsUrl(order.trackingUrl),
    }));
  },
  customerPreorders: () =>
    demo
      ? Promise.resolve([])
      : request<CustomerPreorder[]>("/account/preorders"),
  trackOrder: (data: { orderId: string; phone: string }) =>
    request<GuestTrackedOrder>("/order-track", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createPreorder: async (data: {
    customerName: string;
    phone?: string;
    whatsapp: string;
    email?: string;
    address1?: string;
    address2?: string;
    city: string;
    district?: string;
    postalCode?: string;
    productId: string;
    variantId: string;
    quantity: number;
  }): Promise<PreorderRequest> => {
    if (!demo)
      return request<PreorderRequest>("/preorders", {
        method: "POST",
        body: JSON.stringify(data),
      });
    const product = products.find((item) => item.id === data.productId),
      variant = product?.variants.find((item) => item.id === data.variantId),
      now = new Date().toISOString();
    if (!product || !variant) throw new Error("Demo product is unavailable.");
    return {
      requestId: `DEMO-PRE-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      customerName: data.customerName,
      phone: data.phone || data.whatsapp,
      whatsapp: data.whatsapp,
      email: data.email,
      address1: data.address1,
      address2: data.address2,
      city: data.city,
      district: data.district,
      postalCode: data.postalCode,
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      quantity: data.quantity,
      requestedPrice: product.price,
      status: "new",
    };
  },
  createOrder: async (data: CheckoutData): Promise<Order> => {
    if (!demo)
      return request<Order>("/orders", {
        method: "POST",
        body: JSON.stringify(data),
      });
    await new Promise((r) => setTimeout(r, 650));
    const subtotal = data.items.reduce(
      (n, i) => n + i.unitPrice * i.quantity,
      0,
    );
    const fee =
      subtotal >= siteConfig.freeDeliveryThreshold ? 0 : siteConfig.deliveryFee;
    return {
      orderId: `ZEV-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      customerName: data.customerName,
      phone: data.phone,
      city: data.city,
      district: data.district,
      paymentMethod: data.paymentMethod,
      subtotal,
      deliveryFee: fee,
      total: subtotal + fee,
      orderStatus: "pending",
      paymentStatus:
        data.paymentMethod === "cod" ? "COD" : "verification required",
      items: data.items,
    };
  },
  deliveryQuote: (data:{city:string;district:string;postalCode?:string;items:Array<{productId:string;variantId:string;quantity:number}>}) =>
    demo ? Promise.resolve({fee:siteConfig.deliveryFee,minimumDeliveryDays:2,maximumDeliveryDays:4}) : request<{fee:number;minimumDeliveryDays:number;maximumDeliveryDays:number}>("/delivery-quote",{method:"POST",body:JSON.stringify(data)}),
};