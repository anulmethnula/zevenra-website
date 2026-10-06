import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCart } from "../features/cart/CartContext";
import { money } from "../config/site";

export function CartDrawer() {
  const c = useCart(),
    recommendationsRef = useRef<HTMLDivElement>(null);
  const currentPrice = (item: (typeof c.items)[number]) =>
    c.live[item.variantId]?.currentPrice ?? item.unitPrice;
  const currentStock = (item: (typeof c.items)[number]) =>
    c.live[item.variantId]?.stock ?? 0;
  const valid = (item: (typeof c.items)[number]) => {
    if (item.isPreorder) return false;
    const variant=c.live[item.variantId];
    return Boolean(variant?.active&&variant.published&&variant.stock>=item.quantity);
  };
  const subtotal = c.items.reduce(
      (sum, item) => sum + currentPrice(item) * item.quantity,
      0,
    ),
    canCheckout = c.items.length > 0 && c.items.every(valid);
  const recommendations = c.recommendations;
  const moveRecommendations = (direction: -1 | 1) =>
    recommendationsRef.current?.scrollBy({
      left: direction * (recommendationsRef.current.clientWidth * 0.72),
      behavior: "smooth",
    });

  return (
    <AnimatePresence>
      {c.open && (
        <>
          <motion.button
            aria-label="Close cart"
            className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-[1px]"
            onClick={() => c.setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            className="fixed inset-y-0 right-0 z-[100] flex w-full flex-col overflow-hidden bg-[#fbfaf7] shadow-[-24px_0_70px_rgba(0,0,0,.16)] sm:w-[520px]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              type: "tween",
              duration: 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-black/10 px-5 sm:px-7">
              <div className="flex items-center gap-3">
                <h2 className="text-[22px] font-medium tracking-[-.02em]">
                  CART
                </h2>
                {c.count > 0 && (
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-black px-1.5 text-[10px] text-white">
                    {c.count}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center transition hover:bg-black hover:text-white"
                onClick={() => c.setOpen(false)}
                aria-label="Close cart"
              >
                <X size={21} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {c.hydrationError&&<div className="mx-5 mt-4 flex items-center justify-between gap-3 border border-red-900/20 bg-red-950/[.04] p-3 text-[10px] text-red-900 sm:mx-7"><span>{c.hydrationError}</span><button className="underline" onClick={c.retryHydration}>Retry</button></div>}
              {c.items.length === 0 ? (
                <div className="grid min-h-[58vh] place-content-center px-8 text-center">
                  <ShoppingBag className="mx-auto text-black/35" size={30} />
                  <p className="display mt-5 text-4xl">Your cart is waiting.</p>
                  <p className="mx-auto mt-3 max-w-xs text-xs leading-6 text-black/50">
                    Explore the collection and add a piece to continue.
                  </p>
                  <Link
                    to="/shop"
                    onClick={() => c.setOpen(false)}
                    className="btn btn-dark mx-auto mt-7"
                  >
                    Explore shop
                  </Link>
                </div>
              ) : (
                <>
                  <div className="px-5 sm:px-7">
                    {c.items.map((i) => {
                      const available = valid(i),
                        stock = currentStock(i);
                      return (
                        <article
                          key={i.variantId}
                          className="grid grid-cols-[82px_minmax(0,1fr)_auto] grid-rows-[auto_1fr_auto] gap-x-4 border-b border-black/10 py-5"
                        >
                          <Link
                            to={"/product/" + i.slug}
                            onClick={() => c.setOpen(false)}
                            className="row-span-3 grid h-[106px] place-items-center overflow-hidden bg-[#eeeae3]"
                          >
                            {i.image ? (
                              <img
                                src={i.image}
                                alt={i.name}
                                className="h-full w-full object-contain transition duration-500 hover:scale-[1.025]"
                              />
                            ) : (
                              <div className="h-full w-full bg-black/5" />
                            )}
                          </Link>
                          <div className="min-w-0 self-start">
                            <Link
                              to={"/product/" + i.slug}
                              onClick={() => c.setOpen(false)}
                              className="block truncate text-sm font-medium hover:underline"
                            >
                              {i.name}
                            </Link>
                            <p className="mt-1 text-[11px] text-black/50">
                              {i.color} / {i.size}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => c.remove(i.variantId)}
                            className="-mr-1 -mt-1 grid h-9 w-9 place-items-center justify-self-end text-black/40 transition hover:bg-black hover:text-white"
                            aria-label={"Remove " + i.name}
                          >
                            <Trash2 size={15} />
                          </button>
                          <div className="col-span-2 min-w-0 self-start">
                            {i.isPreorder ? (
                              <p className="mt-2 text-[10px] leading-4 text-red-800">
                                Pre-orders use the separate request flow. Remove
                                this item before checkout.
                              </p>
                            ) : (
                              !c.hydrationLoading && !available && (
                                <p className="mt-2 text-[10px] leading-4 text-red-800">
                                  Availability changed. Please review this item.
                                </p>
                              )
                            )}
                          </div>
                          <div className="inline-flex h-9 items-center self-end justify-self-start border border-black/12 bg-white">
                            <button
                              type="button"
                              className="grid h-full w-9 place-items-center disabled:opacity-30"
                              aria-label={"Decrease " + i.name + " quantity"}
                              onClick={() =>
                                c.quantity(i.variantId, i.quantity - 1, stock)
                              }
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-8 text-center text-xs tabular-nums">
                              {i.quantity}
                            </span>
                            <button
                              type="button"
                              className="grid h-full w-9 place-items-center disabled:opacity-30"
                              aria-label={"Increase " + i.name + " quantity"}
                              disabled={
                                !available || i.quantity >= stock
                              }
                              onClick={() =>
                                c.quantity(i.variantId, i.quantity + 1, stock)
                              }
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <p className="whitespace-nowrap pb-2 text-right text-sm font-medium tabular-nums self-end">
                            {money(currentPrice(i) * i.quantity)}
                          </p>
                        </article>
                      );
                    })}
                  </div>

                  {recommendations.length > 0 && (
                    <section className="mt-6 border-t border-black/10 px-5 pb-7 pt-6 sm:px-7">
                      <div className="mb-4 flex items-center justify-between gap-4">
                        <p className="text-xs font-semibold uppercase tracking-[.08em]">
                          You may also like
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => moveRecommendations(-1)}
                            aria-label="Previous recommendations"
                            className="grid h-10 w-10 place-items-center rounded-full border border-black/15 transition hover:bg-black hover:text-white"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRecommendations(1)}
                            aria-label="Next recommendations"
                            className="grid h-10 w-10 place-items-center rounded-full border border-black/15 transition hover:bg-black hover:text-white"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                      <div
                        ref={recommendationsRef}
                        className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pr-3"
                      >
                        {recommendations.map((product) => {
                          const image = product.media.find(
                            (media) => media.type === "image",
                          )?.url;
                          return (
                            <Link
                              key={product.id}
                              to={"/product/" + product.slug}
                              onClick={() => c.setOpen(false)}
                              className="group w-[42%] min-w-[42%] snap-start sm:w-[calc((100%-1rem)/3)] sm:min-w-[calc((100%-1rem)/3)]"
                            >
                              <div className="relative aspect-[4/5] overflow-hidden bg-[#eeeae3]">
                                {image ? (
                                  <img
                                    src={image}
                                    alt={product.name}
                                    loading="lazy"
                                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
                                  />
                                ) : (
                                  <div className="h-full w-full bg-black/5" />
                                )}
                                <span className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
                                  <ShoppingBag size={14} />
                                </span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-4">
                                {product.name}
                              </p>
                              <p className="mt-0.5 text-[10px] text-black/55">
                                {money(product.price)}
                              </p>
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>

            {c.items.length > 0 && (
              <footer className="shrink-0 border-t border-black/10 bg-[#fbfaf7] px-5 py-5 sm:px-7">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-base font-medium">Subtotal</p>
                    <p className="mt-1 text-[10px] text-black/45">
                      Delivery calculated at checkout
                    </p>
                  </div>
                  <p className="text-lg font-semibold">{money(subtotal)}</p>
                </div>
                {!canCheckout && (
                  <p className="mb-3 text-[11px] leading-5 text-red-800">
                    Update or remove unavailable items before checkout.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/cart"
                    onClick={() => c.setOpen(false)}
                    className="flex min-h-12 items-center justify-center border border-black bg-transparent px-4 text-[10px] font-semibold uppercase tracking-[.12em] transition hover:bg-black hover:text-white"
                  >
                    View cart
                  </Link>
                  {canCheckout ? (
                    <Link
                      to="/checkout"
                      onClick={() => c.setOpen(false)}
                      className="flex min-h-12 items-center justify-center bg-black px-4 text-[10px] font-semibold uppercase tracking-[.12em] text-white transition hover:bg-[#96724f]"
                    >
                      Checkout
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="min-h-12 bg-black px-4 text-[10px] font-semibold uppercase tracking-[.12em] text-white opacity-35"
                    >
                      Checkout
                    </button>
                  )}
                </div>
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
