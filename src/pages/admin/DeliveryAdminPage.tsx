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
  X,
} from "lucide-react";
import { money } from "../../config/site";
import { useStore } from "../../features/store/StoreContext";
import { adminApi } from "../../services/adminApi";
import type { CourierProvider, DeliveryRate } from "../../types";

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
const splitList = (value: string) =>
  [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function downloadTemplate() {
  const rows = [
    ["Zone Name", "Fee", "District", "City / Area", "Postal Code", "Fallback", "Active"],
    ["Colombo Central", "350", "Colombo", "Bambalapitiya", "00400", "No", "Yes"],
    ["Colombo Suburbs", "425", "Colombo", "Maharagama", "10280", "No", "Yes"],
    ["Outstation", "500", "", "", "", "Yes", "Yes"],
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zevenra-delivery-zone-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DeliveryAdminPage() {
  const store = useStore();
  const [couriers, setCouriers] = useState<CourierProvider[]>(() =>
      cloneCouriers(store.admin.couriers),
    ),
    [rates, setRates] = useState<DeliveryRate[]>(() =>
      cloneRates(store.admin.deliveryRates),
    ),
    [defaultId, setDefaultId] = useState(store.data.settings.defaultCourierProviderId),
    [selectedId, setSelectedId] = useState<string>(
      store.data.settings.defaultCourierProviderId || store.admin.couriers[0]?.id || "",
    ),
    [editingZoneId, setEditingZoneId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<Notice | null>(null),
    [templateFile, setTemplateFile] = useState<File | null>(null),
    [templateBase64, setTemplateBase64] = useState(""),
    [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null),
    [templateBusy, setTemplateBusy] = useState(false);

  const serverSnapshot = useMemo(
    () =>
      JSON.stringify({
        couriers: store.admin.couriers,
        rates: store.admin.deliveryRates,
        defaultId: store.data.settings.defaultCourierProviderId,
      }),
    [
      store.admin.couriers,
      store.admin.deliveryRates,
      store.data.settings.defaultCourierProviderId,
    ],
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
    setSelectedId((current) => {
      if (store.admin.couriers.some((courier) => courier.id === current)) return current;
      return (
        store.data.settings.defaultCourierProviderId ||
        store.admin.couriers[0]?.id ||
        ""
      );
    });
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
  const editingZone = rates.find((rate) => rate.id === editingZoneId);

  const updateCourier = (id: string, patch: Partial<CourierProvider>) =>
    setCouriers((items) =>
      items.map((courier) => (courier.id === id ? { ...courier, ...patch } : courier)),
    );

  const updateRate = (id: string, patch: Partial<DeliveryRate>) =>
    setRates((items) =>
      items.map((rate) => (rate.id === id ? { ...rate, ...patch } : rate)),
    );

  function addCourier() {
    const id = crypto.randomUUID();
    const courier: CourierProvider = {
      id,
      name: "New courier",
      phone: "",
      notes: "",
      pricingMode: "flat",
      flatRate: 0,
      active: true,
    };
    setCouriers((items) => [...items, courier]);
    if (!defaultId) setDefaultId(id);
    setSelectedId(id);
    setNotice(null);
  }

  function removeCourier(id: string) {
    if (!window.confirm("Remove this courier and its delivery zones?")) return;
    const nextCouriers = couriers.filter((courier) => courier.id !== id);
    setCouriers(nextCouriers);
    setRates((items) => items.filter((rate) => rate.courierProviderId !== id));
    if (defaultId === id) setDefaultId(nextCouriers.find((courier) => courier.active)?.id || "");
    setSelectedId(nextCouriers[0]?.id || "");
    setNotice(null);
  }

  function setCourierActive(id: string, active: boolean) {
    updateCourier(id, { active });
    if (!active && defaultId === id)
      setDefaultId(couriers.find((courier) => courier.id !== id && courier.active)?.id || "");
  }

  function useForCheckout(id: string) {
    updateCourier(id, { active: true });
    setDefaultId(id);
    setSelectedId(id);
    setNotice(null);
  }

  function setPricingMode(courier: CourierProvider, mode: CourierProvider["pricingMode"]) {
    updateCourier(courier.id, { pricingMode: mode });
    if (mode !== "zone") return;
    if (rates.some((rate) => rate.courierProviderId === courier.id)) return;
    const id = crypto.randomUUID();
    setRates((items) => [
      ...items,
      {
        id,
        courierProviderId: courier.id,
        name: "All other areas",
        fee: courier.flatRate || 0,
        active: true,
        districts: [],
        cities: [],
        postalCodes: [],
        fallback: true,
        sortOrder: 1,
      },
    ]);
  }

  function addZone(courierId: string) {
    const id = crypto.randomUUID();
    const count = rates.filter((rate) => rate.courierProviderId === courierId).length;
    setRates((items) => [
      ...items,
      {
        id,
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
    setEditingZoneId(id);
  }

  function removeZone(id: string) {
    setRates((items) => items.filter((rate) => rate.id !== id));
    if (editingZoneId === id) setEditingZoneId(null);
  }

  function setFallback(courierId: string, rateId: string, fallback: boolean) {
    setRates((items) =>
      items.map((rate) =>
        rate.courierProviderId !== courierId
          ? rate
          : {
              ...rate,
              fallback: fallback ? rate.id === rateId : rate.id === rateId ? false : rate.fallback,
            },
      ),
    );
  }

  function validate() {
    const defaultCourier = couriers.find(
      (courier) => courier.id === defaultId && courier.active,
    );
    if (!defaultCourier) return "Choose one courier for checkout.";

    for (const courier of couriers) {
      if (!courier.name.trim()) return "Every courier needs a name.";
      if (!Number.isFinite(courier.flatRate) || courier.flatRate < 0)
        return `${courier.name}: delivery fee must be zero or more.`;
      if (courier.pricingMode !== "zone") continue;

      const courierRates = rates.filter(
        (rate) => rate.courierProviderId === courier.id,
      );
      if (!courierRates.length)
        return `${courier.name}: add at least one delivery zone.`;
      const activeRates = courierRates.filter((rate) => rate.active);
      if (courier.active && activeRates.filter((rate) => rate.fallback).length !== 1)
        return `${courier.name}: choose exactly one fallback delivery zone.`;

      for (const rate of courierRates) {
        if (!rate.name.trim()) return `${courier.name}: every zone needs a name.`;
        if (!Number.isFinite(rate.fee) || rate.fee < 0)
          return `${rate.name}: fee must be zero or more.`;
        if (
          rate.active &&
          !rate.fallback &&
          !rate.districts.length &&
          !rate.cities.length &&
          !rate.postalCodes.length
        )
          return `${rate.name}: add a district, city/area, or postal code.`;
      }
    }
    return "";
  }

  async function save() {
    const error = validate();
    if (error) {
      setNotice({ tone: "error", message: error });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await store.saveCourierConfig(couriers, rates, defaultId);
      setNotice({ tone: "success", message: "Delivery settings saved." });
    } catch (reason) {
      setNotice({
        tone: "error",
        message:
          reason instanceof Error ? reason.message : "Could not save delivery settings.",
      });
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setCouriers(cloneCouriers(store.admin.couriers));
    setRates(cloneRates(store.admin.deliveryRates));
    setDefaultId(store.data.settings.defaultCourierProviderId);
    setSelectedId(
      store.data.settings.defaultCourierProviderId || store.admin.couriers[0]?.id || "",
    );
    setEditingZoneId(null);
    setNotice(null);
  }

  async function previewTemplate(file?: File) {
    const chosen = file || templateFile;
    if (!selected || !chosen) {
      setNotice({ tone: "error", message: "Choose a courier and template file first." });
      return;
    }
    if (dirty) {
      setNotice({
        tone: "error",
        message: "Save or discard your current delivery edits before importing a template.",
      });
      return;
    }
    setTemplateBusy(true);
    setNotice(null);
    try {
      const base64 = await toBase64(chosen);
      const preview = await adminApi.post<TemplatePreview>("previewDeliveryZoneTemplate", {
        fileName: chosen.name,
        base64,
      });
      setTemplateFile(chosen);
      setTemplateBase64(base64);
      setTemplatePreview(preview);
    } catch (reason) {
      setTemplatePreview(null);
      setNotice({
        tone: "error",
        message:
          reason instanceof Error ? reason.message : "Could not read the delivery template.",
      });
    } finally {
      setTemplateBusy(false);
    }
  }

  async function applyTemplate() {
    if (!selected || !templateFile || !templateBase64 || !templatePreview) return;
    if (
      !window.confirm(
        `Replace ${selected.name}'s current delivery zones with ${templatePreview.zones.length} zones from this template?`,
      )
    )
      return;

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
      setNotice({
        tone: "success",
        message: `Template applied to ${selected.name}. Other couriers were not changed.`,
      });
    } catch (reason) {
      setNotice({
        tone: "error",
        message:
          reason instanceof Error ? reason.message : "Could not apply the delivery template.",
      });
    } finally {
      setTemplateBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] pb-28">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="admin-kicker">Checkout logistics</p>
          <h1 className="admin-title mt-2">Delivery</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">
            Pick one courier for checkout. Each courier keeps its own flat price or
            area-based delivery zones.
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
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/40">
          Checkout courier
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black text-white">
            <Truck size={17} />
          </span>
          <div>
            <p className="text-lg font-medium">
              {couriers.find((courier) => courier.id === defaultId)?.name ||
                "No checkout courier selected"}
            </p>
            <p className="mt-1 text-xs text-black/45">
              Customers do not choose a courier. This courier calculates delivery automatically.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-3">
        {couriers.map((courier) => {
          const courierRates = rates.filter(
            (rate) => rate.courierProviderId === courier.id,
          );
          const isDefault = courier.id === defaultId;
          return (
            <article
              key={courier.id}
              className={
                "grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-[minmax(0,1fr)_minmax(170px,260px)_auto] md:items-center " +
                (isDefault ? "border-black/30" : "border-black/[.07]")
              }
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium">{courier.name || "Unnamed courier"}</h2>
                  {isDefault && (
                    <span className="rounded-full bg-black px-2.5 py-1 text-[9px] uppercase tracking-[.12em] text-white">
                      Checkout
                    </span>
                  )}
                  <span
                    className={
                      "rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[.12em] " +
                      (courier.active
                        ? "bg-emerald-900/[.07] text-emerald-900"
                        : "bg-black/[.05] text-black/40")
                    }
                  >
                    {courier.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-black/45">
                  {courier.pricingMode === "flat"
                    ? `${money(courier.flatRate)} nationwide`
                    : `${courierRates.filter((rate) => rate.active).length} active zones`}
                </p>
              </div>

              <p className="text-xs leading-5 text-black/45">
                {courier.pricingMode === "flat"
                  ? "One price for every delivery address."
                  : "Postal code → city/area → district → fallback."}
              </p>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => setSelectedId(courier.id)}>
                  Manage
                </button>
                {!isDefault && (
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={() => useForCheckout(courier.id)}
                  >
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
          <p className="mt-2 text-sm text-black/45">
            Add one courier and set a nationwide fee. You can add area pricing later.
          </p>
        </section>
      )}

      {selected && (
        <section className="mt-8 overflow-hidden rounded-2xl border border-black/[.08] bg-white">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/[.07] p-5 sm:p-7">
            <div>
              <p className="admin-kicker">Manage courier</p>
              <h2 className="mt-2 text-2xl font-medium">{selected.name}</h2>
            </div>
            <button
              type="button"
              className="text-xs text-red-800 underline underline-offset-4"
              onClick={() => removeCourier(selected.id)}
            >
              Remove courier
            </button>
          </header>

          <div className="grid gap-6 p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="text-xs font-medium">
                Courier name
                <input
                  className="field mt-2"
                  value={selected.name}
                  onChange={(event) =>
                    updateCourier(selected.id, { name: event.target.value })
                  }
                />
              </label>
              <label className="flex min-h-[52px] items-center gap-3 self-end rounded-xl border border-black/[.08] bg-[#f8f6f1] px-4 text-xs">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-black"
                  checked={selected.active}
                  onChange={(event) => setCourierActive(selected.id, event.target.checked)}
                />
                <span>
                  <b>Active</b>
                  <small className="mt-0.5 block text-[10px] text-black/40">
                    Can be used for checkout
                  </small>
                </span>
              </label>
            </div>

            <div className="border-t border-black/[.07] pt-6">
              <p className="text-xs font-medium">Pricing method</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPricingMode(selected, "flat")}
                  className={
                    "rounded-xl border p-4 text-left " +
                    (selected.pricingMode === "flat"
                      ? "border-black bg-black text-white"
                      : "border-black/[.08] bg-[#faf9f6]")
                  }
                >
                  <b className="block text-sm">One price nationwide</b>
                  <span className="mt-1 block text-[11px] opacity-60">
                    Best when the courier gives one delivery fee.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode(selected, "zone")}
                  className={
                    "rounded-xl border p-4 text-left " +
                    (selected.pricingMode === "zone"
                      ? "border-black bg-black text-white"
                      : "border-black/[.08] bg-[#faf9f6]")
                  }
                >
                  <b className="block text-sm">Area-based pricing</b>
                  <span className="mt-1 block text-[11px] opacity-60">
                    Different fees by postal code, city/area, district or fallback.
                  </span>
                </button>
              </div>
            </div>

            {selected.pricingMode === "flat" ? (
              <label className="max-w-md text-xs font-medium">
                Nationwide delivery fee
                <div className="mt-2 flex overflow-hidden rounded-xl border border-black/10 bg-white">
                  <span className="grid place-items-center border-r border-black/[.07] px-4 text-[10px] text-black/40">
                    LKR
                  </span>
                  <input
                    className="min-h-[52px] min-w-0 flex-1 border-0 px-4 outline-none"
                    type="number"
                    min="0"
                    value={selected.flatRate}
                    onChange={(event) =>
                      updateCourier(selected.id, { flatRate: Number(event.target.value) })
                    }
                  />
                </div>
              </label>
            ) : (
              <>
                <div className="rounded-2xl border border-black/[.08] bg-[#f8f6f1] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium">Bulk zone template</p>
                      <p className="mt-1 max-w-2xl text-[11px] leading-5 text-black/45">
                        Use the same simple template for any courier. Uploading it replaces zones
                        only for this courier. Other couriers stay unchanged.
                      </p>
                    </div>
                    <button type="button" className="btn" onClick={downloadTemplate}>
                      <Download size={14} /> Download template
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="flex min-h-[50px] cursor-pointer items-center gap-3 rounded-xl border border-black/[.08] bg-white px-4 text-xs">
                      <FileSpreadsheet size={17} />
                      <span className="min-w-0 flex-1 truncate">
                        {templateFile?.name || "Choose .xlsx or .csv template"}
                      </span>
                      <input
                        type="file"
                        className="sr-only"
                        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          setTemplateFile(file);
                          setTemplateBase64("");
                          setTemplatePreview(null);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-dark"
                      disabled={!templateFile || templateBusy || dirty}
                      onClick={() => void previewTemplate()}
                    >
                      <Upload size={14} /> {templateBusy ? "Reading…" : "Preview template"}
                    </button>
                  </div>
                  {dirty && (
                    <p className="mt-2 text-[10px] text-amber-900">
                      Save or discard current edits before importing a template.
                    </p>
                  )}

                  {templatePreview && (
                    <div className="mt-5 rounded-xl border border-black/[.08] bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            {templatePreview.zones.length} delivery zones ready
                          </p>
                          <p className="mt-1 text-[10px] text-black/45">
                            Header row {templatePreview.headerRowNumber} ·{" "}
                            {templatePreview.totalRows.toLocaleString()} mapping rows
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-dark"
                          disabled={templateBusy}
                          onClick={() => void applyTemplate()}
                        >
                          <Check size={14} /> Replace this courier's zones
                        </button>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {templatePreview.zones.map((zone) => (
                          <div
                            key={(zone.zoneCode || zone.zoneName) + zone.fee}
                            className="rounded-lg bg-[#f8f6f1] p-3 text-xs"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <b>{zone.zoneName}</b>
                              <span>{money(zone.fee)}</span>
                            </div>
                            <p className="mt-1 text-[10px] text-black/45">
                              {zone.districts} districts · {zone.cities} cities ·{" "}
                              {zone.postalCodes} postcodes
                              {zone.fallback ? " · fallback" : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium">Delivery zones</p>
                      <p className="mt-1 text-[11px] text-black/45">
                        Checkout matches postal code first, then city/area, district, and fallback.
                      </p>
                    </div>
                    <button type="button" className="btn" onClick={() => addZone(selected.id)}>
                      <Plus size={14} /> Add zone
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {selectedRates.map((rate) => {
                      const rules =
                        rate.districts.length + rate.cities.length + rate.postalCodes.length;
                      return (
                        <article
                          key={rate.id}
                          className="grid gap-3 rounded-xl border border-black/[.08] bg-[#faf9f6] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <b className="text-sm">{rate.name}</b>
                              {rate.fallback && (
                                <span className="rounded-full bg-black px-2 py-1 text-[8px] uppercase tracking-[.12em] text-white">
                                  Fallback
                                </span>
                              )}
                              {!rate.active && (
                                <span className="rounded-full bg-black/[.06] px-2 py-1 text-[8px] uppercase tracking-[.12em] text-black/45">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-black/45">
                              {money(rate.fee)} ·{" "}
                              {rate.fallback ? "all unmatched addresses" : `${rules} matching rules`}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setEditingZoneId(rate.id)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() =>
                                window.confirm(`Remove "${rate.name}"?`) && removeZone(rate.id)
                              }
                              aria-label={`Remove ${rate.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {dirty && (
        <div className="fixed bottom-5 left-1/2 z-[80] flex w-[min(680px,calc(100vw-32px))] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[#f8f6f1]/95 p-3 shadow-2xl backdrop-blur md:left-[calc(50%+8rem)]">
          <p className="px-2 text-xs font-medium">Unsaved delivery changes</p>
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={busy} onClick={discard}>
              Discard
            </button>
            <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void save()}>
              <Save size={14} /> {busy ? "Saving…" : "Save delivery"}
            </button>
          </div>
        </div>
      )}

      {editingZone && selected && editingZone.courierProviderId === selected.id && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/40 p-4"
          onMouseDown={() => setEditingZoneId(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editingZone.name}`}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#f8f6f1] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[.08] bg-[#f8f6f1]/95 p-5 backdrop-blur">
              <div>
                <p className="admin-kicker">Delivery zone</p>
                <h2 className="mt-1 text-xl font-medium">{editingZone.name}</h2>
              </div>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full border border-black/10"
                onClick={() => setEditingZoneId(null)}
                aria-label="Close zone editor"
              >
                <X size={18} />
              </button>
            </header>

            <div className="grid gap-5 p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <label className="text-xs font-medium">
                  Zone name
                  <input
                    className="field mt-2"
                    value={editingZone.name}
                    onChange={(event) =>
                      updateRate(editingZone.id, { name: event.target.value })
                    }
                  />
                </label>
                <label className="text-xs font-medium">
                  Delivery fee
                  <input
                    className="field mt-2"
                    type="number"
                    min="0"
                    value={editingZone.fee}
                    onChange={(event) =>
                      updateRate(editingZone.id, { fee: Number(event.target.value) })
                    }
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-black/[.08] bg-white px-4 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-black"
                    checked={editingZone.active}
                    onChange={(event) =>
                      updateRate(editingZone.id, { active: event.target.checked })
                    }
                  />
                  Active
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-black/[.08] bg-white px-4 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-black"
                    checked={editingZone.fallback}
                    onChange={(event) =>
                      setFallback(
                        selected.id,
                        editingZone.id,
                        event.target.checked,
                      )
                    }
                  />
                  Fallback for unmatched addresses
                </label>
              </div>

              {!editingZone.fallback && (
                <>
                  <label className="text-xs font-medium">
                    Districts
                    <select
                      className="field mt-2 min-h-[150px]"
                      multiple
                      value={editingZone.districts}
                      onChange={(event) =>
                        updateRate(editingZone.id, {
                          districts: Array.from(event.target.selectedOptions).map(
                            (option) => option.value,
                          ),
                        })
                      }
                    >
                      {sriLankaDistricts.map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[10px] font-normal text-black/40">
                      Hold Ctrl/Cmd to select more than one district.
                    </span>
                  </label>

                  <label className="text-xs font-medium">
                    Cities / areas
                    <textarea
                      className="field mt-2 min-h-28"
                      value={editingZone.cities.join("\n")}
                      placeholder={"Bambalapitiya\nMaharagama\nNugegoda"}
                      onChange={(event) =>
                        updateRate(editingZone.id, {
                          cities: splitList(event.target.value),
                        })
                      }
                    />
                    <span className="mt-1 block text-[10px] font-normal text-black/40">
                      One per line or comma-separated.
                    </span>
                  </label>

                  <label className="text-xs font-medium">
                    Postal codes
                    <textarea
                      className="field mt-2 min-h-24"
                      value={editingZone.postalCodes.join("\n")}
                      placeholder={"00400\n10280\n10*"}
                      onChange={(event) =>
                        updateRate(editingZone.id, {
                          postalCodes: splitList(event.target.value),
                        })
                      }
                    />
                    <span className="mt-1 block text-[10px] font-normal text-black/40">
                      Exact 5-digit codes or prefixes such as 10*.
                    </span>
                  </label>
                </>
              )}

              <button
                type="button"
                className="btn btn-dark justify-center"
                onClick={() => setEditingZoneId(null)}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
