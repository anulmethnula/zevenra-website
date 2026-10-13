import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Minus, Plus } from "lucide-react";
import { Link, Navigate, useSearchParams, useParams } from "react-router-dom";
import { z } from "zod";
import { Seo } from "../components/Seo";
import { money } from "../config/site";
import { useCustomerAuth } from "../features/account/CustomerAuthContext";
import { useCheckoutConfig, useProduct } from "../hooks/usePublicData";
import { api } from "../services/api";
import { uploadPaymentReceipt } from "../services/paymentReceiptUpload";

const requestSchema = z.object({
  customerName: z.string().trim().min(2, "Enter your full name.").max(100),
  whatsapp: z.string().trim().regex(/^[+\d][\d\s-]{8,14}$/, "Enter a valid WhatsApp number."),
  city: z.string().trim().min(2, "Enter your city or area.").max(80),
  address1: z.string().trim().min(5, "Enter your delivery address.").max(180),
  address2: z.string().trim().max(180).optional(),
  district: z.string().trim().min(1, "Enter your district."),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit postal code."),
  email: z.string().trim().email("Enter a valid email or leave it blank.").or(z.literal("")).optional(),
});

export default function PreorderPage() {
  const { slug } = useParams(), [search] = useSearchParams(), request = useProduct(slug || ""), checkout = useCheckoutConfig(), { user } = useCustomerAuth(), product = request.data?.product,
    variant = product?.variants.find((item) => item.id === search.get("variant") && item.active),
    [qty, setQty] = useState(() => { const value = Number(search.get("quantity")); return Number.isInteger(value) ? Math.min(5, Math.max(1, value)) : 1; }),
    [receipt, setReceipt] = useState<File | null>(null), [termsAccepted, setTermsAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState("");
  const defaultName = useMemo(() => [user?.firstName, user?.lastName].filter(Boolean).join(" "), [user]);

  if (request.loading) return <main className="container min-h-[70vh] py-36"><div className="home-skeleton"><div /><div /></div></main>;
  if (!product || !variant || !product.preorderEnabled || variant.stock > 0) return <Navigate to={product ? "/product/" + product.slug : "/shop"} replace />;
  const preorderProduct=product,preorderVariant=variant,
    settings = Object.fromEntries((checkout.data?.settings || []).map((row) => [row.key, row.value])), productTotal = preorderProduct.price * qty;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const parsed = requestSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message || "Please check your details.");
    if (!receipt) return setError("Upload your bank payment receipt.");
    if (!termsAccepted) return setError("Accept the pre-order terms to continue.");
    setBusy(true);
    try {
      const paymentReceiptUrl = await uploadPaymentReceipt(receipt);
      const created = await api.createPreorder({ ...parsed.data, phone: parsed.data.whatsapp, productId: preorderProduct.id, variantId: preorderVariant.id, quantity: qty, paymentReceiptUrl });
      setDone(created.requestId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit your pre-order."); }
    finally { setBusy(false); }
  }

  if (done) return <main className="container grid min-h-[75vh] place-content-center px-4 py-28 text-center">
    <Seo title="Pre-order payment submitted" noindex /><CheckCircle2 className="mx-auto" size={34} /><p className="eyebrow mt-5 text-bronze">Payment submitted</p>
    <h1 className="display mt-3 break-words text-4xl sm:text-5xl">Pre-order received.</h1>
    <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-ink/60">We will verify your payment before confirming the pre-order. Estimated arrival is 3–4 weeks. The courier fee is paid separately to the courier on delivery.</p>
    <p className="mt-4 break-all text-xs text-ink/45">Reference: {done}</p>
    <div className="mx-auto mt-8 flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">{user && <Link className="btn btn-dark justify-center" to="/account/orders">View my requests</Link>}<Link className="btn justify-center" to="/shop">Continue shopping</Link></div>
  </main>;

  return <main className="container min-w-0 pb-20 pt-28 lg:pt-36">
    <Seo title={"Pre-order " + product.name} noindex /><Link to={"/product/" + product.slug} className="inline-flex min-h-11 items-center gap-2 text-xs underline"><ArrowLeft size={14} /> Back to product</Link>
    <div className="mt-7 grid min-w-0 gap-8 lg:grid-cols-[.85fr_1.15fr]">
      <section className="preorder-request-summary min-w-0">
        <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          {product.media.find((media) => media.type === "image") ? <img src={product.media.find((media) => media.type === "image")!.url} alt={product.name} className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5] bg-black/5" />}
          <div className="min-w-0"><p className="eyebrow text-bronze">Pre-order</p><h1 className="display mt-3 break-words text-3xl sm:text-4xl">{product.name}</h1><p className="mt-3 break-words text-sm text-ink/55">{variant.color} / {variant.size}</p><p className="mt-2 break-words text-sm">{money(product.price)} <span className="text-xs text-ink/45">product price</span></p></div>
        </div>
        <div className="preorder-request-steps">
          <div><b>1</b><span><strong>Pay &amp; confirm</strong><small>Pay the full product total and submit your receipt now.</small></span></div>
          <div><b>2</b><span><strong>Payment verification</strong><small>We verify the receipt and confirm your pre-order.</small></span></div>
          <div><b>3</b><span><strong>Arrival</strong><small>Estimated arrival is 3–4 weeks.</small></span></div>
          <div><b>4</b><span><strong>Delivery</strong><small>Pay the courier fee separately on delivery.</small></span></div>
        </div>
        <p className="preorder-request-note break-words">Product payment now: <b>{money(productTotal)}</b><br />Courier fee on delivery: <b>calculated separately</b></p>
      </section>
      <form onSubmit={submit} className="preorder-request-form min-w-0">
        <div><p className="eyebrow">Customer details</p><h2 className="display mt-2 break-words text-4xl">Confirm your pre-order.</h2><p className="mt-3 text-xs leading-6 text-ink/55">Add your details, review the terms, make the bank payment, and upload the receipt in one submission.</p></div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field name="customerName" label="Full name *" required minLength={2} defaultValue={defaultName} /><Field name="whatsapp" label="WhatsApp number *" required type="tel" defaultValue={user?.mobile || ""} /><Field name="city" label="City / area *" required minLength={2} defaultValue={user?.city || ""} /><Field name="email" label="Email (optional)" type="email" defaultValue={user?.email || ""} /><Field name="address1" label="Delivery address *" required minLength={5} defaultValue={user?.address1 || ""} /><Field name="address2" label="Address line 2" defaultValue={user?.address2 || ""} /><Field name="district" label="District *" required defaultValue={user?.district || ""} /><Field name="postalCode" label="Postal code *" required defaultValue={user?.postalCode || ""} />
        </div>
        <div><p className="mb-2 text-xs">Quantity</p><div className="flex min-h-12 w-fit items-center border border-line"><button type="button" className="grid h-11 w-11 place-items-center" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Reduce quantity"><Minus size={15} /></button><span className="w-10 text-center text-sm tabular-nums">{qty}</span><button type="button" className="grid h-11 w-11 place-items-center disabled:opacity-30" disabled={qty >= 5} onClick={() => setQty(Math.min(5, qty + 1))} aria-label="Increase quantity"><Plus size={15} /></button></div></div>
        <section className="border border-bronze/25 bg-bronze/5 p-4 text-xs leading-6 text-ink/65"><p className="font-semibold text-ink">Pre-order terms</p><ul className="mt-2 grid gap-1.5 pl-4 [list-style:disc]"><li>Estimated arrival: 3–4 weeks.</li><li>Full product payment of {money(productTotal)} is required now.</li><li>Courier fee is not included and is paid separately to the courier on delivery.</li><li>Change-of-mind cancellation after confirmation is non-refundable.</li><li>If ZEVENRA cannot fulfil the pre-order, the product payment is refunded.</li></ul></section>
        <section className="grid gap-3 border border-line bg-white/35 p-4 text-sm">
          <div><p className="eyebrow text-bronze">Bank payment details</p><p className="mt-2 text-xs leading-5 text-ink/55">Transfer the exact product total before uploading your receipt.</p></div>
          <div className="grid gap-2 text-xs sm:grid-cols-2"><p><b>Bank</b><br />{String(settings.bankName || "—")}</p><p><b>Account name</b><br />{String(settings.accountName || "—")}</p><p><b>Account number</b><br />{String(settings.bankAccountNumber || settings.accountNumber || "—")}</p><p><b>Branch</b><br />{String(settings.branch || "—")}</p></div>
          <div className="border-t border-line pt-3"><div className="flex justify-between gap-4"><span>Product payment now</span><b>{money(productTotal)}</b></div><div className="mt-2 flex justify-between gap-4 text-ink/55"><span>Courier fee on delivery</span><b>Calculated separately</b></div></div>
          <label className="btn min-h-12 cursor-pointer justify-center border-dashed">{receipt ? receipt.name : "Upload payment receipt *"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" required onChange={(event) => setReceipt(event.target.files?.[0] || null)} /></label>
        </section>
        <label className="flex min-h-11 items-start gap-3 text-xs leading-5 text-ink/65"><input className="mt-1" type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required /><span>I have reviewed the pre-order terms and confirm the payment details above.</span></label>
        {error && <p role="alert" className="bg-red-950 p-3 text-xs leading-5 text-white">{error}</p>}
        <button disabled={busy || !receipt || !termsAccepted} className="btn btn-dark w-full justify-center disabled:opacity-50">{busy ? "Submitting payment…" : "Pay & Confirm Pre-order"}</button>
      </form>
    </div>
  </main>;
}

function Field({ name, label, required, type = "text", defaultValue, minLength }: { name: string; label: string; required?: boolean; type?: string; defaultValue?: string; minLength?: number }) {
  return <label className="min-w-0 text-xs">{label}<input name={name} required={required} type={type} minLength={minLength} inputMode={type === "tel" ? "tel" : undefined} className="field mt-2 min-w-0" defaultValue={defaultValue} /></label>;
}
