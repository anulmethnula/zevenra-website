import { useState, type FormEvent } from "react";
import { PackageSearch } from "lucide-react";
import { Seo } from "../components/Seo";
import { money } from "../config/site";
import { api } from "../services/api";
import type { GuestTrackedOrder } from "../types";

const failure = "We couldn't find an order with those details. Check your Order ID and mobile number.";

export default function TrackOrderPage() {
  const [order, setOrder] = useState<GuestTrackedOrder | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOrder(null);
    const data = new FormData(event.currentTarget);
    try {
      setOrder(await api.trackOrder({
        orderId: String(data.get("orderId") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
      }));
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-[75vh] bg-paper pb-24 pt-32">
      <Seo title="Track your order" description="Track a ZEVENRA guest order securely using its Order ID and mobile number." noindex />
      <div className="container max-w-3xl">
        <div className="max-w-xl">
          <p className="eyebrow text-bronze">Order status</p>
          <h1 className="display mt-3 text-5xl sm:text-6xl">Track your order</h1>
          <p className="mt-4 text-sm leading-6 text-ink/55">Enter the Order ID from your confirmation and the mobile number used at checkout.</p>
        </div>
        <form onSubmit={submit} className="mt-9 grid gap-5 border border-line bg-white/30 p-5 sm:grid-cols-2 sm:p-7">
          <label className="label">Order ID<input className="field mt-2 normal-case tracking-normal" name="orderId" required maxLength={80} autoComplete="off" placeholder="ZEV-..." /></label>
          <label className="label">Mobile Number<input className="field mt-2 normal-case tracking-normal" name="phone" type="tel" inputMode="tel" required maxLength={15} autoComplete="tel" placeholder="07X XXX XXXX" /></label>
          {error && <p role="alert" className="border-l-2 border-red-800 bg-red-950/[.05] p-3 text-xs leading-5 text-red-900 sm:col-span-2">{error}</p>}
          <button className="btn btn-dark min-h-12 w-full sm:col-span-2" disabled={busy}>{busy ? "TRACKING…" : "TRACK ORDER"}</button>
        </form>
        {order && <OrderResult order={order} />}
      </div>
    </main>
  );
}

function OrderResult({ order }: { order: GuestTrackedOrder }) {
  return <section aria-live="polite" className="mt-8 border border-line bg-white/35 p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
      <div><p className="eyebrow text-bronze">Order #{order.orderId}</p><h2 className="mt-2 text-2xl font-semibold">{order.orderStatus || "Pending"}</h2><p className="mt-1 text-xs text-ink/50">{order.city}{order.district ? `, ${order.district}` : ""}</p></div>
      <div className="flex items-center gap-2 border border-bronze/30 px-3 py-2 text-xs"><PackageSearch size={16} /><span>Payment: <b>{order.paymentStatus}</b></span></div>
    </div>
    <div className="divide-y divide-line">{order.items.map((item, index) => <div key={`${item.name}-${item.color}-${item.size}-${index}`} className="flex items-start justify-between gap-5 py-4 text-sm"><div><b>{item.name}</b><p className="mt-1 text-xs text-ink/50">{[item.color,item.size].filter(Boolean).join(" · ")} · Qty {item.quantity}{item.isPreorder ? " · Pre-order" : ""}</p></div><span className="shrink-0">{money(item.unitPrice * item.quantity)}</span></div>)}</div>
    <div className="ml-auto mt-4 max-w-sm space-y-2 border-t border-line pt-4 text-sm"><Row label="Subtotal" value={money(order.subtotal)} /><Row label="Delivery" value={order.deliveryFee ? money(order.deliveryFee) : "Free"} /><Row label="Total" value={money(order.total)} strong /></div>
  </section>;
}
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex justify-between gap-4"><span className="text-ink/55">{label}</span>{strong ? <strong>{value}</strong> : <span>{value}</span>}</div>; }
