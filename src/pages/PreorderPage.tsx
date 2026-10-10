import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Minus, Plus } from "lucide-react";
import { Link, Navigate, useSearchParams, useParams } from "react-router-dom";
import { z } from "zod";
import { Seo } from "../components/Seo";
import { money } from "../config/site";
import { useCustomerAuth } from "../features/account/CustomerAuthContext";
import { api } from "../services/api";
import { useProduct } from "../hooks/usePublicData";

const requestSchema = z.object({
  customerName: z.string().trim().min(2, "Enter your full name.").max(100),
  whatsapp: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{8,14}$/, "Enter a valid WhatsApp number."),
  city: z.string().trim().min(2, "Enter your city or area.").max(80),
  email: z
    .string()
    .trim()
    .email("Enter a valid email or leave it blank.")
    .or(z.literal(""))
    .optional(),
});

export default function PreorderPage() {
  const { slug } = useParams(),
    [search] = useSearchParams(),
    request = useProduct(slug || ""),
    { user } = useCustomerAuth(),
    product = request.data?.product,
    variant = product?.variants.find(
      (v) => v.id === search.get("variant") && v.active,
    ),
    [qty, setQty] = useState(() => {
      const requested = Number(search.get("quantity"));
      return Number.isInteger(requested) ? Math.min(5, Math.max(1, requested)) : 1;
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  const defaultName = useMemo(
    () => [user?.firstName, user?.lastName].filter(Boolean).join(" "),
    [user],
  );
  if (request.loading)
    return (
      <main className="container min-h-[70vh] py-36">
        <div className="home-skeleton">
          <div />
          <div />
        </div>
      </main>
    );
  if (!product || !variant || !product.preorderEnabled || variant.stock > 0)
    return <Navigate to={product ? "/product/" + product.slug : "/shop"} replace />;
  const preorderProduct = product,
    preorderVariant = variant;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const raw = Object.fromEntries(new FormData(event.currentTarget)),
      parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Please check your details.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.createPreorder({
        ...parsed.data,
        phone: parsed.data.whatsapp,
        productId: preorderProduct.id,
        variantId: preorderVariant.id,
        quantity: qty,
      });
      setDone(created.requestId);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not submit pre-order request.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <main className="container grid min-h-[75vh] place-content-center px-4 py-28 text-center">
        <Seo title="Pre-order requested" noindex />
        <CheckCircle2 className="mx-auto" size={34} />
        <p className="eyebrow mt-5 text-bronze">Request received</p>
        <h1 className="display mt-3 break-words text-4xl sm:text-5xl">
          We’ll confirm with you first.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-ink/60">
          No payment has been taken. We will contact you on WhatsApp with the
          final price before your piece is added to a supplier batch.
        </p>
        <p className="mt-4 break-all text-xs text-ink/45">Reference: {done}</p>
        <div className="mx-auto mt-8 flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          {user && (
            <Link className="btn btn-dark justify-center" to="/account/orders">
              View my requests
            </Link>
          )}
          <Link className="btn justify-center" to="/shop">
            Continue shopping
          </Link>
        </div>
      </main>
    );
  return (
    <main className="container min-w-0 pb-20 pt-28 lg:pt-36">
      <Seo title={"Pre-order " + product.name} noindex />
      <Link
        to={"/product/" + product.slug}
        className="inline-flex min-h-11 items-center gap-2 text-xs underline"
      >
        <ArrowLeft size={14} /> Back to product
      </Link>
      <div className="mt-7 grid min-w-0 gap-8 lg:grid-cols-[.85fr_1.15fr]">
        <section className="preorder-request-summary min-w-0">
          <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
            {product.media.find((m) => m.type === "image") ? (
              <img
                src={product.media.find((m) => m.type === "image")!.url}
                alt={product.name}
                className="aspect-[4/5] w-full object-cover"
              />
            ) : (
              <div className="aspect-[4/5] bg-black/5" />
            )}
            <div className="min-w-0">
              <p className="eyebrow text-bronze">Pre-order request</p>
              <h1 className="display mt-3 break-words text-3xl sm:text-4xl">
                {product.name}
              </h1>
              <p className="mt-3 break-words text-sm text-ink/55">
                {variant.color} / {variant.size}
              </p>
              <p className="mt-2 break-words text-sm">
                {money(product.price)}{" "}
                <span className="text-xs text-ink/45">current display price</span>
              </p>
            </div>
          </div>
          <div className="preorder-request-steps">
            <div>
              <b>1</b>
              <span>
                <strong>Send request</strong>
                <small>No payment now.</small>
              </span>
            </div>
            <div>
              <b>2</b>
              <span>
                <strong>WhatsApp confirmation</strong>
                <small>We confirm the item and final price with you.</small>
              </span>
            </div>
            <div>
              <b>3</b>
              <span>
                <strong>Supplier batch</strong>
                <small>Confirmed pieces are grouped before we order.</small>
              </span>
            </div>
            <div>
              <b>4</b>
              <span>
                <strong>Delivery details</strong>
                <small>
                  Full address is collected before the normal order is created.
                </small>
              </span>
            </div>
          </div>
          <p className="preorder-request-note break-words">
            {product.preorderMessage ||
              "Supplier delivery is usually around two weeks after the supplier order is placed, but timing can vary."}
          </p>
        </section>
        <form onSubmit={submit} className="preorder-request-form min-w-0">
          <div className="min-w-0">
            <p className="eyebrow">Quick request</p>
            <h2 className="display mt-2 break-words text-4xl">Request this piece.</h2>
            <p className="mt-3 break-words text-xs leading-6 text-ink/55">
              Keep it simple: we only need your contact and area now. We will
              collect the full delivery address later, before creating the final
              order.
            </p>
          </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Field
              name="customerName"
              label="Full name *"
              required
              minLength={2}
              defaultValue={defaultName}
            />
            <Field
              name="whatsapp"
              label="WhatsApp number *"
              required
              type="tel"
              defaultValue={user?.mobile || ""}
            />
            <Field
              name="city"
              label="City / area *"
              required
              minLength={2}
              defaultValue={user?.city || ""}
            />
            <Field
              name="email"
              label="Email (optional)"
              type="email"
              defaultValue={user?.email || ""}
            />
          </div>
          <div>
            <p className="mb-2 text-xs">Quantity</p>
            <div className="flex min-h-12 w-fit items-center border border-line">
              <button
                type="button"
                className="grid h-11 w-11 place-items-center"
                onClick={() => setQty(Math.max(1, qty - 1))}
                aria-label="Reduce quantity"
              >
                <Minus size={15} />
              </button>
              <span className="w-10 text-center text-sm tabular-nums">{qty}</span>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center disabled:opacity-30"
                disabled={qty >= 5}
                onClick={() => setQty(Math.min(5, qty + 1))}
                aria-label="Increase quantity"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div className="break-words border border-bronze/25 bg-bronze/5 p-4 text-xs leading-6 text-ink/65">
            <b>No payment now.</b> The displayed price is not a final supplier
            commitment. ZEVENRA will confirm the item and final price with you
            on WhatsApp before spending money on the supplier order.
          </div>
          {error && (
            <p role="alert" className="break-words bg-red-950 p-3 text-xs leading-5 text-white">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn btn-dark w-full disabled:opacity-50">
            {busy ? "Sending request…" : "Send pre-order request"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  name,
  label,
  required,
  type = "text",
  defaultValue,
  minLength,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  minLength?: number;
}) {
  return (
    <label className="min-w-0 text-xs">
      {label}
      <input
        name={name}
        required={required}
        type={type}
        minLength={minLength}
        inputMode={type === "tel" ? "tel" : undefined}
        className="field mt-2 min-w-0"
        defaultValue={defaultValue}
      />
    </label>
  );
}
