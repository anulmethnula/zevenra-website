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
} from "../_data/catalog.js";
import { saveSettings } from "../_data/settings.js";
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
  extendPreorderReservation,
  listPreorders,
  notifyPreorder,
  releasePreorderToStock,
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
  adminCookie,
  authEnv,
  body,
  json,
  manualOrderSchema,
  makeSession,
  preorderConversionSchema,
  validOrigin,
} from "../_shared.js";
import { CourierRateFileError } from "../_data/courier-rate-parser.js";
import { deleteDiscount, DiscountConflictError, discountDeleteSchema, listDiscounts, saveDiscount } from "../_data/discounts.js";
import { FulfillmentConfigError, listFulfillmentConfig, saveFulfillmentConfig } from "../_data/fulfillment.js";
import { changeAdminPassword,changeAdminUsername,generateAdminRecoveryCode,getAdminAuth,validAdminPassword,validAdminSession,validAdminUsername } from "../_admin-auth.js";

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
  "getFulfillmentConfig",
  "getAdminSecurity",
]);
const mutationActions = new Set([
  "saveProduct", "setProductStatus", "archiveProduct", "deleteProduct",
  "saveCategory", "deleteCategory", "saveCollection", "deleteCollection",
  "saveSizeChart", "deleteSizeChart", "saveNavigation", "deleteNavigation",
  "saveHomepageSection", "deleteHomepageSection", "duplicateHomepageSection", "reorderHomepageSections",
  "updateOrder", "updateOrderDetails", "createReturn", "updateReturn",
  "updatePreorder", "notifyPreorder", "extendPreorderReservation", "releasePreorderToStock", "convertPreorderToOrder", "createManualOrder",
  "saveSettings", "saveDeliveryRates", "saveCourierConfig", "importCourierRateSheet",
  "validateCourierRateSheet", "confirmCourierRateSheet",
  "setCourierRateCardStatus", "previewDeliveryZoneTemplate", "applyDeliveryZoneTemplate",
  "saveDiscount", "deleteDiscount",
  "saveFulfillmentConfig",
  "changeAdminPassword", "changeAdminUsername", "generateAdminRecoveryCode",
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
      return listOrders(Number(payload.page)||1,Number(payload.pageSize)||100);
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
    case "getFulfillmentConfig":
      return listFulfillmentConfig();
    case "getAdminSecurity": {
      const credential=await getAdminAuth();
      return {username:credential?.username||"",recoveryConfigured:Boolean(credential?.recoveryCodeHash)};
    }
    case "changeAdminPassword": {
      const currentPassword=String(payload.currentPassword||""),newPassword=String(payload.newPassword||""),confirmPassword=String(payload.confirmPassword||"");
      if(newPassword!==confirmPassword)throw new Error("PASSWORD_CONFIRM_MISMATCH");
      if(!validAdminPassword(newPassword))throw new Error("PASSWORD_INVALID");
      return {ok:true,message:"Password updated.",_sessionVersion:await changeAdminPassword(currentPassword,newPassword)};
    }
    case "changeAdminUsername": {
      const currentPassword=String(payload.currentPassword||""),newUsername=String(payload.newUsername||"").trim();
      if(!validAdminUsername(newUsername))throw new Error("USERNAME_INVALID");
      return {ok:true,username:newUsername,message:"Username updated.",_sessionVersion:await changeAdminUsername(currentPassword,newUsername)};
    }
    case "generateAdminRecoveryCode": {
      const generated=await generateAdminRecoveryCode(String(payload.currentPassword||""));
      return {ok:true,recoveryCode:generated.recoveryCode,message:"New recovery code generated.",_sessionVersion:generated.sessionVersion};
    }
    case "saveFulfillmentConfig":
      return saveFulfillmentConfig(payload);
    case "saveDiscount":
      return saveDiscount(payload);
    case "deleteDiscount":
      return deleteDiscount(discountDeleteSchema.parse(payload).id);
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
    case "notifyPreorder":
      return notifyPreorder(String(payload.requestId||""));
    case "extendPreorderReservation":
      return extendPreorderReservation(String(payload.requestId||""));
    case "releasePreorderToStock":
      return releasePreorderToStock(String(payload.requestId||""));
    case "convertPreorderToOrder":
      return convertPreorderToOrder(preorderConversionSchema.parse(payload));
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

function databaseConflictMessage(action: string, error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  if (code === "23505") {
    if (action === "saveProduct")
      return "Product slug, SKU, or size/color combination already exists.";
    if (action === "saveCategory" || action === "saveCollection")
      return "That slug is already in use.";
    return "A record with the same unique value already exists.";
  }
  if (code === "23503") {
    if (action === "deleteCategory")
      return "This category is still used by products or subcategories. Move or archive those records first.";
    if (action === "deleteProduct" || action === "saveProduct")
      return "This product or size is still used by an active pre-order. Archive it or finish/cancel the pre-order first.";
    return "This record is still referenced by other data and cannot be removed yet.";
  }
  if (code === "23514" && action === "updateOrder")
    return "This order has an active courier return and cannot be marked delivered.";
  return "";
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
    if (!await validAdminSession(req, config.SESSION_SECRET))
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
    const result=await execute(action,payload);
    if(result&&typeof result==="object"&&"_sessionVersion" in result){
      const {_sessionVersion,...response}=result as Record<string,unknown>;
      return json(res,response,200,{"Set-Cookie":adminCookie(makeSession(config.SESSION_SECRET,Number(_sessionVersion)))});
    }
    return json(res,result);
  } catch (error) {
    if (error instanceof FulfillmentConfigError)
      return json(res, { error: error.message }, 400);
    if (error instanceof DiscountConflictError)
      return json(res, { error: error.message }, 409);
    if (error instanceof CourierRateFileError || error instanceof DeliveryZoneTemplateError)
      return json(res, { error: error.message }, 400);
    if (error instanceof Error && error.name === "ZodError")
      return json(
        res,
        { error: (error as Error & { issues?: { message?: string }[] }).issues?.[0]?.message || "Please check the submitted details." },
        400,
      );
    if(error instanceof Error&&error.message==="CURRENT_PASSWORD_INVALID")return json(res,{error:"Current password is incorrect."},400);
    if(error instanceof Error&&error.message==="PASSWORD_INVALID")return json(res,{error:"Choose a password with no more than 200 characters."},400);
    if(error instanceof Error&&error.message==="PASSWORD_CONFIRM_MISMATCH")return json(res,{error:"New passwords do not match."},400);
    if(error instanceof Error&&error.message==="USERNAME_INVALID")return json(res,{error:"Use 3–50 letters, numbers, dots, dashes, or underscores."},400);
    const conflict = databaseConflictMessage(action, error);
    if (conflict) return json(res, { error: conflict }, 409);
    console.error("admin action failed", error);
    return json(res, { error: "The operation could not be completed." }, 500);
  }
}
