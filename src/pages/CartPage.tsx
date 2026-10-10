import { Link } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import { useCart } from "../features/cart/CartContext";
import { money } from "../config/site";
import { Seo } from "../components/Seo";

export default function CartPage() {
  const c = useCart(),
    live = c.live;
  const currentPrice = (item: (typeof c.items)[number]) =>
    live[item.variantId]?.currentPrice ?? item.unitPrice;
  const currentStock = (item: (typeof c.items)[number]) =>
    live[item.variantId]?.stock ?? 0;
  const valid = (item: (typeof c.items)[number]) => {
    if (item.isPreorder) return false;
    const variant = live[item.variantId];
    return Boolean(
      variant?.active &&
        variant.published &&
        variant.stock >= item.quantity,
    );
  };
  const displaySubtotal = c.items.reduce(
      (sum, item) => sum + currentPrice(item) * item.quantity,
      0,
    ),
    canCheckout = c.items.length > 0 && c.items.every(valid);
  return (
    <div className="container min-h-[70vh] pb-24 pt-36 lg:pt-44">
      <Seo title="Your Bag" noindex />
      <p className="eyebrow text-ink/50">Your selection</p>
      {c.hydrationError && (
        <div className="mt-6 flex min-w-0 flex-col items-start gap-3 border border-red-900/20 bg-red-950/[.04] p-4 text-xs text-red-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="min-w-0 break-words">{c.hydrationError}</span>
          <button
            className="min-h-11 shrink-0 underline"
            onClick={c.retryHydration}
          >
            Retry
          </button>
        </div>
      )}
      <h1 className="display mt-3 text-5xl md:text-7xl">Bag · {c.count}</h1>
      {!c.items.length ? (
        <div className="mt-20 border-y hairline py-24 text-center">
          <p className="display text-4xl">Nothing held, yet.</p>
          <Link to="/shop" className="btn mt-7">
            Explore the collection
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid min-w-0 gap-12 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            {c.items.map((i) => {
              const available = valid(i),
                stock = currentStock(i);
              return (
                <div
                  key={i.variantId}
                  className="flex min-w-0 gap-4 border-t hairline py-6 sm:gap-7"
                >
                  {i.image ? (
                    <img
                      src={i.image}
                      alt={i.name}
                      className="h-36 w-24 shrink-0 object-cover sm:h-48 sm:w-36"
                    />
                  ) : (
                    <div className="h-36 w-24 shrink-0 bg-[#e7e1d7] sm:h-48 sm:w-36" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words text-sm sm:text-base">
                          {i.name}
                        </h2>
                        <p className="mt-2 break-words text-xs text-ink/55">
                          {i.color} / {i.size}
                        </p>
                        {i.isPreorder && (
                          <p className="mt-2 break-words text-xs text-red-800">
                            Pre-orders now use a separate request flow and
                            cannot be checked out from the bag.
                          </p>
                        )}
                        {!c.hydrationLoading && !available && !i.isPreorder && (
                          <p className="mt-2 break-words text-xs text-red-800">
                            This option is no longer available. Please remove it
                            or choose another option.
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 whitespace-nowrap text-right text-sm tabular-nums">
                        {money(currentPrice(i) * i.quantity)}
                      </p>
                    </div>
                    <div className="mt-auto flex min-w-0 items-center gap-1 sm:gap-2">
                      <button
                        type="button"
                        className="grid h-11 w-11 shrink-0 place-items-center disabled:opacity-30"
                        aria-label={"Decrease " + i.name}
                        onClick={() =>
                          c.quantity(i.variantId, i.quantity - 1, stock)
                        }
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-8 shrink-0 text-center text-sm tabular-nums">
                        {i.quantity}
                      </span>
                      <button
                        type="button"
                        className="grid h-11 w-11 shrink-0 place-items-center disabled:opacity-30"
                        aria-label={"Increase " + i.name}
                        disabled={!available || i.quantity >= stock}
                        onClick={() =>
                          c.quantity(i.variantId, i.quantity + 1, stock)
                        }
                      >
                        <Plus size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => c.remove(i.variantId)}
                        className="ml-auto min-h-11 min-w-0 px-1 text-xs underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <aside className="h-fit min-w-0 border border-line p-6 lg:sticky lg:top-32">
            <p className="eyebrow">Summary</p>
            <div className="mt-7 space-y-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <span>Subtotal</span>
                <span className="shrink-0 text-right tabular-nums">
                  {money(displaySubtotal)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 text-ink/55">
                <span>Delivery</span>
                <span className="min-w-0 text-right">Calculated at checkout</span>
              </div>
            </div>
            <div className="my-6 border-t hairline" />
            <p className="text-xs leading-5 text-ink/55">
              Taxes, if applicable, are included. Your order is awaiting
              confirmation until reviewed by ZEVENRA.
            </p>
            {canCheckout ? (
              <Link to="/checkout" className="btn btn-dark mt-6 w-full">
                Checkout
              </Link>
            ) : (
              <>
                <p className="mt-5 text-xs leading-5 text-red-800">
                  Update or remove unavailable items before checkout.
                </p>
                <button
                  disabled
                  className="btn btn-dark mt-3 w-full opacity-40"
                >
                  Checkout
                </button>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
