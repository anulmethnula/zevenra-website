import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  MapPin,
  MessageCircle,
  PackageOpen,
  RefreshCw,
} from "lucide-react";
import { Seo } from "../components/Seo";
import { money } from "../config/site";
import { useCustomerAuth } from "../features/account/CustomerAuthContext";
import { api } from "../services/api";
import type { CustomerOrder, CustomerPreorder, PreorderStatus } from "../types";
import { AccountLoading } from "./AccountPage";
import { downloadInvoicePdf } from "../utils/invoicePdf";
import { downloadPreorderSummaryPdf } from "../utils/preorderSummaryPdf";
import { orderStatusLabel } from "../../shared/order-status";

const preorderLabels: Record<PreorderStatus, string> = {
  new: "Request received",
  awaiting_payment:"Awaiting payment",
  payment_submitted:"Payment submitted",
  paid:"Paid",
  contacted: "We contacted you",
  confirmed: "Confirmed",
  batched: "Legacy batched",
  ordered: "Legacy ordered",
  in_transit: "In transit",
  arrived: "Arrived",
  ready: "Ready",
  notified: "Ready for checkout",
  converted: "Converted to order",
  cancelled: "Cancelled",
  expired: "Reservation expired",
};
const preorderHelp: Record<PreorderStatus, string> = {
  new: "We received this legacy request.",
  awaiting_payment:"Pay the full product price by bank transfer and upload your receipt.",
  payment_submitted:"Your receipt is waiting for verification.",
  paid:"Your product payment has been verified.",
  contacted: "We are reviewing this legacy request.",
  confirmed:"Your paid pre-order is confirmed. Estimated arrival is 3–4 weeks.",
  batched: "This is a legacy pre-order record.",
  ordered: "This is a legacy pre-order record.",
  in_transit: "Your piece is on the way to Sri Lanka.",
  arrived: "Your piece has arrived and is being checked.",
  ready:"Your piece is ready for its delivery order. The courier fee is collected on delivery.",
  notified:"Your piece is reserved. Use the secure link sent by ZEVENRA to complete your order.",
  converted:
    "This pre-order is finished and has been converted into a normal order. Check the Orders tab.",
  cancelled: "This pre-order request was cancelled.",
  expired:"This reservation expired. Contact ZEVENRA if you still want this item.",
};

export default function CustomerOrdersPage() {
  const { user, loading } = useCustomerAuth(),
    [orders, setOrders] = useState<CustomerOrder[]>([]),
    [preorders, setPreorders] = useState<CustomerPreorder[]>([]),
    [tab, setTab] = useState<"orders" | "preorders">("orders"),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [warning, setWarning] = useState(""),
    [open, setOpen] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    setWarning("");
    const [normal, requests] = await Promise.allSettled([
      api.customerOrders(),
      api.customerPreorders(),
    ]);
    if (normal.status === "fulfilled") setOrders(normal.value);
    else setOrders([]);
    if (requests.status === "fulfilled") setPreorders(requests.value);
    else setPreorders([]);
    if (normal.status === "rejected" && requests.status === "rejected")
      setError("We could not load your orders or pre-orders right now.");
    else if (normal.status === "rejected")
      setWarning(
        "Normal orders could not be loaded right now. Pre-orders are still available.",
      );
    else if (requests.status === "rejected")
      setWarning(
        "Pre-orders could not be loaded right now. Normal orders are still available.",
      );
    setBusy(false);
  }, []);
  useEffect(() => {
    if (user) void load();
  }, [load, user]);
  if (loading) return <AccountLoading />;
  if (!user)
    return (
      <Navigate
        to="/account/login"
        replace
        state={{ from: "/account/orders" }}
      />
    );
  return (
    <main className="account-page account-orders">
      <Seo title="My Orders" noindex />
      <div className="container account-page__inner">
        <Link to="/account" className="account-back">
          <ArrowLeft /> My account
        </Link>
        <p className="eyebrow text-bronze">Your ZEVENRA activity</p>
        <h1 className="display">Orders & pre-orders</h1>
        <p className="account-page__lead">
          See what you requested, payment status, delivery details and where
          each item is in the process.
        </p>
        <div className="customer-order-tabs">
          <button
            className={tab === "orders" ? "is-active" : ""}
            onClick={() => {
              setTab("orders");
              setOpen("");
            }}
          >
            <span>Orders</span>
            <b>{orders.length}</b>
          </button>
          <button
            className={tab === "preorders" ? "is-active" : ""}
            onClick={() => {
              setTab("preorders");
              setOpen("");
            }}
          >
            <span>Pre-orders</span>
            <b>{preorders.length}</b>
          </button>
          <button
            className="customer-order-refresh"
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
        </div>
        {warning && (
          <p className="account-orders-warning" role="status">
            {warning}
          </p>
        )}
        {busy ? (
          <OrdersSkeleton />
        ) : error ? (
          <div className="account-state">
            <p>{error}</p>
            <button onClick={() => void load()} className="btn">
              <RefreshCw /> Retry
            </button>
          </div>
        ) : tab === "orders" ? (
          <OrdersView orders={orders} open={open} setOpen={setOpen} onChanged={load} />
        ) : (
          <PreordersView requests={preorders} />
        )}
      </div>
    </main>
  );
}
function OrdersView({
  orders,
  open,
  setOpen,
  onChanged,
}: {
  orders: CustomerOrder[];
  open: string;
  setOpen: (id: string) => void;
  onChanged:()=>Promise<void>;
}) {
  const [cancelReason,setCancelReason]=useState("Changed my mind"),[cancelling,setCancelling]=useState(""),[cancelError,setCancelError]=useState("");
  async function cancel(order:CustomerOrder){if(!window.confirm("Are you sure you want to cancel this order?"))return;let customReason="";if(cancelReason==="Other"){customReason=window.prompt("Tell us why you are cancelling:")?.trim()||"";if(!customReason)return;}setCancelling(order.orderId);setCancelError("");try{await api.cancelCustomerOrder({orderId:order.orderId,reason:cancelReason,customReason});await onChanged();}catch(reason){setCancelError(reason instanceof Error?reason.message:"Could not cancel this order.");}finally{setCancelling("");}}
  if (!orders.length)
    return (
      <div className="account-state">
        <PackageOpen />
        <h2 className="display">No account orders yet.</h2>
        <p>Orders placed while you are signed in will appear here.</p>
        <Link to="/shop" className="btn btn-dark">
          Explore shop
        </Link>
      </div>
    );
  return (
    <div className="orders-list">
      {orders.map((order) => (
        <article
          className={"order-row " + (open === order.orderId ? "is-open" : "")}
          key={order.orderId}
        >
          <button
            className="order-row__summary"
            onClick={() => setOpen(open === order.orderId ? "" : order.orderId)}
            aria-expanded={open === order.orderId}
          >
            <span>
              <small>Order</small>
              <b>#{order.orderNumber || order.orderId}</b>
            </span>
            <span>
              <small>Date</small>
              <b>
                {new Date(order.createdAt).toLocaleDateString("en-LK", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </b>
            </span>
            <span>
              <small>Total</small>
              <b>{money(order.total)}</b>
            </span>
            <span>
              <small>Payment</small>
              <b>
                {order.paymentMethod === "cod"
                  ? (order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Cash on delivery")
                  : "Bank transfer"}
              </b>
              {order.paymentStatus && <small>{order.paymentStatus}</small>}
            </span>
            <span
              className={
                "order-status order-status--" + order.orderStatus.toLowerCase()
              }
            >
              {orderStatusLabel(order.orderStatus)}
            </span>
            <ChevronDown />
          </button>
          {open === order.orderId && (
            <div className="customer-order-detail">
              <section>
                <p className="eyebrow text-bronze">Items</p>
                <div className="customer-order-items">
                  {order.items.map((item, index) => (
                    <div
                      className="order-item"
                      key={item.variantId + "-" + index}
                    >
                      <span>
                        <b>{item.name}</b>
                        <small>
                          {item.color} / {item.size} · Qty {item.quantity}
                        </small>
                      </span>
                      <b>{money(item.subtotal)}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="customer-order-info">
                <div>
                  <small>Delivery to</small>
                  <p>
                    <MapPin size={14} />
                    {[
                      order.address1,
                      order.address2,
                      order.city,
                      order.district,
                      order.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Address unavailable"}
                  </p>
                </div>
                <div>
                  <small>Contact</small>
                  <p>
                    {order.phone || "—"}
                    {order.whatsapp ? " · WhatsApp " + order.whatsapp : ""}
                  </p>
                </div>
                {order.deliveryNotes && (
                  <div>
                    <small>Delivery instructions</small>
                    <p>{order.deliveryNotes}</p>
                  </div>
                )}
                {order.paymentReference && (
                  <div>
                    <small>Bank reference</small>
                    <p>{order.paymentReference}</p>
                  </div>
                )}
                {(order.trackingNumber ||
                  order.trackingUrl ||
                  order.courierSentDate) && (
                  <div>
                    <small>Courier tracking</small>
                    <p>
                      {order.fulfilmentCourierName || "Courier"}
                      {order.trackingNumber ? ` · ${order.trackingNumber}` : ""}
                      {order.courierSentDate
                        ? ` · Sent ${order.courierSentDate}`
                        : ""}
                      {order.trackingUrl && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={order.trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Track parcel
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                )}
              </section>
              <dl>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(order.subtotal)}</dd>
                </div>
                {Number(order.discountAmount || 0)>0&&<div><dt>Discount{order.discountCode?` (${order.discountCode})`:""}</dt><dd>-{money(Number(order.discountAmount))}</dd></div>}
                <div>
                  <dt>
                    {order.deliveryMethodName || "Delivery"}
                    {order.deliveryAreaGroupName ? ` · ${order.deliveryAreaGroupName}` : order.pickupBranchName ? ` · ${order.pickupBranchName}` : ""}
                  </dt>
                  <dd>
                    {order.deliveryFee
                      ? money(order.deliveryFee)
                      : "Complimentary"}
                  </dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{money(order.total)}</dd>
                </div>
                <div>
                  <dt>Order status</dt>
                  <dd>{orderStatusLabel(order.orderStatus)}</dd>
                </div>
                <div>
                  <dt>Payment status</dt>
                  <dd>{order.paymentStatus || "—"}</dd>
                </div>
              </dl>
              <DocumentButton label="DOWNLOAD INVOICE" run={()=>downloadInvoicePdf(order)}/>
              {order.paymentMethod==="cod"&&["pending","confirmed"].includes(order.orderStatus)?<div className="mt-4 border border-red-900/15 bg-red-950/[.03] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-red-900">Cancel order</p>{order.sourcePreorderRequestId&&<p className="mt-2 text-xs leading-5 text-red-900/75">This delivery order came from a paid pre-order. Cancelling releases the reserved piece to stock and moves the prepaid amount to refund pending.</p>}<select className="field mt-3" value={cancelReason} onChange={event=>setCancelReason(event.target.value)}><option>Changed my mind</option><option>Ordered by mistake</option><option>Need to change the order</option><option>Other</option></select><button type="button" className="btn mt-3 text-red-900" disabled={cancelling===order.orderId} onClick={()=>void cancel(order)}>{cancelling===order.orderId?"CANCELLING…":"CANCEL ORDER"}</button>{cancelError?<p role="alert" className="mt-2 text-xs text-red-900">{cancelError}</p>:null}</div>:order.paymentMethod==="bank"&&!(["delivered","cancelled"].includes(order.orderStatus))?<p className="mt-4 text-xs text-ink/55">Contact ZEVENRA for cancellation assistance.</p>:order.orderStatus==="dispatched"?<p className="mt-4 text-xs text-ink/55">This order has already been dispatched. Contact ZEVENRA if you need help.</p>:null}
              {order.orderStatus==="cancelled"&&order.cancellationReason?<p className="mt-4 text-xs text-red-900">Cancelled: {order.cancellationReason}</p>:null}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
function PreordersView({ requests }: { requests: CustomerPreorder[] }) {
  if (!requests.length)
    return (
      <div className="account-state">
        <MessageCircle />
        <h2 className="display">No signed-in pre-orders yet.</h2>
        <p>Pre-order requests you submit while signed in will appear here.</p>
        <Link to="/shop" className="btn btn-dark">
          Explore shop
        </Link>
      </div>
    );
  return (
    <div className="customer-preorder-list">
      {requests.map((item) => (
        <article className="customer-preorder-card" key={item.requestId}>
          <div className="customer-preorder-card__head">
            <div>
              <small>Pre-order request</small>
              <h2>{item.preorderNumber ? `PRE-${item.preorderNumber}` : item.requestId}</h2>
              <p>
                {new Date(item.createdAt).toLocaleString("en-LK", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <span className={"preorder-status preorder-status--" + item.status}>
              {preorderLabels[item.status]}
            </span>
          </div>
          <div className="customer-preorder-card__grid">
            <section>
              <small>Item</small>
              <h3>{item.productName}</h3>
              <p>
                {item.color} / {item.size} · Qty {item.quantity}
              </p>
              <p>
                Price when requested: <b>{money(item.requestedPrice)}</b>
              </p>
              {["new", "contacted", "batched", "ordered", "notified", "expired"].includes(item.status) && Number(item.confirmedPrice || 0) > 0 && (
                <p>
                  Final agreed price:{" "}
                  <b>{money(Number(item.confirmedPrice))}</b>
                </p>
              )}
            </section>
            <section>
              <small>Delivery details</small>
              <p>{item.customerName}</p>
              <p>{item.whatsapp}</p>
              <p>
                {[
                  item.address1,
                  item.address2,
                  item.city,
                  item.district,
                  item.postalCode,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </section>
            <section className="customer-preorder-next">
              <small>What happens now</small>
              <p>{preorderHelp[item.status]}</p>
              {item.batchId && <span>Legacy batch: {item.batchId}</span>}
            </section>
          </div>
          <DocumentButton label="DOWNLOAD PRE-ORDER SUMMARY" run={()=>downloadPreorderSummaryPdf(item)}/>
        </article>
      ))}
    </div>
  );
}
function DocumentButton({label,run}:{label:string;run:()=>Promise<void>}){const [busy,setBusy]=useState(false),[error,setError]=useState("");return <div className="mt-4"><button type="button" className="btn" disabled={busy} onClick={()=>{setBusy(true);setError("");void run().catch(()=>setError("We couldn't prepare this document. Please try again.")).finally(()=>setBusy(false));}}><Download size={14}/>{busy?"PREPARING PDF…":label}</button>{error?<p role="status" className="mt-2 text-xs text-red-800">{error}</p>:null}</div>;}
function OrdersSkeleton() {
  return (
    <div className="orders-list" aria-label="Loading order history">
      <div className="account-skeleton account-skeleton--order" />
      <div className="account-skeleton account-skeleton--order" />
      <div className="account-skeleton account-skeleton--order" />
    </div>
  );
}
