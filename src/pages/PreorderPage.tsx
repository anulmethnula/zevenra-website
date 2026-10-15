import { useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Download, Minus, Plus, X } from "lucide-react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { sriLankaDistricts } from "../../shared/sri-lanka-districts";
import { Seo } from "../components/Seo";
import { money } from "../config/site";
import { useCustomerAuth } from "../features/account/CustomerAuthContext";
import { useCheckoutConfig, useProduct } from "../hooks/usePublicData";
import { api } from "../services/api";
import { uploadPaymentReceipt } from "../services/paymentReceiptUpload";
import { downloadPreorderSummaryPdf } from "../utils/preorderSummaryPdf";
import type { PreorderRequest } from "../types";

const receiptTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  maxReceiptBytes = 10_000_000,
  requestSchema = z.object({
    customerName: z.string().trim().min(2, "Enter your full name.").max(100, "Enter your full name."),
    whatsapp: z.string().trim().regex(/^[+\d][\d\s-]{8,14}$/, "Enter a valid WhatsApp number."),
    city: z.string().trim().min(2, "Enter your city or area.").max(80, "Enter your city or area."),
    address1: z.string().trim().min(5, "Enter your delivery address.").max(180, "Enter your delivery address."),
    address2: z.string().trim().max(180, "Address line 2 is too long.").optional(),
    district: z.string().refine((value) => (sriLankaDistricts as readonly string[]).includes(value), "Choose your district."),
    postalCode: z.string().trim().regex(/^\d{5}$/, "Enter a valid 5-digit postal code."),
    email: z.string().trim().email("Enter a valid email or leave it blank.").or(z.literal("")).optional(),
  });
type FieldErrors = Record<string, string>;

export default function PreorderPage() {
  const { slug } = useParams(), [search] = useSearchParams(), navigate = useNavigate(), request = useProduct(slug || ""), checkout = useCheckoutConfig(), { user } = useCustomerAuth(), product = request.data?.product,
    variant = product?.variants.find((item) => item.id === search.get("variant") && item.active),
    [qty, setQty] = useState(() => { const value = Number(search.get("quantity")); return Number.isInteger(value) ? Math.min(5, Math.max(1, value)) : 1; }),
    [receipt, setReceipt] = useState<File | null>(null), [uploadedReceiptUrl, setUploadedReceiptUrl] = useState(""), [termsAccepted, setTermsAccepted] = useState(false), [busy, setBusy] = useState(false),
    [fieldErrors, setFieldErrors] = useState<FieldErrors>({}), [submitError, setSubmitError] = useState(""), [done, setDone] = useState<PreorderRequest|null>(null), receiptInput = useRef<HTMLInputElement>(null), receiptButton = useRef<HTMLButtonElement>(null);
  const defaultName = useMemo(() => [user?.firstName, user?.lastName].filter(Boolean).join(" "), [user]);

  if (request.loading) return <main className="container min-h-[70vh] py-36"><div className="home-skeleton"><div /><div /></div></main>;
  if (!product || !variant || !product.preorderEnabled || variant.stock > 0) return <Navigate to={product ? "/product/" + product.slug : "/shop"} replace />;
  const preorderProduct = product, preorderVariant = variant, settings = Object.fromEntries((checkout.data?.settings || []).map((row) => [row.key, row.value])), productTotal = preorderProduct.price * qty,
    validSavedDistrict = (sriLankaDistricts as readonly string[]).includes(user?.district || "") ? user?.district : "";

  function focusFirstError(form: HTMLFormElement, errors: FieldErrors) {
    const first = Object.keys(errors)[0], target = first === "receipt" ? receiptButton.current : form.elements.namedItem(first);
    if (target instanceof HTMLElement) { target.focus(); target.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  function chooseReceipt(file: File | null) {
    setSubmitError(""); setUploadedReceiptUrl("");
    if (!file) { setReceipt(null); return; }
    if (!receiptTypes.has(file.type)) { setReceipt(null); setFieldErrors((current) => ({ ...current, receipt: "Upload a JPG, PNG, WEBP, or PDF receipt." })); return; }
    if (file.size > maxReceiptBytes) { setReceipt(null); setFieldErrors((current) => ({ ...current, receipt: "Receipt must be 10 MB or smaller." })); return; }
    setReceipt(file); setFieldErrors((current) => { const next = { ...current }; delete next.receipt; return next; });
  }
  function removeReceipt() { setReceipt(null); setUploadedReceiptUrl(""); if (receiptInput.current) receiptInput.current.value = ""; }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, parsed = requestSchema.safeParse(Object.fromEntries(new FormData(form))), errors: FieldErrors = {};
    if (!parsed.success) for (const issue of parsed.error.issues) { const field = String(issue.path[0] || ""); if (field && !errors[field]) errors[field] = issue.message; }
    const selectedReceipt=receipt;
    if (!selectedReceipt) errors.receipt = fieldErrors.receipt || "Upload your payment receipt.";
    if (!termsAccepted) errors.terms = "Accept the pre-order terms to continue.";
    setFieldErrors(errors); setSubmitError("");
    if (!parsed.success || Object.keys(errors).length) { focusFirstError(form, errors); return; }
    setBusy(true);
    let paymentReceiptUrl = uploadedReceiptUrl;
    if (!paymentReceiptUrl) {
      try { paymentReceiptUrl = await uploadPaymentReceipt(selectedReceipt!); setUploadedReceiptUrl(paymentReceiptUrl); }
      catch (reason) { const message = reason instanceof Error ? reason.message : "Receipt upload failed. Please try again."; setUploadedReceiptUrl(""); setFieldErrors((current) => ({ ...current, receipt: message })); setSubmitError(message); setBusy(false); return; }
    }
    try {
      const created = await api.createPreorder({ ...parsed.data, phone: parsed.data.whatsapp, productId: preorderProduct.id, variantId: preorderVariant.id, quantity: qty, paymentReceiptUrl });
      setDone(created);
    } catch (reason) { setSubmitError(reason instanceof Error ? reason.message : "We could not submit your pre-order. Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="container min-w-0 pb-20 pt-28 lg:pt-36">
    <Seo title={"Pre-order " + product.name} noindex /><Link to={"/product/" + product.slug} className="inline-flex min-h-11 items-center gap-2 text-xs underline"><ArrowLeft size={14} /> Back to product</Link>
    <div className="mt-7 grid min-w-0 gap-8 lg:grid-cols-[.85fr_1.15fr]">
      <section className="preorder-request-summary min-w-0">
        <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">{product.media.find((media) => media.type === "image") ? <img src={product.media.find((media) => media.type === "image")!.url} alt={product.name} className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5] bg-black/5" />}<div className="min-w-0"><p className="eyebrow text-bronze">Pre-order</p><h1 className="display mt-3 break-words text-3xl sm:text-4xl">{product.name}</h1><p className="mt-3 text-sm text-ink/55">{variant.color} / {variant.size}</p><p className="mt-2 text-sm">{money(product.price)} <span className="text-xs text-ink/45">product price</span></p></div></div>
        <div className="preorder-request-steps"><div><b>1</b><span><strong>Submit payment</strong><small>Pay the full product total and submit your receipt now.</small></span></div><div><b>2</b><span><strong>Payment verification</strong><small>We verify the receipt before confirming your pre-order.</small></span></div><div><b>3</b><span><strong>Arrival</strong><small>Estimated arrival is 3–4 weeks.</small></span></div><div><b>4</b><span><strong>Delivery</strong><small>Pay the courier fee separately on delivery.</small></span></div></div>
        <p className="preorder-request-note">Product payment now: <b>{money(productTotal)}</b><br />Estimated arrival: <b>3–4 weeks</b><br />Courier fee: <b>paid separately to courier on delivery</b></p>
      </section>
      <form onSubmit={submit} noValidate className="preorder-request-form min-w-0">
        <div><p className="eyebrow">Customer details</p><h2 className="display mt-2 text-4xl">Confirm your pre-order.</h2><p className="mt-3 text-xs leading-6 text-ink/55">Add your details, review the terms, make the bank payment, and upload the receipt in one submission.</p></div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field name="customerName" label="Full name *" defaultValue={defaultName} error={fieldErrors.customerName} /><Field name="whatsapp" label="WhatsApp number *" type="tel" defaultValue={user?.mobile || ""} error={fieldErrors.whatsapp} /><Field name="city" label="City / area *" defaultValue={user?.city || ""} error={fieldErrors.city} /><Field name="email" label="Email (optional)" type="email" defaultValue={user?.email || ""} error={fieldErrors.email} /><Field name="address1" label="Delivery address *" defaultValue={user?.address1 || ""} error={fieldErrors.address1} className="sm:col-span-2" /><Field name="address2" label="Address line 2" defaultValue={user?.address2 || ""} error={fieldErrors.address2} />
          <label className="min-w-0 text-xs">District *<select name="district" defaultValue={validSavedDistrict} aria-invalid={Boolean(fieldErrors.district)} className={`field mt-2 min-w-0 ${fieldErrors.district ? "border-red-700/60" : ""}`}><option value="">Select district</option>{sriLankaDistricts.map((district) => <option key={district} value={district}>{district}</option>)}</select><FieldError message={fieldErrors.district} /></label>
          <label className="min-w-0 text-xs">Postal code *<input name="postalCode" defaultValue={user?.postalCode || ""} inputMode="numeric" pattern="\d{5}" maxLength={5} aria-invalid={Boolean(fieldErrors.postalCode)} className={`field mt-2 min-w-0 ${fieldErrors.postalCode ? "border-red-700/60" : ""}`} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 5); }} /><FieldError message={fieldErrors.postalCode} /></label>
        </div>
        <div><p className="mb-2 text-xs">Quantity</p><div className="flex min-h-12 w-fit items-center border border-line"><button type="button" className="grid h-11 w-11 place-items-center" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Reduce quantity"><Minus size={15} /></button><span className="w-10 text-center text-sm tabular-nums">{qty}</span><button type="button" className="grid h-11 w-11 place-items-center disabled:opacity-30" disabled={qty >= 5} onClick={() => setQty(Math.min(5, qty + 1))} aria-label="Increase quantity"><Plus size={15} /></button></div></div>
        <section className="border border-bronze/25 bg-bronze/5 p-4 text-xs leading-6 text-ink/65"><p className="font-semibold text-ink">Pre-order terms</p><ul className="mt-2 grid gap-1 pl-4 [list-style:disc]"><li>Estimated arrival: 3–4 weeks</li><li>Full product payment required now</li><li>Courier fee is paid separately to courier on delivery</li><li>Confirmed pre-orders are non-refundable for change of mind</li><li>If we&apos;re unable to complete your pre-order, your product payment will be refunded.</li></ul></section>
        <section className="grid gap-3 border border-line bg-white/35 p-4 text-sm"><div><p className="eyebrow text-bronze">Bank payment details</p><p className="mt-2 text-xs leading-5 text-ink/55">Transfer the exact product total before uploading your receipt.</p></div><div className="grid gap-2 text-xs sm:grid-cols-2"><p><b>Bank</b><br />{String(settings.bankName || "—")}</p><p><b>Account name</b><br />{String(settings.accountName || "—")}</p><p><b>Account number</b><br />{String(settings.bankAccountNumber || settings.accountNumber || "—")}</p><p><b>Branch</b><br />{String(settings.branch || "—")}</p></div><div className="border-t border-line pt-3"><div className="flex justify-between gap-4"><span>Product payment now</span><b>{money(productTotal)}</b></div><div className="mt-2 flex justify-between gap-4 text-ink/55"><span>Courier fee on delivery</span><b>Calculated separately</b></div></div>
          <input ref={receiptInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => chooseReceipt(event.target.files?.[0] || null)} />
          {receipt ? <div className="flex min-h-12 items-center justify-between gap-3 border border-line px-3"><span className="min-w-0 truncate text-xs">{receipt.name}</span><span className="flex shrink-0"><button type="button" className="min-h-11 px-2 text-[10px] font-semibold uppercase tracking-wider text-bronze" onClick={() => receiptInput.current?.click()}>Replace</button><button type="button" className="min-h-11 px-2 text-[10px] uppercase tracking-wider text-ink/50" onClick={removeReceipt}>Remove</button></span></div> : <button ref={receiptButton} type="button" className={`btn min-h-12 justify-center border-dashed ${fieldErrors.receipt ? "border-red-700/60" : ""}`} onClick={() => receiptInput.current?.click()}>Upload payment receipt *</button>}
          <FieldError message={fieldErrors.receipt} />
        </section>
        <label className="flex min-h-11 items-start gap-3 text-xs leading-5 text-ink/65"><input name="terms" className="mt-1" type="checkbox" checked={termsAccepted} aria-invalid={Boolean(fieldErrors.terms)} onChange={(event) => { setTermsAccepted(event.target.checked); setFieldErrors((current) => { const next = { ...current }; delete next.terms; return next; }); }} /><span>I have reviewed the pre-order terms and confirm the payment details above.<FieldError message={fieldErrors.terms} /></span></label>
        {submitError && <p role="alert" className="border border-red-900/15 bg-red-950/[.04] p-3 text-xs leading-5 text-red-900">{submitError}</p>}
        <button disabled={busy} className="btn btn-dark w-full justify-center disabled:opacity-50">{busy ? "Submitting..." : "Submit Payment for Verification"}</button>
      </form>
    </div>
    {done && <div className="fixed inset-0 z-[120] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="preorder-success-title" className="relative w-full max-w-lg border border-white/10 bg-[#f5f0e8] p-6 text-ink shadow-2xl sm:p-9"><button type="button" aria-label="Close" className="absolute right-3 top-3 grid h-11 w-11 place-items-center" onClick={() => navigate("/shop")}><X size={18} /></button><CheckCircle2 className="text-bronze" size={34} /><h2 id="preorder-success-title" className="display mt-5 text-4xl">Payment receipt submitted</h2><p className="mt-4 text-sm leading-7 text-ink/65">Thank you. Your pre-order request has been received and your payment receipt is awaiting verification.</p><dl className="mt-6 grid gap-3 border-y border-line py-5 text-xs"><SuccessRow label="Pre-order ID" value={done.preorderNumber ? `PRE-${done.preorderNumber}` : done.requestId} /><SuccessRow label="Product name" value={product.name} /><SuccessRow label="Product payment amount" value={money(productTotal)} /><SuccessRow label="Estimated arrival" value="3–4 weeks" /><SuccessRow label="Courier fee" value="Paid separately on delivery" /></dl><div className="mt-6 grid gap-2 sm:grid-cols-2"><button autoFocus type="button" className="btn btn-dark justify-center" onClick={() => navigate("/shop")}>Done</button><button type="button" className="btn justify-center" onClick={()=>void downloadPreorderSummaryPdf(done)}><Download size={14}/> Download pre-order summary</button>{user && <Link className="btn justify-center" to="/account/orders">View my requests</Link>}</div></section></div>}
  </main>;
}

function Field({ name, label, type = "text", defaultValue, error, className = "" }: { name: string; label: string; type?: string; defaultValue?: string; error?: string; className?: string }) {
  return <label className={`min-w-0 text-xs ${className}`}>{label}<input name={name} type={type} defaultValue={defaultValue} inputMode={type === "tel" ? "tel" : undefined} aria-invalid={Boolean(error)} className={`field mt-2 min-w-0 ${error ? "border-red-700/60" : ""}`} /><FieldError message={error} /></label>;
}
function FieldError({ message }: { message?: string }) { return message ? <span className="mt-1.5 block text-[10px] leading-4 text-red-800">{message}</span> : null; }
function SuccessRow({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-5"><dt className="text-ink/50">{label}</dt><dd className="text-right font-medium">{value}</dd></div>; }
