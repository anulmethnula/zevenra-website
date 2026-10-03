import type { VercelRequest, VercelResponse } from "@vercel/node";
import { storeBootstrap } from "./_data/catalog.js";
import { json, methodNotAllowed } from "./_shared.js";
const privateBankKeys = new Set([
  "bankName",
  "bankAccountName",
  "accountName",
  "bankAccountNumber",
  "accountNumber",
  "bankBranch",
  "branch",
  "bankInstructions",
]);
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const payload = await storeBootstrap(),
      bankEnabled = payload.settings.some(
        (row) =>
          ["bankTransferEnabled", "bankEnabled"].includes(row.key) &&
          (row.value === true || String(row.value).toLowerCase() === "true"),
      );
    return json(
      res,
      {
        ...payload,
        settings: bankEnabled
          ? payload.settings
          : payload.settings.filter((row) => !privateBankKeys.has(row.key)),
      },
      200,
      { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    );
  } catch (error) {
    console.error("store bootstrap failed", error);
    return json(res, { error: "Store data temporarily unavailable" }, 503);
  }
}
