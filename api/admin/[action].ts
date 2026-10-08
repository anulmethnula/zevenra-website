import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminBootstrap, dashboard } from "../_data/admin.js";
import {
  archiveProduct,
  deleteEntity,
  deleteProduct,
  listCategories,
  listCollections,
  listCouriers,
  listDeliveryRates,
  listHomepageSections,
  duplicateHomepageSection,
  reorderHomepageSections,
  saveHomepageSection,
  deleteHomepageSection,
  listNavigation,
  listProducts,
  listAdminProducts,
  getProductById,
  listSettings,
  listSizeCharts,
  saveCourierConfig,
  saveEntity,
  saveProduct,
  setProductStatus,
  saveSettings,
} from "../_data/catalog.js";
import {
  createOrder,
  createReturn,
  getOrder,
  listReturns,
  listOrders,
  updateOrderDetails,
  updateOrder,
  updateReturn,
} from "../_data/orders.js";
import {
  convertPreorderToOrder,
  createPreorderBatch,
  listPreorders,
  updatePreorder,
} from "../_data/preorders.js";
import {
  confirmCourierRateSheet,
  importCourierRateSheet,
  listCourierRateCards,
  previewCourierRateCard,
  setCourierRateCardStatus,
  validateCourierRateSheet,
} from "../_data/courier-rate-cards.js";
import {
  applyDeliveryZoneTemplate,
  DeliveryZoneTemplateError,
  previewDeliveryZoneTemplate,
} from "../_data/delivery-zone-template.js";
import {
  authEnv,
  body,
  json,
  manualOrderSchema,
  validOrigin,
  validSession,
} from "../_shared.js";
import { CourierRateFileError } from "../_data/courier-rate-parser.js";
import { deactivateDiscount, discountDeactivateSchema, listDiscounts, saveDiscount } from "../_data/discounts.js";

const readActions = new Set([
  "bootstrap",
  "dashboard",
  "listProducts",
  "listAdminProducts",
  "getProduct",
  "listCategories",
  "listCollections",
  "listSizeCharts",
  "listNavigation",
  "listHomepageSections",
  "listOrders",
  "getOrder",
  "listReturns",
  "listPreorders",
  "getSettings",
  "listCouriers",
  "listDeliveryRates",
  "listCourierRateCards",
  "previewCourierRateCard",
  "listDiscounts",
]);
const mutationActions = new Set([
  "saveProduct", "setProductStatus", "archiveProduct", "deleteProduct",
  "saveCategory", "deleteCategory", "saveCollection", "deleteCollection",
  "saveSizeChart", "deleteSizeChart", "saveNavigation", "deleteNavigation",
  "saveHomepageSection", "deleteHomepageSection", "duplicateHomepageSection", "reorderHomepageSections",
  "updateOrder", "updateOrderDetails", "createReturn", "updateReturn",
  "updatePreorder", "createPreorderBatch", "convertPreorderToOrder", "createManualOrder",
  "saveSettings", "saveDeliveryRates", "saveCourierConfig", "importCourierRateSheet",
  "validateCourierRateSheet", "confirmCourierRateSheet",
  "setCourierRateCardStatus", "previewDeliveryZoneTemplate", "applyDeliveryZoneTemplate",
  "saveDiscount", "deactivateDiscount",
]);
const allowed = new Set([...readActions, ...mutationActions]);

async function execute(action: string, payload: Record<string, unknown>) {
  switch (action) {
    case "bootstrap":
      return adminBootstrap(String(payload.section || "/admin"));
    case "dashboard":
      return dashboard();
    case "listProducts":
      return listProducts();
    case "listAdminProducts":
      return listAdminProducts(payload);
    case "getProduct":
      return getProductById(String(payload.id || ""));
    case "listCategories":
      return listCategories();
    case "listCollections":
      return listCollections();
    case "listSizeCharts":
      return listSizeCharts();
    case "listNavigation":
      return listNavigation();
    case "listHomepageSections":
      return listHomepageSections();
    case "listOrders":
      return listOrders();
    case "getOrder":
      return getOrder(String(payload.orderId || payload.id || ""));
    case "listPreorders":
      return listPreorders(String(payload.status || "") || undefined);
    case "getSettings":
      return listSettings();
    case "listCouriers":
      return listCouriers();
    case "listDeliveryRates":
      return listDeliveryRates();
    case "listDiscounts":
      return listDiscounts();
    case "saveDiscount":
      return saveDiscount(payload);
    case "deactivateDiscount":
      return deactivateDiscount(discountDeactivateSchema.parse(payload).id);
    case "saveProduct":
      return saveProduct(payload);
    case "setProductStatus":
      return setProductStatus(String(payload.id || ""), String(payload.status || ""));
    case "archiveProduct":
      return archiveProduct(String(payload.id || ""));
    case "deleteProduct":
      return deleteProduct(String(payload.id || ""));
    case "saveCategory":
      return saveEntity("categories", payload);
    case "deleteCategory":
      return deleteEntity("categories", String(payload.id || ""));
    case "saveCollection":
      return saveEntity("collections", payload);
    case "deleteCollection":
      return deleteEntity("collections", String(payload.id || ""));
    case "saveSizeChart":
      return saveEntity("size_charts", payload);
    case "deleteSizeChart":
      return deleteEntity("size_charts", String(payload.id || ""));
    case "saveNavigation":
      return saveEntity("navigation", payload);
    case "deleteNavigation":
      return deleteEntity("navigation", String(payload.id || ""));
    case "saveHomepageSection":
      return saveHomepageSection(payload);
    case "deleteHomepageSection":
      return deleteHomepageSection(String(payload.id || ""));
    case "duplicateHomepageSection":
      return duplicateHomepageSection(String(payload.id || ""));
    case "reorderHomepageSections":
      return reorderHomepageSections(Array.isArray(payload.ids) ? payload.ids.map(String) : []);
    case "updateOrder":
      return updateOrder(payload);
    case "updateOrderDetails":
      return updateOrderDetails(payload);
    case "listReturns":
      return listReturns(String(payload.orderId || "") || undefined);
    case "createReturn":
      return createReturn(payload);
    case "updateReturn":
      return updateReturn(payload);
    case "updatePreorder":
      return updatePreorder(payload);
    case "createPreorderBatch":
      return createPreorderBatch();
    case "convertPreorderToOrder":
      return convertPreorderToOrder(payload);
    case "createManualOrder":
      return createOrder(
        {
          ...manualOrderSchema.parse(payload),
          source: String(payload.source || "manual"),
        },
        { requireReceipt: false },
      );
    case "saveSettings":
      return saveSettings(payload);
    case "saveCourierConfig":
      return saveCourierConfig(payload);
    case "saveDeliveryRates":
      return saveCourierConfig(payload);
    case "importCourierRateSheet":
      return importCourierRateSheet(payload);
    case "validateCourierRateSheet":
      return validateCourierRateSheet(payload);
    case "confirmCourierRateSheet":
      return confirmCourierRateSheet(String(payload.id || ""));
    case "listCourierRateCards":
      return listCourierRateCards(String(payload.courierProviderId || ""));
    case "previewCourierRateCard":
      return previewCourierRateCard(String(payload.id || ""), Number(payload.page) || 1);
    case "setCourierRateCardStatus":
      return setCourierRateCardStatus(String(payload.id || ""), payload.active === true || String(payload.active) === "true");
    case "previewDeliveryZoneTemplate":
      return previewDeliveryZoneTemplate(payload);
    case "applyDeliveryZoneTemplate":
      return applyDeliveryZoneTemplate(payload);
    default:
      throw new Error("Unknown action");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const value = Array.isArray(req.query.action)
      ? req.query.action[0]
      : req.query.action,
    action = String(value || "");
  if (!allowed.has(action))
    return json(res, { error: "Unknown action" }, 404);
  const expectedMethod = readActions.has(action) ? "GET" : "POST";
  if (req.method !== expectedMethod) {
    res.setHeader("Allow", expectedMethod);
    return json(res, { error: "Method not allowed" }, 405);
  }
  try {
    res.setHeader("Cache-Control", "private, no-store");
    const config = authEnv();
    if (!validSession(req, config.SESSION_SECRET))
      return json(res, { error: "Session expired" }, 401);
    if (expectedMethod === "POST" && !validOrigin(req, config))
      return json(res, { error: "Invalid request origin" }, 403);
    const payload =
      req.method === "GET"
        ? Object.fromEntries(
            Object.entries(req.query)
              .filter(([key]) => key !== "action")
              .map(([key, item]) => [
                key,
                Array.isArray(item) ? item[0] : item,
              ]),
          )
        : (body(req) as Record<string, unknown>);
    return json(res, await execute(action, payload));
  } catch (error) {
    if (error instanceof CourierRateFileError || error instanceof DeliveryZoneTemplateError)
      return json(res, { error: error.message }, 400);
    if (error instanceof Error && error.name === "ZodError")
      return json(
        res,
        { error: (error as Error & { issues?: { message?: string }[] }).issues?.[0]?.message || "Please check the submitted details." },
        400,
      );
    console.error("admin action failed", error);
    return json(res, { error: "The operation could not be completed." }, 500);
  }
}
