import { useState, type FormEvent } from "react";
import { Copy, Download, ExternalLink, ImageIcon, PackageSearch, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { money } from "../config/site";
import { api } from "../services/api";
import type { GuestTrackedOrder } from "../types";
import { getRecentGuestOrders, orderIdFromSearch, rememberGuestOrder, removeRecentGuestOrder } from "../utils/guestOrders";
import { deliveryAddressLines, downloadOrderPdf } from "../utils/orderPdf";
import { orderProgress, safeHttpsUrl } from "../utils/orderTracking";

const failure = "We couldn't find an order with those details. Check your Order ID and mobile number.";

export default function TrackOrderPage() {
  const [orderId, setOrderId] = useState(() => orderIdFromSearch(window.location.search)),
    [recent, setRecent] = useState(() => getRecentGuestOrders()),
    [order, setOrder] = useState<GuestTrackedOrder | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setOrder(null);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api.trackOrder({ orderId: orderId.trim(), phone: String(data.get("phone") || "").trim() });
      setOrder(result); setOrderId(result.orderId);
      setRecent(rememberGuestOrder({ orderId: result.orderId, createdAt: result.createdAt }));
    } catch { setError(failure); } finally { setBusy(false); }
  }
  return <main className="min-h-[75vh] bg-paper pb-24 pt-32">
    <Seo title="Track your order" description="Track a ZEVENRA guest order securely using its Order ID and mobile number." noindex />
    <div className="container max-w-3xl">
      <div className="max-w-xl"><p className="eyebrow text-bronze">Order status</p><h1 className="display mt-3 text-5xl sm:text-6xl">Track your order</h1><p className="mt-4 text-sm leading-6 text-ink/55">Enter the Order ID from your confirmation and the mobile number used at checkout.</p></div>
      <form onSubmit={submit} className="mt-9 grid gap-5 border border-line bg-white/30 p-5 sm:grid-cols-2 sm:p-7">
        <label className="label">Order ID<input className="field mt-2 normal-case tracking-normal" name="orderId" value={orderId} onChange={(event) => setOrderId(event.target.value)} required maxLength={80} autoComplete="off" placeholder="ZEV-..." /></label>
        <label className="label">Mobile Number<input className="field mt-2 normal-case tracking-normal" name="phone" type="tel" inputMode="tel" required maxLength={30} autoComplete="tel" placeholder="07X XXX XXXX or +94 7X XXX XXXX" /><span className="mt-2 block text-[10px] normal-case leading-5 tracking-normal text-ink/45">Use the same mobile number you entered at checkout.</span></label>
        {error ? <p role="alert" className="border-l-2 border-red-800 bg-red-950/[.05] p-3 text-xs leading-5 text-red-900 sm:col-span-2">{error}</p> : null}
        <button className="btn btn-dark min-h-12 w-full sm:col-span-2" disabled={busy}>{busy ? "TRACKING…" : "TRACK ORDER"}</button>
      </form>
      {recent.length ? <section className="mt-6 border border-line bg-white/20 p-5"><p className="eyebrow text-ink/45">Recent orders on this device</p><div className="mt-3 divide-y divide-line">{recent.map((item) => <div key={item.orderId} className="flex items-center justify-between gap-3 py-3"><button type="button" className="min-w-0 text-left" onClick={() => setOrderId(item.orderId)}><b className="block truncate text-sm">{item.orderId}</b><span className="mt-1 block text-xs text-ink/45">{new Date(item.createdAt).toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "numeric" })}</span></button><button type="button" className="grid min-h-10 min-w-10 place-items-center text-ink/45 hover:text-red-800" aria-label={`Remove ${item.orderId} from this device`} onClick={() => setRecent(removeRecentGuestOrder(item.orderId))}><Trash2 size={15} /></button></div>)}</div></section> : null}
      {order ? <OrderResult order={order} /> : null}
    </div>
  </main>;
}

function OrderResult({ order }: { order: GuestTrackedOrder }) {
  const [pdfBusy, setPdfBusy] = useState(false), [message, setMessage] = useState(""),
    cancelled = order.orderStatus.toLowerCase() === "cancelled",
    currentIndex = orderProgress.findIndex(([status]) => status === order.orderStatus.toLowerCase()),
    trackingUrl = safeHttpsUrl(order.trackingUrl),
    address = deliveryAddressLines(order);
  async function pdf() { setPdfBusy(true); setMessage(""); try { await downloadOrderPdf(order); } catch { setMessage("We couldn't prepare the PDF. Please try again."); } finally { setPdfBusy(false); } }
  async function copyTracking() { try { await navigator.clipboard.writeText(order.trackingNumber); setMessage("Tracking number copied."); } catch { setMessage("Could not copy the tracking number."); } }
  return <section aria-live="polite" className="mt-8 border border-line bg-white/35 p-4 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5"><div className="min-w-0"><p className="eyebrow break-all text-bronze">Order #{order.orderId}</p><h2 className="mt-2 text-2xl font-semibold">{cancelled ? "Order cancelled" : order.orderStatus || "Pending"}</h2><p className="mt-1 text-xs text-ink/50">Placed {new Date(order.createdAt).toLocaleString("en-LK")}</p></div><div className="flex items-center gap-2 border border-bronze/30 px-3 py-2 text-xs"><PackageSearch size={16} /><span>Payment: <b>{order.paymentStatus}</b></span></div></div>
    {cancelled ? <div className="mt-5 border border-red-900/20 bg-red-950/[.05] p-4 text-sm text-red-900"><b>Order cancelled</b><p className="mt-1 text-xs leading-5">This order will not continue through fulfilment.</p></div> : <ol className="mt-5 grid grid-cols-2 gap-2 min-[390px]:grid-cols-3 lg:grid-cols-6">{orderProgress.map(([status, label], index) => <li key={status} className={`border px-1 py-3 text-center text-[9px] sm:px-2 sm:text-[10px] ${index <= currentIndex ? "border-bronze bg-bronze/[.08] text-bronze" : "border-line text-ink/35"}`}><span className="mx-auto mb-2 block h-1.5 w-1.5 rounded-full bg-current" />{label}</li>)}</ol>}
    <div className="mt-7 grid gap-7 border-t border-line pt-6 sm:grid-cols-2">
      <div className="space-y-6"><Detail label="Customer" value={order.customerName} /><div><p className="eyebrow text-ink/40">Delivery address</p><div className="mt-2 break-words text-sm leading-6">{address.length ? address.map((line) => <p key={line}>{line}</p>) : <p>—</p>}</div></div></div>
      <div className="space-y-6"><Detail label="Payment method" value={order.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"} /><Detail label="Delivery area" value={order.deliveryZoneName || [order.city, order.district].filter(Boolean).join(", ")} />{order.fulfilmentCourierName ? <Detail label="Courier" value={order.fulfilmentCourierName} /> : null}{order.trackingNumber ? <div><p className="eyebrow text-ink/40">Tracking number</p><div className="mt-2 flex flex-wrap items-center gap-2"><b className="break-all text-sm">{order.trackingNumber}</b><button type="button" className="btn min-h-10 px-3" onClick={() => void copyTracking()}><Copy size={13} /> Copy</button></div>{trackingUrl ? <a className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-bronze underline-offset-4 hover:underline" href={trackingUrl} target="_blank" rel="noreferrer">Track with courier <ExternalLink size={13} /></a> : null}</div> : null}</div>
    </div>
    <div className="mt-8"><h3 className="eyebrow text-bronze">Products</h3><div className="mt-3 divide-y divide-line border-y border-line">{order.items.map((item, index) => <ProductRow key={`${item.name}-${item.color}-${item.size}-${index}`} item={item} />)}</div></div>
    <div className="ml-auto mt-7 max-w-sm"><h3 className="eyebrow mb-4 text-bronze">Order totals</h3><div className="space-y-3 border-t border-line pt-4 text-sm"><Row label="Subtotal" value={money(order.subtotal)} /><Row label="Delivery" value={order.deliveryFee ? money(order.deliveryFee) : "Free"} /><Row label="Total" value={money(order.total)} strong /></div></div>
    <div className="mt-7 flex justify-stretch sm:justify-end"><button type="button" className="btn min-h-12 w-full justify-center sm:w-auto" disabled={pdfBusy} onClick={() => void pdf()}><Download size={14} />{pdfBusy ? "PREPARING PDF…" : "DOWNLOAD ORDER PDF"}</button></div>{message ? <p className="mt-3 text-right text-xs text-ink/55" role="status">{message}</p> : null}
  </section>;
}

function ProductRow({ item }: { item: GuestTrackedOrder["items"][number] }) {
  const [imageFailed, setImageFailed] = useState(false),
    image = item.imageUrl && !imageFailed ? <img src={item.imageUrl} alt="" width="72" height="90" loading="lazy" decoding="async" className="h-[90px] w-[72px] object-cover" onError={() => setImageFailed(true)} /> : <span className="grid h-[90px] w-[72px] place-items-center bg-black/[.04] text-ink/25"><ImageIcon size={20} aria-hidden="true" /></span>,
    imageBlock = item.productSlug ? <Link to={`/product/${encodeURIComponent(item.productSlug)}`} aria-label={`View ${item.name}`}>{image}</Link> : image;
  return <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:gap-5">
    {imageBlock}
    <div className="min-w-0"><b className="block break-words text-sm leading-5">{item.name}</b><p className="mt-2 text-xs leading-5 text-ink/50">{[item.color, item.size].filter(Boolean).join(" · ") || "Standard"}</p><p className="text-xs leading-5 text-ink/50">Qty {item.quantity}{item.isPreorder ? " · Pre-order" : ""}</p>{item.productSlug ? <Link className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-wider text-bronze underline-offset-4 hover:underline" to={`/product/${encodeURIComponent(item.productSlug)}`}>View product →</Link> : null}</div>
    <span className="col-start-2 text-sm font-medium sm:col-start-3 sm:row-start-1 sm:text-right">{money(item.unitPrice * item.quantity)}</span>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="eyebrow text-ink/40">{label}</p><p className="mt-2 break-words text-sm leading-6">{value || "—"}</p></div>; }
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex justify-between gap-4"><span className="text-ink/55">{label}</span>{strong ? <strong className="text-base">{value}</strong> : <span>{value}</span>}</div>; }
