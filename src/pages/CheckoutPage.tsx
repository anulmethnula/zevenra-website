import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Check, CheckCircle2, ChevronDown, ShoppingBag, Upload, WalletCards, X } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Seo } from "../components/Seo";
import { money } from "../config/site";
import { useCustomerAuth } from "../features/account/CustomerAuthContext";
import { useCart } from "../features/cart/CartContext";
import { useStore } from "../features/store/StoreContext";
import { api } from "../services/api";
import { uploadPaymentReceipt } from "../services/paymentReceiptUpload";
import type { Order, PaymentMethod } from "../types";
import { checkoutCourier, deliveryQuote } from "../utils/delivery";
import { checkoutAmounts } from "../utils/checkoutAmounts";
import { paymentReadinessMessage, postalCodeError } from "../utils/checkoutValidation";
import { rememberGuestOrder } from "../utils/guestOrders";
import { useCheckoutConfig } from "../hooks/usePublicData";

const districts = ["Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya"] as const;
const schema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(100)
    .regex(/^[\p{L}\p{M} .'-]+$/u, "Full name should contain letters only."),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{8,14}$/, "Enter a valid mobile number."),
  email: z.string().trim().email("Enter a valid email address.").or(z.literal("")).optional(),
  address1: z.string().trim().min(5, "Enter your delivery address.").max(180),
  address2: z.string().trim().max(180).optional(),
  deliveryNotes: z.string().trim().max(300, "Keep delivery instructions under 300 characters.").optional(),
  city: z.string().trim().min(2, "Enter your city / area.").max(80),
  district: z.enum(districts, {
    errorMap: () => ({ message: "Choose your district." }),
  }),
  postalCode: z
    .string()
    .trim()
    .refine((value) => !value || /^\d+$/.test(value), "Postal code must contain numbers only.")
    .refine((value) => !value || value.length === 5, "Postal code must be exactly 5 digits.")
    .optional(),
  paymentMethod: z.enum(["cod", "bank"]),
  paymentReference: z.string().trim().max(100).optional(),
  paymentReceiptUrl: z.string().url().optional(),
});
const enter = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export default function CheckoutPage() {
  const cart = useCart(),
    navigate = useNavigate(),
    formRef = useRef<HTMLFormElement>(null),
    { data } = useStore(),
    checkout = useCheckoutConfig(),
    { user } = useCustomerAuth(),
    raw = Object.fromEntries((checkout.data?.settings || []).map((row) => [row.key, row.value])),
    bool = (value: unknown) => value === true || String(value).toLowerCase() === "true",
    settings = {
      ...data.settings,
      codEnabled: bool(raw.codEnabled),
      bankEnabled: bool(raw.bankEnabled ?? raw.bankTransferEnabled),
      bankName: String(raw.bankName || ""),
      accountName: String(raw.accountName ?? raw.bankAccountName ?? ""),
      accountNumber: String(raw.accountNumber ?? raw.bankAccountNumber ?? ""),
      branch: String(raw.branch ?? raw.bankBranch ?? ""),
      bankInstructions: String(raw.bankInstructions || ""),
      deliveryEnabled: bool(raw.deliveryEnabled),
      deliveryFee: Number(raw.deliveryFee ?? raw.deliveryFlatFee) || 0,
      freeDeliveryThreshold: Number(raw.freeDeliveryThreshold) || 0,
      defaultCourierProviderId: String(raw.defaultCourierProviderId || ""),
      storeOpen: bool(raw.storeOpen),
      ordersEnabled: bool(raw.ordersEnabled),
    };
  const savedName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const bankConfigured = Boolean(settings.bankEnabled && settings.bankName.trim() && settings.accountName.trim() && settings.accountNumber.trim());
  const availablePayments = useMemo<PaymentMethod[]>(() => [...(settings.codEnabled ? ["cod" as const] : []), ...(bankConfigured ? ["bank" as const] : [])], [settings.codEnabled, bankConfigured]);
  const [payment, setPayment] = useState<PaymentMethod>(availablePayments[0] || "cod"),
    [district, setDistrict] = useState(user?.district || ""),
    [city, setCity] = useState(user?.city || ""),
    [postalCode, setPostalCode] = useState(user?.postalCode || ""),
    [postalTouched, setPostalTouched] = useState(false);
  const [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [receiptBusy, setReceiptBusy] = useState(false),
    [receiptUrl, setReceiptUrl] = useState(""),
    [receiptName, setReceiptName] = useState(""),
    [successOrder, setSuccessOrder] = useState<Order | null>(null),
    [summaryOpen, setSummaryOpen] = useState(false),
    [discountInput, setDiscountInput] = useState(""),
    [discount, setDiscount] = useState<{
      code: string;
      amount: number;
      message: string;
    } | null>(null),
    [discountBusy, setDiscountBusy] = useState(false),
    [discountMessage, setDiscountMessage] = useState("");
  useEffect(() => {
    if (!availablePayments.includes(payment) && availablePayments[0]) setPayment(availablePayments[0]);
  }, [availablePayments, payment]);
  const discountItems = useMemo(
      () =>
        cart.items.map(({ productId, variantId, quantity }) => ({
          productId,
          variantId,
          quantity,
        })),
      [cart.items],
    ),
    discountCode = discount?.code;
  useEffect(() => {
    if (!discountCode) return;
    let current = true;
    void api
      .validateDiscount({ code: discountCode, items: discountItems })
      .then((result) => {
        if (!current) return;
        if (result.valid && result.code && result.discountAmount !== undefined) {
          setDiscount({
            code: result.code,
            amount: result.discountAmount,
            message: result.message,
          });
          setDiscountMessage(result.message);
        } else {
          setDiscount(null);
          setDiscountMessage(result.message);
        }
      })
      .catch(() => {
        if (current) {
          setDiscount(null);
          setDiscountMessage("This discount code is not available.");
        }
      });
    return () => {
      current = false;
    };
  }, [discountCode, discountItems]);
  if ((!cart.items.length && !successOrder) || cart.items.some((i) => i.isPreorder)) return <Navigate to="/cart" replace />;
  if (checkout.loading)
    return (
      <main className="container min-h-[70vh] py-20">
        <div className="home-skeleton">
          <div />
          <div />
          <div />
          <div />
        </div>
      </main>
    );
  if (checkout.error)
    return (
      <main className="container grid min-h-[70vh] place-content-center py-20 text-center">
        <h1 className="text-4xl font-semibold">Checkout is temporarily unavailable.</h1>
        <p className="mt-3 text-sm text-ink/55">Your bag is safe. Please try again.</p>
        <button className="btn mx-auto mt-6" onClick={() => void checkout.retry()}>
          Retry
        </button>
      </main>
    );
  const stockFor = (_pid: string, vid: string) => cart.live[vid]?.stock ?? 0;
  const price = (i: (typeof cart.items)[number]) => cart.live[i.variantId]?.currentPrice ?? i.unitPrice;
  const subtotal = cart.items.reduce((sum, i) => sum + price(i) * i.quantity, 0),
    postalFormatError = postalCodeError(postalCode),
    addressReady = Boolean(district && city.trim().length >= 2 && !postalFormatError);
  const courier = checkoutCourier(checkout.data?.couriers || [], settings.defaultCourierProviderId),
    allRates = checkout.data?.deliveryRates || [];
  const quote = addressReady ? deliveryQuote(courier,allRates,{district,city,postalCode}) : undefined,
    deliveryReady = !settings.deliveryEnabled || Boolean(quote);
  const deliveryFee = settings.freeDeliveryThreshold > 0 && subtotal >= settings.freeDeliveryThreshold ? 0 : settings.deliveryEnabled ? (quote?.fee ?? 0) : 0,
    amounts = checkoutAmounts(subtotal, deliveryFee, !settings.deliveryEnabled || (addressReady && deliveryReady), discount?.amount || 0);
  const paymentStatus = paymentReadinessMessage({
            city,
            district,
            postalError: postalFormatError,
            deliveryEnabled: settings.deliveryEnabled,
            quoteReady: Boolean(quote),
          });
  const clearError = (name: string) =>
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  const focusFirst = (errors: Record<string, string>) =>
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
    });
  async function uploadReceipt(file?: File) {
    if (!file) return;
    setReceiptBusy(true);
    setError("");
    try {
      setReceiptUrl(await uploadPaymentReceipt(file));
      setReceiptName(file.name);
    } catch (reason) {
      setReceiptUrl("");
      setReceiptName("");
      setError(reason instanceof Error ? reason.message : "Could not upload the payment receipt.");
    } finally {
      setReceiptBusy(false);
    }
  }
  async function applyDiscount(code = discountInput) {
    setDiscountBusy(true);
    setDiscountMessage("");
    try {
      const result = await api.validateDiscount({ code, items: discountItems });
      if (result.valid && result.code && result.discountAmount !== undefined) {
        setDiscount({
          code: result.code,
          amount: result.discountAmount,
          message: result.message,
        });
        setDiscountInput(result.code);
        setDiscountMessage(result.message);
      } else {
        setDiscount(null);
        setDiscountMessage(result.message);
      }
    } catch (reason) {
      setDiscount(null);
      setDiscountMessage(reason instanceof Error ? reason.message : "This discount code is not available.");
    } finally {
      setDiscountBusy(false);
    }
  }
  function removeDiscount() {
    setDiscount(null);
    setDiscountInput("");
    setDiscountMessage("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    if (!settings.storeOpen || !settings.ordersEnabled) {
      setError("Online ordering is temporarily unavailable. Please contact us for assistance.");
      return;
    }
    if (!availablePayments.length) {
      setError("No payment method is currently available.");
      return;
    }
    if (payment === "bank" && !receiptUrl) {
      const e = {
        paymentReceiptUrl: "Upload your bank transfer receipt before placing the order.",
      };
      setFieldErrors(e);
      setError("Please check the highlighted payment detail.");
      focusFirst(e);
      return;
    }
    for (const item of cart.items)
      if (stockFor(item.productId, item.variantId) < item.quantity) {
        setError(`${item.name} is no longer available in that quantity. Please update your cart.`);
        return;
      }
    const raw = Object.fromEntries(new FormData(event.currentTarget)),
      parsed = schema.safeParse({
        ...raw,
        paymentMethod: payment,
        paymentReceiptUrl: payment === "bank" ? receiptUrl : undefined,
        paymentReference: payment === "bank" ? String(raw.paymentReference || "") : undefined,
      });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] || "form");
        if (!e[key]) e[key] = issue.message;
      }
      setFieldErrors(e);
      setError("Please fix the highlighted fields before placing your order.");
      focusFirst(e);
      return;
    }
    if (settings.deliveryEnabled && !quote) {
      const e = {
        city: "Delivery is unavailable for these details.",
      };
      setFieldErrors(e);
      setError("We could not calculate delivery from these details.");
      focusFirst(e);
      return;
    }
    setBusy(true);
    try {
      const order = await api.createOrder({
        ...parsed.data,
        postalCode: parsed.data.postalCode || "",
        discountCode: discount?.code,
        items: cart.items,
      });
      sessionStorage.setItem(`order:${order.orderId}`, JSON.stringify(order));
      rememberGuestOrder({
        orderId: order.orderId,
        createdAt: order.createdAt,
      });
      cart.clear();
      setSuccessOrder(order);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not submit your order. Your cart and details are still here—please try again.");
    } finally {
      setBusy(false);
    }
  }
  const stockReady = cart.items.every((item) => stockFor(item.productId, item.variantId) >= item.quantity),
    placeDisabled = Boolean(successOrder) || busy || receiptBusy || !amounts.ready || !stockReady || (payment === "bank" && !receiptUrl) || !availablePayments.length || !settings.storeOpen || !settings.ordersEnabled;
  return (
    <>
      <main aria-hidden={Boolean(successOrder)} className="checkout-page min-w-0 bg-paper">
        <Seo title="Checkout" />
        <div className="mx-auto max-w-[1440px]">
          <form ref={formRef} onSubmit={submit} noValidate className="grid min-w-0 lg:grid-cols-[58%_42%]">
            <aside className="min-w-0 border-b border-black/10 bg-[#f1ede7] p-4 sm:p-7 lg:col-start-2 lg:row-start-1 lg:border-b-0 lg:border-l lg:p-10">
              <div className="lg:sticky lg:top-6">
                <button type="button" className="flex min-h-12 w-full items-center justify-between gap-4 text-left lg:hidden" aria-expanded={summaryOpen} aria-controls="checkout-order-summary" onClick={() => setSummaryOpen((open) => !open)}>
                  <span className="flex items-center gap-3">
                    <ShoppingBag className="lg:hidden" size={19} />
                    <span className="display text-2xl sm:text-3xl">Order summary</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {!summaryOpen && amounts.total !== undefined ? <b className="text-sm lg:hidden">{money(amounts.total)}</b> : null}
                    <ChevronDown size={19} className={`transition-transform lg:hidden ${summaryOpen ? "rotate-180" : ""}`} />
                  </span>
                </button>
                <h1 className="display hidden text-3xl lg:block">Order summary</h1>
                <div id="checkout-order-summary" className={`${summaryOpen ? "block" : "hidden"} lg:block`}>
                  <div className="mt-4 divide-y divide-black/10 lg:mt-6">
                    {cart.items.map((item) => {
                      const unitPrice = price(item);
                      return (
                        <div key={item.variantId} className="grid grid-cols-[68px_minmax(0,1fr)_auto] gap-3 py-4">
                          <div className="relative h-[82px] overflow-visible rounded-sm border border-black/10 bg-[#e8e2da]">
                            <img src={item.image} alt="" className="h-full w-full object-contain" />
                            <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-black px-1 text-[10px] text-white">{item.quantity}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium">{item.name}</p>
                            <p className="mt-1 text-xs text-ink/50">
                              {item.color} / {item.size}
                            </p>
                          </div>
                          <b className="text-right text-sm">{money(unitPrice * item.quantity)}</b>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-5 border-y border-black/10 py-5">
                    <p className="eyebrow mb-3 text-ink/50">Discount code</p>
                    {discount ? (
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          <b className="text-sm">✓ {discount.code}</b>
                          <small className="mt-1 block text-xs text-emerald-800">{discount.message}</small>
                        </span>
                        <button type="button" className="text-xs underline" onClick={removeDiscount}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 min-[390px]:flex-row">
                        <input className="field min-w-0 flex-1 uppercase" placeholder="Discount code" value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} maxLength={40} />
                        <button type="button" className="btn min-h-12 justify-center" disabled={discountBusy || !discountInput.trim()} onClick={() => void applyDiscount()}>
                          {discountBusy ? "APPLYING…" : "APPLY"}
                        </button>
                      </div>
                    )}
                    {discountMessage && !discount ? (
                      <p className="mt-2 text-xs text-red-800" role="status">
                        {discountMessage}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-5 space-y-3 text-sm">
                    <SummaryLine label="Subtotal" value={money(amounts.subtotal)} />
                    {discount ? <SummaryLine label={`Discount (${discount.code})`} value={`-${money(amounts.discountAmount)}`} /> : null}
                    <SummaryLine label="Shipping" value={!amounts.ready ? "Enter delivery details" : amounts.deliveryFee ? money(amounts.deliveryFee) : "Free"} />
                    <div className="border-t border-black/15 pt-4 text-lg">
                      <SummaryLine label="Total" value={amounts.total === undefined ? "—" : money(amounts.total)} />
                    </div>
                  </div>
                </div>
              </div>
            </aside>
            <div className="min-w-0 space-y-5 p-4 sm:p-8 lg:col-start-1 lg:row-start-1 lg:p-12 xl:px-16">
              <div>
                <p className="eyebrow text-bronze">Complete your order</p>
                <h2 className="display mt-2 text-4xl sm:text-5xl">Checkout</h2>
                <p className="mt-2 text-xs leading-5 text-ink/55">{user ? `Signed in as ${user.email}. This order will appear in My Orders.` : "Checking out as a guest. Your details are used only to fulfil this order."}</p>
              </div>
              <Section number="01" title="Contact information">
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <Field name="customerName" label="Full name" required autoComplete="name" defaultValue={savedName} error={fieldErrors.customerName} onChange={() => clearError("customerName")} />
                  <Field name="phone" label="Phone" required type="tel" autoComplete="tel" placeholder="0771234567" defaultValue={user?.mobile || ""} error={fieldErrors.phone} onChange={() => clearError("phone")} />
                  <Field name="email" label="Email (optional)" type="email" wide autoComplete="email" defaultValue={user?.email || ""} error={fieldErrors.email} onChange={() => clearError("email")} />
                </div>
              </Section>
              <Section number="02" title="Delivery address">
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <label className="label sm:col-span-2">
                    Country / Region
                    <input className="field mt-1.5 bg-black/[.03]" value="Sri Lanka" readOnly />
                  </label>
                  <Field name="address1" label="Address" required wide autoComplete="address-line1" defaultValue={user?.address1 || ""} error={fieldErrors.address1} onChange={() => clearError("address1")} />
                  <Field
                    name="city"
                    label="City / Area"
                    required
                    autoComplete="address-level2"
                    defaultValue={user?.city || ""}
                    error={fieldErrors.city}
                    onChange={(value) => {
                      setCity(value);
                      clearError("city");
                    }}
                  />
                  <label className="label">
                    District <i>*</i>
                    <select
                      name="district"
                      required
                      aria-invalid={Boolean(fieldErrors.district)}
                      aria-describedby={fieldErrors.district ? "district-error" : undefined}
                      className={`field mt-1.5 ${fieldErrors.district ? "border-red-700" : ""}`}
                      value={district}
                      onChange={(event) => {
                        setDistrict(event.target.value);
                        clearError("district");
                      }}
                    >
                      <option value="" disabled>
                        Select district
                      </option>
                      {districts.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                    <InlineError id="district-error" message={fieldErrors.district} />
                  </label>
                  <Field
                    name="postalCode"
                    label="Postal code"
                    autoComplete="postal-code"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10250"
                    value={postalCode}
                    error={(postalTouched ? postalFormatError : "") || fieldErrors.postalCode}
                    onBlur={() => setPostalTouched(true)}
                    onChange={(value) => {
                      setPostalCode(value);
                      clearError("postalCode");
                    }}
                  />
                </div>
                <div className="mt-6">
                  <p className="eyebrow mb-3 text-ink/50">Delivery</p>
                  <div className={`border p-4 ${amounts.ready ? "border-black bg-black/[.025]" : "border-black/10"}`}>
                    <div className="flex items-center justify-between gap-4">
                      <span>
                        <b className="block text-sm">{quote?.zone?.name || orderDeliveryLabel(courier?.pricingMode)}</b>
                        <small className="mt-1 block text-xs text-ink/50">{amounts.ready ? "Calculated using the store's configured courier rate." : "Enter your delivery details to calculate the rate."}</small>
                      </span>
                      {amounts.ready ? <b className="text-sm">{amounts.deliveryFee ? money(amounts.deliveryFee) : "Free"}</b> : null}
                    </div>
                  </div>
                </div>
              </Section>
              <Section number="03" title="Optional information">
                <details className="group border border-black/10 bg-white/20">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    Add apartment details or delivery instructions
                    <ChevronDown size={17} className="shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="grid gap-4 border-t border-black/10 p-4">
                    <Field name="address2" label="Apartment, suite, etc." autoComplete="address-line2" defaultValue={user?.address2 || ""} />
                    <label className="label text-sm font-medium">
                      Delivery instructions
                      <textarea name="deliveryNotes" rows={3} maxLength={300} className={`field mt-1.5 min-h-24 resize-y py-3 normal-case tracking-normal ${fieldErrors.deliveryNotes ? "border-red-700" : ""}`} aria-invalid={Boolean(fieldErrors.deliveryNotes)} aria-describedby={fieldErrors.deliveryNotes ? "deliveryNotes-error" : undefined} onChange={() => clearError("deliveryNotes")} placeholder="Landmark, gate code, or other helpful notes" />
                      <InlineError id="deliveryNotes-error" message={fieldErrors.deliveryNotes} />
                    </label>
                  </div>
                </details>
              </Section>
              <Section number="04" title="Payment method">
                <div className="grid gap-3 sm:grid-cols-2">
                  {availablePayments.map((value) => {
                    const selected = payment === value;
                    return (
                      <motion.label whileTap={{ scale: 0.99 }} key={value} className={`relative flex min-h-20 cursor-pointer items-center gap-3 border p-3 ${selected ? "border-bronze bg-bronze/[.06]" : "border-line bg-white/20"}`}>
                        <input className="sr-only" type="radio" name="pay" checked={selected} onChange={() => setPayment(value)} />
                        {value === "cod" ? <Banknote size={20} /> : <WalletCards size={20} />}
                        <span className="min-w-0 flex-1">
                          <b className="block text-xs uppercase tracking-[.1em]">{value === "cod" ? "Cash on Delivery" : "Bank Transfer"}</b>
                          <small className="mt-0.5 block text-[10px] normal-case text-ink/50">{value === "cod" ? "Pay when your order arrives." : "Transfer before confirmation."}</small>
                        </span>
                        <span className={`grid h-5 w-5 place-items-center rounded-full border ${selected ? "border-bronze bg-bronze text-white" : "border-black/20"}`}>{selected && <Check size={12} />}</span>
                      </motion.label>
                    );
                  })}
                </div>
                {payment === "cod" ? (
                  <PaymentAmount label="Pay on delivery" amounts={amounts} status={paymentStatus} />
                ) : (
                  <AnimatePresence initial={false}>
                    {bankConfigured && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="mt-4 space-y-4 border border-line bg-white/35 p-4">
                          <div className="grid gap-x-4 gap-y-2 text-xs leading-5 sm:grid-cols-2">
                            <BankDetail label="Bank" value={settings.bankName} />
                            <BankDetail label="Account name" value={settings.accountName} />
                            <BankDetail label="Account number" value={settings.accountNumber} />
                            {settings.branch && <BankDetail label="Branch" value={settings.branch} />}
                          </div>
                          <BankTransferAmount amounts={amounts} status={paymentStatus} />
                          {settings.bankInstructions && <p className="text-xs text-ink/60">{settings.bankInstructions}</p>}
                          <Field name="paymentReference" label="Payment reference" wide />
                          <ReceiptUpload
                            ready={amounts.ready}
                            busy={receiptBusy}
                            url={receiptUrl}
                            name={receiptName}
                            error={fieldErrors.paymentReceiptUrl}
                            clearError={() => clearError("paymentReceiptUrl")}
                            upload={uploadReceipt}
                            remove={() => {
                              setReceiptUrl("");
                              setReceiptName("");
                            }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
                <FinalAction payment={payment} amounts={amounts} receiptReady={Boolean(receiptUrl)} error={error} disabled={placeDisabled} busy={busy} receiptBusy={receiptBusy} />
              </Section>
            </div>
          </form>
        </div>
      </main>
      {successOrder && <OrderSuccessModal order={successOrder} viewOrder={() => navigate(`/order/${successOrder.orderId}`)} continueShopping={() => navigate("/shop")} />}
    </>
  );
}
function orderDeliveryLabel(mode?: string) {
  return mode === "flat" ? "Sri Lanka" : "Selected delivery area";
}
function OrderSuccessModal({ order, viewOrder, continueShopping }: { order: Order; viewOrder: () => void; continueShopping: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null),
    viewRef = useRef<HTMLButtonElement>(null),
    shopRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  const trap = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const first = viewRef.current,
      last = shopRef.current;
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <motion.div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="presentation">
      <motion.div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="order-success-title" onKeyDown={trap} className="my-auto w-full max-w-lg border border-white/20 bg-paper p-6 text-center shadow-2xl outline-none sm:p-9" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-emerald-900/30 bg-emerald-950/[.05] text-emerald-900">
          <CheckCircle2 size={27} strokeWidth={1.7} />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-emerald-900">Order submitted successfully</p>
        <h2 id="order-success-title" className="mt-2 text-2xl font-semibold">
          Thank you! We received your order.
        </h2>
        <p className="mt-5 text-xs font-medium text-ink/50">Order ID</p>
        <strong className="mt-1 block text-lg font-semibold">#{order.orderId}</strong>
        <p className="mt-2 text-xs leading-5 text-ink/55">Keep your Order ID. You can track this order anytime using your Order ID and the mobile number used at checkout.</p>
        <div className="mt-5 border-y border-black/10 py-4">
          <p className="text-sm font-semibold">{order.paymentMethod === "cod" ? "Cash on Delivery" : "Payment verification pending"}</p>
          <p className="mt-2 text-xs leading-5 text-ink/60">{order.paymentMethod === "cod" ? `Pay ${money(order.total)} when your order arrives.` : "Your receipt was submitted successfully."}</p>
        </div>
        <div className="mt-5 grid gap-3">
          <button ref={viewRef} type="button" className="btn btn-dark w-full" onClick={viewOrder}>
            View Order
          </button>
          <button ref={shopRef} type="button" className="btn w-full" onClick={continueShopping}>
            Continue Shopping
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
function Section({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <motion.section {...enter} className="border-b border-black/10 py-6 sm:py-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-black text-[9px] font-medium text-white">{number}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}
function InlineError({ message, id }: { message?: string; id?: string }) {
  return message ? (
    <span id={id} className="mt-1.5 block text-[11px] normal-case leading-5 tracking-normal text-red-800">
      {message}
    </span>
  ) : null;
}
function PaymentAmount({ label, amounts, status }: { label: string; amounts: ReturnType<typeof checkoutAmounts>; status: string }) {
  return (
    <div className="mt-4 border border-bronze/35 bg-bronze/[.07] p-4">
      {amounts.total === undefined ? (
        <p className="text-xs font-medium">{status}</p>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-medium text-bronze">{label}</p>
          <strong className="text-xl font-semibold">{money(amounts.total)}</strong>
        </div>
      )}
    </div>
  );
}
function BankTransferAmount({ amounts, status }: { amounts: ReturnType<typeof checkoutAmounts>; status: string }) {
  return (
    <div className="border border-bronze/35 bg-bronze/[.07] p-4">
      {amounts.total === undefined ? (
        <p className="text-xs font-medium leading-5">{status}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold text-bronze">Amount to transfer</p>
            <strong className="text-xl font-semibold">{money(amounts.total)}</strong>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-black/10 pt-3 text-xs">
            <SummaryLine label="Subtotal" value={money(amounts.subtotal)} />
            <SummaryLine label="Delivery" value={amounts.deliveryFee ? money(amounts.deliveryFee) : "Free"} />
          </div>
        </>
      )}
    </div>
  );
}
function ReceiptUpload({ ready, busy, url, name, error, clearError, upload, remove }: { ready: boolean; busy: boolean; url: string; name: string; error?: string; clearError: () => void; upload: (file?: File) => Promise<void>; remove: () => void }) {
  const accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf",
    change = (file?: File) => {
      clearError();
      void upload(file);
    };
  return (
    <div>
      <p className="mb-1.5 label">
        Receipt upload <i>*</i>
      </p>
      <InlineError message={error} />
      {busy ? (
        <div className="flex min-h-20 items-center justify-center border border-dashed border-black/25 text-sm">Uploading receipt…</div>
      ) : url ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-emerald-900/20 bg-emerald-950/[.05] p-3">
          <span className="flex min-w-0 items-center gap-2 text-emerald-900">
            <CheckCircle2 size={16} />
            <span className="min-w-0">
              <b className="block text-xs">Receipt uploaded</b>
              <small className="block max-w-64 truncate text-emerald-800">{name}</small>
            </span>
          </span>
          <span className="flex items-center gap-1">
            <label className={`btn min-h-10 px-3 ${ready ? "cursor-pointer" : "pointer-events-none opacity-40"}`}>
              Replace
              <input
                className="sr-only"
                type="file"
                accept={accept}
                disabled={!ready}
                onChange={(event) => {
                  change(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button type="button" className="btn min-h-10 px-3" onClick={remove}>
              <X size={13} /> Remove
            </button>
          </span>
        </div>
      ) : (
        <label tabIndex={ready ? 0 : -1} className={`flex min-h-20 items-center justify-center gap-3 border border-dashed border-black/25 px-4 text-center ${ready ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}>
          <Upload size={18} />
          <span className="text-left">
            <b className="block text-xs">Upload bank receipt</b>
            <small className="block text-[10px] text-ink/45">{ready ? "Image or PDF" : "Add delivery details first."}</small>
          </span>
          <input
            name="paymentReceiptUrl"
            className="sr-only"
            type="file"
            accept={accept}
            disabled={!ready}
            onChange={(event) => {
              change(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
function FinalAction({ payment, amounts, receiptReady, error, disabled, busy, receiptBusy }: { payment: PaymentMethod; amounts: ReturnType<typeof checkoutAmounts>; receiptReady: boolean; error: string; disabled: boolean; busy: boolean; receiptBusy: boolean }) {
  return (
    <div className="mt-5 border-t border-black/15 pt-4">
      <div className="flex items-end justify-between gap-4">
        <span>
          <p className="text-sm font-semibold text-bronze">Total</p>
          <small className="mt-1 block text-xs text-ink/50">{payment === "cod" ? "Pay on delivery" : "Transfer total"}</small>
        </span>
        <strong className="text-2xl font-semibold">{amounts.total === undefined ? "—" : money(amounts.total)}</strong>
      </div>
      {payment === "bank" && <p className={`mt-2 text-xs ${receiptReady ? "text-emerald-800" : "text-ink/50"}`}>{receiptReady ? "Receipt attached securely for verification." : "Receipt required before placing your order."}</p>}
      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="alert" className="mt-3 border-l-2 border-red-800 bg-red-950/[.06] p-3 text-xs leading-5 text-red-900">
          {error}
        </motion.p>
      )}
      <button disabled={disabled} className="btn btn-dark mt-4 min-h-14 w-full">
        {busy ? "PLACING ORDER…" : receiptBusy ? "UPLOADING RECEIPT…" : "PLACE ORDER"}
      </button>
      <p className="mt-2 text-center text-xs leading-4 text-ink/50">By placing your order, you agree to our store terms. Orders are subject to confirmation.</p>
    </div>
  );
}
function BankDetail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-ink/45">{label}</span>
      <br />
      <b>{value}</b>
    </p>
  );
}
function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-ink/60">{label}</span>
      <span className="max-w-[190px] text-right font-medium leading-5">{value}</span>
    </div>
  );
}
function Field({ name, label, required, type = "text", autoComplete, wide, defaultValue, value, inputMode, maxLength, onChange, onBlur, error, placeholder }: { name: string; label: string; required?: boolean; type?: string; autoComplete?: string; wide?: boolean; defaultValue?: string; value?: string; inputMode?: "text" | "numeric" | "tel"; maxLength?: number; onChange?: (value: string) => void; onBlur?: () => void; error?: string; placeholder?: string }) {
  const errorId = `${name}-error`;
  return (
    <label className={`${wide ? "sm:col-span-2 " : ""}label text-sm font-medium`}>
      {label} {required && <i>*</i>}
      <input name={name} required={required} type={type} inputMode={inputMode || (type === "tel" ? "tel" : undefined)} maxLength={maxLength} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={`field mt-1.5 normal-case tracking-normal ${error ? "border-red-700" : ""}`} autoComplete={autoComplete} defaultValue={value === undefined ? defaultValue : undefined} value={value} placeholder={placeholder} onBlur={onBlur} onChange={(e) => onChange?.(e.target.value)} />
      <InlineError id={errorId} message={error} />
    </label>
  );
}
