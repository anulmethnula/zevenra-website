import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  MoreHorizontal,
  MessageCircle,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { money } from "../../config/site";
import { adminApi } from "../../services/adminApi";
import { uploadAdminMedia } from "../../services/cloudinaryUpload";
import { invalidatePublic } from "../../services/publicDataCache";
import { useStore } from "../../features/store/StoreContext";
import { adminToast } from "../../components/admin/AdminToasts";
import { paymentRejectionReasons, paymentRetryMessage } from "../../utils/preorderPayment";
import { CourierRateSheetImport } from "../../components/admin/CourierRateSheetImport";
import { convertedOrderStatusLabel, normalizeOrderStatus, orderStatusLabel } from "../../../shared/order-status";
import { selectDispatchCourierId, sriLankaDateTimeLocal, sriLankaDateTimeToIso } from "../../../shared/dispatch";
import HomepageBuilder from "../../components/admin/homepage/HomepageBuilder";
import type {
  Category,
  Collection,
  CourierProvider,
  DeliveryRate,
  FinanceData,
  HomepageSection,
  NavigationItem,
  Order,
  PreorderRequest,
  PreorderStatus,
  Product,
  SizeChart,
} from "../../types";
const sriLankaDistricts = [
  "Ampara",
  "Anuradhapura",
  "Badulla",
  "Batticaloa",
  "Colombo",
  "Galle",
  "Gampaha",
  "Hambantota",
  "Jaffna",
  "Kalutara",
  "Kandy",
  "Kegalle",
  "Kilinochchi",
  "Kurunegala",
  "Mannar",
  "Matale",
  "Matara",
  "Monaragala",
  "Mullaitivu",
  "Nuwara Eliya",
  "Polonnaruwa",
  "Puttalam",
  "Ratnapura",
  "Trincomalee",
  "Vavuniya",
] as const;
const adminPhone = /^[+\d][\d\s-]{8,14}$/;

type HistoricalProductIdentity = {
  productId?: string;
  sku?: string;
  productName?: string;
  name?: string;
};

const normalizeProductName = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function resolveCurrentProduct(
  products: Product[],
  item?: HistoricalProductIdentity,
) {
  if (!item) return undefined;
  const byId = products.find((product) => product.id === item.productId);
  if (byId) return byId;
  if (item.sku) {
    const bySku = products.find((product) =>
      product.variants.some((variant) => variant.sku === item.sku),
    );
    if (bySku) return bySku;
  }
  const historicalName = normalizeProductName(
    item.productName || item.name || "",
  );
  if (!historicalName) return undefined;
  const nameMatches = products.filter(
    (product) => normalizeProductName(product.name) === historicalName,
  );
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

export default function AdminPage() {
  const section = useLocation().pathname.split("/")[2] || "overview";
  if (section === "overview") return <Dashboard />;
  if (section === "products") return <ProductsWorkspace />;
  if (section === "categories") return <Categories />;
  if (section === "collections") return <Collections />;
  if (section === "navigation") return <Navigation />;
  if (section === "homepage") return <HomepageBuilder />;
  if (section === "size-charts") return <SizeCharts />;
  if (section === "settings") return <ExplicitSettings focus={section} />;
  if (section === "delivery") return <DeliveryRates />;
  if (section === "orders") return <Orders />;
  if (section === "finance") return <Finance />;
  if (section === "preorders") return <Preorders />;
  return <Media />;
}
function Head({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="admin-page-head flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="admin-kicker">{eyebrow}</p>
        <h1 className="admin-title mt-2">{title}</h1>
      </div>
      {action}
    </div>
  );
}
function AdminDrawer({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};const previous=document.body.style.overflow;document.body.style.overflow="hidden";window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);};},[onClose]);
  return <><button type="button" className="admin-drawer-backdrop" onClick={onClose} aria-label="Close editor"/><aside className="admin-drawer" role="dialog" aria-modal="true" aria-label={title}><header className="admin-drawer__header"><div><p className="admin-kicker">Editor</p><h2 className="mt-1 text-xl font-bold">{title}</h2></div><button type="button" className="grid h-11 w-11 place-items-center rounded-full border" onClick={onClose} aria-label="Close editor"><X size={18}/></button></header><div className="admin-drawer__body">{children}</div></aside></>;
}
function UploadField({
  label,
  value,
  onChange,
  accept = "image/jpeg,image/png,image/webp,image/avif",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  accept?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await uploadAdminMedia(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="text-xs">{label}</p>
      <div className="mt-2 flex gap-2">
        <input
          className="field min-w-0 flex-1"
          value={value}
          placeholder="Upload or paste URL"
          onChange={(e) => onChange(e.target.value)}
        />
        <label className="btn btn-dark shrink-0 cursor-pointer">
          {busy ? "Uploading…" : "Upload"}
          <input
            className="sr-only"
            type="file"
            accept={accept}
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {value && accept.startsWith("image") && (
        <img
          src={value}
          alt=""
          className="mt-2 h-24 w-20 border border-black/10 object-cover"
        />
      )}
      {error && <p className="mt-2 text-xs text-red-800">{error}</p>}
    </div>
  );
}
function DashboardMetric({label,value,to,help,strong=false}:{label:string;value:string|number;to:string;help?:string;strong?:boolean}) {
  const tone=label.includes("Cancelled")||label.includes("Low Stock")?"danger":label.includes("Delivered")?"success":label.includes("Dispatched")?"info":label.includes("Pending")||label.includes("Pre-order")?"warning":label.includes("Confirmed")?"violet":strong||label.includes("Revenue")||label.includes("Delivery Collected")?"bronze":"neutral";
  return <Link to={to} aria-label={`View ${label}`} data-tone={tone} className={`dashboard-metric ${strong?"dashboard-metric--primary":""}`}><span className="dashboard-metric__top"><span className="dashboard-metric__label"><i aria-hidden="true"/>{label}</span><span aria-hidden="true" className="dashboard-metric__arrow">↗</span></span><strong className="dashboard-metric__value">{value}</strong>{help?<span className="dashboard-metric__help">{help}</span>:<span className="dashboard-metric__help">Open details</span>}</Link>;
}
type FinancePeriod = FinanceData["period"];
function Finance() {
  const [period,setPeriod]=useState<FinancePeriod>("30"),[data,setData]=useState<FinanceData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");void adminApi.get<FinanceData>("finance",{period},controller.signal).then(setData).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Finance data could not be loaded.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[period]);
  const periods:[FinancePeriod,string][]=[["today","Today"],["7","7 Days"],["30","30 Days"],["all","All Time"]],summary=[{label:"Product Revenue",value:money(data?.productRevenue||0),help:"Delivered product sales after discounts. Delivery excluded."},{label:"Delivery Collected",value:money(data?.deliveryCollected||0),help:"Delivery money is tracked separately."},{label:"Delivered Orders",value:data?.deliveredOrders||0},{label:"Items Sold",value:data?.itemsSold||0}],totalPayments=(data?.productRevenue||0)+(data?.deliveryCollected||0);
  return <>
    <Head eyebrow="Business performance" title="Finance" action={<div className="flex flex-wrap gap-1 rounded-full border border-black/10 bg-white/30 p-1" role="group" aria-label="Finance period">{periods.map(([value,label])=><button key={value} type="button" onClick={()=>setPeriod(value)} aria-pressed={period===value} className={`min-h-9 rounded-full px-4 text-xs transition ${period===value?"bg-black text-white":"text-black/55 hover:bg-white/70"}`}>{label}</button>)}</div>}/>
    {error?<div className="mt-8 border border-red-900/20 bg-red-50 p-4 text-sm text-red-900" role="alert">{error}</div>:null}
    {loading&&!data?<div className="mt-8 grid min-h-48 place-content-center text-sm text-black/45">Loading finance data…</div>:<div className={loading?"opacity-60 transition":"transition"} aria-busy={loading}>
      <section className="mt-8"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map(card=><div key={card.label} className="border border-bronze/20 bg-white/40 p-5"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-black/45">{card.label}</p><p className="display mt-3 break-words text-3xl sm:text-4xl">{card.value}</p>{card.help?<p className="mt-3 text-[11px] leading-5 text-black/50">{card.help}</p>:null}</div>)}</div></section>
      <section className="mt-8">
        <Panel title="Revenue summary">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 text-sm"><span className="text-black/60">Product Revenue</span><strong>{money(data?.productRevenue||0)}</strong></div>
            <div className="flex items-center justify-between gap-4 text-sm"><span className="text-black/60">Delivery Collected</span><strong>{money(data?.deliveryCollected||0)}</strong></div>
            <div className="flex items-center justify-between gap-4 border-t border-black/10 pt-4"><span className="font-medium">Total Customer Payments</span><strong className="text-lg">{money(totalPayments)}</strong></div>
            <p className="text-xs text-black/50">Product sales and delivery money are shown separately.</p>
          </div>
        </Panel>
      </section>
      <section className="mt-8"><Panel title="Top selling products">{data?.topProducts.length?<div className="grid gap-3 sm:grid-cols-2">{data.topProducts.map(product=><Link key={`${product.productId}-${product.name}`} to={`/admin/products/${product.productId}`} className="flex items-center gap-4 border border-black/10 bg-white/25 p-3 transition hover:border-bronze/40 hover:bg-white/45"><span className="grid h-24 w-20 shrink-0 place-items-center overflow-hidden bg-black/[.04]">{product.imageUrl?<img src={product.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover"/>:<span className="text-[9px] uppercase tracking-wider text-black/30">No image</span>}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{product.name}</b><span className="mt-2 block text-xs text-black/45">{product.quantity} sold</span><span className="mt-2 block text-base font-medium">{money(product.revenue)}</span></span></Link>)}</div>:<Empty text="No delivered product sales in this period."/>}</Panel></section>
      <section className="mt-8"><Panel title="Recent delivered orders">{data?.recentSales.length?<div className="grid gap-3 sm:grid-cols-2">{data.recentSales.map(sale=><Link key={sale.orderId} to={`/admin/orders/${sale.orderId}`} className="border border-black/10 bg-white/25 p-4 transition hover:border-bronze/40 hover:bg-white/45"><div className="flex items-start justify-between gap-3"><span><b className="block text-sm">{sale.orderId}</b><span className="mt-1 block text-xs text-black/45">{sale.customerName}</span></span><span className="text-[10px] text-black/40">{new Date(sale.createdAt).toLocaleDateString("en-LK",{timeZone:"Asia/Colombo",month:"short",day:"numeric"})}</span></div><div className="mt-4 space-y-2 border-t border-black/10 pt-3 text-xs"><div className="flex justify-between"><span>Product</span><b>{money(sale.productRevenue)}</b></div><div className="flex justify-between text-bronze"><span>Delivery</span><b>{money(sale.delivery)}</b></div><div className="flex justify-between pt-1 text-sm"><span>Total</span><b>{money(sale.total)}</b></div></div></Link>)}</div>:<Empty text="No delivered orders in this period."/>}</Panel></section>
    </div>}
  </>;
}
function Dashboard() {
  const { admin } = useStore(),
    stats = admin.dashboard,
    low = stats?.stockAttention || [], deliveredOrders="/admin/orders?status=delivered", finance="/admin/finance",
    business=[
      {label:"Product Revenue",value:money(stats?.productRevenue??stats?.revenue??0),to:finance,help:"Delivered product sales after discounts. Delivery fees excluded."},
    ], activity=[
      {label:"Orders Today",value:stats?.ordersToday||0,to:"/admin/orders?date=today"},{label:"Items Sold",value:stats?.itemsSold||0,to:deliveredOrders},{label:"Delivery Collected",value:money(stats?.deliveryCollected||0),to:finance,help:"Delivery fees are shown separately and are not included in product revenue or gross profit."},{label:"Active Pre-orders",value:stats?.preorderNew||0,to:"/admin/preorders?status=active"},
    ], operations=[
      {label:"Pending Orders",value:stats?.pending||0,to:"/admin/orders?status=pending"},{label:"Confirmed",value:stats?.confirmed||0,to:"/admin/orders?status=confirmed"},{label:"Dispatched",value:stats?.dispatched||0,to:"/admin/orders?status=dispatched"},{label:"Delivered",value:stats?.delivered||0,to:deliveredOrders},{label:"Cancelled",value:stats?.cancelled||0,to:"/admin/orders?status=cancelled"},
    ], storeCards=[{label:"Published Products",value:stats?.publishedProducts||0,to:"/admin/products?status=published"},{label:"Low Stock",value:stats?.lowStockProducts||0,to:"/admin/products?stock=low"}];
  return (
    <>
      <Head
        eyebrow="Your store today"
        title="Dashboard"
        action={
          <Link to="/admin/products/new" className="btn btn-dark">
            <PackagePlus size={16} /> Add product
          </Link>
        }
      />
      <section className="dashboard-metric-group mt-8"><div className="dashboard-metric-group__heading"><div><p className="eyebrow text-bronze">Business overview</p><p>Sales and activity today</p></div></div><div className="dashboard-metric-grid dashboard-metric-grid--business">{business.map(card=><DashboardMetric key={card.label} {...card} strong/>)}{activity.map(card=><DashboardMetric key={card.label} {...card}/>)}</div></section>
      <section className="dashboard-metric-group mt-8"><div className="dashboard-metric-group__heading"><div><p className="eyebrow text-bronze">Order operations</p><p>Orders by current stage</p></div><Link to="/admin/orders" className="dashboard-section-link">View all</Link></div><div className="dashboard-metric-grid dashboard-metric-grid--operations">{operations.map(card=><DashboardMetric key={card.label} {...card}/>)}</div></section>
      <section className="dashboard-metric-group mt-8"><div className="dashboard-metric-group__heading"><div><p className="eyebrow text-bronze">Store health</p><p>Products and stock</p></div></div><div className="dashboard-metric-grid dashboard-metric-grid--store">{storeCards.map(card=><DashboardMetric key={card.label} {...card}/>)}</div></section>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Panel title="Top selling products">
          {stats?.topProducts?.length ? (
            stats.topProducts.map((product, index) => (
              <div
                key={product.productId}
                className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-black/10 py-3"
              >
                <span className="display text-xl text-black/30">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm">{product.name}</p>
                  <p className="mt-1 text-xs text-black/45">
                    {product.quantity} items sold
                  </p>
                </div>
                <span className="text-sm">{money(product.revenue)}</span>
              </div>
            ))
          ) : (
            <Empty text="Delivered sales will appear here." />
          )}
        </Panel>
        <Panel title="Recent orders">
          {stats?.recent?.length ? (
            stats.recent.slice(0, 6).map((order) => (
              <Link
                to="/admin/orders"
                key={order.orderId}
                className="flex items-center justify-between gap-4 border-b border-black/10 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate">
                    {order.orderId} · {order.customerName}
                  </span>
                  <span className="mt-1 block text-xs uppercase tracking-wider text-black/40">
                    {order.orderStatus}
                  </span>
                </span>
                <span className="shrink-0">{money(Number(order.total))}</span>
              </Link>
            ))
          ) : (
            <Empty text="No orders yet." />
          )}
        </Panel>
      </div>
      <div className="mt-5">
        <Panel title="Stock attention">
          {low.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {low.slice(0, 10).map((p) => {
                const image = p.thumbnail,
                  stock = p.totalStock;
                return (
                  <Link
                    to={"/admin/products/" + p.id}
                    key={p.id}
                    className="flex items-center gap-3 border border-black/10 bg-white/25 p-3"
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
                        className="h-16 w-12 object-cover"
                      />
                    ) : (
                      <div className="h-16 w-12 bg-black/5" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="mt-1 block text-xs text-black/45">
                        {stock} units left
                        {p.preorderEnabled ? " · pre-order enabled" : ""}
                      </span>
                    </span>
                    <span className="text-xs underline">EDIT</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty text="No products need stock attention." />
          )}
        </Panel>
      </div>
    </>
  );
}
export function Products() {
  const { data, duplicate, remove, commit } = useStore(),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [category, setCategory] = useState("all"),
    [page, setPage] = useState(1),
    pageSize = 20;
  const mainCategories = data.categories
      .filter((cat) => !cat.parentId && cat.active)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    needle = query.trim().toLowerCase();
  const filtered = data.products
    .filter((product) => {
      const cat = data.categories.find((x) => x.id === product.categoryId),
        parent = cat?.parentId
          ? data.categories.find((x) => x.id === cat.parentId)
          : cat,
        haystack = [
          product.name,
          product.slug,
          product.tags.join(" "),
          cat?.name,
          parent?.name,
        ]
          .join(" ")
          .toLowerCase(),
        matchCategory =
          category === "all" ||
          product.categoryId === category ||
          cat?.parentId === category;
      return (
        (!needle || haystack.includes(needle)) &&
        (status === "all" || product.status === status) &&
        matchCategory
      );
    })
    .sort((a, b) => b.sortOrder - a.sortOrder);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    safePage = Math.min(page, pages),
    visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [query, status, category]);
  return (
    <>
      <Head
        eyebrow="Catalogue"
        title="Products"
        action={
          <Link to="/admin/products/new" className="btn btn-dark">
            <PackagePlus size={16} /> Add product
          </Link>
        }
      />
      <div className="mt-7 grid gap-3 rounded-sm bg-[#f6f3ed] p-4 md:grid-cols-[minmax(220px,1fr)_180px_200px]">
        <div className="relative">
          <Search className="absolute left-3 top-3" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
            className="field bg-white/55 pl-10"
            placeholder="Search product, category, tag…"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="field bg-white/55"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field bg-white/55"
        >
          <option value="all">All categories</option>
          {mainCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 overflow-hidden border border-black/10 bg-[#f6f3ed]">
        {visible.length ? (
          visible.map((p) => {
            const image = p.media.find((media) => media.type === "image"),
              cat = data.categories.find((x) => x.id === p.categoryId),
              parent = cat?.parentId
                ? data.categories.find((x) => x.id === cat.parentId)
                : undefined,
              stock = p.variants
                .filter((v) => v.active)
                .reduce((n, v) => n + v.stock, 0);
            return (
              <div
                key={p.id}
                className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b border-black/10 p-3 last:border-0 sm:grid-cols-[72px_minmax(0,1fr)_110px_110px_auto] sm:gap-4"
              >
                {image ? (
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/5] w-full border border-black/5 object-cover"
                  />
                ) : (
                  <div className="aspect-[4/5] w-full bg-black/5" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm">{p.name}</p>
                  <p className="mt-1 truncate text-xs text-black/45">
                    {parent ? parent.name + " → " : ""}
                    {cat?.name || "No category"} · {stock} units
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="border border-black/10 px-2 py-1 text-[9px] uppercase tracking-wider">
                      {p.status}
                    </span>
                    {p.preorderEnabled && (
                      <span className="border border-[#96724f]/30 bg-[#96724f]/5 px-2 py-1 text-[9px] uppercase tracking-wider text-[#765638]">
                        Pre-order
                      </span>
                    )}
                  </div>
                </div>
                <span className="hidden text-sm sm:block">
                  {money(p.price)}
                </span>
                <button
                  onClick={() =>
                    void commit("products", {
                      ...p,
                      status: p.status === "published" ? "draft" : "published",
                    })
                  }
                  className="hidden min-h-11 text-xs underline sm:block"
                >
                  {p.status === "published" ? "UNPUBLISH" : "PUBLISH"}
                </button>
                <div className="flex items-center">
                  <Link
                    className="grid min-h-11 min-w-11 place-items-center text-xs underline"
                    to={`/admin/products/${p.id}`}
                  >
                    EDIT
                  </Link>
                  <button
                    onClick={() => duplicate("products", p.id)}
                    className="hidden min-h-11 min-w-11 place-items-center sm:grid"
                    title="Duplicate"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    onClick={() =>
                      confirm(`Delete ${p.name}?`) && remove("products", p.id)
                    }
                    className="hidden min-h-11 min-w-11 place-items-center text-red-800 sm:grid"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <Empty text="No products match these filters." />
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-black/45">
          Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–
          {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}{" "}
          products
        </p>
        <div className="flex items-center gap-2">
          <button
            className="btn"
            disabled={safePage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft size={15} /> Previous
          </button>
          <span className="px-2 text-xs">
            Page {safePage} / {pages}
          </span>
          <button
            className="btn"
            disabled={safePage >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
          >
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
type ProductListRow = { id:string;name:string;slug:string;price:number;status:string;preorderEnabled:boolean;updatedAt:string;categoryId:string;categoryName:string;parentCategoryId:string;parentCategoryName:string;thumbnail:string;variantCount:number;totalStock:number;lowStockCount:number };
type ProductListResponse = { items:ProductListRow[];page:number;pageSize:number;total:number;pageCount:number;categoryCounts:Record<string,number> };
function ProductsWorkspace() {
  const { data }=useStore(), location=useLocation(), initialParams=new URLSearchParams(location.search), [query,setQuery]=useState(""),[debounced,setDebounced]=useState(""),[category,setCategory]=useState("all"),[status,setStatus]=useState(()=>initialParams.get("status")||"all"),[stock,setStock]=useState(()=>initialParams.get("stock")||"all"),[sort,setSort]=useState("updated_desc"),[page,setPage]=useState(1),[result,setResult]=useState<ProductListResponse>({items:[],page:1,pageSize:25,total:0,pageCount:1,categoryCounts:{}}),[loading,setLoading]=useState(true),[error,setError]=useState(""),[menu,setMenu]=useState(""),[danger,setDanger]=useState<ProductListRow|null>(null);
  const main=data.categories.filter(item=>item.active&&!item.parentId).sort((a,b)=>a.sortOrder-b.sortOrder), selectedMain=main.find(item=>item.id===category)||data.categories.find(item=>item.id===category&&item.parentId), mainId=selectedMain?.parentId||selectedMain?.id||"", subs=data.categories.filter(item=>item.active&&item.parentId===mainId).sort((a,b)=>a.sortOrder-b.sortOrder);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(query.trim()),300);return()=>clearTimeout(timer);},[query]);
  const load=useCallback(async(signal?:AbortSignal)=>{setLoading(true);setError("");try{const next=await adminApi.get<Partial<ProductListResponse>>("listAdminProducts",{q:debounced,category,status,stock,sort,page:String(page),pageSize:"25"},signal);setResult({items:next.items??[],page:next.page??page,pageSize:next.pageSize??25,total:next.total??0,pageCount:next.pageCount??1,categoryCounts:next.categoryCounts??{}});}catch(reason){if(reason instanceof DOMException&&reason.name==="AbortError")return;setError(reason instanceof Error?reason.message:"Could not load products.");}finally{if(!signal?.aborted)setLoading(false);}},[category,debounced,page,sort,status,stock]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  useEffect(()=>setPage(1),[debounced,category,status,stock,sort]);
  async function changeStatus(item:ProductListRow,next:string){setMenu("");try{await adminApi.post("setProductStatus",{id:item.id,status:next});invalidatePublic("/products");invalidatePublic("/home");invalidatePublic("/recommendations");setResult(current=>({...current,items:current.items.map(row=>row.id===item.id?{...row,status:next}:row)}));adminToast(next==="archived"?"Product archived":next==="published"?"Product published":"Product unpublished");}catch(reason){const message=reason instanceof Error?reason.message:"Could not update product.";setError(message);adminToast(message,"error");}}
  async function removeProduct(){if(!danger)return;try{await adminApi.post("deleteProduct",{id:danger.id});invalidatePublic("/products");invalidatePublic("/home");invalidatePublic("/recommendations");setDanger(null);adminToast("Product deleted");void load();}catch(reason){const message=reason instanceof Error?reason.message:"This product cannot be deleted. Archive it instead.";setError(message);adminToast(message,"error");}}
  const active=Boolean(query||category!=="all"||status!=="all"||stock!=="all"||sort!=="updated_desc");
  return <><Head eyebrow="Catalogue" title="Products" action={<Link to="/admin/products/new" className="btn btn-dark"><PackagePlus size={16}/> Add product</Link>}/>
    <div className="mt-5 flex flex-wrap gap-2" aria-label="Product quick views"><button className={`btn ${stock==="all"?"btn-dark":""}`} onClick={()=>setStock("all")}>All inventory</button><button className={`btn ${stock==="low"?"btn-dark":""}`} onClick={()=>setStock("low")}>Low stock</button><button className={`btn ${stock==="out"?"btn-dark":""}`} onClick={()=>setStock("out")}>Out of stock</button><button className={`btn ${status==="draft"?"btn-dark":""}`} onClick={()=>setStatus(status==="draft"?"all":"draft")}>Draft</button><button className={`btn ${status==="published"?"btn-dark":""}`} onClick={()=>setStatus(status==="published"?"all":"published")}>Published</button></div>
    <div className="mt-7 hidden flex-wrap gap-2 sm:flex"><button onClick={()=>setCategory("all")} className={`rounded-full border px-4 py-2 text-xs ${category==="all"?"border-black bg-black text-white":"border-black/10 bg-white/35"}`}>All <span className="ml-1 opacity-60">{result.total}</span></button>{main.map(item=><button key={item.id} onClick={()=>setCategory(item.id)} className={`rounded-full border px-4 py-2 text-xs ${mainId===item.id?"border-black bg-black text-white":"border-black/10 bg-white/35"}`}>{item.name} <span className="ml-1 opacity-60">{result.categoryCounts?.[item.id]||0}</span></button>)}</div>
    {mainId&&subs.length>0&&<div className="mt-3 hidden flex-wrap gap-2 sm:flex"><button onClick={()=>setCategory(mainId)} className={`border-b px-2 py-1 text-xs ${category===mainId?"border-bronze text-bronze":"border-transparent text-black/50"}`}>All {main.find(item=>item.id===mainId)?.name}</button>{subs.map(item=><button key={item.id} onClick={()=>setCategory(item.id)} className={`border-b px-2 py-1 text-xs ${category===item.id?"border-bronze text-bronze":"border-transparent text-black/50"}`}>{item.name}</button>)}</div>}
    <div className="mt-6 grid items-center gap-3 border-b border-black/10 pb-4 md:grid-cols-[minmax(240px,1fr)_170px_190px_auto]"><div className="relative flex min-h-12 items-center border-b border-black/20 focus-within:border-bronze"><Search className="pointer-events-none absolute left-1 text-black/40" size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} className="h-12 w-full bg-transparent pl-8 pr-10 text-sm outline-none" placeholder="Search products, SKU, category…" aria-label="Search products"/>{query&&<button onClick={()=>setQuery("")} className="absolute right-1 grid h-9 w-9 place-items-center" aria-label="Clear search"><X size={15}/></button>}</div><select value={status} onChange={e=>setStatus(e.target.value)} className="field" aria-label="Product status"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select><select value={sort} onChange={e=>setSort(e.target.value)} className="field" aria-label="Sort products"><option value="updated_desc">Recently updated</option><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="stock_asc">Lowest stock</option><option value="stock_desc">Highest stock</option><option value="price_asc">Price low–high</option><option value="price_desc">Price high–low</option></select>{active&&<button className="btn" onClick={()=>{setQuery("");setCategory("all");setStatus("all");setSort("updated_desc");}}>Clear filters</button>}<select value={category} onChange={e=>setCategory(e.target.value)} className="field sm:hidden" aria-label="Product category"><option value="all">All categories</option>{main.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    {error&&<div role="alert" className="mt-4 flex items-center justify-between border border-red-900/15 bg-red-950/[.06] p-4 text-xs text-red-900"><span>{error}</span><button className="btn" onClick={()=>void load()}>Try again</button></div>}
    <div className="mt-5 overflow-visible border border-black/10 bg-[#f6f3ed]"><div className="hidden grid-cols-[minmax(260px,1fr)_170px_130px_120px_110px_100px] gap-4 border-b border-black/10 px-4 py-3 text-[10px] uppercase tracking-[.14em] text-black/40 lg:grid"><span>Product</span><span>Category</span><span>Stock</span><span>Price</span><span>Status</span><span>Action</span></div>{loading?Array.from({length:6},(_,i)=><div key={i} className="grid animate-pulse grid-cols-[64px_1fr] gap-4 border-b border-black/10 p-4"><span className="h-20 bg-black/10"/><span className="my-auto h-4 max-w-sm bg-black/10"/></div>):result.items.length?result.items.map(item=><div key={item.id} className="relative grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b border-black/10 p-3 transition hover:bg-white/45 lg:grid-cols-[80px_minmax(180px,1fr)_170px_130px_120px_110px_100px] lg:gap-4"><div className="grid aspect-[4/5] place-items-center overflow-hidden bg-[#ece7df]">{item.thumbnail&&<img src={item.thumbnail} alt="" loading="lazy" decoding="async" width="80" height="100" className="h-full w-full object-contain"/>}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-1 text-[10px] text-black/45">{item.variantCount} variant{item.variantCount===1?"":"s"} · {item.slug}</p>{item.preorderEnabled&&<span className="mt-2 inline-block border border-bronze/30 bg-bronze/[.06] px-2 py-1 text-[8px] uppercase tracking-wider text-bronze">Pre-order</span>}</div><div className="hidden text-xs lg:block">{item.parentCategoryName?`${item.parentCategoryName} → `:""}{item.categoryName||"Uncategorised"}</div><div className="hidden lg:block"><p className={`text-xs ${item.totalStock===0?"text-red-800":""}`}>{item.totalStock===0?"Out of stock":`${item.totalStock} in stock`}</p>{item.lowStockCount>0&&<p className="mt-1 text-[9px] text-amber-800">{item.lowStockCount} low stock</p>}</div><span className="hidden text-sm lg:block">{money(item.price)}</span><span className={`hidden w-fit rounded-full px-2.5 py-1 text-[9px] uppercase tracking-wider lg:block ${item.status==="published"?"bg-emerald-900/[.08] text-emerald-900":"bg-black/[.06] text-black/55"}`}>{item.status}</span><div className="flex items-center justify-end gap-1"><Link to={`/admin/products/${item.id}`} className="btn min-h-10 px-3">Edit</Link><button onClick={()=>setMenu(menu===item.id?"":item.id)} className="grid h-10 w-10 place-items-center" aria-label={`More actions for ${item.name}`}><MoreHorizontal size={17}/></button>{menu===item.id&&<div className="absolute right-3 top-[70%] z-20 grid min-w-44 border border-black/10 bg-white p-1 shadow-xl"><button className="px-3 py-2 text-left text-xs hover:bg-black/[.04]" onClick={()=>void changeStatus(item,item.status==="published"?"draft":"published")}>{item.status==="published"?"Unpublish":"Publish"}</button><button className="px-3 py-2 text-left text-xs hover:bg-black/[.04]" onClick={()=>void changeStatus(item,"archived")}>Archive</button><button className="px-3 py-2 text-left text-xs text-red-800 hover:bg-red-950/[.04]" onClick={()=>{setDanger(item);setMenu("");}}>Delete</button></div>}</div></div>):<Empty text="No products match these filters."/>}</div>
    <div className="mt-5 flex items-center justify-between gap-3"><p className="text-xs text-black/45">Showing {result.total?((result.page-1)*result.pageSize)+1:0}–{Math.min(result.page*result.pageSize,result.total)} of {result.total}</p><div className="flex items-center gap-2"><button className="btn" disabled={page<=1||loading} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={15}/> Previous</button><span className="text-xs">{result.page} / {result.pageCount}</span><button className="btn" disabled={page>=result.pageCount||loading} onClick={()=>setPage(value=>value+1)}>Next <ChevronRight size={15}/></button></div></div>
    {danger&&<div className="fixed inset-0 z-[200] grid place-items-center bg-black/50 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md bg-[#f6f3ed] p-6 shadow-2xl"><p className="eyebrow text-red-800">Dangerous action</p><h2 className="display mt-3 text-3xl">Delete “{danger.name}”?</h2><p className="mt-4 text-xs leading-6 text-black/55">Deletion is allowed only when no historical order references this product. Archive it when history must be preserved.</p><div className="mt-6 flex justify-end gap-2"><button className="btn" onClick={()=>setDanger(null)}>Cancel</button><button className="btn border-red-800 text-red-800" onClick={()=>void removeProduct()}>Delete product</button></div></div></div>}</>;
}
function Categories() {
  const store = useStore(),
    [editing, setEditing] = useState<Category | null>(null),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [parentFilter, setParentFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all"),
    [page, setPage] = useState(1),
    pageSize = 25,
    main = [...store.data.categories]
      .filter((category) => !category.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const create = (kind:"main"|"sub") => setEditing({
    id: crypto.randomUUID(),
    name: "",
    slug: "",
    description: "",
    imageUrl: "",
    active: true,
    featured: false,
    showInNavigation: kind === "main",
    showOnHomepage: false,
    parentId: kind === "sub" ? main[0]?.id : undefined,
    sortOrder: store.data.categories.length + 1,
  });
  const needle=query.trim().toLowerCase(), filtered=[...store.data.categories].filter(item=>{const parent=main.find(value=>value.id===item.parentId);return (!needle||[item.name,item.slug,parent?.name].some(value=>String(value||"").toLowerCase().includes(needle)))&&(type==="all"||(type==="main"?!item.parentId:Boolean(item.parentId)))&&(parentFilter==="all"||item.parentId===parentFilter)&&(statusFilter==="all"||(statusFilter==="active"?item.active:!item.active));}).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name)),pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),safePage=Math.min(page,pageCount),visible=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
  useEffect(()=>setPage(1),[query,type,parentFilter,statusFilter]);
  return (
    <>
      <Head
        eyebrow="Catalogue structure"
        title="Categories"
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => create("main")} className="btn btn-dark">
              <Plus size={16} /> Main category
            </button>
            <button
              disabled={!main.length}
              onClick={() => create("sub")}
              className="btn disabled:opacity-40"
            >
              <Plus size={16} /> Subcategory
            </button>
          </div>
        }
      />
      <p className="mt-3 max-w-2xl text-sm text-[#5f574f]">Organise storefront navigation and product discovery. Edit details only when needed.</p>
      <div className="admin-resource-toolbar"><input className="field" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search name, slug or parent" aria-label="Search categories"/><select className="field" value={type} onChange={event=>setType(event.target.value)} aria-label="Category type"><option value="all">All types</option><option value="main">Main</option><option value="sub">Subcategories</option></select><select className="field" value={parentFilter} onChange={event=>setParentFilter(event.target.value)} aria-label="Parent category"><option value="all">All parents</option>{main.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="field" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} aria-label="Category status"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      <div className="admin-resource-list"><div className="admin-resource-row admin-resource-row--head"><span>Category</span><span>Type</span><span>Parent</span><span>Status</span><span>Navigation</span><span>Homepage</span><span>Action</span></div>{visible.length?visible.map(item=>{const parent=main.find(value=>value.id===item.parentId);return <div className="admin-resource-row" key={item.id}><span><b className="block">{item.name}</b><small className="mt-1 block text-[#8a7f73]">/{item.slug}</small></span><span>{item.parentId?"Subcategory":"Main"}</span><span>{parent?.name||"—"}</span><span className={`admin-status ${item.active?"admin-status--success":""}`}>{item.active?"Active":"Inactive"}</span><span>{item.showInNavigation?"Shown":"—"}</span><span>{item.showOnHomepage?"Shown":"—"}</span><button className="btn min-h-10 px-3" onClick={()=>setEditing(item)}>Edit</button></div>}):<div className="admin-empty m-4 p-10 text-center"><b>No matching results</b><button className="mt-3 block w-full text-xs underline" onClick={()=>{setQuery("");setType("all");setParentFilter("all");setStatusFilter("all");}}>Reset filters</button></div>}</div>
      <div className="admin-pagination"><span>Showing {visible.length} of {filtered.length}</span><div className="flex gap-2"><button className="btn" disabled={safePage<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><span className="self-center">{safePage} / {pageCount}</span><button className="btn" disabled={safePage>=pageCount} onClick={()=>setPage(value=>value+1)}>Next</button></div></div>
      {editing&&<AdminDrawer title={editing.name||"New category"} onClose={()=>setEditing(null)}><CategoryCard key={editing.id} item={editing} fresh={!store.data.categories.some(item=>item.id===editing.id)} onCancel={()=>setEditing(null)}/></AdminDrawer>}
    </>
  );
}
function CategoryCard({
  item,
  fresh = false,
  onCancel,
}: {
  item: Category;
  fresh?: boolean;
  onCancel?: () => void;
}) {
  const s = useStore(),
    [draft, setDraft] = useState(item),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => setDraft(item), [item]);
  const change = <K extends keyof Category>(key: K, value: Category[K]) =>
      setDraft((x) => ({ ...x, [key]: value })),
    name = (value: string) =>
      setDraft((x) => ({
        ...x,
        name: value,
        slug: !x.slug || x.slug === slugify(x.name) ? slugify(value) : x.slug,
      }));
  const parents = s.data.categories.filter(
      (category) => category.id !== draft.id && !category.parentId,
    ),
    childCount = s.data.categories.filter(
      (category) => category.parentId === draft.id,
    ).length,
    parent = s.data.categories.find(
      (category) => category.id === draft.parentId,
    );
  async function submit() {
    if (!draft.name.trim()) return setStatus("Name is required.");
    if (draft.parentId === draft.id)
      return setStatus("A category cannot be its own parent.");
    setBusy(true);
    setStatus("");
    try {
      await s.commit("categories", {
        ...draft,
        slug: draft.slug || slugify(draft.name),
        showInNavigation: draft.parentId ? false : draft.showInNavigation,
      });
      setStatus("Category saved.");
      onCancel?.();
    } catch (reason) {
      setStatus(
        reason instanceof Error
          ? reason.message
          : "Could not save category. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title={
        (draft.parentId ? "Subcategory" : "Main category") +
        " — " +
        (draft.name || "New category")
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category name" value={draft.name} onChange={name} />
        <Field
          label="Slug"
          value={draft.slug}
          onChange={(slug) => change("slug", slug)}
        />
        <label className="block text-xs">
          Parent category
          <select
            className="field mt-2"
            disabled={childCount > 0 && !draft.parentId}
            value={draft.parentId || ""}
            onChange={(e) => change("parentId", e.target.value || undefined)}
          >
            <option value="">None — main category</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Sort order"
          value={String(draft.sortOrder)}
          onChange={(value) => change("sortOrder", Number(value) || 0)}
        />
        <UploadField
          label="Category image (optional)"
          value={draft.imageUrl}
          onChange={(value) => change("imageUrl", value)}
        />
        <UploadField
          label="Mobile image (optional)"
          value={draft.mobileImageUrl || ""}
          onChange={(value) => change("mobileImageUrl", value)}
        />
      </div>
      {parent && (
        <p className="mt-3 border-l-2 border-[#96724f] pl-3 text-xs text-black/50">
          Storefront path: {parent.name} → {draft.name || "Subcategory"}
        </p>
      )}
      {childCount > 0 && !draft.parentId && (
        <p className="mt-3 text-xs text-amber-900">
          This main category has {childCount} subcategories. Move them first
          before changing this category into a subcategory.
        </p>
      )}
      <label className="mt-3 block text-xs">
        Description (optional)
        <textarea
          className="field mt-2"
          value={draft.description}
          onChange={(e) => change("description", e.target.value)}
        />
      </label>
      <Toggles
        items={[
          ["Published", draft.active, (v) => change("active", v)],
          ["Featured", draft.featured, (v) => change("featured", v)],
          ...(!draft.parentId
            ? [
                [
                  "Show in navigation",
                  draft.showInNavigation,
                  (v: boolean) => change("showInNavigation", v),
                ] as [string, boolean, (v: boolean) => void],
              ]
            : []),
          [
            "Show on homepage",
            draft.showOnHomepage,
            (v) => change("showOnHomepage", v),
          ],
        ]}
      />
      {draft.parentId && (
        <p className="mt-2 text-xs leading-5 text-black/45">
          Published subcategories appear automatically inside their main
          category menu and on that category’s shop page.
        </p>
      )}
      <EditorActions
        busy={busy}
        status={status}
        save={submit}
        cancel={() => {
          setDraft(item);
          onCancel?.();
        }}
      >
        {!fresh && (
          <button
            onClick={() =>
              confirm('Delete "' + item.name + '"?') &&
              s.remove("categories", item.id)
            }
            className="btn border-red-800 text-red-800"
          >
            Delete
          </button>
        )}
      </EditorActions>
    </Panel>
  );
}
function Collections() {
  const s = useStore(),
    [editing, setEditing] = useState<Collection|null>(null),
    [query,setQuery]=useState(""),
    [statusFilter,setStatusFilter]=useState("all"),
    [page,setPage]=useState(1),pageSize=25;
  const create=()=>setEditing({
      id: crypto.randomUUID(),
      name: "",
      slug: "",
      description: "",
      heroImage: "",
      active: false,
      showInNavigation: false,
      showOnHomepage: false,
      sortOrder: s.data.collections.length + 1,
    }),needle=query.trim().toLowerCase(),filtered=[...s.data.collections].filter(item=>(!needle||[item.name,item.slug,item.description].some(value=>String(value||"").toLowerCase().includes(needle)))&&(statusFilter==="all"||(statusFilter==="active"?item.active:!item.active))).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name)),pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),safePage=Math.min(page,pageCount),visible=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
  useEffect(()=>setPage(1),[query,statusFilter]);
  return (
    <>
      <Head
        eyebrow="How pieces are grouped"
        title="Collections"
        action={
          <button onClick={create} className="btn btn-dark">
            <Plus size={16} /> Add collection
          </button>
        }
      />
      <p className="mt-3 max-w-2xl text-sm text-[#5f574f]">Manage curated product groups without expanding every editor.</p>
      <div className="admin-resource-toolbar"><input className="field" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search collections" aria-label="Search collections"/><select className="field" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} aria-label="Collection status"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      <div className="admin-resource-list"><div className="admin-resource-row admin-resource-row--head"><span>Collection</span><span>Status</span><span>Navigation</span><span>Homepage</span><span>Order</span><span>Media</span><span>Action</span></div>{visible.length?visible.map(item=><div className="admin-resource-row" key={item.id}><span><b className="block">{item.name}</b><small className="mt-1 block text-[#8a7f73]">/{item.slug}</small></span><span className={`admin-status ${item.active?"admin-status--success":""}`}>{item.active?"Active":"Inactive"}</span><span>{item.showInNavigation?"Shown":"—"}</span><span>{item.showOnHomepage?"Shown":"—"}</span><span>{item.sortOrder}</span><span>{item.heroImage||item.videoUrl?"Ready":"—"}</span><button className="btn min-h-10 px-3" onClick={()=>setEditing(item)}>Edit</button></div>):<div className="admin-empty m-4 p-10 text-center"><b>No matching results</b><button className="mt-3 block w-full text-xs underline" onClick={()=>{setQuery("");setStatusFilter("all");}}>Reset filters</button></div>}</div>
      <div className="admin-pagination"><span>Showing {visible.length} of {filtered.length}</span><div className="flex gap-2"><button className="btn" disabled={safePage<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><span className="self-center">{safePage} / {pageCount}</span><button className="btn" disabled={safePage>=pageCount} onClick={()=>setPage(value=>value+1)}>Next</button></div></div>
      {editing&&<AdminDrawer title={editing.name||"New collection"} onClose={()=>setEditing(null)}><CollectionCard key={editing.id} item={editing} fresh={!s.data.collections.some(item=>item.id===editing.id)} onCancel={()=>setEditing(null)}/></AdminDrawer>}
    </>
  );
}
function CollectionCard({
  item,
  fresh = false,
  onCancel,
}: {
  item: Collection;
  fresh?: boolean;
  onCancel?: () => void;
}) {
  const s = useStore(),
    [draft, setDraft] = useState(item),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => setDraft(item), [item]);
  const change = <K extends keyof Collection>(key: K, value: Collection[K]) =>
    setDraft((x) => ({ ...x, [key]: value }));
  async function submit() {
    if (!draft.name.trim()) return setStatus("Name is required.");
    setBusy(true);
    try {
      await s.commit("collections", {
        ...draft,
        slug: draft.slug || slugify(draft.name),
      });
      setStatus("Collection saved.");
      onCancel?.();
    } catch {
      setStatus("Could not save collection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title={draft.name || "New collection"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Title"
          value={draft.name}
          onChange={(value) => change("name", value)}
        />
        <Field
          label="Slug"
          value={draft.slug}
          onChange={(value) => change("slug", value)}
        />
        <UploadField
          label="Hero image"
          value={draft.heroImage}
          onChange={(value) => change("heroImage", value)}
        />
        <UploadField
          label="Optional video"
          value={draft.videoUrl || ""}
          onChange={(value) => change("videoUrl", value)}
          accept="video/mp4,video/webm"
        />
      </div>
      <label className="mt-3 block text-xs">
        Description
        <textarea
          className="field mt-2"
          value={draft.description}
          onChange={(e) => change("description", e.target.value)}
        />
      </label>
      <Toggles
        items={[
          ["Published", draft.active, (v) => change("active", v)],
          [
            "Navigation",
            draft.showInNavigation,
            (v) => change("showInNavigation", v),
          ],
          [
            "Homepage",
            draft.showOnHomepage,
            (v) => change("showOnHomepage", v),
          ],
        ]}
      />
      <EditorActions
        busy={busy}
        status={status}
        save={submit}
        cancel={() => {
          setDraft(item);
          onCancel?.();
        }}
      >
        {!fresh && (
          <button
            onClick={() =>
              confirm(`Delete "${item.name}"?`) &&
              s.remove("collections", item.id)
            }
            className="btn border-red-800 text-red-800"
          >
            Delete
          </button>
        )}
      </EditorActions>
    </Panel>
  );
}
function Navigation() {
  const s = useStore(),
    [creating, setCreating] = useState(false);
  const blank: NavigationItem = {
    id: crypto.randomUUID(),
    label: "",
    linkType: "page",
    target: "/shop",
    visible: true,
    sortOrder: s.data.navigation.length + 1,
  };
  return (
    <>
      <Head
        eyebrow="Storefront header"
        title="Navigation"
        action={
          <button onClick={() => setCreating(true)} className="btn btn-dark">
            <Plus size={16} /> Add item
          </button>
        }
      />
      <p className="mt-4 max-w-2xl text-sm leading-7 text-black/55">
        NEW, SHOP and ABOUT are permanent storefront links. Main categories
        marked “Show in navigation” are inserted automatically between them.
        Every published subcategory under that main category appears
        automatically in its dropdown. Use this editor only for optional
        collections, campaigns or custom links.
      </p>
      {creating && (
        <div className="mt-7">
          <NavRow item={blank} fresh onCancel={() => setCreating(false)} />
        </div>
      )}
      <div className="mt-7 grid gap-2">
        {[...s.data.navigation]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((n) => (
            <NavRow key={n.id} item={n} />
          ))}
      </div>
    </>
  );
}
function NavRow({
  item,
  fresh = false,
  onCancel,
}: {
  item: NavigationItem;
  fresh?: boolean;
  onCancel?: () => void;
}) {
  const s = useStore(),
    [draft, setDraft] = useState(item),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => setDraft(item), [item]);
  function changeType(linkType: NavigationItem["linkType"]) {
    const target =
      linkType === "category"
        ? s.data.categories.find((c) => c.active && !c.parentId)?.id || ""
        : linkType === "collection"
          ? s.data.collections.find((c) => c.active)?.id || ""
          : linkType === "page"
            ? "/shop"
            : "";
    setDraft({ ...draft, linkType, target });
  }
  async function submit() {
    if (!draft.label.trim()) return setStatus("Label is required.");
    if (!draft.target.trim()) return setStatus("Choose a destination.");
    setBusy(true);
    setStatus("");
    try {
      await s.commit("navigation", draft);
      setStatus("Navigation saved.");
      onCancel?.();
    } catch (reason) {
      setStatus(
        reason instanceof Error ? reason.message : "Could not save navigation.",
      );
    } finally {
      setBusy(false);
    }
  }
  const target =
    draft.linkType === "category" ? (
      <select
        className="field"
        value={draft.target}
        onChange={(e) => setDraft({ ...draft, target: e.target.value })}
      >
        <option value="">Select main category</option>
        {s.data.categories
          .filter((c) => c.active && !c.parentId)
          .map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
      </select>
    ) : draft.linkType === "collection" ? (
      <select
        className="field"
        value={draft.target}
        onChange={(e) => setDraft({ ...draft, target: e.target.value })}
      >
        <option value="">Select collection</option>
        {s.data.collections
          .filter((col) => col.active)
          .map((col) => (
            <option key={col.id} value={col.id}>
              {col.name}
            </option>
          ))}
      </select>
    ) : (
      <input
        className="field"
        value={draft.target}
        placeholder={draft.linkType === "url" ? "https://…" : "/shop"}
        onChange={(e) => setDraft({ ...draft, target: e.target.value })}
      />
    );
  return (
    <div className="bg-[#f6f3ed] p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_150px_1fr_auto]">
        <input
          className="field"
          placeholder="Menu label"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        <select
          className="field"
          value={draft.linkType}
          onChange={(e) =>
            changeType(e.target.value as NavigationItem["linkType"])
          }
        >
          <option>category</option>
          <option>collection</option>
          <option>page</option>
          <option>url</option>
        </select>
        {target}
        <button
          onClick={() => setDraft({ ...draft, visible: !draft.visible })}
          className="min-h-11 px-3 text-xs"
        >
          {draft.visible ? "VISIBLE" : "HIDDEN"}
        </button>
      </div>
      <EditorActions
        busy={busy}
        status={status}
        save={submit}
        cancel={() => {
          setDraft(item);
          onCancel?.();
        }}
      >
        {!fresh && (
          <button
            onClick={() =>
              confirm('Delete "' + item.label + '"?') &&
              s.remove("navigation", item.id)
            }
            className="btn border-red-800 text-red-800"
          >
            Delete
          </button>
        )}
      </EditorActions>
    </div>
  );
}
export function Homepage() {
  const s = useStore(),
    [creating, setCreating] = useState(false),
    blank: HomepageSection = {
      id: crypto.randomUUID(),
      type: "editorial-image",
      enabled: false,
      title: "New section",
      subtitle: "",
      textPosition: "left",
      overlay: 25,
      spacing: "normal",
      sortOrder: s.data.homepageSections.length + 1,
    };
  return (
    <>
      <Head
        eyebrow="Controlled page builder"
        title="Homepage"
        action={
          <button onClick={() => setCreating(true)} className="btn btn-dark">
            <Plus size={16} /> Add section
          </button>
        }
      />
      <HeroEditor />
      {creating && (
        <div className="mt-8">
          <SectionRow item={blank} fresh onCancel={() => setCreating(false)} />
        </div>
      )}
      <div className="mt-8 grid gap-3">
        {[...s.data.homepageSections]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((x) => (
            <SectionRow key={x.id} item={x} />
          ))}
      </div>
    </>
  );
}
function HeroEditor() {
  return (
    <Panel title="Hero">
      <div className="border-l-2 border-[#96724f] bg-white/40 px-4 py-4 text-sm leading-6 text-black/60">
        <p className="font-medium text-black/80">
          Hero is managed from the website code.
        </p>
        <p className="mt-1">
          Localhost and Vercel now use the same hero configuration and video
          asset. Edit the hero in VS Code, then commit and push it to deploy the
          exact same version.
        </p>
        <p className="mt-2 text-xs">
          Current video: <code>/media/hero-final-v2.mp4</code>
        </p>
      </div>
    </Panel>
  );
}
function SectionRow({
  item,
  fresh = false,
  onCancel,
}: {
  item: HomepageSection;
  fresh?: boolean;
  onCancel?: () => void;
}) {
  const s = useStore(),
    [draft, setDraft] = useState(item),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => setDraft(item), [item]);
  async function submit() {
    setBusy(true);
    try {
      await s.commit("homepageSections", draft);
      setStatus("Section saved.");
      onCancel?.();
    } catch {
      setStatus("Could not save section.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-[#f6f3ed] p-4">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr_1fr_auto]">
        <select
          className="field"
          value={draft.type}
          onChange={(e) =>
            setDraft({
              ...draft,
              type: e.target.value as HomepageSection["type"],
            })
          }
        >
          {[
            "product-grid",
            "collection-feature",
            "category-grid",
            "editorial-image",
            "full-width-campaign",
            "text-statement",
            "new-arrivals",
            "featured-products",
            "social",
            "service-strip",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input
          className="field"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <input
          className="field"
          value={draft.desktopMedia || ""}
          placeholder="Desktop media URL"
          onChange={(e) => setDraft({ ...draft, desktopMedia: e.target.value })}
        />
        <button
          onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
          className="min-h-11 text-xs"
        >
          {draft.enabled ? "VISIBLE" : "HIDDEN"}
        </button>
      </div>
      <EditorActions
        busy={busy}
        status={status}
        save={submit}
        cancel={() => {
          setDraft(item);
          onCancel?.();
        }}
      >
        {!fresh && (
          <button
            onClick={() =>
              confirm(`Delete "${item.title}"?`) &&
              s.remove("homepageSections", item.id)
            }
            className="btn border-red-800 text-red-800"
          >
            Delete
          </button>
        )}
      </EditorActions>
    </div>
  );
}
function SizeCharts() {
  const s = useStore(),
    [creating, setCreating] = useState(false),
    blank: SizeChart = {
      id: crypto.randomUUID(),
      name: "New Size Chart",
      unit: "",
      columns: [],
      rows: [],
      imageUrl: "",
      notes: "",
    };
  return (
    <>
      <Head
        eyebrow="Product-specific sizing"
        title="Size Charts"
        action={
          <button onClick={() => setCreating(true)} className="btn btn-dark">
            <Plus size={16} /> Add chart
          </button>
        }
      />
      <p className="mt-4 max-w-3xl text-sm leading-7 text-black/55">
        Size charts are image-only. Upload the supplier chart and assign it to
        the matching product. You can also upload or replace a chart directly
        inside the Product editor.
      </p>
      {creating && (
        <div className="mt-7">
          <ChartCard item={blank} fresh onCancel={() => setCreating(false)} />
        </div>
      )}
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        {s.data.sizeCharts.map((chart) => (
          <ChartCard key={chart.id} item={chart} />
        ))}
      </div>
    </>
  );
}
function ChartCard({
  item,
  fresh = false,
  onCancel,
}: {
  item: SizeChart;
  fresh?: boolean;
  onCancel?: () => void;
}) {
  const s = useStore(),
    [draft, setDraft] = useState(item),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => setDraft(item), [item]);
  async function submit() {
    if (!draft.name.trim()) return setStatus("Name is required.");
    if (!draft.imageUrl?.trim())
      return setStatus("Upload the size-chart image first.");
    setBusy(true);
    setStatus("");
    try {
      await s.commit("sizeCharts", {
        ...draft,
        unit: "",
        columns: [],
        rows: [],
        notes: "",
      });
      setStatus("Size chart saved.");
      onCancel?.();
    } catch (reason) {
      setStatus(
        reason instanceof Error ? reason.message : "Could not save size chart.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title={draft.name}>
      <div className="grid gap-4">
        <Field
          label="Name"
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
        />
        <UploadField
          label="Supplier size-chart image"
          value={draft.imageUrl || ""}
          onChange={(imageUrl) => setDraft({ ...draft, imageUrl })}
        />
        {draft.imageUrl && (
          <div className="border border-black/10 bg-white p-3">
            <img
              src={draft.imageUrl}
              alt={draft.name}
              className="mx-auto max-h-[520px] w-full object-contain"
            />
          </div>
        )}
        <p className="text-xs leading-5 text-black/45">
          No text measurements are required. Customers will see this image when
          they open Size Guide on the product page.
        </p>
      </div>
      <EditorActions
        busy={busy}
        status={status}
        save={submit}
        cancel={() => {
          setDraft(item);
          onCancel?.();
        }}
      >
        {!fresh && (
          <button
            onClick={() =>
              confirm('Delete "' + item.name + '"?') &&
              s.remove("sizeCharts", item.id)
            }
            className="btn border-red-800 text-red-800"
          >
            Delete
          </button>
        )}
      </EditorActions>
    </Panel>
  );
}

type DeliveryNotice = {
  tone: "success" | "error";
  message: string;
};

function DeliveryRates() {
  const s = useStore(),
    [couriers, setCouriers] = useState(s.admin.couriers),
    [rates, setRates] = useState(s.admin.deliveryRates),
    [defaultId, setDefaultId] = useState(
      s.data.settings.defaultCourierProviderId,
    ),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<DeliveryNotice | null>(null),
    [rateCards, setRateCards] = useState<Array<{courierProviderId:string;version:number;status:string;importedAt:string;total:number}>>([]),
    [editingCourier, setEditingCourier] = useState<string | null>(null),
    [editingZone, setEditingZone] = useState<string | null>(null);

  useEffect(() => {
    setCouriers(s.admin.couriers);
    setRates(s.admin.deliveryRates);
    setDefaultId(s.data.settings.defaultCourierProviderId);
  }, [
    s.admin.couriers,
    s.admin.deliveryRates,
    s.data.settings.defaultCourierProviderId,
  ]);

  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => { void adminApi.get<Array<{courierProviderId:string;version:number;status:string;importedAt:string;total:number}>>("listCourierRateCards").then(setRateCards).catch(()=>undefined); }, []);

  const updateCourier = (id: string, patch: Partial<CourierProvider>) =>
    setCouriers((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

  const updateRate = (id: string, patch: Partial<DeliveryRate>) =>
    setRates((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

  const addCourier = () => {
    const id = crypto.randomUUID();
    setCouriers((items) => [
      ...items,
      {
        id,
        name: "",
        phone: "",
        notes: "",
        pricingMode: "flat",
        flatRate: 0,
        active: true,
        minimumDeliveryDays: 2,
        maximumDeliveryDays: 4,
      },
    ]);
    if (!defaultId) setDefaultId(id);
    setEditingCourier(id);
    setNotice(null);
  };

  const removeCourier = (id: string) => {
    const next = couriers.filter((item) => item.id !== id);
    setCouriers(next);
    setRates((items) =>
      items.filter((item) => item.courierProviderId !== id),
    );
    if (defaultId === id)
      setDefaultId(next.find((item) => item.active)?.id || "");
    setNotice(null);
  };

  const changeActive = (id: string, active: boolean) => {
    updateCourier(id, { active });
    if (!active && defaultId === id) {
      const next = couriers.find((item) => item.id !== id && item.active);
      setDefaultId(next?.id || "");
    } else if (active && !defaultId) {
      setDefaultId(id);
    }
  };

  const changePricingMode = (
    courier: CourierProvider,
    pricingMode: CourierProvider["pricingMode"],
  ) => {
    updateCourier(courier.id, { pricingMode });
    if (pricingMode !== "zone") return;
    setRates((items) => {
      if (items.some((item) => item.courierProviderId === courier.id))
        return items;
      return [
        ...items,
        {
          id: crypto.randomUUID(),
          courierProviderId: courier.id,
          name: "All other districts",
          fee: courier.flatRate || 0,
          active: true,
          districts: [],
          cities: [],
          postalCodes: [],
          fallback: true,
          sortOrder: items.length + 1,
        },
      ];
    });
  };

  const addZone = (courier: CourierProvider) => {
    const id = crypto.randomUUID();
    setRates((items) => [
      ...items,
      {
        id,
        courierProviderId: courier.id,
        name: "New delivery area",
        fee: courier.flatRate || 0,
        active: true,
        districts: [],
        cities: [],
        postalCodes: [],
        fallback: false,
        sortOrder: items.length + 1,
      },
    ]);
    setEditingZone(id);
  };

  const setFallback = (courierId: string, rateId: string) =>
    setRates((items) =>
      items.map((item) =>
        item.courierProviderId !== courierId
          ? item
          : { ...item, fallback: item.id === rateId },
      ),
    );

  const fail = (message: string) => {
    setNotice({ tone: "error", message });
    return false;
  };

  async function submit(nextDefaultId = defaultId) {
    setNotice(null);

    const selected = couriers.find((item) => item.id === nextDefaultId);
    if (!selected?.active)
      return fail("Choose an active default courier before saving.");

    for (const courier of couriers) {
      if (!courier.name.trim())
        return fail("Give every courier a name before saving.");
      if (!Number.isFinite(courier.flatRate) || courier.flatRate < 0)
        return fail(courier.name + ": delivery fee must be 0 or more.");

      if (courier.pricingMode === "zone") {
        const courierRates = rates.filter(
          (rate) => rate.courierProviderId === courier.id,
        );
        if (!courierRates.length)
          return fail(courier.name + ": add at least one delivery area.");
        if (
          courierRates.some(
            (rate) =>
              !rate.name.trim() || !Number.isFinite(rate.fee) || rate.fee < 0,
          )
        )
          return fail(
            courier.name + ": every delivery area needs a name and valid fee.",
          );
        if (
          courierRates.filter((rate) => rate.active && rate.fallback).length !==
          1
        )
          return fail(
            courier.name + ": choose exactly one fallback delivery area.",
          );
        const emptyArea = courierRates.find(
          (rate) =>
            rate.active &&
            !rate.fallback &&
            !rate.districts.length &&
            !rate.cities.length &&
            !rate.postalCodes.length,
        );
        if (emptyArea)
          return fail(
            emptyArea.name +
              ": choose at least one district, or make it the fallback area.",
          );
      }
    }

    setBusy(true);
    try {
      await s.saveCourierConfig(couriers, rates, nextDefaultId);
      setNotice({
        tone: "success",
        message: "Delivery settings saved",
      });
    } catch (reason) {
      setNotice({
        tone: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "Could not save delivery settings.",
      });
    } finally {
      setBusy(false);
    }
  }

  const makeDefault = async (courier: CourierProvider) => {
    if (!courier.active || courier.id === defaultId || busy) return;
    setDefaultId(courier.id);
    await submit(courier.id);
  };

  const reset = () => {
    setCouriers(s.admin.couriers);
    setRates(s.admin.deliveryRates);
    setDefaultId(s.data.settings.defaultCourierProviderId);
    setNotice(null);
  };

  const selected = couriers.find((item) => item.id === defaultId);
  const dirty = JSON.stringify({ couriers, rates, defaultId }) !== JSON.stringify({
    couriers: s.admin.couriers,
    rates: s.admin.deliveryRates,
    defaultId: s.data.settings.defaultCourierProviderId,
  });
  const zoneBeingEdited = rates.find((rate) => rate.id === editingZone);

  return (
    <div className="mx-auto max-w-[1120px]">
      {notice && (
        <div
          className={
            "fixed right-5 top-20 z-[100] w-[min(390px,calc(100vw-40px))] rounded-xl border px-4 py-4 shadow-2xl " +
            (notice.tone === "success"
              ? "border-emerald-900/15 bg-[#f2f8f3] text-emerald-950"
              : "border-red-900/15 bg-[#fff5f2] text-red-950")
          }
          role="status"
        >
          <div className="flex items-start gap-3">
            <span
              className={
                "mt-1 h-2.5 w-2.5 shrink-0 rounded-full " +
                (notice.tone === "success" ? "bg-emerald-700" : "bg-red-700")
              }
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[.12em]">
                {notice.tone === "success" ? "Saved" : "Check this"}
              </p>
              <p className="mt-1 text-xs leading-5 opacity-75">
                {notice.message}
              </p>
            </div>
            <button
              type="button"
              className="text-lg leading-none opacity-40 hover:opacity-80"
              onClick={() => setNotice(null)}
              aria-label="Close message"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <Head
        eyebrow="Checkout logistics"
        title="Delivery"
        action={
          <button className="btn btn-dark" onClick={addCourier}>
            <Plus size={15} /> Add courier
          </button>
        }
      />

      <section className="mt-7 overflow-hidden rounded-2xl border border-black/[.07] bg-[#f8f6f1] shadow-[0_18px_60px_rgba(17,17,15,.05)]">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/45">
              Checkout courier
            </p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-.02em]">
              Keep delivery simple.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
              Customers never choose a courier. Set one default courier here,
              then choose either one nationwide price or district-based prices.
            </p>
          </div>

          <div className="rounded-xl border border-black/[.07] bg-white p-4 text-xs">
            <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-black/40">Current default</p>
            <p className="mt-2 font-medium">{selected?.name || "No default courier"}</p>
            <p className="mt-1 text-[10px] leading-5 text-black/45">Use Make default on an active courier below to change checkout.</p>
          </div>
        </div>

        {selected?.active && (
          <div className="flex flex-wrap items-center gap-2 border-t border-black/[.07] bg-white/55 px-5 py-4 text-xs sm:px-7">
            <span className="rounded-full bg-black px-2.5 py-1 text-[9px] uppercase tracking-[.14em] text-white">
              Live checkout
            </span>
            <b>{selected.name || "New courier"}</b>
            <span className="text-black/45">
              {selected.pricingMode === "flat"
                ? money(selected.flatRate) + " nationwide"
                : "District-based pricing"}
            </span>
          </div>
        )}
      </section>

      {!!couriers.length && <div className="mt-5 grid gap-3">
        {couriers.map((courier) => { const courierRates=rates.filter((rate)=>rate.courierProviderId===courier.id),activeCard=rateCards.find((card)=>card.courierProviderId===courier.id&&card.status==="active"); return <article key={courier.id} className="grid gap-4 rounded-2xl border border-black/[.07] bg-white p-5 shadow-[0_8px_30px_rgba(17,17,15,.03)] md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
          <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-medium">{courier.name || "Unnamed courier"}</h3>{courier.id===defaultId&&<span className="admin-status admin-status--info">Default</span>}<span className={courier.active?"admin-status admin-status--success":"admin-status"}>{courier.active?"Active":"Inactive"}</span></div><p className="mt-2 text-xs text-black/45">{courier.pricingMode==="flat"?`Flat rate · ${money(courier.flatRate)} nationwide`:`Zone pricing · ${courierRates.length} area${courierRates.length===1?"":"s"}`}</p></div>
          <div className="text-xs text-black/45">{activeCard?<>Imported rate card v{activeCard.version}<span className="mt-1 block text-[10px]">{new Date(activeCard.importedAt).toLocaleDateString()} · {activeCard.total.toLocaleString()} rates</span></>:courier.pricingMode==="zone"?`${courierRates.filter((rate)=>rate.active).length} active delivery zones`:"Simple checkout pricing"}</div>
          <div className="flex flex-wrap gap-2"><button type="button" className="btn" onClick={()=>setEditingCourier(courier.id)}>Manage</button>{courier.id!==defaultId&&<button type="button" className="btn btn-dark" disabled={busy||!courier.active} title={courier.active?"Make this the checkout courier":"Activate this courier before making it default"} onClick={()=>void makeDefault(courier)}>Make default</button>}</div>
        </article>;})}
      </div>}

      {!couriers.length && (
        <section className="mt-5 rounded-2xl border border-dashed border-black/15 bg-white/45 p-8 text-center sm:p-12">
          <p className="text-lg font-medium">No courier configured</p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-black/45">
            Add your courier, enter the actual delivery price, and save. That
            is enough for a normal nationwide setup.
          </p>
          <button className="btn btn-dark mt-5" onClick={addCourier}>
            <Plus size={15} /> Add first courier
          </button>
        </section>
      )}

      {editingCourier && <AdminDrawer title={couriers.find((courier)=>courier.id===editingCourier)?.name || "Courier details"} onClose={()=>setEditingCourier(null)}><div className="grid gap-5">
        {couriers.filter((courier)=>courier.id===editingCourier).map((courier, courierIndex) => {
          const courierRates = rates.filter(
              (rate) => rate.courierProviderId === courier.id,
            ),
            isDefault = courier.id === defaultId;

          return (
            <section
              key={courier.id}
              className="overflow-hidden rounded-2xl border border-black/[.07] bg-white shadow-[0_10px_40px_rgba(17,17,15,.035)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/[.07] px-5 py-4 sm:px-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/35">
                    Courier {String(courierIndex + 1).padStart(2, "0")}
                  </span>
                  {isDefault && (
                    <span className="rounded-full bg-black px-2.5 py-1 text-[9px] uppercase tracking-[.12em] text-white">
                      Default
                    </span>
                  )}
                  <span
                    className={
                      courier.active
                        ? "rounded-full bg-emerald-900/[.06] px-2.5 py-1 text-[9px] uppercase tracking-[.12em] text-emerald-900"
                        : "rounded-full bg-black/[.04] px-2.5 py-1 text-[9px] uppercase tracking-[.12em] text-black/40"
                    }
                  >
                    {courier.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-800/75 underline underline-offset-4 hover:text-red-900"
                  onClick={() => confirm(`Remove ${courier.name || "this courier"} and its unsaved delivery zones?`) && removeCourier(courier.id)}
                >
                  Remove
                </button>
              </div>

              <div className="p-5 sm:p-7">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
                  <label className="block text-xs font-medium">
                    Courier name
                    <input
                      className="field mt-2"
                      value={courier.name}
                      placeholder="e.g. Domex, Prompt Xpress"
                      onChange={(event) =>
                        updateCourier(courier.id, {
                          name: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="flex min-h-[52px] items-center gap-3 rounded-xl border border-black/[.08] bg-[#f8f6f1] px-4 text-xs">
                    <input
                      className="h-5 w-5 accent-black"
                      type="checkbox"
                      checked={courier.active}
                      onChange={(event) =>
                        changeActive(courier.id, event.target.checked)
                      }
                    />
                    <span>
                      <b>Active</b>
                      <small className="mt-0.5 block text-[10px] leading-4 text-black/40">
                        Available for checkout
                      </small>
                    </span>
                  </label>
                </div>

                <div className="mt-7 border-t border-black/[.07] pt-6">
                  <p className="text-xs font-medium">Delivery pricing</p>
                  <p className="mt-1 text-[11px] leading-5 text-black/42">
                    Choose the option that matches the rate card your courier
                    gave you.
                  </p>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      className={
                        "rounded-xl border p-4 text-left transition " +
                        (courier.pricingMode === "flat"
                          ? "border-black bg-black text-white"
                          : "border-black/[.08] bg-[#faf9f6] hover:border-black/25")
                      }
                      onClick={() => changePricingMode(courier, "flat")}
                    >
                      <b className="block text-sm">One price nationwide</b>
                      <span
                        className={
                          "mt-1 block text-[11px] leading-5 " +
                          (courier.pricingMode === "flat"
                            ? "text-white/60"
                            : "text-black/42")
                        }
                      >
                        Best when the courier charges one delivery fee.
                      </span>
                    </button>

                    <button
                      type="button"
                      className={
                        "rounded-xl border p-4 text-left transition " +
                        (courier.pricingMode === "zone"
                          ? "border-black bg-black text-white"
                          : "border-black/[.08] bg-[#faf9f6] hover:border-black/25")
                      }
                      onClick={() => changePricingMode(courier, "zone")}
                    >
                      <b className="block text-sm">Different by district</b>
                      <span
                        className={
                          "mt-1 block text-[11px] leading-5 " +
                          (courier.pricingMode === "zone"
                            ? "text-white/60"
                            : "text-black/42")
                        }
                      >
                        Pick districts with buttons. No manual lists needed.
                      </span>
                    </button>
                  </div>
                </div>

                {courier.pricingMode === "flat" ? (
                  <div className="mt-5 max-w-md rounded-xl border border-black/[.08] bg-[#f8f6f1] p-5">
                    <label className="block text-xs font-medium">
                      Nationwide delivery fee
                      <div className="mt-2 flex items-center overflow-hidden rounded-lg border border-black/10 bg-white">
                        <span className="border-r border-black/[.07] px-4 text-[11px] font-medium text-black/40">
                          LKR
                        </span>
                        <input
                          className="min-h-[52px] min-w-0 flex-1 border-0 bg-transparent px-4 text-base outline-none"
                          type="number"
                          min="0"
                          value={courier.flatRate}
                          onChange={(event) =>
                            updateCourier(courier.id, {
                              flatRate: Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    </label>
                    <p className="mt-2 text-[10px] leading-5 text-black/40">
                      This is the only price required for a nationwide setup.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium">District pricing</p>
                        <p className="mt-1 text-[11px] leading-5 text-black/42">
                          Create special areas, then keep one fallback area for
                          every district that does not match.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => addZone(courier)}
                      >
                        <Plus size={14} /> Add area
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4">
                      {courierRates.map((rate) => (
                        <div
                          key={rate.id}
                          className="rounded-xl border border-black/[.08] bg-[#faf9f6] p-4 sm:p-5"
                        >
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px]">
                            <label className="block text-xs font-medium">
                              Area name
                              <input
                                className="field mt-2"
                                value={rate.name}
                                placeholder="e.g. Colombo & Gampaha"
                                onChange={(event) =>
                                  updateRate(rate.id, {
                                    name: event.target.value,
                                  })
                                }
                              />
                            </label>

                            <label className="block text-xs font-medium">
                              Delivery fee
                              <div className="mt-2 flex items-center overflow-hidden rounded-lg border border-black/10 bg-white">
                                <span className="border-r border-black/[.07] px-3 text-[10px] text-black/40">
                                  LKR
                                </span>
                                <input
                                  className="min-h-[48px] min-w-0 flex-1 border-0 bg-transparent px-3 outline-none"
                                  type="number"
                                  min="0"
                                  value={rate.fee}
                                  onChange={(event) =>
                                    updateRate(rate.id, {
                                      fee: Number(event.target.value),
                                    })
                                  }
                                />
                              </div>
                            </label>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-black/[.08] bg-white px-3 text-xs">
                              <input
                                className="h-4 w-4 accent-black"
                                type="checkbox"
                                checked={rate.active}
                                onChange={(event) =>
                                  updateRate(rate.id, {
                                    active: event.target.checked,
                                  })
                                }
                              />
                              Active
                            </label>

                            <button
                              type="button"
                              className={
                                rate.fallback
                                  ? "min-h-10 rounded-lg border border-black bg-black px-3 text-xs text-white"
                                  : "min-h-10 rounded-lg border border-black/[.08] bg-white px-3 text-xs"
                              }
                              onClick={() => setFallback(courier.id, rate.id)}
                            >
                              {rate.fallback
                                ? "Fallback for other districts ✓"
                                : "Use as fallback"}
                            </button>

                            <button
                              type="button"
                              className="btn"
                              onClick={() => setEditingZone(rate.id)}
                            >
                              Edit details
                            </button>

                            <button
                              type="button"
                              className="ml-auto min-h-10 px-2 text-xs text-red-800/75"
                              onClick={() =>
                                setRates((items) =>
                                  items.filter((item) => item.id !== rate.id),
                                )
                              }
                            >
                              <Trash2 size={14} className="inline" /> Remove
                            </button>
                          </div>

                          {rate.fallback ? (
                            <p className="mt-4 rounded-lg bg-black/[.035] px-4 py-3 text-[10px] leading-5 text-black/45">
                              This price is used automatically for every
                              district not selected in another active area.
                            </p>
                          ) : (
                            <div className="mt-5">
                              <DistrictPicker
                                values={rate.districts}
                                onChange={(districts) =>
                                  updateRate(rate.id, { districts })
                                }
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <details className="mt-6 rounded-xl border border-black/[.07] bg-[#faf9f6]">
                  <summary className="cursor-pointer list-none px-4 py-3 text-xs font-medium">
                    Optional courier details
                    <span className="ml-2 font-normal text-black/35">
                      phone & internal note
                    </span>
                  </summary>
                  <div className="grid gap-4 border-t border-black/[.07] p-4 md:grid-cols-2">
                    <label className="block text-xs">
                      Contact phone
                      <input
                        className="field mt-2"
                        value={courier.phone || ""}
                        onChange={(event) =>
                          updateCourier(courier.id, {
                            phone: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="block text-xs">
                      Internal note
                      <textarea
                        className="field mt-2 resize-y"
                        rows={2}
                        value={courier.notes || ""}
                        onChange={(event) =>
                          updateCourier(courier.id, {
                            notes: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </details>
              </div>
            </section>
          );
        })}
        <CourierRateSheetImport couriers={couriers} courierId={editingCourier} />
      </div></AdminDrawer>}

      {zoneBeingEdited && <AdminDrawer title={zoneBeingEdited.name || "Delivery zone"} onClose={() => setEditingZone(null)}><div className="space-y-5">
        <Panel title="Zone identity"><Field label="Zone name" value={zoneBeingEdited.name} onChange={(name) => updateRate(zoneBeingEdited.id,{name})}/><div className="text-xs">Courier<p className="field mt-2 flex items-center">{couriers.find((courier)=>courier.id===zoneBeingEdited.courierProviderId)?.name || "Unnamed courier"}</p></div></Panel>
        <Panel title="Price"><label className="block text-xs">Delivery fee (LKR)<input className="field mt-2" type="number" min="0" value={zoneBeingEdited.fee} onChange={(event) => updateRate(zoneBeingEdited.id,{fee:Number(event.target.value)})}/></label></Panel>
        <Panel title="District coverage"><DistrictPicker values={zoneBeingEdited.districts} onChange={(districts) => updateRate(zoneBeingEdited.id,{districts})}/></Panel>
        <Panel title="Cities / Areas"><textarea className="field min-h-28" value={zoneBeingEdited.cities.join("\n")} onChange={(event) => updateRate(zoneBeingEdited.id,{cities:event.target.value.split(/[,\n]/).map((value)=>value.trim()).filter(Boolean)})} placeholder="One city or area per line" /></Panel>
        <Panel title="Postal codes"><textarea className="field min-h-28" value={zoneBeingEdited.postalCodes.join("\n")} onChange={(event) => updateRate(zoneBeingEdited.id,{postalCodes:event.target.value.split(/[,\n]/).map((value)=>value.trim()).filter(Boolean)})} placeholder="One postal code or prefix per line" /></Panel>
        <Panel title="State & priority"><Toggles items={[["Active",zoneBeingEdited.active,(active)=>updateRate(zoneBeingEdited.id,{active})],["Fallback",zoneBeingEdited.fallback,(fallback)=>fallback?setFallback(zoneBeingEdited.courierProviderId || "",zoneBeingEdited.id):updateRate(zoneBeingEdited.id,{fallback:false})]]}/><label className="block text-xs">Sort order<input className="field mt-2" type="number" min="0" value={zoneBeingEdited.sortOrder} onChange={(event) => updateRate(zoneBeingEdited.id,{sortOrder:Number(event.target.value)})}/></label><div className="mt-5 rounded-xl bg-black/[.04] p-4 text-xs leading-6"><b className="block">Matching priority</b>Postal code<br/>→ City / Area<br/>→ District<br/>→ Outstation / Fallback</div></Panel>
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-black/10 bg-[#e9e5de]/95 p-4 backdrop-blur"><span className="text-xs text-amber-800">{dirty ? "Unsaved changes" : ""}</span><div className="flex gap-2"><button type="button" className="btn" onClick={() => setEditingZone(null)}>Close</button><button type="button" className="btn btn-dark" disabled={busy||!dirty} onClick={() => void submit()}>{busy ? "SAVING…" : "SAVE DELIVERY SETTINGS"}</button></div></div>
      </div></AdminDrawer>}

      {!!couriers.length && (
        <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/10 bg-[#f8f6f1]/95 p-4 shadow-[0_18px_55px_rgba(17,17,15,.14)] backdrop-blur sm:px-5">
          <div>
            <p className="text-xs font-medium">{dirty ? "Unsaved changes" : "Delivery settings are up to date"}</p>
            <p className="mt-1 text-[10px] text-black/40">
              Nothing changes for customers until you press Save delivery.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn"
              disabled={busy || !dirty}
              onClick={reset}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn-dark min-w-[150px]"
              disabled={busy || !dirty}
              onClick={() => void submit()}
            >
              {busy ? "SAVING…" : "SAVE DELIVERY SETTINGS"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DistrictPicker({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const selected = new Set(values);
  const toggle = (district: string) =>
    onChange(
      selected.has(district)
        ? values.filter((value) => value !== district)
        : [...values, district],
    );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">Select districts</p>
          <p className="mt-1 text-[10px] leading-4 text-black/40">
            Click once to include a district. Click again to remove it.
          </p>
        </div>
        {!!values.length && (
          <button
            type="button"
            className="text-[10px] text-black/45 underline underline-offset-4"
            onClick={() => onChange([])}
          >
            Clear selection
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {sriLankaDistricts.map((district) => (
          <button
            key={district}
            type="button"
            onClick={() => toggle(district)}
            className={
              selected.has(district)
                ? "rounded-full border border-black bg-black px-3 py-2 text-[10px] text-white"
                : "rounded-full border border-black/[.08] bg-white px-3 py-2 text-[10px] text-black/60 hover:border-black/30"
            }
          >
            {district}
          </button>
        ))}
      </div>
    </div>
  );
}

type PreorderAdminDraft = {
  confirmedPrice: string;
  notes: string;
  address1: string;
  address2: string;
  city: string;
  district: string;
  postalCode: string;
};
type PreorderFulfillmentConfig={methods:Array<{type:"flat"|"area_group"|"pickup";displayName:string;active:boolean}>;pickupLocations:Array<{id:string;name:string;address:string;active:boolean}>};
function Preorders() {
  const store = useStore(),
    location = useLocation(),
    initialParams = new URLSearchParams(location.search),
    [query, setQuery] = useState(()=>initialParams.get("search")||""),
    [filter, setFilter] = useState(()=>initialParams.get("status")||"active"),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(""),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [drafts, setDrafts] = useState<Record<string, PreorderAdminDraft>>({}),
    [claimLinks,setClaimLinks]=useState<Record<string,string>>({}),
    [rejecting,setRejecting]=useState<PreorderRequest|null>(null),
    [rejectionReason,setRejectionReason]=useState(""),
    [customRejectionReason,setCustomRejectionReason]=useState(""),
    [fulfillment,setFulfillment]=useState<PreorderFulfillmentConfig|null>(null),
    [conversion,setConversion]=useState<Record<string,{method:"flat"|"area_group"|"pickup";pickupLocationId:string}>>({}),
    pageSize = 20;
  useEffect(()=>{void adminApi.get<PreorderFulfillmentConfig>("getFulfillmentConfig").then(setFulfillment).catch(reason=>setMessage(reason instanceof Error?reason.message:"Could not load fulfillment settings."));},[]);
  const labels: Record<PreorderStatus, string> = {
    new: "New request",
    awaiting_payment:"Awaiting payment",
    payment_submitted:"Payment submitted",
    paid:"Paid",
    contacted: "Customer contacted",
    confirmed: "Confirmed",
    batched: "Legacy batched",
    ordered: "Legacy ordered",
    in_transit: "In transit",
    arrived: "Arrived",
    ready: "Ready",
    notified: "Customer notified",
    converted: "Converted to order",
    cancelled: "Cancelled",
    expired: "Expired",
  };
  const next: Partial<Record<PreorderStatus, PreorderStatus>> = {
    new: "awaiting_payment",
    payment_submitted:"paid",
    paid:"confirmed",
    contacted: "confirmed",
    confirmed: "in_transit",
    batched: "ordered",
    ordered: "in_transit",
    in_transit: "arrived",
    arrived: "ready",
  };
  const nextText: Partial<Record<PreorderStatus, string>> = {
    new: "Move to awaiting payment",
    payment_submitted:"Verify payment",
    paid:"Confirm pre-order",
    contacted: "Confirm customer",
    confirmed: "Mark in transit",
    batched: "Mark legacy order placed",
    ordered: "Mark in transit",
    in_transit: "Mark arrived",
    arrived: "Mark ready for customer",
  };
  const guidance: Record<PreorderStatus, string> = {
    new: "Legacy new request. Move it to awaiting payment when ready.",
    awaiting_payment:"Waiting for the customer to pay the full product price and upload a bank receipt.",
    payment_submitted:"Open the receipt and verify the full product payment.",
    paid:"Payment is verified. Confirm this pre-order.",
    contacted:
      "Legacy contacted request. Confirm only after validating its payment.",
    confirmed:
      "The paid pre-order is confirmed. Mark it in transit when tracking begins.",
    batched:
      "Legacy batched request. Continue using the legacy ordered step.",
    ordered:
      "Legacy ordered request. Mark it in transit when tracking starts moving.",
    in_transit:
      "The pre-order is on the way. Mark arrived when you physically receive it.",
    arrived:
      "Check the item, size and condition. Keep this customer-reserved piece out of public stock, then mark it ready.",
    ready:
      "Create the linked delivery order. Only the courier fee will be collected on delivery.",
    notified:"The customer has a secure one-time checkout link while this reservation remains active.",
    converted: "This request is finished and is now a normal order.",
    cancelled: "No further action is required for this cancelled request.",
    expired:"This reservation was released to stock and can no longer be claimed.",
  };
  const all = [...store.admin.preorders].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    needle = query.trim().toLowerCase(),
    awaitingPaymentCount = all.filter((x) => x.status === "awaiting_payment").length,
    paymentSubmittedCount = all.filter((x) => x.status === "payment_submitted").length,
    inTransitCount = all.filter((x) => x.status === "in_transit").length,
    readyCount = all.filter((x) => x.status === "ready").length;
  const filtered = all.filter((item) => {
      const active = !["converted", "cancelled", "expired"].includes(item.status),
        statusOk =
          filter === "all" ||
          (filter === "active" && active) ||
          filter === item.status,
        searchOk =
          !needle ||
          [
            item.requestId,
            item.customerName,
            item.phone,
            item.whatsapp,
            item.email,
            item.productName,
            item.color,
            item.size,
            item.batchId,
            item.city,
            item.district,
          ].some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(needle),
          );
      return statusOk && searchOk;
    }),
    pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    safe = Math.min(page, pages),
    visible = filtered.slice((safe - 1) * pageSize, safe * pageSize);
  useEffect(() => setPage(1), [query, filter]);
  const baseDraft = (item: PreorderRequest): PreorderAdminDraft => ({
    confirmedPrice: String(item.confirmedPrice || ""),
    notes: item.notes || "",
    address1: item.address1 || "",
    address2: item.address2 || "",
    city: item.city || "",
    district: item.district || "",
    postalCode: item.postalCode || "",
  });
  const draftFor = (item: PreorderRequest) =>
    drafts[item.requestId] || baseDraft(item);
  const editDraft = (
    item: PreorderRequest,
    patch: Partial<PreorderAdminDraft>,
  ) =>
    setDrafts((current) => ({
      ...current,
      [item.requestId]: {
        ...(current[item.requestId] || baseDraft(item)),
        ...patch,
      },
    }));
  async function change(item: PreorderRequest, status: PreorderStatus) {
    setBusy(item.requestId);
    setMessage("");
    try {
      const draft = draftFor(item);
      await store.updatePreorder({
        requestId: item.requestId,
        status,
        notes: draft.notes,
      });
      setMessage(status === "paid" ? "Payment verified" : item.requestId + " → " + labels[status] + ".");
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Could not update pre-order.",
      );
    } finally {
      setBusy("");
    }
  }
  async function saveDetails(item: PreorderRequest) {
    setBusy(item.requestId);
    setMessage("");
    try {
      const draft = draftFor(item);
      if (draft.postalCode && !/^\d{5}$/.test(draft.postalCode))
        throw new Error("Postal code must be 5 digits.");
      await store.updatePreorder({
        requestId: item.requestId,
        notes: draft.notes.trim(),
        address1: draft.address1.trim(),
        address2: draft.address2.trim(),
        city: draft.city.trim(),
        district: draft.district,
        postalCode: draft.postalCode.trim(),
      });
      setMessage(item.requestId + " details saved.");
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Could not save pre-order details.",
      );
    } finally {
      setBusy("");
    }
  }
  async function notifyCustomer(item:PreorderRequest){
    setBusy(item.requestId);setMessage("");
    try{
      const result=await adminApi.post<{token:string;reservationExpiresAt:string}>("notifyPreorder",{requestId:item.requestId});
      const link=window.location.origin+"/preorder/complete?token="+encodeURIComponent(result.token);
      setClaimLinks(current=>({...current,[item.requestId]:link}));
      await store.refreshPreorders();
      setMessage(item.requestId+" checkout link created.");
    }catch(reason){setMessage(reason instanceof Error?reason.message:"Could not notify customer.");}
    finally{setBusy("");}
  }
  async function rejectPayment(){
    if(!rejecting)return;
    const reason=rejectionReason==="Other"?customRejectionReason.trim():rejectionReason;
    if(!reason){setMessage(rejectionReason==="Other"?"Enter a short reason.":"Choose a payment rejection reason.");return;}
    setBusy(rejecting.requestId);setMessage("");
    try{
      const result=await adminApi.post<{token:string;reason:string;rejectedAt:string}>("rejectPreorderPayment",{requestId:rejecting.requestId,reason:rejectionReason,customReason:customRejectionReason});
      const link=window.location.origin+"/preorder/complete?token="+encodeURIComponent(result.token);
      setClaimLinks(current=>({...current,[rejecting.requestId]:link}));
      await store.refreshPreorders();
      setMessage("New receipt requested for "+rejecting.requestId+".");
      setRejecting(null);setRejectionReason("");setCustomRejectionReason("");
    }catch(reason){setMessage(reason instanceof Error?reason.message:"Could not request a new receipt.");}
    finally{setBusy("");}
  }
  async function copyPaymentMessage(message:string){
    try{await navigator.clipboard.writeText(message);setMessage("WhatsApp message copied.");}catch{setMessage("Could not copy the message.");}
  }
  async function extendReservation(item:PreorderRequest){
    setBusy(item.requestId);setMessage("");
    try{await adminApi.post("extendPreorderReservation",{requestId:item.requestId});await store.refreshPreorders();setMessage(item.requestId+" reservation extended by 24 hours.");}
    catch(reason){setMessage(reason instanceof Error?reason.message:"Could not extend reservation.");}
    finally{setBusy("");}
  }
  async function releaseReservation(item:PreorderRequest){
    if(!confirm("Release "+item.requestId+" to public stock?"))return;
    setBusy(item.requestId);setMessage("");
    try{await adminApi.post("releasePreorderToStock",{requestId:item.requestId});await store.loadAdmin();setMessage(item.requestId+" released to stock.");}
    catch(reason){setMessage(reason instanceof Error?reason.message:"Could not release reservation.");}
    finally{setBusy("");}
  }
  async function copyClaimLink(item:PreorderRequest){
    const link=claimLinks[item.requestId];if(!link)return;
    try{await navigator.clipboard.writeText(link);setMessage("Checkout link copied.");}catch{setMessage("Copy failed. Generate and copy the link again.");}
  }
  async function convert(item: PreorderRequest) {
    const draft = draftFor(item);
    const activeMethods=(fulfillment?.methods||[]).filter(method=>method.active),selected=conversion[item.requestId]||{method:activeMethods.length===1?activeMethods[0].type:"" as "flat",pickupLocationId:""};
    if(!selected.method)return setMessage("Choose a fulfillment method before converting this pre-order.");
    if(selected.method==="pickup"&&!selected.pickupLocationId)return setMessage("Choose an active pickup branch before converting this pre-order.");
    if (selected.method!=="pickup"&&(!draft.address1.trim() || !draft.city.trim() || !draft.district))
      return setMessage(
        "Complete the delivery address and district before converting this pre-order.",
      );
    if (draft.postalCode && !/^\d{5}$/.test(draft.postalCode))
      return setMessage("Postal code must be 5 digits.");
    if (
      !confirm(
        "Convert " +
          item.requestId +
        " to a delivery order? The courier will collect only the delivery fee.",
      )
    )
      return;
    setBusy(item.requestId);
    setMessage("");
    try {
      await store.updatePreorder({
        requestId: item.requestId,
        notes: draft.notes.trim(),
        address1: draft.address1.trim(),
        address2: draft.address2.trim(),
        city: draft.city.trim(),
        district: draft.district,
        postalCode: draft.postalCode.trim(),
      });
      const order = await adminApi.post<Order>("convertPreorderToOrder", {
        requestId: item.requestId,
        paymentMethod:"bank",
        fulfillmentMethod:selected.method,
        pickupLocationId:selected.method==="pickup"?selected.pickupLocationId:undefined,
      });
      await store.loadAdmin();
      setMessage(
        item.requestId +
          " converted to " +
          order.orderId +
          ". Customer can now see the normal order in My Orders if they were signed in.",
      );
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Could not convert pre-order.",
      );
    } finally {
      setBusy("");
    }
  }
  const waNumber = (value: string) => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.startsWith("0") ? "94" + digits.slice(1) : digits;
  };
  return (
    <>
      <Head
        eyebrow="Manual management"
        title="Pre-orders"
      />
      <div className="admin-help-card mt-5">
        <b>Paid pre-order flow:</b> Payment submitted → Verify payment → Confirmed → In transit → Arrived → Ready → Delivery order. <span>Estimated arrival: 3–4 weeks.</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Awaiting payment", awaitingPaymentCount, "Waiting for receipt submission"],
          ["Payment submitted", paymentSubmittedCount, "Receipts ready to verify"],
          ["In transit", inTransitCount, "Pre-orders currently on the way"],
          ["Ready for delivery", readyCount, "Create linked delivery orders"],
        ].map(([label, value, help]) => (
          <div key={String(label)} className="admin-stat-card">
            <p>{label}</p>
            <strong>{value}</strong>
            <small>{help}</small>
          </div>
        ))}
      </div>
      <div className="admin-toolbar mt-5">
        <div className="admin-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search pre-orders"
            placeholder="Search request ID, customer, WhatsApp, product, city…"
          />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Pre-order status filter">
          <option value="active">Active requests</option>
          <option value="all">All requests</option>
          {(
            [
              "new",
              "awaiting_payment",
              "payment_submitted",
              "paid",
              "contacted",
              "confirmed",
              "batched",
              "ordered",
              "in_transit",
              "arrived",
              "ready",
              "notified",
              "converted",
              "cancelled",
              "expired",
            ] as PreorderStatus[]
          ).map((status) => (
            <option key={status} value={status}>
              {labels[status]}
            </option>
          ))}
        </select>
      </div>
      {message && <p className="admin-notice mt-4">{message}</p>}
      <div className="mt-5 grid gap-4">
        {visible.length ? (
          visible.map((item) => {
            const draft = draftFor(item),
              product = resolveCurrentProduct(store.data.products, item),
              image = product?.media.find((media) => media.type === "image"),
              phone = waNumber(item.whatsapp || item.phone),
              finalPrice = Number(item.requestedPrice || 0),
              paymentState=item.paymentVerifiedAt?"Verified":item.status==="awaiting_payment"&&item.paymentRejectionReason?"New receipt requested":item.paymentSubmittedAt?"Submitted":item.status==="awaiting_payment"?"Awaiting payment":"Legacy / not recorded",
              claimLink=claimLinks[item.requestId]||"",
              rejectionReason=item.paymentRejectionReason||"",
              rejectionMessage=rejectionReason&&claimLink?paymentRetryMessage({customerName:item.customerName,requestId:item.requestId,reason:rejectionReason,retryUrl:claimLink,productName:item.productName,productTotal:item.requestedPrice*item.quantity}):"",
              nextStatus = next[item.status],
              progressIndex = item.status === "converted" ? 4 : item.status === "ready" ? 3 : ["in_transit","arrived"].includes(item.status) ? 2 : ["confirmed","ordered","batched"].includes(item.status) ? 1 : 0,
              waMessage = item.status==="awaiting_payment"&&rejectionMessage
                ? rejectionMessage
                : item.status==="notified"&&claimLink
                ? "Your ZEVENRA pre-order has arrived 🤍\nYour "+item.productName+" — "+item.size+" is reserved for you.\nComplete your order here:\n"+claimLink+"\n\nReserved for 48 hours."
                : "Hi " +
                item.customerName +
                ", this is ZEVENRA about your pre-order " +
                item.requestId +
                " for " +
                item.productName +
                " — " +
                item.color +
                " / " +
                item.size +
                " × " +
                item.quantity +
                ". " +
                "The product price is " + money(finalPrice) + ". Estimated arrival is 3–4 weeks.",
              wa =
                "https://wa.me/" +
                phone +
                "?text=" +
                encodeURIComponent(waMessage);
            return (
              <article key={item.requestId} className="preorder-admin-card">
                <div className="preorder-admin-card__top">
                  <div className="flex min-w-0 items-center gap-3">
                    {product ? <Link to={`/admin/products/${product.id}`} className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden bg-black/[.05]" aria-label={`View ${item.productName}`}>{image ? <img src={image.url} alt="" loading="lazy" className="h-16 w-12 object-contain" /> : <span className="px-1 text-center text-[8px] uppercase tracking-wide text-black/30">No image</span>}</Link> : <div className="grid h-16 w-12 shrink-0 place-items-center bg-black/[.05]"><span className="px-1 text-center text-[8px] uppercase tracking-wide text-black/30">No image</span></div>}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="break-all">{item.requestId}</b>
                        <span
                          className={
                            "preorder-status preorder-status--" + item.status
                          }
                        >
                          {labels[item.status]}
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium text-black/75">{item.productName} · {item.size} · Qty {item.quantity}</p>
                      <p className="truncate text-xs text-black/50">{item.customerName} · {money(item.requestedPrice*item.quantity)} · Payment {paymentState}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2"><a href={wa} target="_blank" rel="noreferrer" className="btn" aria-label={`WhatsApp ${item.customerName}`}><MessageCircle size={14} /> WhatsApp</a>{nextStatus&&item.status!=="payment_submitted"&&<button type="button" disabled={busy===item.requestId} onClick={()=>void change(item,nextStatus)} className="btn btn-dark">{nextText[item.status]}</button>}<button type="button" className="btn" onClick={()=>setOpen(item.requestId)}>View</button></div>
                </div>
                <AnimatePresence>
                {open===item.requestId&&<>
                <motion.button type="button" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} aria-label="Close pre-order details" onClick={()=>setOpen("")} className="admin-drawer-backdrop" />
                <motion.aside initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}} transition={{duration:.26,ease:[.4,0,.2,1]}} className="admin-drawer preorder-admin-drawer" role="dialog" aria-modal="true" aria-label={`Pre-order ${item.requestId}`}>
                <div className="admin-drawer__header"><div><p className="eyebrow text-black/45">Pre-order details</p><h2>{item.requestId}</h2></div><button type="button" className="btn" onClick={()=>setOpen("")}>Close</button></div>
                <div className="admin-drawer__body">
                <section className="preorder-drawer-section preorder-drawer-overview">
                  <div><small>Overview</small><h3>{item.requestId}</h3></div>
                  <div><span>Status</span><b>{labels[item.status]}</b></div>
                  <div><span>Created</span><b>{new Date(item.createdAt).toLocaleString("en-LK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</b></div>
                  <div><span>Estimated arrival</span><b>3–4 weeks</b></div>
                </section>
                {item.paymentReceiptUrl&&<section className="preorder-drawer-section pb-4">
                  <div className="grid gap-4"><small>Payment receipt</small><ProtectedReceipt url={item.paymentReceiptUrl}/>
                    {item.status==="payment_submitted"&&<div className="flex flex-wrap gap-3 pb-1"><button type="button" disabled={busy===item.requestId||!item.paymentReceiptUrl} onClick={()=>void change(item,"paid")} className="btn btn-dark">Verify payment</button><button type="button" disabled={busy===item.requestId} onClick={()=>{setRejecting(item);setRejectionReason("");setCustomRejectionReason("");}} className="btn text-red-800">Request new receipt</button></div>}
                  </div>
                </section>}
                <div className="preorder-admin-grid">
                  <section className="preorder-product-box">
                    {product ? (
                      <Link to={`/admin/products/${product.id}`} aria-label={`View ${item.productName}`}>
                        {image ? <img src={image.url} alt="" loading="lazy" /> : <div className="preorder-product-placeholder" />}
                      </Link>
                    ) : (
                      <div className="preorder-product-placeholder" />
                    )}
                    <div>
                      <small>Product</small>
                      <h3>{product ? <Link to={`/admin/products/${product.id}`} className="hover:underline">{item.productName}</Link> : item.productName}</h3>
                      <p>
                        {item.color} / {item.size} · Qty {item.quantity}
                      </p>
                      <p>Locked product price: <b>{money(Number(item.requestedPrice))}</b></p>
                      <p>
                        Product total:{" "}
                        <b>{money(Number(item.requestedPrice) * item.quantity)}</b>
                      </p>
                      {!product && <p className="mt-2 text-xs font-medium text-amber-800">Product unavailable</p>}
                    </div>
                  </section>
                  <section className="preorder-customer-box">
                    <small>Customer</small>
                    <h3>{item.customerName}</h3>
                    <p>
                      <b>Mobile:</b> {item.phone}
                    </p>
                    <p>
                      <b>WhatsApp:</b> {item.whatsapp}
                    </p>
                    {item.email && (
                      <p>
                        <b>Email:</b> {item.email}
                      </p>
                    )}
                    {item.status==="ready"&&<><p><b>Area:</b> {item.city || "—"}</p><p>
                      <b>Delivery address:</b>{" "}
                      {[
                        item.address1,
                        item.address2,
                        item.city,
                        item.district,
                        item.postalCode,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Collect before final order"}
                    </p></>}
                  </section>
                  <section className="preorder-next-box">
                    <small>Payment</small>
                    <h3>{guidance[item.status]}</h3>
                    <div className="mb-3 grid gap-2 text-xs text-black/60"><span>Amount: <b>{money(item.requestedPrice*item.quantity)}</b></span><span>Status: <b>{paymentState}</b></span>{item.status==="awaiting_payment"&&rejectionReason&&<><span>Reason: <b>{rejectionReason}</b></span><span>Rejected: <b>{item.paymentRejectedAt?new Date(item.paymentRejectedAt).toLocaleString("en-LK"):"—"}</b></span></>}</div>
                    {item.status === "awaiting_payment" && rejectionReason && <div className="mb-2 grid gap-2"><a href={wa} target="_blank" rel="noreferrer" className={"btn w-full justify-center "+(!claimLink?"pointer-events-none opacity-40":"")}><MessageCircle size={14} /> Send WhatsApp Message</a><button type="button" className="btn w-full justify-center" disabled={!rejectionMessage} onClick={()=>void copyPaymentMessage(rejectionMessage)}>Copy Message</button></div>}
                    {item.status === "awaiting_payment" && !rejectionReason && <a href={wa} target="_blank" rel="noreferrer" className="btn mb-2 w-full justify-center"><MessageCircle size={14} /> WhatsApp customer</a>}
                    {item.status==="converted"&&item.convertedOrderId&&<Link className="btn justify-center" to={`/admin/orders/${encodeURIComponent(item.convertedOrderId)}`}>Converted to {item.convertedOrderId} · {item.convertedOrderStatus ? convertedOrderStatusLabel(item.convertedOrderStatus) : "Order"}</Link>}
                    {nextStatus && item.status!=="awaiting_payment" && item.status!=="payment_submitted" && (
                      <button
                        disabled={
                          busy === item.requestId ||
                          (nextStatus === "paid" && !item.paymentReceiptUrl)
                        }
                        onClick={() => void change(item, nextStatus)}
                        className="btn btn-dark w-full disabled:opacity-40"
                      >
                        {busy === item.requestId
                          ? "Saving…"
                          : nextText[item.status]}
                      </button>
                    )}
                    {item.status === "ready" && (
                      <div className="grid gap-2">
                        <label className="label">Fulfillment<select className="field mt-1" value={conversion[item.requestId]?.method||((fulfillment?.methods||[]).filter(method=>method.active).length===1?(fulfillment?.methods||[]).find(method=>method.active)?.type:"")||""} onChange={event=>setConversion(current=>({...current,[item.requestId]:{method:event.target.value as "flat"|"area_group"|"pickup",pickupLocationId:""}}))}><option value="">Choose method</option>{(fulfillment?.methods||[]).filter(method=>method.active).map(method=><option key={method.type} value={method.type}>{method.displayName}</option>)}</select></label>
                          {(conversion[item.requestId]?.method||((fulfillment?.methods||[]).filter(method=>method.active).length===1?(fulfillment?.methods||[]).find(method=>method.active)?.type:""))==="pickup"?<label className="label">Pickup branch<select className="field mt-1" value={conversion[item.requestId]?.pickupLocationId||""} onChange={event=>setConversion(current=>({...current,[item.requestId]:{method:"pickup",pickupLocationId:event.target.value}}))}><option value="">Choose branch</option>{(fulfillment?.pickupLocations||[]).filter(branch=>branch.active).map(branch=><option key={branch.id} value={branch.id}>{branch.name} — {branch.address}</option>)}</select></label>:null}
                          <button disabled={busy===item.requestId} onClick={()=>void convert(item)} className="btn btn-dark">Create Delivery Order</button>
                      </div>
                    )}
                    {item.status==="notified"&&<div className="grid gap-2">
                      <p className="text-xs text-black/55">Reserved until {item.reservationExpiresAt?new Date(item.reservationExpiresAt).toLocaleString("en-LK"):"—"}</p>
                      <a href={wa} target="_blank" rel="noreferrer" className={"btn btn-dark justify-center "+(!claimLink?"pointer-events-none opacity-40":"")}>WhatsApp customer</a>
                      <button type="button" className="btn justify-center" disabled={!claimLink} onClick={()=>void copyClaimLink(item)}>Copy checkout link</button>
                      <button type="button" className="btn justify-center" disabled={busy===item.requestId} onClick={()=>void notifyCustomer(item)}>Send again</button>
                      <button type="button" className="btn justify-center" disabled={busy===item.requestId} onClick={()=>void extendReservation(item)}>Extend 24h</button>
                      <button type="button" className="btn justify-center text-red-800" disabled={busy===item.requestId} onClick={()=>void releaseReservation(item)}>Release to stock</button>
                    </div>}
                  </section>
                </div>
                <section className="preorder-drawer-section preorder-delivery-summary">
                  <div><small>Delivery</small><h3>{item.convertedOrderDeliveryFee==null?"Courier fee calculated with delivery order":money(item.convertedOrderDeliveryFee)}</h3><p>Customer pays courier on delivery.</p></div>
                  {item.status==="converted"&&item.convertedOrderId&&<Link className="btn" to={`/admin/orders/${encodeURIComponent(item.convertedOrderId)}`}>{item.convertedOrderId} · {item.convertedOrderStatus ? convertedOrderStatusLabel(item.convertedOrderStatus) : "Order"}</Link>}
                </section>
                <section className="preorder-drawer-section"><div><small>Timeline</small><ol className="preorder-timeline">
                  {["Payment","Confirmed","In transit","Ready","Delivery"].map((label,index) => (
                    <li
                      key={label}
                      className={index <= progressIndex ? "is-done" : ""}
                    >
                      {label}
                    </li>
                  ))}
                </ol></div></section>
                {item.status==="ready"&&<details className="mt-4 rounded-xl border border-black/10 bg-white/35 p-4">
                  <summary className="cursor-pointer text-xs font-semibold">
                    Delivery details for final order
                  </summary>
                  <p className="mt-2 text-[11px] leading-5 text-black/45">
                    Confirm these delivery details before creating the delivery order.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="text-xs sm:col-span-2">
                      Address line 1
                      <input
                        className="field mt-2"
                        value={draft.address1}
                        onChange={(e) =>
                          editDraft(item, { address1: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Address line 2
                      <input
                        className="field mt-2"
                        value={draft.address2}
                        onChange={(e) =>
                          editDraft(item, { address2: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs">
                      City / area
                      <input
                        className="field mt-2"
                        value={draft.city}
                        onChange={(e) =>
                          editDraft(item, { city: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs">
                      District
                      <select
                        className="field mt-2"
                        value={draft.district}
                        onChange={(e) =>
                          editDraft(item, { district: e.target.value })
                        }
                      >
                        <option value="">Select district</option>
                        {sriLankaDistricts.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      Postal code
                      <input
                        className="field mt-2"
                        inputMode="numeric"
                        maxLength={5}
                        value={draft.postalCode}
                        onChange={(e) =>
                          editDraft(item, {
                            postalCode: e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 5),
                          })
                        }
                      />
                    </label>
                  </div>
                  <button disabled={busy===item.requestId} onClick={()=>void saveDetails(item)} className="btn mt-4">Save delivery details</button>
                </details>}
                </div>
                </motion.aside>
                </>}
                </AnimatePresence>
              </article>
            );
          })
        ) : (
          <div className="admin-empty-state">
            <p className="display">No pre-orders here.</p>
            <span>
              {store.admin.preorders.length
                ? "Try another search or filter."
                : "Customer pre-order requests will appear here as soon as someone submits one."}
            </span>
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-black/45">
          Showing {filtered.length ? (safe - 1) * pageSize + 1 : 0}–
          {Math.min(safe * pageSize, filtered.length)} of {filtered.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            className="btn"
            disabled={safe <= 1}
            onClick={() => setPage((v) => Math.max(1, v - 1))}
          >
            <ChevronLeft size={15} /> Previous
          </button>
          <span className="px-2 text-xs">
            {safe} / {pages}
          </span>
          <button
            className="btn"
            disabled={safe >= pages}
            onClick={() => setPage((v) => Math.min(pages, v + 1))}
          >
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <RejectPaymentModal item={rejecting} reason={rejectionReason} customReason={customRejectionReason} busy={Boolean(rejecting&&busy===rejecting.requestId)} onReason={setRejectionReason} onCustomReason={setCustomRejectionReason} onClose={()=>setRejecting(null)} onConfirm={()=>void rejectPayment()}/>
    </>
  );
}
function RejectPaymentModal({item,reason,customReason,busy,onReason,onCustomReason,onClose,onConfirm}:{item:PreorderRequest|null;reason:string;customReason:string;busy:boolean;onReason:(value:string)=>void;onCustomReason:(value:string)=>void;onClose:()=>void;onConfirm:()=>void}){
  useEffect(()=>{if(!item)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)onClose();};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close);},[busy,item,onClose]);
  if(!item)return null;
  return createPortal(<AnimatePresence><motion.div className="fixed inset-0 z-[1000] grid place-items-center overflow-y-auto bg-black/75 p-4 sm:p-6" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><motion.section initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:18,scale:.98}} role="dialog" aria-modal="true" aria-labelledby="reject-payment-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[32rem] flex-col overflow-hidden border border-black/10 bg-[#f7f4ee] shadow-2xl sm:max-h-[calc(100dvh-3rem)]"><div className="overflow-y-auto p-5 sm:p-6"><h2 id="reject-payment-title" className="display text-2xl">Request a new receipt</h2><p className="mt-2 text-sm text-black/55">Choose the reason shown to {item.customerName}. The current receipt remains available as audit evidence.</p><label className="label mt-5">Reason<select autoFocus className="field mt-2" value={reason} onChange={event=>onReason(event.target.value)} required><option value="">Choose a reason</option>{paymentRejectionReasons.map(value=><option key={value}>{value}</option>)}</select></label>{reason==="Other"?<label className="label mt-4">Short reason<textarea className="field mt-2 min-h-24" maxLength={240} value={customReason} onChange={event=>onCustomReason(event.target.value)} required/></label>:null}</div><div className="flex shrink-0 justify-end gap-2 border-t border-black/10 bg-[#f7f4ee] p-4 sm:px-6"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="btn btn-dark" disabled={busy||!reason||(reason==="Other"&&!customReason.trim())} onClick={onConfirm}>{busy?"Requesting…":"Request new receipt"}</button></div></motion.section></motion.div></AnimatePresence>,document.body);
}
function downloadOrdersCsv(rows: Order[]) {
  const csvCell = (value: unknown) =>
    '"' + String(value ?? "").replace(/"/g, '""') + '"';
  const header = [
    "Order ID",
    "Created At",
    "Customer",
    "Phone",
    "Address 1",
    "Address 2",
    "City",
    "District",
    "Postal Code",
    "Checkout Courier",
    "Fulfilment Courier",
    "Tracking Number",
    "COD Amount",
    "Total",
    "Order Status",
    "Payment Status",
  ];
  const lines = [
    header,
    ...rows.map((order) => [
      order.orderId,
      order.createdAt,
      order.customerName,
      order.phone,
      order.address1 || "",
      order.address2 || "",
      order.city,
      order.district,
      order.postalCode || "",
      order.courierName || "",
      order.fulfilmentCourierName || "",
      order.trackingNumber || "",
      order.paymentMethod === "cod" ? Number(order.total) || 0 : 0,
      Number(order.total) || 0,
      order.orderStatus,
      order.paymentStatus,
    ]),
  ].map((row) => row.map(csvCell).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download =
    "zevenra-orders-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function Orders() {
  const { admin, updateOrder, data, loadAdmin } = useStore(),
    location = useLocation(),
    { id: routeOrderId } = useParams(),
    initialParams = new URLSearchParams(location.search),
    [query, setQuery] = useState(()=>initialParams.get("search")||""),
    [orderFilter, setOrderFilter] = useState(()=>initialParams.get("status")||"all"),
    [paymentFilter, setPaymentFilter] = useState("all"),
    [sourceFilter, setSourceFilter] = useState("all"),
    [dateFilter, setDateFilter] = useState(()=>initialParams.get("date")||"all"),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(routeOrderId||""),
    [details, setDetails] = useState<Record<string, AdminOrderDetail>>({}),
    [loadingId, setLoadingId] = useState(""),
    [savingId, setSavingId] = useState(""),
    [dispatchOrderId, setDispatchOrderId] = useState(""),
    [dispatchCourierId, setDispatchCourierId] = useState(""),
    [dispatchTrackingNumber, setDispatchTrackingNumber] = useState(""),
    [dispatchTrackingUrl, setDispatchTrackingUrl] = useState(""),
    [dispatchHandover, setDispatchHandover] = useState(""),
    [status, setStatus] = useState(""),
    [creatingManual, setCreatingManual] = useState(false),
    [manualBusy, setManualBusy] = useState(false),
    [manualItems, setManualItems] = useState([
      { key: crypto.randomUUID(), productId: "", variantId: "", quantity: 1 },
    ]);
  const pageSize = 20,
    now = Date.now(),
    needle = query.trim().toLowerCase();
  const orders = [...admin.orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const filtered = orders.filter((order) => {
    const created = new Date(order.createdAt).getTime(),
      ageDays = (now - created) / 86400000,
      payment = String(order.paymentStatus || "").toLowerCase();
    const matchesDate =
      dateFilter === "all" ||
      (dateFilter === "today" &&
        new Date(order.createdAt).toDateString() ===
          new Date().toDateString()) ||
      (dateFilter === "7" && ageDays <= 7) ||
      (dateFilter === "30" && ageDays <= 30);
    const matchesPayment =
      paymentFilter === "all" ||
      paymentFilter === order.paymentMethod ||
      (paymentFilter === "verify" &&
        order.paymentMethod === "bank" &&
        ["", "verification required", "receipt submitted"].includes(payment)) ||
      (paymentFilter === "paid" && ["paid", "verified"].includes(payment));
    const matchesOrder =
      orderFilter === "all" ||
      String(order.orderStatus).toLowerCase() === orderFilter ||
      (orderFilter === "needs_payment" && order.paymentMethod === "bank" && !["paid", "verified"].includes(payment)) ||
      (orderFilter === "returns" && Number(order.returnCount) > 0);
    const matchesSource = sourceFilter === "all" || (sourceFilter === "preorder" ? Boolean(order.sourcePreorderRequestId) : !order.sourcePreorderRequestId);
    const matchesQuery =
      !needle ||
      [
        order.orderId,
        order.sourcePreorderRequestId,
        order.customerName,
        order.phone,
        order.whatsapp,
        order.email,
        order.district,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    return matchesDate && matchesPayment && matchesOrder && matchesSource && matchesQuery;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)),
    safePage = Math.min(page, pageCount),
    visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [query, orderFilter, paymentFilter, sourceFilter, dateFilter]);
  useEffect(()=>{if(!routeOrderId)return;let active=true;setLoadingId(routeOrderId);void adminApi.get<AdminOrderDetail>("getOrder",{orderId:routeOrderId}).then(detail=>{if(active)setDetails(current=>({...current,[routeOrderId]:detail}));}).catch(reason=>{if(active)setStatus(reason instanceof Error?reason.message:"Could not load order details.");}).finally(()=>{if(active)setLoadingId("");});return()=>{active=false;};},[routeOrderId]);

  async function toggle(orderId: string) {
    if (open === orderId) {
      setOpen("");
      return;
    }
    setOpen(orderId);
    setStatus("");
    if (details[orderId]) return;
    setLoadingId(orderId);
    try {
      const detail = await adminApi.get<AdminOrderDetail>("getOrder", {
        orderId,
      });
      setDetails((current) => ({ ...current, [orderId]: detail }));
    } catch (reason) {
      setStatus(
        reason instanceof Error
          ? reason.message
          : "Could not load order details.",
      );
    } finally {
      setLoadingId("");
    }
  }
  const updateInFlight = useRef(new Set<string>());
  async function change(orderId: string, patch: Partial<Order>) {
    if(updateInFlight.current.has(orderId))return false;
    updateInFlight.current.add(orderId);
    setSavingId(orderId);
    setStatus("");
    try {
      await updateOrder({ orderId, ...patch });
      const updated = await adminApi.get<AdminOrderDetail>("getOrder", { orderId });
      setDetails((current) => ({
        ...current,
        [orderId]: {
          ...(current[orderId] || {}),
          ...updated,
        } as AdminOrderDetail,
      }));
      setStatus("Order updated.");
      return true;
    } catch (reason) {
      setStatus(
        reason instanceof Error ? reason.message : "Could not update order.",
      );
      return false;
    } finally {
      updateInFlight.current.delete(orderId);
      setSavingId("");
    }
  }
  async function createManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualBusy(true);
    setStatus("");
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget)),
        name = String(raw.customerName || "").trim(),
        phone = String(raw.phone || "").trim(),
        whatsapp = String(raw.whatsapp || "").trim(),
        email = String(raw.email || "").trim(),
        address1 = String(raw.address1 || "").trim(),
        city = String(raw.city || "").trim(),
        district = String(raw.district || "").trim();
      if (name.length < 2) throw new Error("Enter the customer’s full name.");
      if (!adminPhone.test(phone))
        throw new Error("Enter a valid customer mobile number.");
      if (whatsapp && !adminPhone.test(whatsapp))
        throw new Error("Enter a valid WhatsApp number or leave it blank.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Enter a valid email address or leave it blank.");
      if (
        address1.length < 5 ||
        city.length < 2 ||
        !sriLankaDistricts.includes(
          district as (typeof sriLankaDistricts)[number],
        )
      )
        throw new Error(
          "Complete the delivery address and choose a valid district.",
        );
      const items = manualItems
        .filter((item) => item.productId && item.variantId)
        .map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        }));
      if (!items.length) throw new Error("Add at least one product.");
      for (const line of manualItems.filter(
        (item) => item.productId && item.variantId,
      )) {
        const product = data.products.find((p) => p.id === line.productId),
          variant = product?.variants.find((v) => v.id === line.variantId);
        if (!variant || line.quantity < 1 || line.quantity > variant.stock)
          throw new Error("Check item quantities against the available stock.");
      }
      const choice = String(raw.paymentChoice || "cod"),
        paymentMethod = choice === "cod" ? "cod" : "bank",
        paymentStatus =
          choice === "bank_paid"
            ? "paid"
            : choice === "bank_waiting"
              ? "verification required"
              : "COD";
      const order = await adminApi.post<Order>("createManualOrder", {
        source: String(raw.source || "manual"),
        customerName: name,
        phone,
        whatsapp,
        email,
        address1,
        address2: String(raw.address2 || "").trim(),
        city,
        district,
        postalCode: String(raw.postalCode || "").trim(),
        deliveryNotes: String(raw.deliveryNotes || "").trim(),
        paymentMethod,
        paymentStatus,
        items,
      });
      await loadAdmin();
      setCreatingManual(false);
      setManualItems([
        { key: crypto.randomUUID(), productId: "", variantId: "", quantity: 1 },
      ]);
      setStatus(
        "Manual order " +
          order.orderId +
          " created. Stock was reserved immediately.",
      );
    } catch (reason) {
      setStatus(
        reason instanceof Error
          ? reason.message
          : "Could not create manual order.",
      );
    } finally {
      setManualBusy(false);
    }
  }
  const pending = orders.filter(
      (order) => String(order.orderStatus).toLowerCase() === "pending",
    ).length,
    bankVerify = orders.filter(
      (order) =>
        order.paymentMethod === "bank" &&
        ["", "verification required", "receipt submitted"].includes(
          String(order.paymentStatus || "").toLowerCase(),
        ),
    ).length,
    dispatched = orders.filter((order) => order.orderStatus === "dispatched").length,
    returns = orders.filter((order) => Number(order.returnCount) > 0).length;
  return (
    <>
      <Head
        eyebrow="Fulfilment"
        title="Orders"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadOrdersCsv(filtered)}
              disabled={!filtered.length}
              className="btn"
            >
              <Download size={15} /> Export courier CSV
            </button>
            <button
              onClick={() => setCreatingManual((value) => !value)}
              className="btn btn-dark"
            >
              <Plus size={15} />
              {creatingManual ? "Close manual order" : "Manual order"}
            </button>
          </div>
        }
      />
      {creatingManual && (
        <form
          onSubmit={createManual}
          className="fixed inset-y-0 right-0 z-[100] w-full overflow-y-auto border-l border-black/10 bg-[#f6f3ed] p-5 shadow-[-20px_0_60px_rgba(0,0,0,.18)] sm:w-[680px] sm:p-7"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow text-black/45">Instagram / WhatsApp sale</p>
              <h2 className="display mt-2 text-3xl">Create manual order</h2>
            </div>
            <p className="max-w-md text-xs leading-5 text-black/45">
              Use this when you sell through DMs. Stock is reserved immediately
              so the website cannot oversell the same size.
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs">
              Source
              <select name="source" className="field mt-2">
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="manual">Other / Manual</option>
              </select>
            </label>
            <label className="text-xs">
              Customer name *
              <input name="customerName" required className="field mt-2" />
            </label>
            <label className="text-xs">
              Phone *
              <input name="phone" required className="field mt-2" type="tel" />
            </label>
            <label className="text-xs">
              WhatsApp
              <input name="whatsapp" className="field mt-2" type="tel" />
            </label>
            <label className="text-xs">
              Email
              <input name="email" className="field mt-2" type="email" />
            </label>
            <label className="text-xs">
              Payment
              <select name="paymentChoice" className="field mt-2">
                <option value="cod">Cash on delivery</option>
                <option value="bank_paid">Bank transfer — verified</option>
                <option value="bank_waiting">
                  Bank transfer — awaiting verification
                </option>
              </select>
            </label>
            <label className="text-xs sm:col-span-2">
              Address line 1 *
              <input name="address1" required className="field mt-2" />
            </label>
            <label className="text-xs">
              Address line 2<input name="address2" className="field mt-2" />
            </label>
            <label className="text-xs">
              City *<input name="city" required className="field mt-2" />
            </label>
            <label className="text-xs">
              District *
              <select
                name="district"
                required
                className="field mt-2"
                defaultValue=""
              >
                <option value="" disabled>
                  Select district
                </option>
                {sriLankaDistricts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Postal code
              <input name="postalCode" className="field mt-2" />
            </label>
            <label className="text-xs sm:col-span-2 lg:col-span-3">
              Delivery notes
              <textarea name="deliveryNotes" className="field mt-2" rows={2} />
            </label>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Items</p>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setManualItems((items) => [
                    ...items,
                    {
                      key: crypto.randomUUID(),
                      productId: "",
                      variantId: "",
                      quantity: 1,
                    },
                  ])
                }
              >
                <Plus size={14} /> Add item
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              {manualItems.map((line) => {
                const product = data.products.find(
                    (p) => p.id === line.productId,
                  ),
                  variants =
                    product?.variants.filter((v) => v.active && v.stock > 0) ||
                    [];
                return (
                  <div
                    key={line.key}
                    className="grid gap-2 border border-black/10 bg-white/45 p-3 sm:grid-cols-[1fr_1fr_100px_auto]"
                  >
                    <select
                      className="field"
                      value={line.productId}
                      onChange={(e) =>
                        setManualItems((items) =>
                          items.map((item) =>
                            item.key === line.key
                              ? {
                                  ...item,
                                  productId: e.target.value,
                                  variantId: "",
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Select product</option>
                      {data.products
                        .filter((p) => p.status === "published")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <select
                      className="field"
                      disabled={!line.productId}
                      value={line.variantId}
                      onChange={(e) =>
                        setManualItems((items) =>
                          items.map((item) =>
                            item.key === line.key
                              ? { ...item, variantId: e.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Select size / colour</option>
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.color} / {v.size} — stock {v.stock}
                        </option>
                      ))}
                    </select>
                    <input
                      className="field"
                      type="number"
                      min="1"
                      max={
                        variants.find((v) => v.id === line.variantId)?.stock ||
                        99
                      }
                      value={line.quantity}
                      onChange={(e) =>
                        setManualItems((items) =>
                          items.map((item) =>
                            item.key === line.key
                              ? {
                                  ...item,
                                  quantity: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      disabled={manualItems.length === 1}
                      className="btn text-red-800 disabled:opacity-30"
                      onClick={() =>
                        setManualItems((items) =>
                          items.filter((item) => item.key !== line.key),
                        )
                      }
                    >
                      <Trash2 size={14} />
                      <span className="sm:hidden">Remove</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              disabled={manualBusy}
              className="btn btn-dark disabled:opacity-50"
            >
              {manualBusy ? "Creating…" : "Create & reserve stock"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCreatingManual(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="mt-7 flex flex-wrap gap-2">
        {[
          ["All", orders.length, "all"],
          ["Pending", pending, "pending"],
          ["Needs payment", bankVerify, "needs_payment"],
          ["Dispatched", dispatched, "dispatched"],
          ["Returns", returns, "returns"],
        ].map(([label, value, filter]) => (
          <button type="button" onClick={() => setOrderFilter(String(filter))} key={label} className={`flex min-h-11 items-center gap-3 border px-4 text-xs transition ${orderFilter===filter?"border-black bg-black text-white":"border-black/10 bg-[#f6f3ed] hover:border-black/30"}`}>
            <span>{label}</span><b>{value}</b>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Order source filter">
        {[["All","all"],["Normal Orders","normal"],["Pre-orders","preorder"]].map(([label,value])=><button type="button" key={value} onClick={()=>setSourceFilter(value)} className={`btn ${sourceFilter===value?"btn-dark":""}`}>{label}</button>)}
      </div>
      <div className="admin-toolbar mt-5 md:grid-cols-[minmax(220px,1fr)_180px_180px_160px_auto]">
        <div className="admin-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search orders"
            placeholder="Order ID, pre-order ID, customer, phone or WhatsApp…"
          />
        </div>
        <select
          value={orderFilter}
          onChange={(e) => setOrderFilter(e.target.value)}
          aria-label="Order status filter"
          className="field bg-white/50"
        >
          <option value="all">All order statuses</option>
          <option value="needs_payment">Needs payment</option>
          <option value="returns">Returns</option>
          {[
            "pending",
            "confirmed",
            "dispatched",
            "delivered",
            "cancelled",
          ].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          aria-label="Payment filter"
          className="field bg-white/50"
        >
          <option value="all">All payments</option>
          <option value="bank">Bank transfer</option>
          <option value="cod">Cash on delivery</option>
          <option value="verify">Needs verification</option>
          <option value="paid">Paid / verified</option>
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          aria-label="Order date filter"
          className="field bg-white/50"
        >
          <option value="all">Any date</option>
          <option value="today">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
        <button type="button" className="btn" onClick={() => { setQuery(""); setOrderFilter("all"); setPaymentFilter("all"); setSourceFilter("all"); setDateFilter("all"); }}>Clear filters</button>
      </div>
      {status && (
        <p className="mt-4 border-l-2 border-[#96724f] bg-white/40 px-4 py-3 text-xs text-black/60">
          {status}
        </p>
      )}
      <div className="mt-5 overflow-hidden border border-black/10 bg-[#f6f3ed]">
        <div className="hidden min-h-12 grid-cols-[64px_minmax(210px,1.1fr)_minmax(210px,1fr)_130px_180px_120px_70px] items-center gap-x-5 border-b border-black/10 bg-white/25 px-4 text-[10px] uppercase tracking-[.14em] text-black/45 lg:grid">
          <span className="text-center">Product</span>
          <span className="flex h-full items-center">Order / date</span>
          <span className="flex h-full items-center">Customer</span>
          <span className="flex h-full items-center justify-end text-right">Total</span>
          <span className="flex h-6 items-center border-l border-black/10 pl-5">Payment</span>
          <span className="flex h-full items-center justify-center text-center">Status</span>
          <span className="flex h-full items-center justify-end text-right">Action</span>
        </div>
        {visible.length ? (
          visible.map((order) => {
            const detail = details[order.orderId],
              isOpen = open === order.orderId,
              firstItem = order.items?.[0],
              firstProduct = resolveCurrentProduct(data.products, firstItem),
              firstImage = firstProduct?.media.find(
                (media) => media.type === "image",
              ),
              additionalItems = Math.max(0, (order.items?.length || 0) - 1),
              normalizedOrderStatus = normalizeOrderStatus(detail?.orderStatus||order.orderStatus);
            return (
              <article
                key={order.orderId}
                className="border-b border-black/10 transition-colors last:border-0 hover:bg-white/25"
              >
                <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 lg:grid-cols-[64px_minmax(210px,1.1fr)_minmax(210px,1fr)_130px_180px_120px_70px] lg:gap-x-5">
                  <button
                    type="button"
                    onClick={() => void toggle(order.orderId)}
                    className="relative grid h-16 w-12 place-items-center justify-self-center bg-[#ebe8e1]"
                    aria-label={`View order ${order.orderId}`}
                  >
                    {firstImage ? <img src={firstImage.url} alt="" loading="lazy" className="h-16 w-12 object-contain" /> : <span className="px-1 text-center text-[8px] uppercase tracking-wide text-black/30">No image</span>}
                    {additionalItems > 0 && <span className="absolute -right-2 -top-2 grid min-h-5 min-w-5 place-items-center rounded-full border border-white bg-black px-1 text-[9px] font-medium text-white">+{additionalItems}</span>}
                  </button>
                  <button type="button" onClick={() => void toggle(order.orderId)} className="flex min-h-16 min-w-0 flex-col justify-center text-left">
                    <p className="truncate text-sm font-medium">{order.orderId}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-black/45">
                        {new Date(order.createdAt).toLocaleString("en-LK", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {order.sourcePreorderRequestId ? (
                        <span className="border border-[#96724f]/30 bg-[#96724f]/5 px-1.5 py-0.5 text-[8px] font-medium tracking-[.12em] text-[#765638]">
                          PRE-ORDER
                        </span>
                      ) : <span className="border border-black/10 px-1.5 py-0.5 text-[8px] font-medium tracking-[.12em] text-black/45">NORMAL ORDER</span>}
                    </div>
                  </button>
                  <div className="col-span-2 flex min-h-12 min-w-0 flex-col justify-center border-t border-black/[.06] pt-2 lg:col-span-1 lg:min-h-16 lg:border-0 lg:pt-0">
                    <p className="truncate text-sm">{order.customerName}</p>
                    <p className="mt-1 truncate text-xs text-black/45">
                      {order.phone} · {order.district}
                    </p>
                  </div>
                  <span className="col-span-2 flex min-h-10 items-center text-sm font-medium tabular-nums lg:col-span-1 lg:min-h-16 lg:justify-end lg:text-right">{money(Number(order.total))}</span>
                  <div className="col-span-2 flex min-h-10 min-w-0 flex-col justify-center lg:col-span-1 lg:min-h-10 lg:border-l lg:border-black/10 lg:pl-5">
                    <p className="text-xs font-medium">{order.sourcePreorderRequestId ? "Product Paid ✓" : order.paymentMethod === "cod" ? "COD" : "BANK"}</p>
                    <p className="mt-1 truncate whitespace-nowrap text-[10px] uppercase tracking-[.08em] text-black/45" title={order.sourcePreorderRequestId ? `Amount to collect ${money(Number(order.amountToCollect || 0))}` : order.paymentStatus}>
                      {order.sourcePreorderRequestId ? `Courier Due ${money(Number(order.amountToCollect || 0))}` : order.paymentStatus}
                    </p>
                  </div>
                  <span className="col-span-2 w-fit rounded-full border border-black/10 bg-white/30 px-3 py-1 text-center text-[10px] uppercase tracking-wider lg:col-span-1 lg:min-w-20 lg:justify-self-center">
                    {order.sourcePreorderRequestId ? convertedOrderStatusLabel(order.orderStatus) : orderStatusLabel(order.orderStatus)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggle(order.orderId)}
                    className="col-span-2 min-h-9 justify-self-end px-2 text-xs font-medium underline underline-offset-4 lg:col-span-1"
                  >
                    {isOpen ? "CLOSE" : "VIEW"}
                  </button>
                </div>
                {isOpen && (
                  <>
                  <button type="button" aria-label="Close order details" onClick={() => setOpen("")} className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-[1px]" />
                  <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} transition={{ type: "tween", duration: .28 }} className="fixed inset-y-0 right-0 z-[100] w-full overflow-y-auto overflow-x-hidden bg-[#f6f3ed] p-5 shadow-[-20px_0_60px_rgba(0,0,0,.18)] sm:w-[760px] sm:p-7 lg:w-[860px]">
                    <div className="mb-6 flex items-start justify-between gap-4 border-b border-black/10 pb-5">
                      <div className="min-w-0"><p className="eyebrow text-black/45">Order details</p><h2 className="mt-2 break-all text-xl font-medium">{order.orderId}</h2><p className="mt-1 text-xs text-black/45">{new Date(order.createdAt).toLocaleString("en-LK")}</p><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-black/50" onClick={() => { void navigator.clipboard.writeText(order.orderId); setStatus("Order ID copied."); }}><Copy size={12}/> Copy order ID</button><span className="admin-status">{order.sourcePreorderRequestId ? "PRE-ORDER" : "NORMAL ORDER"}</span><span className="admin-status">{order.orderStatus}</span><span className="admin-status admin-status--info">{order.paymentStatus}</span></div></div>
                      <button type="button" onClick={() => setOpen("")} className="btn px-4">Close</button>
                    </div>
                    {loadingId === order.orderId ? (
                      <p className="py-8 text-center text-sm text-black/45">
                        Loading order details…
                      </p>
                    ) : detail ? (
                      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
                        <div className="space-y-7">
                          <div>
                            <p className="eyebrow text-black/45">Products</p>
                            <div className="mt-3 divide-y divide-black/10">
                              {(detail.items || []).map((item, index) => {
                                const product = resolveCurrentProduct(data.products, item),
                                  image = product?.media.find((media) => media.type === "image");
                                return <div key={item.orderItemId || item.variantId || index} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm">
                                  {product ? <Link to={`/admin/products/${product.id}`} className="grid aspect-[4/5] place-items-center overflow-hidden bg-black/[.04]" aria-label={`View ${item.productName || item.name || "product"}`}>{image ? <img src={image.url} alt="" loading="lazy" className="h-full w-full object-contain" /> : <span className="text-[9px] text-black/35">No image</span>}</Link> : <div className="grid aspect-[4/5] place-items-center bg-black/[.04] text-[9px] text-black/35">Unavailable</div>}
                                  <div className="min-w-0">
                                    {product ? <Link to={`/admin/products/${product.id}`} className="font-medium hover:underline">{item.productName || item.name || "Item"}</Link> : <p className="font-medium">{item.productName || item.name || "Item"}</p>}
                                    <p className="mt-1 text-xs text-black/45">{item.color} / {item.size} · Qty {item.quantity}{String(item.isPreorder).toLowerCase() === "true" ? " · PRE-ORDER" : ""}</p>
                                    <p className="mt-1 text-xs text-black/55">{money(Number(item.unitPrice))} each</p>
                                    {product ? <Link to={`/admin/products/${product.id}`} className="mt-1 inline-block text-[10px] font-medium underline underline-offset-4">View product →</Link> : <p className="mt-1 text-[10px] font-medium text-amber-800">Product unavailable</p>}
                                  </div>
                                  <b className="whitespace-nowrap font-normal">{money(Number(item.lineTotal || Number(item.unitPrice) * Number(item.quantity)))}</b>
                                </div>;
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="eyebrow text-black/45">
                              Customer & delivery
                            </p>
                            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                              <Info label="Source" value={detail.sourcePreorderRequestId ? "Pre-order" : (detail.source || "web").replace("_", " ")} />
                              <Info label="Name" value={detail.customerName} />
                              <Info label="Phone" value={detail.phone} />
                              <div><p className="text-[10px] uppercase tracking-[.14em] text-black/40">WhatsApp</p>{detail.whatsapp ? <a className="mt-1 inline-flex items-center gap-1 text-sm underline underline-offset-4" href={`https://wa.me/${String(detail.whatsapp).replace(/\D/g, "").replace(/^0/, "94")}`} target="_blank" rel="noreferrer"><MessageCircle size={13}/>{detail.whatsapp}</a> : <p className="mt-1 text-sm">—</p>}</div>
                              <Info label="Email" value={detail.email || "—"} />
                              <Info
                                label="District / city"
                                value={[detail.district, detail.city]
                                  .filter(Boolean)
                                  .join(" · ")}
                              />
                              <Info
                                label="Postal code"
                                value={detail.postalCode || "—"}
                              />
                              <div className="sm:col-span-2">
                                <Info
                                  label="Delivery address"
                                  value={[
                                    detail.address1,
                                    detail.address2,
                                    detail.city,
                                    detail.district,
                                    detail.postalCode,
                                  ]
                                    .filter(Boolean)
                                    .join(", ")}
                                />
                              </div>
                              {detail.deliveryNotes && (
                                <div className="sm:col-span-2">
                                  <Info
                                    label="Delivery instructions"
                                    value={detail.deliveryNotes}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <OrderDetailsEditor
                            order={detail}
                            onSaved={(updated) => {
                              setDetails((current) => ({
                                ...current,
                                [order.orderId]: {
                                  ...current[order.orderId],
                                  ...updated,
                                },
                              }));
                              setStatus("Customer and delivery details updated.");
                            }}
                          />
                          {detail.sourcePreorderRequestId && <Panel title="Linked preorder"><div className="space-y-3 text-sm"><Link className="font-medium underline underline-offset-4" to={`/admin/preorders?search=${encodeURIComponent(detail.sourcePreorderRequestId)}`}>Original pre-order: {detail.sourcePreorderRequestId}</Link><Info label="Pre-order created" value={detail.sourcePreorderCreatedAt ? new Date(detail.sourcePreorderCreatedAt).toLocaleString("en-LK") : "—"}/><Info label="Customer notified" value={detail.sourcePreorderNotifiedAt ? new Date(detail.sourcePreorderNotifiedAt).toLocaleString("en-LK") : "—"}/><Info label="Estimated delivery" value={detail.minimumDeliveryDays != null && detail.maximumDeliveryDays != null ? `${detail.minimumDeliveryDays}–${detail.maximumDeliveryDays} working days` : "—"}/></div></Panel>}
                        </div>
                        <div className="space-y-5">
                          <Panel title="Order control">
                            <label className="mb-3 block text-xs">
                              Order status
                              <select
                                disabled={savingId === order.orderId}
                                className="field mt-2"
                                value={normalizedOrderStatus}
                                onChange={(e) => {
                                   const value = normalizeOrderStatus(e.target.value);
                                  if(value==="cancelled"){
                                    const reason=window.prompt("CANCEL ORDER\n\nEnter one reason exactly or add a short custom reason:\nCustomer requested cancellation\nUnable to fulfil\nPayment issue\nDuplicate order\nIncorrect order\nOther");
                                    if(!reason?.trim())return;
                                    void change(order.orderId,{orderStatus:value,cancellationReason:reason.trim(),cancelledBy:"owner"});return;
                                  }
                                  if(value==="dispatched"){
                                     const existingId=detail.fulfilmentCourierId||"";
                                     setDispatchOrderId(order.orderId);setDispatchCourierId(selectDispatchCourierId(admin.couriers,existingId));setDispatchTrackingNumber(detail.trackingNumber||"");setDispatchTrackingUrl(detail.trackingUrl||"");
                                     setDispatchHandover(sriLankaDateTimeLocal());return;
                                  }
                                  if(value==="delivered"&&!window.confirm("Mark this order as delivered?"))return;
                                  void change(order.orderId,{orderStatus:value});
                                }}
                              >
                                {[
                                  normalizedOrderStatus,
                                  ...(
                                    detail.sourcePreorderRequestId ? {
                                      pending: ["dispatched", "cancelled"],
                                      dispatched: ["delivered"],
                                      delivered: [],
                                      cancelled: [detail.cancelledFromStatus||"pending"],
                                    } : {
                                      pending: ["confirmed", "cancelled"],
                                      confirmed: ["dispatched","cancelled"],
                                      dispatched: ["delivered"],
                                      delivered: [],
                                      cancelled: [detail.cancelledFromStatus||"pending"],
                                    } as Record<string, string[]>
                                  )[
                                    normalizedOrderStatus
                                  ],
                                ].map((value) => (
                                  <option key={value} value={value}>
                                    {value===String(detail.cancelledFromStatus||"")&&String(detail.orderStatus).toLowerCase()==="cancelled"?`Restore to ${value}`:value}
                                  </option>
                                ))}
                              </select>
                              {savingId===order.orderId?<span className="mt-2 block text-[11px] text-black/45">Updating…</span>:null}
                            </label>
                            {detail.paymentMethod==="bank"?<label className="block text-xs">
                              Payment status
                              <select
                                disabled={savingId === order.orderId || Boolean(detail.sourcePreorderRequestId)}
                                className="field mt-2"
                                value={String(detail.paymentStatus || "")}
                                onChange={(e) =>
                                  void change(order.orderId, {
                                    paymentStatus: e.target.value,
                                  })
                                }
                              >
                                {[
                                      "verification required",
                                      "receipt submitted",
                                      "paid",
                                      "verified",
                                      "rejected",
                                      "refund pending",
                                      "refunded",
                                    ].map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </label>:<Info label="Payment method" value="Cash on delivery"/>}
                            {dispatchOrderId===order.orderId?<div className="mt-4 border border-bronze/25 bg-white/45 p-4"><p className="text-xs font-semibold uppercase tracking-wider">Mark as dispatched</p><p className="mt-2 text-xs text-black/55">Confirm that this parcel has been handed over to the courier.</p><div className="mt-4 grid gap-3"><label className="text-xs">Courier<select className="field mt-2" value={dispatchCourierId} onChange={e=>setDispatchCourierId(e.target.value)}><option value="">Select courier</option>{admin.couriers.filter(courier=>courier.active).map(courier=><option key={courier.id} value={courier.id}>{courier.name}</option>)}</select></label><label className="text-xs">Handover date/time (Sri Lanka)<input className="field mt-2" type="datetime-local" value={dispatchHandover} onChange={e=>setDispatchHandover(e.target.value)}/></label><details className="border-t border-black/10 pt-3"><summary className="cursor-pointer text-xs text-black/55">Advanced tracking fields</summary><div className="mt-3 grid gap-3"><Field label="Tracking number (optional)" value={dispatchTrackingNumber} onChange={setDispatchTrackingNumber}/><Field label="Tracking URL (optional)" value={dispatchTrackingUrl} onChange={setDispatchTrackingUrl}/></div></details><div className="flex gap-2"><button type="button" className="btn btn-dark" disabled={savingId===order.orderId||!dispatchCourierId||!dispatchHandover} onClick={async()=>{const url=dispatchTrackingUrl.trim();if(url&&!/^https:\/\//i.test(url)){setStatus("Tracking URL must start with https://");return;}const saved=await change(order.orderId,{orderStatus:"dispatched",fulfilmentCourierId:dispatchCourierId,trackingNumber:dispatchTrackingNumber.trim(),trackingUrl:url,courierSentDate:sriLankaDateTimeToIso(dispatchHandover)});if(saved)setDispatchOrderId("");}}>{savingId===order.orderId?"Updating…":"CONFIRM HANDOVER"}</button><button type="button" className="btn" disabled={savingId===order.orderId} onClick={()=>setDispatchOrderId("")}>Cancel</button></div></div></div>:null}
                          </Panel>
                          <Panel title="Payment">
                            <div className="space-y-3 text-sm">
                              {detail.sourcePreorderRequestId ? <>
                                <Info label="Product total" value={money(Number(detail.subtotal))}/>
                                <Info label="Product payment" value="PAID ✓"/>
                                <Info label="Amount already paid" value={money(Number(detail.amountPaid ?? detail.subtotal))}/>
                              </> : null}
                              <Info
                                label="Method"
                                value={
                                  detail.sourcePreorderRequestId
                                    ? "Product prepaid · courier fee on delivery"
                                    : detail.paymentMethod === "cod"
                                    ? "Cash on delivery"
                                    : "Bank transfer"
                                }
                              />
                              {detail.paymentReference && (
                                <Info
                                  label="Transfer reference"
                                  value={detail.paymentReference}
                                />
                              )}
                              <Info
                                label="Payment status"
                                value={detail.paymentStatus}
                              />
                              {detail.paymentReceiptUrl && (
                                <ProtectedReceipt
                                  url={detail.paymentReceiptUrl}
                                />
                              )}{" "}
                            </div>
                          </Panel>
                          <Panel title={detail.sourcePreorderRequestId ? "Delivery" : "Totals"}>
                            <div className="space-y-2 text-sm">
                              {detail.sourcePreorderRequestId ? <>
                                <div className="flex justify-between"><span>Courier fee</span><span>{money(Number(detail.deliveryFee))}</span></div>
                                <div className="flex justify-between border-y border-black/10 py-3 text-base"><b>AMOUNT TO COLLECT</b><b>{money(Number(detail.amountToCollect ?? detail.deliveryFee))}</b></div>
                                <div className="flex justify-between"><span>Grand total</span><b>{money(Number(detail.total))}</b></div>
                                <Info label="Collection" value={detail.fulfillmentMethod === "pickup" ? "No courier collection" : "Courier on delivery"}/>
                                {detail.fulfillmentMethod !== "pickup" && <p className="border-l-2 border-[#96724f] pl-3 text-xs font-medium">Collect {money(Number(detail.amountToCollect ?? detail.deliveryFee))} on delivery.</p>}
                              </> : <>
                              <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span>{money(Number(detail.subtotal))}</span>
                              </div>
                              {Number(detail.discountAmount||0)>0&&<div className="flex justify-between"><span>Discount{detail.discountCode?` (${detail.discountCode})`:""}</span><span>-{money(Number(detail.discountAmount))}</span></div>}
                              <div className="flex justify-between">
                                <span>Delivery</span>
                                <span>
                                  {Number(detail.deliveryFee)
                                    ? money(Number(detail.deliveryFee))
                                    : "Complimentary"}
                                </span>
                              </div>
                              <div className="flex justify-between border-t border-black/10 pt-3">
                                <b>Total</b>
                                <b>{money(Number(detail.total))}</b>
                              </div>
                              </>}
                            </div>
                          </Panel>
                          {detail.sourcePreorderRequestId && <Panel title="Status / timeline"><ol className="space-y-2 text-xs"><li><b>Created</b> · {new Date(detail.createdAt).toLocaleString("en-LK")}</li><li><b>Product payment verified</b> · before conversion</li><li><b>Pre-order converted</b> · {new Date(detail.createdAt).toLocaleString("en-LK")}</li><li className={detail.orderStatus === "dispatched" || detail.orderStatus === "delivered" ? "" : "text-black/35"}><b>Dispatched</b>{detail.courierSentDate ? ` · ${new Date(detail.courierSentDate).toLocaleString("en-LK")}` : ""}</li><li className={detail.orderStatus === "delivered" ? "" : "text-black/35"}><b>Delivered</b></li></ol></Panel>}
                          {normalizedOrderStatus==="dispatched"||normalizedOrderStatus==="delivered"?<Panel title="Delivery"><div className="space-y-3 text-sm"><Info label="Status" value={normalizedOrderStatus==="dispatched"?"Dispatched":"Delivered"}/><Info label="Courier" value={detail.fulfilmentCourierName||detail.courierName||"Not added"}/><Info label="Tracking" value={detail.trackingNumber||"Not added"}/><Info label="Handed to courier" value={detail.courierSentDate?new Date(detail.courierSentDate).toLocaleString("en-LK"):"Not added"}/>{detail.trackingUrl?<a className="btn inline-flex" href={detail.trackingUrl} target="_blank" rel="noreferrer">Open courier tracking</a>:null}</div></Panel>:<FulfilmentPanel
                            order={detail}
                            couriers={admin.couriers}
                            busy={savingId === order.orderId}
                            save={(patch) => void change(order.orderId, patch)}
                          />}
                          <ReturnsPanel order={detail} onMessage={setStatus} />
                        </div>
                      </div>
                    ) : (
                      <p className="py-8 text-center text-sm text-black/45">
                        Order details unavailable.
                      </p>
                    )}
                  </motion.div>
                  </>
                )}
              </article>
            );
          })
        ) : (
          <Empty
            text={
              admin.orders.length
                ? "No orders match these filters."
                : "No orders yet."
            }
          />
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-black/45">
          Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–
          {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}{" "}
          orders
        </p>
        <div className="flex items-center gap-2">
          <button
            className="btn"
            disabled={safePage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft size={15} /> Previous
          </button>
          <span className="px-2 text-xs">
            Page {safePage} / {pageCount}
          </span>
          <button
            className="btn"
            disabled={safePage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
function ProtectedReceipt({ url }: { url?: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function open() {
    if (!url) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payment-receipt-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          cache: "no-store",
        }),
        payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url)
        throw new Error(payload.error || "Could not open receipt.");
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not open receipt.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[.14em] text-black/40">
        Receipt
      </p>
      {url ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void open()}
            className="btn mt-2 w-full justify-center"
          >
            {busy ? "Opening secure receipt…" : "View receipt"}{" "}
            <ExternalLink size={14} />
          </button>
          <p className="mt-2 text-[10px] leading-5 text-black/45">
            Receipt access is generated for an authorised admin session only.
          </p>
          {error && (
            <p className="mt-2 text-xs text-red-800" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 border border-amber-900/20 bg-amber-900/[.05] p-3 text-xs text-amber-950">
          No receipt attached.
        </p>
      )}
    </div>
  );
}
function FulfilmentPanel({
  order,
  couriers,
  busy,
  save,
}: {
  order: AdminOrderDetail;
  couriers: CourierProvider[];
  busy: boolean;
  save: (patch: Partial<Order>) => void;
}) {
  const [courierId, setCourierId] = useState(
      order.fulfilmentCourierId || "",
    ),
    [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || ""),
    [trackingUrl, setTrackingUrl] = useState(order.trackingUrl || ""),
    [sentDate, setSentDate] = useState(order.courierSentDate || ""),
    [error, setError] = useState("");
  const submit = () => {
    const url = trackingUrl.trim();
    if (url && !/^https:\/\//i.test(url)) {
      setError("Tracking URL must start with https://");
      return;
    }
    setError("");
    save({
      fulfilmentCourierId: courierId,
      trackingNumber: trackingNumber.trim(),
      trackingUrl: url,
      courierSentDate: sentDate,
    });
  };
  return (
    <Panel title="Fulfilment">
      <div className="mb-4 grid gap-3 border-l-2 border-bronze bg-black/[.025] p-3 text-xs sm:grid-cols-2">
        <Info label="Courier" value={order.courierName || "Legacy delivery"}/>
        <Info label="Pricing mode" value={order.deliveryPricingMode === "flat" ? "Flat rate" : "Area based"}/>
        <Info label="Delivery zone" value={order.deliveryZoneName || (order.deliveryPricingMode === "flat" ? "Nationwide" : "Not recorded")}/>
        <Info label="Delivery fee" value={Number(order.deliveryFee)?money(Number(order.deliveryFee)):"Complimentary"}/>
      </div>
      <div className="grid gap-3">
        <label className="text-xs">
          Actual fulfilment courier
          <select
            className="field mt-2"
            value={courierId}
            onChange={(e) => setCourierId(e.target.value)}
          >
            <option value="">Select courier</option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name}
                {courier.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Tracking number"
          value={trackingNumber}
          onChange={setTrackingNumber}
        />
        <Field
          label="Tracking URL"
          value={trackingUrl}
          onChange={setTrackingUrl}
        />
        <label className="text-xs">
          Courier sent date
          <input
            className="field mt-2"
            type="date"
            value={sentDate}
            onChange={(e) => setSentDate(e.target.value)}
          />
        </label>
        {error && (
          <p className="text-xs text-red-800" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="btn btn-dark" onClick={submit}>
          Save fulfilment
        </button>
      </div>
    </Panel>
  );
}
type AdminOrderLine = {
  orderItemId?: number;
  productId?: string;
  variantId?: string;
  productName?: string;
  name?: string;
  color?: string;
  size?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  sku?: string;
  isPreorder?: boolean | string;
};
type AdminOrderDetail = Omit<Order, "items"> & { items: AdminOrderLine[] };
type AdminReturn = {
  id: string;
  type: "customer_return" | "courier_rto";
  status: string;
  reason: string;
  createdAt: string;
  items?: Array<{
    id: number;
    orderItemId: number;
    quantity: number;
    restockable?: boolean;
    productName?: string;
    color?: string;
    size?: string;
  }>;
};

function ReturnsPanel({ order, onMessage }: { order: AdminOrderDetail; onMessage: (value: string) => void }) {
  const [returns, setReturns] = useState<AdminReturn[]>([]), [loading, setLoading] = useState(false), [creating, setCreating] = useState(false);
  const eligible = order.orderStatus === "dispatched" || order.orderStatus === "delivered";
  const load = useCallback(async () => { setLoading(true); try { setReturns(await adminApi.get<AdminReturn[]>("listReturns", { orderId: order.orderId })); } catch (reason) { onMessage(reason instanceof Error ? reason.message : "Could not load returns."); } finally { setLoading(false); } }, [onMessage, order.orderId]);
  useEffect(() => { void load(); }, [load]);
  async function create(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const raw = new FormData(event.currentTarget), items = order.items.map((item) => ({ orderItemId: item.orderItemId, quantity: Number(raw.get(`qty-${item.orderItemId}`) || 0) })).filter((item) => item.orderItemId && item.quantity > 0); try { await adminApi.post("createReturn", { orderId: order.orderId, type: raw.get("type"), reason: raw.get("reason"), notes: raw.get("notes"), refundRequired: raw.get("refundRequired") === "on", items }); setCreating(false); onMessage("Return created. Stock has not been changed."); await load(); } catch (reason) { onMessage(reason instanceof Error ? reason.message : "Could not create return."); } }
  async function advance(item: AdminReturn, status: string) { try { const payload: Record<string, unknown> = { returnId: item.id, status }; if (status === "received") payload.items = item.items?.map((line) => ({ id: line.id, restockable: (document.querySelector<HTMLInputElement>(`#restock-${line.id}`)?.checked ?? false) })); const result = await adminApi.post<{ restoredUnits: number }>("updateReturn", payload); onMessage(status === "received" ? `Return received. ${result.restoredUnits} unit${result.restoredUnits === 1 ? "" : "s"} restored to stock.` : `Return marked ${status.replace("_", " ")}.`); await load(); } catch (reason) { onMessage(reason instanceof Error ? reason.message : "Could not update return."); } }
  return <Panel title="Returns"><div className="space-y-4">{loading && <p className="text-xs text-black/45">Loading returns…</p>}{returns.map((item) => <div key={item.id} className="border border-black/10 bg-white/40 p-3 text-xs"><div className="flex justify-between gap-3"><b>{item.type === "courier_rto" ? "Courier RTO" : "Customer return"}</b><span className="uppercase text-black/45">{item.status}</span></div><p className="mt-2 text-black/60">{item.reason}</p>{item.status === "in_transit" && <div className="mt-3 space-y-2">{item.items?.map((line) => <label key={line.id} className="flex items-center justify-between gap-3"><span>{line.productName} · {line.color}/{line.size} · Qty {line.quantity}</span><span><input id={`restock-${line.id}`} type="checkbox" className="mr-2 accent-black"/>Restockable</span></label>)}</div>}<div className="mt-3 flex flex-wrap gap-2">{item.status === "requested" && <><button className="btn" onClick={() => void advance(item,"approved")}>Approve</button><button className="btn" onClick={() => void advance(item,"rejected")}>Reject</button></>}{item.status === "approved" && <button className="btn" onClick={() => void advance(item,"in_transit")}>Mark in transit</button>}{item.status === "in_transit" && <button className="btn btn-dark" onClick={() => void advance(item,"received")}>Mark received</button>}{item.status === "received" && <button className="btn" onClick={() => void advance(item,"completed")}>Complete</button>}</div></div>)}{eligible && !creating && <button className="btn w-full" onClick={() => setCreating(true)}>Create return</button>}{creating && <form onSubmit={create} className="space-y-3 border border-black/10 p-3"><select name="type" className="field" defaultValue={order.orderStatus === "dispatched" ? "courier_rto" : "customer_return"}>{order.orderStatus === "dispatched" && <option value="courier_rto">Courier return / RTO</option>}{order.orderStatus === "delivered" && <option value="customer_return">Customer return</option>}</select><input name="reason" required className="field" placeholder="Reason"/><textarea name="notes" className="field" placeholder="Notes"/><label className="flex items-center gap-2 text-xs"><input name="refundRequired" type="checkbox" className="accent-black"/>Money refund will be required</label>{order.items.map((item) => <label key={item.orderItemId} className="flex items-center justify-between gap-3 text-xs"><span>{item.productName || item.name} · purchased {item.quantity}</span><input name={`qty-${item.orderItemId}`} type="number" min="0" max={item.quantity} defaultValue="0" className="field w-20"/></label>)}<div className="flex gap-2"><button className="btn btn-dark">Create return</button><button type="button" className="btn" onClick={() => setCreating(false)}>Close</button></div></form>}{!eligible && !returns.length && <p className="text-xs leading-5 text-black/45">Returns become available after dispatch or delivery as applicable.</p>}</div></Panel>;
}
function OrderDetailsEditor({ order, onSaved }: { order: AdminOrderDetail; onSaved: (order: AdminOrderDetail) => void }) {
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const locked=["dispatched","delivered","cancelled"].includes(order.orderStatus);
  async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{const raw=Object.fromEntries(new FormData(event.currentTarget));const updated=await adminApi.post<AdminOrderDetail>("updateOrderDetails",{orderId:order.orderId,...raw});onSaved(updated);setEditing(false);}catch(reason){setError(reason instanceof Error?reason.message:"Could not update details.");}finally{setBusy(false);}}
  if(locked)return <p className="border-l-2 border-black/15 pl-3 text-xs leading-5 text-black/45">Customer and delivery details are locked after shipment.</p>;
  if(!editing)return <button type="button" className="btn w-full" onClick={()=>setEditing(true)}>Edit customer & delivery details</button>;
  const fields:[string,string,string][]=[["customerName","Full name",order.customerName],["phone","Phone",order.phone],["whatsapp","WhatsApp",order.whatsapp||""],["email","Email",order.email||""],["address1","Address",order.address1||""],["address2","Address line 2",order.address2||""],["city","City / area",order.city||""],["postalCode","Postal code",order.postalCode||""]];
  return <form onSubmit={save} className="grid gap-3 border border-black/10 bg-white/30 p-4 sm:grid-cols-2"><p className="eyebrow sm:col-span-2">Edit details</p>{fields.map(([name,label,value])=><label key={name} className={`text-xs ${name==="address1"||name==="address2"?"sm:col-span-2":""}`}>{label}<input name={name} defaultValue={value} className="field mt-2" required={["customerName","phone","address1","city"].includes(name)}/></label>)}<label className="text-xs">District<select name="district" defaultValue={order.district} className="field mt-2">{sriLankaDistricts.map(value=><option key={value}>{value}</option>)}</select></label><label className="text-xs sm:col-span-2">Delivery notes<textarea name="deliveryNotes" defaultValue={order.deliveryNotes||""} className="field mt-2" rows={2}/></label>{error&&<p className="text-xs text-red-800 sm:col-span-2">{error}</p>}<div className="flex gap-2 sm:col-span-2"><button disabled={busy} className="btn btn-dark">{busy?"Saving…":"Save details"}</button><button type="button" className="btn" onClick={()=>setEditing(false)}>Cancel</button></div></form>;
}
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[.14em] text-black/40">
        {label}
      </p>
      <div className="mt-1 break-words text-sm leading-6 text-black/70">
        {value || "—"}
      </div>
    </div>
  );
}

function Media() {
  const [config, setConfig] = useState<{
      timestamp: number;
      folder: string;
      signature: string;
      apiKey: string;
      cloudName: string;
    } | null>(null),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uploads, setUploads] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/admin/cloudinary-sign", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setConfig(await response.json());
      })
      .catch(() =>
        setError(
          "Cloudinary is not configured yet. Add the three Cloudinary environment variables to enable signed uploads.",
        ),
      )
      .finally(() => setChecking(false));
  }, []);
  async function upload(file: File) {
    if (!config) return;
    setBusy(true);
    setError("");
    try {
      const fresh = await fetch("/api/admin/cloudinary-sign", {
          method: "POST",
        }),
        signed = (await fresh.json()) as typeof config;
      if (!fresh.ok) throw new Error();
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signed.apiKey);
      form.append("timestamp", String(signed.timestamp));
      form.append("folder", signed.folder);
      form.append("signature", signed.signature);
      const kind = file.type.startsWith("video/") ? "video" : "image",
        response = await fetch(
          `https://api.cloudinary.com/v1_1/${signed.cloudName}/${kind}/upload`,
          { method: "POST", body: form },
        ),
        result = (await response.json()) as { secure_url?: string };
      if (!response.ok || !result.secure_url) throw new Error();
      setUploads((x) => [result.secure_url!, ...x]);
    } catch {
      setError(
        "Upload failed. Check the file type and Cloudinary configuration.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Head eyebrow="Asset library" title="Media" />
      <div className="mt-7 border-2 border-dashed border-black/15 bg-[#f6f3ed] p-8 text-center sm:p-12">
        <p className="display text-3xl">Images and video, securely signed.</p>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-black/45">
          Upload approved catalogue media. Copy the returned URL into a product
          or homepage section.
        </p>
        {checking ? (
          <p className="mt-6 text-xs">Checking Cloudinary…</p>
        ) : config ? (
          <label className="btn btn-dark mt-6 cursor-pointer">
            {busy ? "Uploading…" : "Choose media"}
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
              disabled={busy}
              onChange={(e) =>
                e.target.files?.[0] && void upload(e.target.files[0])
              }
            />
          </label>
        ) : null}
        {error && (
          <p
            className="mx-auto mt-5 max-w-xl bg-red-950 p-3 text-xs text-white"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
      {uploads.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {uploads.map((url) => (
            <div key={url} className="bg-[#f6f3ed] p-3">
              {/\.(mp4|webm|mov)(\?|$)/i.test(url) ? (
                <video
                  src={url}
                  controls
                  muted
                  playsInline
                  className="aspect-[4/3] w-full bg-black object-cover"
                />
              ) : (
                <img
                  src={url}
                  alt="Uploaded media"
                  className="aspect-[4/3] w-full object-cover"
                />
              )}
              <button
                className="mt-3 w-full truncate text-left text-xs underline"
                onClick={() => void navigator.clipboard.writeText(url)}
              >
                {url}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
type SettingsSection="brand"|"payments"|"delivery"|"store";
const settingsSections:SettingsSection[]=["brand","payments","delivery","store"];
const settingsSectionKeys={brand:["brandName","tagline","announcement","whatsapp","phone","email","instagram","tiktok"],payments:["codEnabled","bankEnabled","bankName","accountName","accountNumber","branch"],delivery:["deliveryEnabled","freeDeliveryThreshold"],store:["storeOpen","ordersEnabled","defaultTitle","defaultDescription"]} as const;
const settingsSectionLabels:Record<SettingsSection,string>={brand:"Brand & contact settings",payments:"Payment settings",delivery:"Delivery settings",store:"Store settings"};
function SectionSave({section,label,busy,status,save}:{section:SettingsSection;label:string;busy:boolean;status:string;save:(section:SettingsSection)=>Promise<void>}){return <div className="mt-5 border-t border-black/10 pt-4"><button type="button" className="btn btn-dark min-h-11 w-full justify-center" disabled={busy} onClick={()=>void save(section)}>{busy?"Saving…":label}</button>{status&&<p className={`mt-3 text-xs ${status.endsWith("saved.")?"text-emerald-800":"text-red-800"}`} role="status">{status}</p>}</div>}
function ExplicitSettings({ focus }: { focus: string }) {
  const s = useStore(),
    [draft, setDraft] = useState(s.data.settings),
    [busy, setBusy] = useState<Record<SettingsSection,boolean>>({brand:false,payments:false,delivery:false,store:false}),
    [status, setStatus] = useState<Record<SettingsSection,string>>({brand:"",payments:"",delivery:"",store:""}),
    dirty=useRef(new Set<SettingsSection>());
  useEffect(() => setDraft(current=>{
    const next={...current};
    for(const section of settingsSections)if(!dirty.current.has(section))for(const key of settingsSectionKeys[section])Object.assign(next,{[key]:s.data.settings[key]});
    return next;
  }), [s.data.settings]);
  const change = <K extends keyof typeof draft>(
    section: SettingsSection,
    key: K,
    value: (typeof draft)[K],
  ) => {dirty.current.add(section);setStatus(current=>({...current,[section]:""}));setDraft((x) => ({ ...x, [key]: value }));};
  const validUrl = (value: string) => {
    if (!value.trim()) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  };
  async function submit(section:SettingsSection) {
    setStatus(current=>({...current,[section]:""}));
    if (section==="brand"&&!draft.brandName.trim()) return setStatus(current=>({...current,brand:"Brand name is required."}));
    if (section==="brand"&&
      draft.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())
    )
      return setStatus(current=>({...current,brand:"Enter a valid contact email."}));
    if (section==="brand"&&draft.whatsapp.trim() && !adminPhone.test(draft.whatsapp.trim()))
      return setStatus(current=>({...current,brand:"Enter a valid WhatsApp number."}));
    if (section==="brand"&&draft.phone.trim() && !adminPhone.test(draft.phone.trim()))
      return setStatus(current=>({...current,brand:"Enter a valid phone number."}));
    if (section==="brand"&&(!validUrl(draft.instagram) || !validUrl(draft.tiktok)))
      return setStatus(current=>({...current,brand:"Instagram and TikTok must be valid http(s) URLs or left blank."}));
    if (section==="delivery"&&(!Number.isFinite(draft.freeDeliveryThreshold) || draft.freeDeliveryThreshold < 0))
      return setStatus(current=>({...current,delivery:"Delivery amounts cannot be negative."}));
    if (section==="store"&&draft.ordersEnabled && !s.data.settings.codEnabled && !s.data.settings.bankEnabled)
      return setStatus(current=>({...current,store:"Save an enabled payment method before enabling online orders."}));
    if (section==="payments"&&
      draft.bankEnabled &&
      (!draft.bankName.trim() ||
        !draft.accountName.trim() ||
        !draft.accountNumber.trim())
    )
      return setStatus(current=>({...current,payments:"Complete bank name, account name and account number before enabling bank transfer."}));
    const patch=Object.fromEntries(settingsSectionKeys[section].map(key=>[key,draft[key]]));
    setBusy(current=>({...current,[section]:true}));
    try {
      await s.commitSettings(patch);
      dirty.current.delete(section);
      setStatus(current=>({...current,[section]:`${settingsSectionLabels[section]} saved.`}));
    } catch (reason) {
      setStatus(current=>({...current,[section]:reason instanceof Error ? reason.message : "Could not save settings."}));
    } finally {
      setBusy(current=>({...current,[section]:false}));
    }
  }
  return (
    <>
      <Head
        eyebrow="Store configuration"
        title={focus === "delivery" ? "Delivery" : "Settings"}
      />
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        {focus !== "delivery" && (
          <>
            <Panel title="Brand & contact">
              <Field
                label="Brand name"
                value={draft.brandName}
                onChange={(v) => change("brand", "brandName", v)}
              />
              <Field
                label="Tagline"
                value={draft.tagline}
                onChange={(v) => change("brand", "tagline", v)}
              />
              <Field
                label="Announcement"
                value={draft.announcement}
                onChange={(v) => change("brand", "announcement", v)}
              />
              <Field
                label="WhatsApp"
                value={draft.whatsapp}
                onChange={(v) => change("brand", "whatsapp", v)}
              />
              <Field
                label="Phone"
                value={draft.phone}
                onChange={(v) => change("brand", "phone", v)}
              />
              <Field
                label="Email"
                value={draft.email}
                onChange={(v) => change("brand", "email", v)}
              />
              <Field
                label="Instagram URL"
                value={draft.instagram}
                onChange={(v) => change("brand", "instagram", v)}
              />
              <Field
                label="TikTok URL"
                value={draft.tiktok}
                onChange={(v) => change("brand", "tiktok", v)}
              />
              <p className="text-xs leading-5 text-black/45">
                These details power the Contact page and footer social links.
              </p>
              <SectionSave section="brand" label="Save Brand & Contact" busy={busy.brand} status={status.brand} save={submit}/>
            </Panel>
            <Panel title="Payments">
              <Toggles
                items={[
                  [
                    "Cash on delivery",
                    draft.codEnabled,
                    (v) => change("payments", "codEnabled", v),
                  ],
                  [
                    "Bank transfer",
                    draft.bankEnabled,
                    (v) => change("payments", "bankEnabled", v),
                  ],
                ]}
              />
              <Field
                label="Bank"
                value={draft.bankName}
                onChange={(v) => change("payments", "bankName", v)}
              />
              <Field
                label="Account name"
                value={draft.accountName}
                onChange={(v) => change("payments", "accountName", v)}
              />
              <Field
                label="Account number"
                value={draft.accountNumber}
                onChange={(v) => change("payments", "accountNumber", v)}
              />
              <Field
                label="Branch"
                value={draft.branch}
                onChange={(v) => change("payments", "branch", v)}
              />
              <SectionSave section="payments" label="Save Payment Settings" busy={busy.payments} status={status.payments} save={submit}/>
            </Panel>
          </>
        )}
        <Panel title="Delivery">
          <Toggles
            items={[
              [
                "Islandwide delivery",
                draft.deliveryEnabled,
                (v) => change("delivery", "deliveryEnabled", v),
              ],
            ]}
          />
          <Field
            label="Free delivery threshold (LKR)"
            value={String(draft.freeDeliveryThreshold)}
            onChange={(v) => change("delivery", "freeDeliveryThreshold", Number(v))}
          />
          <p className="mt-2 text-xs leading-5 text-black/45">
            Courier prices and delivery zones are managed separately so changing
            courier companies never changes your store settings.
          </p>
          <Link to="/admin/delivery" className="btn mt-4 w-full">
            Manage couriers & delivery
          </Link>
          <SectionSave section="delivery" label="Save Delivery Settings" busy={busy.delivery} status={status.delivery} save={submit}/>
        </Panel>
        {focus === "delivery" && <DeliveryRates />}
        <Panel title="Store & SEO">
          <Toggles
            items={[
              ["Store open", draft.storeOpen, (v) => change("store", "storeOpen", v)],
              [
                "Orders enabled",
                draft.ordersEnabled,
                (v) => change("store", "ordersEnabled", v),
              ],
            ]}
          />
          <Field
            label="Default title"
            value={draft.defaultTitle}
            onChange={(v) => change("store", "defaultTitle", v)}
          />
          <Field
            label="Description"
            value={draft.defaultDescription}
            onChange={(v) => change("store", "defaultDescription", v)}
          />
          <SectionSave section="store" label="Save Store Settings" busy={busy.store} status={status.store} save={submit}/>
        </Panel>
        {focus !== "delivery" && <DiscountManager />}
        {focus !== "delivery" && <div className="lg:col-span-2"><AdminSecurity /></div>}
      </div>
    </>
  );
}

function SecurityPassword({name,label,show,setShow,autoComplete}:{name:string;label:string;show:boolean;setShow:(value:boolean)=>void;autoComplete:string}){
  return <label className="label block">{label}<span className="mt-2 flex items-center border border-black/15 bg-white"><input className="field min-w-0 flex-1 border-0" name={name} type={show?"text":"password"} autoComplete={autoComplete} maxLength={200} required/><button type="button" className="grid h-11 w-11 shrink-0 place-items-center text-black/50" onClick={()=>setShow(!show)} aria-label={(show?"Hide ":"Show ")+label.toLowerCase()}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></span></label>;
}
function AdminSecurity(){
  const [security,setSecurity]=useState<{username:string;recoveryConfigured:boolean}|null>(null),[editor,setEditor]=useState<"username"|"password"|"recovery"|null>(null),[status,setStatus]=useState(""),[busy,setBusy]=useState(""),[recoveryCode,setRecoveryCode]=useState(""),[shows,setShows]=useState<Record<string,boolean>>({});
  const load=useCallback(async()=>{try{setSecurity(await adminApi.get("getAdminSecurity"));}catch(reason){setStatus(reason instanceof Error?reason.message:"Could not load security settings.");}},[]);
  useEffect(()=>{void load();},[load]);
  const visibility=(name:string)=>({show:Boolean(shows[name]),setShow:(value:boolean)=>setShows(current=>({...current,[name]:value}))});
  function openEditor(next:"username"|"password"|"recovery"){setEditor(next);setStatus("");setRecoveryCode("");setShows({});}
  function closeEditor(){if(busy)return;setEditor(null);setStatus("");setRecoveryCode("");setShows({});}
  async function submit(event:React.FormEvent<HTMLFormElement>,action:string){event.preventDefault();setBusy(action);setStatus("");setRecoveryCode("");const form=event.currentTarget;try{const result=await adminApi.post<{message:string;username?:string;recoveryCode?:string}>(action,Object.fromEntries(new FormData(form)));setStatus(result.message);if(result.recoveryCode)setRecoveryCode(result.recoveryCode);else setEditor(null);form.reset();await load();}catch(reason){setStatus(reason instanceof Error?reason.message:"Could not update admin security.");}finally{setBusy("");}}
  async function copyRecovery(){if(!recoveryCode)return;try{await navigator.clipboard.writeText(recoveryCode);setStatus("Recovery code copied.");}catch{setStatus("Copy failed. Select and copy the code manually.");}}
  return <Panel title="Admin security">
    <p className="-mt-2 mb-5 text-sm leading-6 text-black/50">Manage your sign-in and recovery details.</p>
    <div className="border-y border-black/10">
      {([{key:"username",label:"Username",value:security?.username||"Loading…",action:"Change"},{key:"password",label:"Password",value:"••••••••",action:"Change"},{key:"recovery",label:"Recovery access",value:security?.recoveryConfigured?"Configured":"Not configured",action:"Manage"}] as const).map((item,index)=><div key={item.key} className={(index?"border-t border-black/10 ":"")+"flex min-h-20 flex-col gap-3 py-4 sm:flex-row sm:items-center"}><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{item.label}</h3><p className="mt-1 truncate text-sm text-black/50">{item.value}</p></div><button type="button" className="btn min-h-11 w-full justify-center px-5 sm:w-auto" disabled={busy!==""} aria-expanded={editor===item.key} onClick={()=>openEditor(item.key)}>{item.action}</button></div>)}
    </div>
    {editor&&<div className="mt-5 bg-black/[0.025] p-4 sm:p-5">
      {editor==="username"&&<form onSubmit={event=>void submit(event,"changeAdminUsername")}><div className="grid gap-4 sm:grid-cols-2"><label className="label block">New username<input key={security?.username} className="field mt-2" name="newUsername" defaultValue={security?.username||""} required/></label><SecurityPassword name="currentPassword" label="Current password" autoComplete="current-password" {...visibility("username")}/></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 justify-center" onClick={closeEditor}>Cancel</button><button className="btn btn-dark min-h-11 justify-center" disabled={busy!==""}>{busy==="changeAdminUsername"?"Saving…":"Save username"}</button></div></form>}
      {editor==="password"&&<form onSubmit={event=>void submit(event,"changeAdminPassword")}><p className="mb-4 text-xs text-black/50">Choose your new password.</p><div className="grid gap-4 sm:grid-cols-3"><SecurityPassword name="currentPassword" label="Current password" autoComplete="current-password" {...visibility("passwordCurrent")}/><SecurityPassword name="newPassword" label="New password" autoComplete="new-password" {...visibility("passwordNew")}/><SecurityPassword name="confirmPassword" label="Confirm password" autoComplete="new-password" {...visibility("passwordConfirm")}/></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 justify-center" onClick={closeEditor}>Cancel</button><button className="btn btn-dark min-h-11 justify-center" disabled={busy!==""}>{busy==="changeAdminPassword"?"Saving…":"Save password"}</button></div></form>}
      {editor==="recovery"&&<form onSubmit={event=>void submit(event,"generateAdminRecoveryCode")}><p className="mb-4 text-sm leading-6 text-black/55">{security?.recoveryConfigured?"Generating a new recovery code invalidates the previous one.":"Create a recovery code to regain access if you forget your password."}</p><div className="max-w-md"><SecurityPassword name="currentPassword" label="Current password" autoComplete="current-password" {...visibility("recovery")}/></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 justify-center" onClick={closeEditor}>Cancel</button><button className="btn btn-dark min-h-11 justify-center" disabled={busy!==""}>{busy==="generateAdminRecoveryCode"?"Generating…":"Generate new recovery code"}</button></div></form>}
    </div>}
    {recoveryCode&&<div className="mt-5 bg-emerald-50 p-4 sm:p-5"><p className="text-sm font-semibold text-emerald-950">New recovery code</p><p className="mt-1 text-xs leading-5 text-emerald-900/70">Save this code somewhere safe. It will only be shown once.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 break-all bg-white p-3 text-sm ring-1 ring-emerald-900/10">{recoveryCode}</code><button type="button" className="btn min-h-11 shrink-0 justify-center" onClick={()=>void copyRecovery()}><Copy size={15}/> Copy</button></div></div>}
    {status&&<p className={"mt-4 text-xs "+(/updated|generated|copied/.test(status)?"text-emerald-800":"text-red-800")} role="status">{status}</p>}
  </Panel>;
}

type AdminDiscount={id:string;code:string;type:"percentage"|"fixed";value:number;minimumSubtotal:number;maximumDiscount:number|null;active:boolean;startsAt:string|null;expiresAt:string|null;usageLimit:number|null;usageCount:number};
const emptyDiscount:Omit<AdminDiscount,"id"|"usageCount">={code:"",type:"percentage",value:10,minimumSubtotal:0,maximumDiscount:null,active:true,startsAt:null,expiresAt:null,usageLimit:null};
function localDateTime(value:string|null|undefined){if(!value)return"";const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function DiscountManager(){
  const [items,setItems]=useState<AdminDiscount[]>([]),[draft,setDraft]=useState<Partial<AdminDiscount>>({...emptyDiscount}),[editorOpen,setEditorOpen]=useState(false),[advancedOpen,setAdvancedOpen]=useState(false),[deleting,setDeleting]=useState<AdminDiscount|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
  const load=useCallback(async()=>{try{setItems(await adminApi.get<AdminDiscount[]>("listDiscounts"));}catch(reason){setStatus(reason instanceof Error?reason.message:"Could not load discounts.");}},[]);
  useEffect(()=>{void load();},[load]);
  function openCreate(){setDraft({...emptyDiscount});setAdvancedOpen(false);setStatus("");setEditorOpen(true);}
  function openEdit(item:AdminDiscount){setDraft({...item});setAdvancedOpen(Boolean(item.maximumDiscount||item.usageLimit||item.startsAt||item.expiresAt));setStatus("");setEditorOpen(true);}
  function closeEditor(){if(!busy){setEditorOpen(false);setDraft({...emptyDiscount});}}
  async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setStatus("");try{const editing=Boolean(draft.id);await adminApi.post("saveDiscount",{...(draft.id?{id:draft.id}:{}),code:String(draft.code||"").trim().toUpperCase(),type:draft.type||"percentage",value:Number(draft.value),minimumSubtotal:Number(draft.minimumSubtotal||0),maximumDiscount:draft.type==="percentage"&&draft.maximumDiscount!=null?Number(draft.maximumDiscount):null,active:draft.active!==false,startsAt:draft.startsAt||null,expiresAt:draft.expiresAt||null,usageLimit:draft.usageLimit!=null?Number(draft.usageLimit):null});setEditorOpen(false);setDraft({...emptyDiscount});setStatus(editing?"Discount updated.":"Discount created.");await load();}catch(reason){setStatus(reason instanceof Error?reason.message:"Could not save discount.");}finally{setBusy(false);}}
  async function remove(){if(!deleting)return;setBusy(true);setStatus("");try{await adminApi.post("deleteDiscount",{id:deleting.id});setDeleting(null);setStatus(`Discount ${deleting.code} deleted.`);await load();}catch(reason){setStatus(reason instanceof Error?reason.message:"Could not delete discount.");}finally{setBusy(false);}}
  return <Panel title="Discounts">
    <div className="mb-4 flex items-center justify-between gap-3"><p className="text-xs leading-5 text-black/50">Create, update, disable, or remove checkout codes.</p><button type="button" className="btn btn-dark min-h-10 shrink-0" onClick={openCreate}><Plus size={15}/> Create Discount</button></div>
    <div className="space-y-2">{items.length===0?<div className="border border-dashed border-black/15 p-5 text-center text-sm text-black/50">No discounts yet.</div>:items.map(item=><div key={item.id} className="flex flex-col gap-3 border border-black/10 bg-white/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-sm tracking-wide">{item.code}</b><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.active?"bg-emerald-100 text-emerald-800":"bg-black/10 text-black/55"}`}>{item.active?"Active":"Inactive"}</span></div><p className="mt-1 text-xs text-black/55"><strong className="text-black/75">{item.type==="percentage"?`${item.value}% OFF`:`${money(item.value)} OFF`}</strong>{item.minimumSubtotal>0?` · Minimum ${money(item.minimumSubtotal)}`:""} · Used {item.usageCount} / {item.usageLimit??"Unlimited"}</p></div>
      <div className="flex gap-2"><button type="button" className="btn min-h-9 flex-1 px-4 sm:flex-none" onClick={()=>openEdit(item)}>Edit</button><button type="button" className="btn min-h-9 flex-1 border-red-900/20 px-4 text-red-800 sm:flex-none" onClick={()=>setDeleting(item)}>Delete</button></div>
    </div>)}</div>
    {status&&<p className="mt-3 text-xs" role="status">{status}</p>}
    {editorOpen&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5" role="presentation"><div className="max-h-[92vh] w-full overflow-y-auto bg-[#f3f0ea] p-5 shadow-2xl sm:max-w-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="discount-editor-title">
      <div className="mb-5 flex items-center justify-between gap-4"><div><p className="eyebrow text-black/45">Discounts</p><h2 id="discount-editor-title" className="mt-1 text-xl font-semibold">{draft.id?`Edit ${draft.code}`:"Create Discount"}</h2></div><button type="button" className="grid h-10 w-10 place-items-center" aria-label="Close discount form" onClick={closeEditor}><X size={19}/></button></div>
      <form onSubmit={save}>
        <div className="grid gap-x-4 sm:grid-cols-2"><label className="mb-3 block text-xs">Discount code<input className="field mt-2 uppercase" required maxLength={40} pattern="[A-Za-z0-9_-]+" autoFocus value={draft.code||""} onChange={event=>setDraft(current=>({...current,code:event.target.value.toUpperCase()}))} onBlur={event=>setDraft(current=>({...current,code:event.target.value.trim().toUpperCase()}))}/></label><label className="mb-3 block text-xs">Discount type<select className="field mt-2" value={draft.type||"percentage"} onChange={event=>setDraft(current=>({...current,type:event.target.value as AdminDiscount["type"],maximumDiscount:event.target.value==="fixed"?null:current.maximumDiscount}))}><option value="percentage">Percentage</option><option value="fixed">Fixed LKR</option></select></label><label className="mb-3 block text-xs">Discount value<input className="field mt-2" type="number" required min="0.01" max={draft.type==="percentage"?100:undefined} step="0.01" value={draft.value??""} onChange={event=>setDraft(current=>({...current,value:event.target.value===""?undefined:Number(event.target.value)}))}/></label><label className="mb-3 block text-xs">Minimum order value<input className="field mt-2" type="number" required min="0" step="0.01" value={draft.minimumSubtotal??0} onChange={event=>setDraft(current=>({...current,minimumSubtotal:event.target.value===""?undefined:Number(event.target.value)}))}/></label></div>
        <label className="my-2 flex min-h-11 items-center gap-3 text-sm"><input className="h-5 w-5 accent-black" type="checkbox" checked={draft.active!==false} onChange={event=>setDraft(current=>({...current,active:event.target.checked}))}/><span><b className="block">Active</b><small className="text-black/50">Inactive codes are rejected at checkout.</small></span></label>
        <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-between border-y border-black/10 py-3 text-left text-sm font-semibold" aria-expanded={advancedOpen} onClick={()=>setAdvancedOpen(value=>!value)}>Advanced options <ChevronRight size={16} className={advancedOpen?"rotate-90 transition-transform":"transition-transform"}/></button>
        {advancedOpen&&<div className="mt-4 grid gap-x-4 sm:grid-cols-2">{draft.type==="percentage"&&<label className="mb-3 block text-xs">Maximum discount<input className="field mt-2" type="number" min="0.01" step="0.01" placeholder="No maximum" value={draft.maximumDiscount??""} onChange={event=>setDraft(current=>({...current,maximumDiscount:event.target.value===""?null:Number(event.target.value)}))}/></label>}<label className="mb-3 block text-xs">Usage limit<input className="field mt-2" type="number" min="1" step="1" placeholder="Unlimited" value={draft.usageLimit??""} onChange={event=>setDraft(current=>({...current,usageLimit:event.target.value===""?null:Number(event.target.value)}))}/></label><label className="mb-3 block text-xs">Starts at<input className="field mt-2" type="datetime-local" value={localDateTime(draft.startsAt)} onChange={event=>setDraft(current=>({...current,startsAt:event.target.value?new Date(event.target.value).toISOString():null}))}/></label><label className="mb-3 block text-xs">Expires at<input className="field mt-2" type="datetime-local" min={localDateTime(draft.startsAt)||undefined} value={localDateTime(draft.expiresAt)} onChange={event=>setDraft(current=>({...current,expiresAt:event.target.value?new Date(event.target.value).toISOString():null}))}/></label></div>}
        {status&&<p className="mt-3 text-xs text-red-800" role="alert">{status}</p>}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 justify-center" disabled={busy} onClick={closeEditor}>Cancel</button><button type="submit" className="btn btn-dark min-h-11 justify-center" disabled={busy}>{busy?"Saving…":draft.id?"Save Changes":"Create Discount"}</button></div>
      </form>
    </div></div>}
    {deleting&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-5" role="presentation"><div className="w-full max-w-sm bg-[#f3f0ea] p-6 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="delete-discount-title"><h2 id="delete-discount-title" className="text-lg font-semibold">Delete discount {deleting.code}?</h2><p className="mt-2 text-sm leading-6 text-black/55">Customers will no longer be able to use this code. Existing orders will keep their original discount details.</p><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 justify-center" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</button><button type="button" className="btn min-h-11 justify-center border-red-900 bg-red-900 text-white" disabled={busy} onClick={()=>void remove()}>{busy?"Deleting…":"Delete Discount"}</button></div></div></div>}
  </Panel>;
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-panel p-5 sm:p-6">
      <p className="admin-panel__title mb-5">{title}</p>
      {children}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="admin-empty grid min-h-44 place-content-center px-5 text-center text-sm leading-6">
      {text}
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mb-3 block text-xs">
      {label}
      <input
        className="field mt-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Toggles({
  items,
}: {
  items: [string, boolean, (v: boolean) => void][];
}) {
  return (
    <div className="my-4 flex flex-wrap gap-4">
      {items.map(([label, value, set]) => (
        <label key={label} className="flex min-h-11 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => set(e.target.checked)}
            className="h-5 w-5 accent-black"
          />
          {label}
        </label>
      ))}
    </div>
  );
}
function EditorActions({
  busy,
  status,
  save,
  cancel,
  children,
}: {
  busy: boolean;
  status: string;
  save: () => void;
  cancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4">
      <button
        disabled={busy}
        onClick={save}
        className="btn btn-dark disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save Changes"}
      </button>
      <button disabled={busy} onClick={cancel} className="btn">
        Cancel
      </button>
      {children}
      {status && (
        <span className="text-xs text-black/55" role="status">
          {status}
        </span>
      )}
    </div>
  );
}
function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
