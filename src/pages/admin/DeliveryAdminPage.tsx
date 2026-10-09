import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Download,
  FileSpreadsheet,
  Plus,
  Save,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { money } from "../../config/site";
import { useStore } from "../../features/store/StoreContext";
import { adminApi } from "../../services/adminApi";
import { CourierRateSheetImport } from "../../components/admin/CourierRateSheetImport";
import type { CourierProvider, DeliveryRate } from "../../types";
import { defaultDeliveryZones } from "../../utils/delivery";

type Notice = { tone: "success" | "error"; message: string };
type TemplatePreview = {
  headerRowNumber: number;
  totalRows: number;
  zones: Array<{
    zoneCode: string;
    zoneName: string;
    fee: number;
    active: boolean;
    fallback: boolean;
    districts: number;
    cities: number;
    postalCodes: number;
  }>;
};

const cloneCouriers = (value: CourierProvider[]) => structuredClone(value);
const cloneRates = (value: DeliveryRate[]) => structuredClone(value);

function starterZones(courierProviderId: string): DeliveryRate[] {
  return defaultDeliveryZones.map(zone=>({...structuredClone(zone),id:crypto.randomUUID(),courierProviderId}));
}

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function downloadTemplate() {
  const rows:string[][]=[["Zone Name","Fee","District","City / Area","Postal Code","Fallback","Active"]];
  for(const zone of defaultDeliveryZones){const count=Math.max(1,zone.districts.length,zone.cities.length,zone.postalCodes.length);for(let index=0;index<count;index++)rows.push([zone.name,String(zone.fee),zone.districts[index]||"",zone.cities[index]||"",zone.postalCodes[index]||"",zone.fallback?"Yes":"No",zone.active?"Yes":"No"]);}
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zevenra-delivery-areas-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DeliveryAdminPage() {
  const store = useStore();
  const [couriers, setCouriers] = useState<CourierProvider[]>(() => cloneCouriers(store.admin.couriers));
  const [rates, setRates] = useState<DeliveryRate[]>(() => cloneRates(store.admin.deliveryRates));
  const [defaultId, setDefaultId] = useState(store.data.settings.defaultCourierProviderId);
  const [selectedId, setSelectedId] = useState(
    store.data.settings.defaultCourierProviderId || store.admin.couriers[0]?.id || "",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateBase64, setTemplateBase64] = useState("");
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);

  const serverSnapshot = useMemo(
    () =>
      JSON.stringify({
        couriers: store.admin.couriers,
        rates: store.admin.deliveryRates,
        defaultId: store.data.settings.defaultCourierProviderId,
      }),
    [store.admin.couriers, store.admin.deliveryRates, store.data.settings.defaultCourierProviderId],
  );
  const localSnapshot = useMemo(
    () => JSON.stringify({ couriers, rates, defaultId }),
    [couriers, rates, defaultId],
  );
  const dirty = localSnapshot !== serverSnapshot;

  useEffect(() => {
    if (busy || templateBusy) return;
    setCouriers(cloneCouriers(store.admin.couriers));
    setRates(cloneRates(store.admin.deliveryRates));
    setDefaultId(store.data.settings.defaultCourierProviderId);
    setSelectedId((current) =>
      store.admin.couriers.some((courier) => courier.id === current)
        ? current
        : store.data.settings.defaultCourierProviderId || store.admin.couriers[0]?.id || "",
    );
  }, [
    busy,
    templateBusy,
    store.admin.couriers,
    store.admin.deliveryRates,
    store.data.settings.defaultCourierProviderId,
  ]);

  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selected = couriers.find((courier) => courier.id === selectedId);
  const selectedRates = rates
    .filter((rate) => rate.courierProviderId === selectedId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const updateCourier = (id: string, patch: Partial<CourierProvider>) =>
    setCouriers((items) =>
      items.map((courier) => (courier.id === id ? { ...courier, ...patch } : courier)),
    );

  const updateRate = (id: string, patch: Partial<DeliveryRate>) =>
    setRates((items) => items.map((rate) => (rate.id === id ? { ...rate, ...patch } : rate)));

  function addCourier() {
    const id = crypto.randomUUID();
    setCouriers((items) => [
      ...items,
      {
        id,
        name: "New courier",
        phone: "",
        notes: "",
        dispatchBranch: "",
        pricingMode: "flat",
        flatRate: 0,
        active: true,
        minimumDeliveryDays: 2,
        maximumDeliveryDays: 4,
      },
    ]);
    if (!defaultId) setDefaultId(id);
    setSelectedId(id);
    setNotice(null);
  }

  function removeCourier(id: string) {
    if (!window.confirm("Remove this courier and its delivery areas?")) return;
    const next = couriers.filter((courier) => courier.id !== id);
    setCouriers(next);
    setRates((items) => items.filter((rate) => rate.courierProviderId !== id));
    if (defaultId === id) setDefaultId(next.find((courier) => courier.active)?.id || "");
    setSelectedId(next[0]?.id || "");
    setNotice(null);
  }

  function selectForCheckout(id: string) {
    updateCourier(id, { active: true });
    setDefaultId(id);
    setSelectedId(id);
    setNotice(null);
  }

  function setPricingMode(courier: CourierProvider, pricingMode: CourierProvider["pricingMode"]) {
    updateCourier(courier.id, { pricingMode });
    if (pricingMode === "zone" && !rates.some((rate) => rate.courierProviderId === courier.id))
      setRates((items) => [...items, ...starterZones(courier.id)]);
  }

  function applyStarterZones(courierId: string) {
    if (
      rates.some((rate) => rate.courierProviderId === courierId) &&
      !window.confirm("Replace this courier's unsaved delivery areas with the 4-area starter?")
    )
      return;
    setRates((items) => [
      ...items.filter((rate) => rate.courierProviderId !== courierId),
      ...starterZones(courierId),
    ]);
    setNotice(null);
  }

  function addZone(courierId: string) {
    const count = rates.filter((rate) => rate.courierProviderId === courierId).length;
    setRates((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        courierProviderId: courierId,
        name: "New delivery area",
        fee: 0,
        active: true,
        districts: [],
        cities: [],
        postalCodes: [],
        fallback: false,
        sortOrder: count + 1,
      },
    ]);
  }

  function setFallback(courierId: string, rateId: string) {
    setRates((items) =>
      items.map((rate) =>
        rate.courierProviderId === courierId
          ? { ...rate, fallback: rate.id === rateId }
          : rate,
      ),
    );
  }

  function validate() {
    const checkoutCourier = couriers.find((courier) => courier.id === defaultId && courier.active);
    if (!checkoutCourier) return "Choose one active courier for checkout.";
    for (const courier of couriers) {
      if (!courier.name.trim()) return "Every courier needs a name.";
      if (!Number.isFinite(courier.flatRate) || courier.flatRate < 0)
        return `${courier.name}: delivery fee must be zero or more.`;
      if (!Number.isInteger(courier.minimumDeliveryDays) || courier.minimumDeliveryDays <= 0 ||
          !Number.isInteger(courier.maximumDeliveryDays) || courier.maximumDeliveryDays < courier.minimumDeliveryDays)
        return `${courier.name}: delivery estimate must use valid minimum and maximum days.`;
      if (courier.pricingMode !== "zone") continue;
      const courierRates = rates.filter((rate) => rate.courierProviderId === courier.id);
      const activeRates = courierRates.filter((rate) => rate.active);
      if (!activeRates.length) return `${courier.name}: add at least one active delivery area.`;
      if (courier.active && activeRates.filter((rate) => rate.fallback).length !== 1)
        return `${courier.name}: choose one fallback delivery area.`;
      for (const rate of courierRates) {
        if (!rate.name.trim()) return `${courier.name}: every delivery area needs a name.`;
        if (!Number.isFinite(rate.fee) || rate.fee < 0)
          return `${rate.name}: fee must be zero or more.`;
      }
    }
    return "";
  }

  async function save() {
    const error = validate();
    if (error) return setNotice({ tone: "error", message: error });
    setBusy(true);
    setNotice(null);
    try {
      await store.saveCourierConfig(couriers, rates, defaultId);
      setNotice({ tone: "success", message: "Delivery settings saved." });
    } catch (reason) {
      setNotice({
        tone: "error",
        message: reason instanceof Error ? reason.message : "Could not save delivery settings.",
      });
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setCouriers(cloneCouriers(store.admin.couriers));
    setRates(cloneRates(store.admin.deliveryRates));
    setDefaultId(store.data.settings.defaultCourierProviderId);
    setSelectedId(store.data.settings.defaultCourierProviderId || store.admin.couriers[0]?.id || "");
    setTemplateFile(null);
    setTemplateBase64("");
    setTemplatePreview(null);
    setNotice(null);
  }

  async function previewTemplate() {
    if (!selected || !templateFile) {
      setNotice({ tone: "error", message: "Choose a courier and ZEVENRA delivery template first." });
      return;
    }
    if (dirty) {
      setNotice({ tone: "error", message: "Save or discard current delivery edits first." });
      return;
    }
    setTemplateBusy(true);
    setNotice(null);
    try {
      const base64 = await toBase64(templateFile);
      const preview = await adminApi.post<TemplatePreview>("previewDeliveryZoneTemplate", {
        fileName: templateFile.name,
        base64,
      });
      setTemplateBase64(base64);
      setTemplatePreview(preview);
    } catch (reason) {
      setTemplatePreview(null);
      setNotice({
        tone: "error",
        message: reason instanceof Error ? reason.message : "Could not read the delivery template.",
      });
    } finally {
      setTemplateBusy(false);
    }
  }

  async function applyTemplate() {
    if (!selected || !templateFile || !templateBase64 || !templatePreview) return;
    if (!window.confirm(`Replace ${selected.name}'s delivery areas with this template?`)) return;
    setTemplateBusy(true);
    setNotice(null);
    try {
      await adminApi.post("applyDeliveryZoneTemplate", {
        courierProviderId: selected.id,
        fileName: templateFile.name,
        base64: templateBase64,
      });
      setTemplateFile(null);
      setTemplateBase64("");
      setTemplatePreview(null);
      await store.loadAdmin("/admin/delivery");
      setNotice({ tone: "success", message: `Delivery areas updated for ${selected.name}.` });
    } catch (reason) {
      setNotice({
        tone: "error",
        message: reason instanceof Error ? reason.message : "Could not apply the delivery template.",
      });
    } finally {
      setTemplateBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1120px] pb-28">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="admin-kicker">Checkout logistics</p>
          <h1 className="admin-title mt-2">Delivery</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">
            Choose one courier for checkout. Customers never choose a courier or shipping speed; the saved pricing rules calculate delivery automatically.
          </p>
        </div>
        <button type="button" className="btn btn-dark" onClick={addCourier}>
          <Plus size={15} /> Add courier
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className={
            "mt-6 rounded-xl border px-4 py-3 text-sm " +
            (notice.tone === "success"
              ? "border-emerald-900/15 bg-emerald-950/[.05] text-emerald-950"
              : "border-red-900/15 bg-red-950/[.05] text-red-950")
          }
        >
          {notice.message}
        </div>
      )}

      <section className="mt-7 rounded-2xl border border-black/[.07] bg-[#f8f6f1] p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black text-white">
            <Truck size={17} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/40">Live checkout courier</p>
            <p className="mt-1 text-lg font-medium">
              {couriers.find((courier) => courier.id === defaultId)?.name || "No courier selected"}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-3">
        {couriers.map((courier) => {
          const courierRates = rates.filter((rate) => rate.courierProviderId === courier.id && rate.active);
          const isDefault = courier.id === defaultId;
          return (
            <article
              key={courier.id}
              className={
                "grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center " +
                (isDefault ? "border-black/30" : "border-black/[.07]")
              }
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium">{courier.name || "Unnamed courier"}</h2>
                  {isDefault && <span className="rounded-full bg-black px-2.5 py-1 text-[9px] uppercase tracking-[.12em] text-white">Default</span>}
                  <span className={courier.active ? "admin-status admin-status--success" : "admin-status"}>
                    {courier.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-black/45">
                  {courier.pricingMode === "flat"
                    ? `${money(courier.flatRate)} nationwide`
                    : `${courierRates.length} checkout area${courierRates.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <p className="text-xs leading-5 text-black/45">
                {courier.pricingMode === "flat"
                  ? "One delivery fee for every customer."
                  : "Postal code, city, and district determine the saved delivery area automatically."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => setSelectedId(courier.id)}>Edit</button>
                <button type="button" className="btn" onClick={() => updateCourier(courier.id,{active:!courier.active})}>{courier.active?"Disable":"Enable"}</button>
                {!isDefault && (
                  <button type="button" className="btn btn-dark" onClick={() => selectForCheckout(courier.id)}>
                    Use for checkout
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!couriers.length && (
        <section className="mt-5 rounded-2xl border border-dashed border-black/15 bg-white/40 p-10 text-center">
          <p className="text-lg font-medium">No courier configured</p>
          <p className="mt-2 text-sm text-black/45">Add one courier and choose a simple pricing method.</p>
        </section>
      )}

      {selected && (
        <section className="mt-8 overflow-hidden rounded-2xl border border-black/[.08] bg-white">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/[.07] p-5 sm:p-7">
            <div>
              <p className="admin-kicker">Manage courier</p>
              <h2 className="mt-2 text-2xl font-medium">{selected.name}</h2>
            </div>
            <button type="button" className="text-xs text-red-800 underline underline-offset-4" onClick={() => removeCourier(selected.id)}>
              Remove courier
            </button>
          </header>

          <div className="grid gap-6 p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="text-xs font-medium">
                Courier name
                <input className="field mt-2" value={selected.name} onChange={(event) => updateCourier(selected.id, { name: event.target.value })} />
              </label>
              <label className="flex min-h-[52px] items-center gap-3 self-end rounded-xl border border-black/[.08] bg-[#f8f6f1] px-4 text-xs">
                <input type="checkbox" className="h-5 w-5 accent-black" checked={selected.active} onChange={(event) => updateCourier(selected.id, { active: event.target.checked })} />
                <span><b>Active</b><small className="mt-0.5 block text-[10px] text-black/40">Available for checkout</small></span>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Minimum delivery days
                <input className="field mt-2" type="number" min="1" step="1" value={selected.minimumDeliveryDays} onChange={(event) => updateCourier(selected.id, { minimumDeliveryDays: Number(event.target.value) })} />
              </label>
              <label className="text-xs font-medium">
                Maximum delivery days
                <input className="field mt-2" type="number" min={selected.minimumDeliveryDays} step="1" value={selected.maximumDeliveryDays} onChange={(event) => updateCourier(selected.id, { maximumDeliveryDays: Number(event.target.value) })} />
              </label>
            </div>

            {selected.pricingMode === "zone" && (
              <label className="max-w-md text-xs font-medium">
                Dispatch branch for imported rate sheets
                <input
                  className="field mt-2"
                  value={selected.dispatchBranch || ""}
                  maxLength={120}
                  placeholder="Must exactly match From Branch"
                  onChange={(event) => updateCourier(selected.id, { dispatchBranch: event.target.value })}
                />
                <span className="mt-2 block text-[10px] leading-4 text-black/45">
                  Required before an imported rate card can be activated. Checkout uses only rows for this branch.
                </span>
              </label>
            )}

            <div className="border-t border-black/[.07] pt-6">
              <p className="text-xs font-medium">Pricing method</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPricingMode(selected, "flat")}
                  className={"rounded-xl border p-4 text-left " + (selected.pricingMode === "flat" ? "border-black bg-black text-white" : "border-black/[.08] bg-[#faf9f6]")}
                >
                  <b className="block text-sm">Flat-rate pricing</b>
                  <span className="mt-1 block text-[11px] opacity-60">Example: LKR 400 for every address.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode(selected, "zone")}
                  className={"rounded-xl border p-4 text-left " + (selected.pricingMode === "zone" ? "border-black bg-black text-white" : "border-black/[.08] bg-[#faf9f6]")}
                >
                  <b className="block text-sm">Area-based pricing</b>
                  <span className="mt-1 block text-[11px] opacity-60">Postal code, city, district, then outstation fallback.</span>
                </button>
              </div>
            </div>

            {selected.pricingMode === "flat" ? (
              <label className="max-w-md text-xs font-medium">
                Nationwide delivery fee
                <div className="mt-2 flex overflow-hidden rounded-xl border border-black/10 bg-white">
                  <span className="grid place-items-center border-r border-black/[.07] px-4 text-[10px] text-black/40">LKR</span>
                  <input className="min-h-[52px] min-w-0 flex-1 border-0 px-4 outline-none" type="number" min="0" value={selected.flatRate} onChange={(event) => updateCourier(selected.id, { flatRate: Number(event.target.value) })} />
                </div>
              </label>
            ) : (
              <>
                <section className="rounded-2xl border border-black/[.08] bg-[#f8f6f1] p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Delivery areas shown at checkout</p>
                      <p className="mt-1 text-[11px] leading-5 text-black/45">
                        Checkout matches these areas automatically and shows the matched area name with its fee.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn" onClick={() => applyStarterZones(selected.id)}>Use 4-area starter</button>
                      <button type="button" className="btn" onClick={() => addZone(selected.id)}><Plus size={14} /> Add area</button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {selectedRates.map((rate) => (
                      <article key={rate.id} className="grid gap-3 rounded-xl border border-black/[.08] bg-white p-4 lg:grid-cols-[minmax(180px,1fr)_170px_auto_auto] lg:items-end">
                        <label className="text-xs font-medium">
                          Area name
                          <input className="field mt-2" value={rate.name} onChange={(event) => updateRate(rate.id, { name: event.target.value })} />
                        </label>
                        <label className="text-xs font-medium">
                          Delivery fee
                          <input className="field mt-2" type="number" min="0" value={rate.fee} onChange={(event) => updateRate(rate.id, { fee: Number(event.target.value) })} />
                        </label>
                        <div className="flex min-h-[48px] items-center gap-3">
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" className="h-4 w-4 accent-black" checked={rate.active} onChange={(event) => updateRate(rate.id, { active: event.target.checked })} /> Active
                          </label>
                          <label className="flex items-center gap-2 text-xs" title="Used when an older/manual order has no selected area">
                            <input type="radio" name={`fallback-${selected.id}`} checked={rate.fallback} onChange={() => setFallback(selected.id, rate.id)} /> Fallback
                          </label>
                        </div>
                        <button type="button" className="btn min-h-[48px]" aria-label={`Remove ${rate.name}`} onClick={() => window.confirm(`Remove "${rate.name}"?`) && setRates((items) => items.filter((item) => item.id !== rate.id))}>
                          <Trash2 size={14} />
                        </button>
                      </article>
                    ))}
                  </div>
                </section>

                <details className="rounded-2xl border border-black/[.08] bg-white">
                  <summary className="cursor-pointer list-none p-5 text-sm font-medium sm:p-6">Bulk template upload <span className="ml-2 text-xs font-normal text-black/40">optional</span></summary>
                  <div className="border-t border-black/[.07] p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium">ZEVENRA delivery-area template</p>
                        <p className="mt-1 max-w-2xl text-[11px] leading-5 text-black/45">
                          Download our simple template, edit the area names and fees for this courier, then upload it. Do not upload a courier company's raw rate sheet here.
                        </p>
                      </div>
                      <button type="button" className="btn" onClick={downloadTemplate}><Download size={14} /> Download template</button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="flex min-h-[50px] cursor-pointer items-center gap-3 rounded-xl border border-black/[.08] bg-[#faf9f6] px-4 text-xs">
                        <FileSpreadsheet size={17} />
                        <span className="min-w-0 flex-1 truncate">{templateFile?.name || "Choose ZEVENRA .xlsx or .csv template"}</span>
                        <input type="file" className="sr-only" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => { setTemplateFile(event.target.files?.[0] || null); setTemplateBase64(""); setTemplatePreview(null); }} />
                      </label>
                      <button type="button" className="btn btn-dark" disabled={!templateFile || templateBusy || dirty} onClick={() => void previewTemplate()}>
                        <Upload size={14} /> {templateBusy ? "Reading…" : "Preview"}
                      </button>
                    </div>
                    {dirty && <p className="mt-2 text-[10px] text-amber-900">Save or discard current edits before importing a template.</p>}
                    {templatePreview && (
                      <div className="mt-5 rounded-xl border border-black/[.08] bg-[#faf9f6] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{templatePreview.zones.length} delivery areas ready</p>
                            <p className="mt-1 text-[10px] text-black/45">Header row {templatePreview.headerRowNumber} · {templatePreview.totalRows.toLocaleString()} rows</p>
                          </div>
                          <button type="button" className="btn btn-dark" disabled={templateBusy} onClick={() => void applyTemplate()}><Check size={14} /> Apply to {selected.name}</button>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {templatePreview.zones.map((zone) => (
                            <div key={(zone.zoneCode || zone.zoneName) + zone.fee} className="rounded-lg bg-white p-3 text-xs">
                              <div className="flex items-center justify-between gap-3"><b>{zone.zoneName}</b><span>{money(zone.fee)}</span></div>
                              {zone.fallback && <p className="mt-1 text-[10px] text-black/45">Fallback area</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </>
            )}
          </div>
        </section>
      )}

      <div className="mt-8">
        <CourierRateSheetImport couriers={couriers} courierId={selectedId} />
      </div>

      {dirty && (
        <div className="fixed bottom-5 left-1/2 z-[80] flex w-[min(680px,calc(100vw-32px))] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[#f8f6f1]/95 p-3 shadow-2xl backdrop-blur md:left-[calc(50%+8rem)]">
          <p className="px-2 text-xs font-medium">Unsaved delivery changes</p>
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={busy} onClick={discard}>Discard</button>
            <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void save()}><Save size={14} /> {busy ? "Saving…" : "Save delivery"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
