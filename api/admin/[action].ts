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
  authEnv,
  body,
  json,
  manualOrderSchema,
  validOrigin,
  validSession,
} from "../_shared.js";

const allowed = new Set([
  "bootstrap",
  "dashboard",
  "listProducts",
  "listAdminProducts",
  "getProduct",
  "saveProduct",
  "setProductStatus",
  "archiveProduct",
  "deleteProduct",
  "listCategories",
  "saveCategory",
  "deleteCategory",
  "listCollections",
  "saveCollection",
  "deleteCollection",
  "listSizeCharts",
  "saveSizeChart",
  "deleteSizeChart",
  "listNavigation",
  "saveNavigation",
  "deleteNavigation",
  "listHomepageSections",
  "saveHomepageSection",
  "deleteHomepageSection",
  "duplicateHomepageSection",
  "reorderHomepageSections",
  "listOrders",
  "getOrder",
  "updateOrder",
  "updateOrderDetails",
  "listReturns",
  "createReturn",
  "updateReturn",
  "listPreorders",
  "updatePreorder",
  "createPreorderBatch",
  "convertPreorderToOrder",
  "createManualOrder",
  "getSettings",
  "saveSettings",
  "listCouriers",
  "listDeliveryRates",
  "saveDeliveryRates",
  "saveCourierConfig",
  "importCourierRateSheet",
  "validateCourierRateSheet",
  "confirmCourierRateSheet",
  "listCourierRateCards",
  "previewCourierRateCard",
  "setCourierRateCardStatus",
]);

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
    default:
      throw new Error("Unknown action");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    const config = authEnv();
    if (!validSession(req, config.SESSION_SECRET))
      return json(res, { error: "Session expired" }, 401);
    if (!validOrigin(req, config))
      return json(res, { error: "Invalid request origin" }, 403);
    const value = Array.isArray(req.query.action)
        ? req.query.action[0]
        : req.query.action,
      action = String(value || "");
    if (!allowed.has(action))
      return json(res, { error: "Unknown action" }, 404);
    if (!["GET", "POST"].includes(req.method || "")) {
      res.setHeader("Allow", "GET, POST");
      return json(res, { error: "Method not allowed" }, 405);
    }
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
    const message = error instanceof Error ? error.message : "";
    if (error instanceof Error && error.name === "ZodError")
      return json(
        res,
        { error: (error as Error & { issues?: { message?: string }[] }).issues?.[0]?.message || "Please check the submitted details." },
        400,
      );
    const databaseError = typeof (error as { code?:unknown } | null)?.code === "string" || /relation |column |constraint|postgres|duplicate key|null value/i.test(message);
    if (databaseError) {
      console.error("admin action database failure", error);
      return json(res,{ error: "The operation could not be completed. Please review the details and try again." },400);
    }
    return json(
      res,
      { error: message || "The operation could not be completed." },
      400,
    );
  }
}
