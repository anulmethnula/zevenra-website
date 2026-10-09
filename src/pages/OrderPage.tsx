import { useEffect, useState } from "react";
import { Check, Copy, Download, MessageCircle, ShoppingBag } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Seo } from "../components/Seo";
import { money } from "../config/site";
import { useStore } from "../features/store/StoreContext";
import { useCustomerAuth } from "../features/account/CustomerAuthContext";
import type { Order } from "../types";
import { normalizeWhatsappDigits } from "../utils/contact";
import { orderSuccessCopy } from "../utils/orderSuccess";
import { downloadOrderPdf } from "../utils/orderPdf";

export default function OrderPage() {
  const { orderId } = useParams(),
    { data } = useStore(),
    { user } = useCustomerAuth(),
    [pdfBusy, setPdfBusy] = useState(false),
    [actionMessage, setActionMessage] = useState("");
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"auto"});},[orderId]);
  let order: Order | undefined;
  try {
    order = JSON.parse(
      sessionStorage.getItem(`order:${orderId}`) || "",
    ) as Order;
  } catch {
    order = undefined;
  }
  if (!order)
    return (
      <div className="container grid min-h-[70vh] place-content-center text-center">
        <h1 className="display text-4xl">Order details unavailable.</h1>
        <p className="mt-3 text-sm text-ink/55">
          Open the original confirmation link or contact ZEVENRA.
        </p>
        <Link to="/contact" className="btn mt-6">
          Contact us
        </Link>
      </div>
    );
  const confirmedOrder = order,
    whatsapp = normalizeWhatsappDigits(data.settings.whatsapp),
    lines = order.items
      .map(
        (item) =>
          `${item.name} — ${item.color}/${item.size} × ${item.quantity}${item.isPreorder ? " (PRE-ORDER)" : ""}`,
      )
      .join("\n"),
    deliveryLabel = order.deliveryZoneName
      ? `${order.deliveryZoneName} — ${money(order.deliveryFee)}`
      : money(order.deliveryFee),
    message = `Hello ZEVENRA, I have submitted order ${order.orderId}.\n\n${lines}\nSubtotal: ${money(order.subtotal)}\nDelivery: ${deliveryLabel}\nTotal: ${money(order.total)}\nName: ${order.customerName}\nCity: ${order.city}\nPayment: ${order.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"}`,
    success=orderSuccessCopy(order.paymentMethod,money(order.total));
  async function copyOrderId() { try { await navigator.clipboard.writeText(confirmedOrder.orderId); setActionMessage("Order ID copied."); } catch { setActionMessage("Could not copy the Order ID."); } }
  async function pdf() { setPdfBusy(true); setActionMessage(""); try { await downloadOrderPdf(confirmedOrder); } catch { setActionMessage("We couldn't prepare the PDF. Please try again."); } finally { setPdfBusy(false); } }
  return (
    <main className="container py-8 sm:py-12">
      <Seo title={`Order ${order.orderId}`} />
      <div className="mx-auto max-w-3xl">
      <section className="border border-emerald-950/15 bg-emerald-950/[.045] p-6 text-center sm:p-9">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald-900/30 text-emerald-900"><Check size={30} strokeWidth={1.7}/></span>
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-900">Order submitted successfully</p>
        <h1 className="display mt-3 text-3xl sm:text-5xl">Thank you. We received your order.</h1>
        <p className="eyebrow mt-6 text-ink/45">Order ID</p><strong className="mt-1 block text-lg tracking-[.08em]">#{order.orderId}</strong>
        <div className="mx-auto mt-6 max-w-xl border-t border-emerald-950/10 pt-5"><h2 className="text-sm font-semibold">{success.title}</h2><p className="mt-2 text-xs leading-6 text-ink/60">{success.detail}</p></div>
      </section>
      <section className="mt-5 border border-black/10 bg-white/25 p-5 sm:p-7"><h2 className="eyebrow text-bronze">Order summary</h2><div className="mt-4 divide-y divide-black/10 text-left">
        {order.items.map((item) => (
          <div
            key={item.variantId}
            className="flex justify-between gap-5 py-3 text-sm"
          >
            <span>
              {item.name} · {item.color}/{item.size} × {item.quantity}
              {item.isPreorder && (
                <small className="ml-2 border border-bronze/30 px-1.5 py-0.5 text-[9px] tracking-wider text-bronze">
                  PRE-ORDER
                </small>
              )}
            </span>
            <span>{money(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-3 text-sm"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
        {Number(order.discountAmount || 0)>0?<div className="flex justify-between gap-4 py-3 text-sm"><span>Discount{order.discountCode?` (${order.discountCode})`:""}</span><span>-{money(Number(order.discountAmount))}</span></div>:null}
        <div className="flex justify-between gap-4 py-3 text-sm">
          <span>
            Delivery
            {order.deliveryZoneName ? `: ${order.deliveryZoneName}` : ""}
          </span>
          <span>
            {order.deliveryFee ? money(order.deliveryFee) : "Complimentary"}
          </span>
        </div>
        <div className="flex justify-between gap-4 py-3 text-base">
          <span>Total</span>
          <b>{money(order.total)}</b>
        </div>
      </div></section>
      {order.minimumDeliveryDays && order.maximumDeliveryDays ? <section className="mt-5 border border-black/10 bg-white/25 p-5 text-left sm:p-7"><h2 className="eyebrow text-bronze">Shipping method</h2><div className="mt-3 flex items-center justify-between gap-4 text-sm"><span><b className="block">Standard</b><small className="mt-1 block text-xs text-ink/55">{order.minimumDeliveryDays}–{order.maximumDeliveryDays} Business Days</small></span><b>{order.deliveryFee ? money(order.deliveryFee) : "Complimentary"}</b></div></section> : null}
      <section className="mt-5 border border-black/10 bg-white/25 p-5 text-left sm:p-7"><h2 className="eyebrow text-bronze">Delivery to</h2><p className="mt-3 text-sm font-medium">{order.customerName}</p><p className="mt-1 text-xs text-ink/55">{[order.city,order.district].filter(Boolean).join(" · ")}</p></section>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button type="button" className="btn justify-center" onClick={() => void copyOrderId()}><Copy size={15}/>Copy Order ID</button>
        <button type="button" className="btn min-h-12 justify-center" disabled={pdfBusy} onClick={() => void pdf()}><Download size={15}/>{pdfBusy ? "PREPARING PDF…" : "DOWNLOAD ORDER PDF"}</button>
        <Link className="btn btn-dark justify-center" to="/shop"><ShoppingBag size={15}/>Continue Shopping</Link>
        <Link className="btn justify-center" to={`/track-order?orderId=${encodeURIComponent(order.orderId)}`}>Track Order</Link>
        {user && (
          <Link className="btn justify-center" to="/account/orders">
            View My Orders
          </Link>
        )}
        {whatsapp.length >= 8 && (
          <a
            className="btn justify-center sm:col-span-2"
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={15}/>Contact on WhatsApp
          </a>
        )}
      </div>
      {actionMessage ? <p className="mt-3 text-center text-xs text-ink/55" role="status">{actionMessage}</p> : null}
      <p className="mt-5 text-center text-xs leading-5 text-ink/45">
        Keep your Order ID. You can track this order anytime using your Order ID and the mobile number used at checkout.
        {order.paymentMethod === "bank" && whatsapp.length >= 8
          ? " Your receipt is saved securely with the order; you do not need to resend the file unless ZEVENRA asks you to."
          : ""}
      </p>
      </div>
    </main>
  );
}
