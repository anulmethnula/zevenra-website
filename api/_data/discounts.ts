import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, type DatabaseClient } from "../_db.js";

export const discountCode = (value: unknown) => String(value ?? "").trim().toUpperCase();
export const discountAdminSchema = z.object({
  id: z.string().trim().max(100).optional(), code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["percentage", "fixed"]), value: z.number().finite().positive(), minimumSubtotal: z.number().finite().min(0),
  maximumDiscount: z.number().finite().positive().nullable().optional(), active: z.boolean(),
  startsAt: z.string().datetime().nullable().optional(), expiresAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === "percentage" && value.value > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Percentage cannot exceed 100." });
  if (value.type === "fixed" && value.maximumDiscount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maximumDiscount"], message: "Maximum discount applies only to percentage codes." });
  if (value.startsAt && value.expiresAt && value.expiresAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "End date must be after start date." });
});
export const discountDeleteSchema=z.object({id:z.string().trim().min(1).max(100)}).strict();

export class DiscountConflictError extends Error {
  constructor(message = "A discount with this code already exists.") {
    super(message);
    this.name = "DiscountConflictError";
  }
}

export type DiscountRow = Record<string, unknown>;
export type AppliedDiscount = { code: string; type: "percentage" | "fixed"; value: number; amount: number };

export function calculateDiscount(row: DiscountRow | undefined, subtotal: number, now = new Date()): AppliedDiscount | null {
  if (!row || !row.active) return null;
  const starts = row.starts_at ? new Date(String(row.starts_at)) : null, expires = row.expires_at ? new Date(String(row.expires_at)) : null,
    limit = row.usage_limit == null ? null : Number(row.usage_limit), used = Number(row.usage_count) || 0,
    minimum = Number(row.minimum_subtotal) || 0, type = String(row.type), value = Number(row.value) || 0;
  if ((starts && starts > now) || (expires && expires <= now) || (limit !== null && used >= limit) || subtotal < minimum || value <= 0 || !["percentage", "fixed"].includes(type)) return null;
  let amount = type === "percentage" ? subtotal * value / 100 : value;
  if (type === "percentage" && row.maximum_discount != null) amount = Math.min(amount, Number(row.maximum_discount));
  amount = Math.max(0, Math.min(subtotal, Math.round(amount)));
  return { code: discountCode(row.code), type: type as AppliedDiscount["type"], value, amount };
}

export async function validateDiscount(client: DatabaseClient, code: string, subtotal: number, lock = false) {
  const normalized = discountCode(code);
  if (!normalized) return null;
  const row = (await client.query<DiscountRow>(`SELECT * FROM discount_codes WHERE upper(btrim(code))=$1${lock ? " FOR UPDATE" : ""}`, [normalized])).rows[0];
  return calculateDiscount(row, subtotal);
}

export async function previewDiscount(code: string, items: Array<{ productId: string; variantId: string; quantity: number }>) {
  const rows = (await query<DiscountRow>(`SELECT p.id product_id,v.id variant_id,p.price,p.status,v.active FROM variants v JOIN products p ON p.id=v.product_id WHERE (p.id,v.id) IN (SELECT * FROM unnest($1::text[],$2::text[]))`, [items.map(i=>i.productId), items.map(i=>i.variantId)])).rows;
  if (rows.length !== items.length) return null;
  const prices = new Map(rows.filter(row=>row.status==="published"&&row.active===true).map(row=>[`${row.product_id}:${row.variant_id}`,Number(row.price)]));
  if (prices.size !== items.length) return null;
  const subtotal = items.reduce((sum,item)=>sum+(prices.get(`${item.productId}:${item.variantId}`) || 0)*item.quantity,0);
  const normalized=discountCode(code),row=(await query<DiscountRow>("SELECT * FROM discount_codes WHERE upper(btrim(code))=$1",[normalized])).rows[0];
  return calculateDiscount(row,subtotal);
}

export async function listDiscounts() {
  return (await query<DiscountRow>("SELECT id,code,type,value,minimum_subtotal,maximum_discount,active,starts_at,expires_at,usage_limit,usage_count,created_at,updated_at FROM discount_codes ORDER BY created_at DESC")).rows.map(mapDiscount);
}
export async function saveDiscount(input: unknown) {
  const value=discountAdminSchema.parse(input), id=value.id||randomUUID(), code=discountCode(value.code);
  try {
    const row=(await query<DiscountRow>(`INSERT INTO discount_codes(id,code,type,value,minimum_subtotal,maximum_discount,active,starts_at,expires_at,usage_limit,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,type=EXCLUDED.type,value=EXCLUDED.value,minimum_subtotal=EXCLUDED.minimum_subtotal,maximum_discount=EXCLUDED.maximum_discount,active=EXCLUDED.active,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,usage_limit=EXCLUDED.usage_limit,updated_at=now() RETURNING *`,[id,code,value.type,value.value,value.minimumSubtotal,value.type==="percentage"?value.maximumDiscount??null:null,value.active,value.startsAt||null,value.expiresAt||null,value.usageLimit??null])).rows[0];
    return mapDiscount(row);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505")
      throw new DiscountConflictError();
    throw error;
  }
}
export async function deleteDiscount(id:string){const row=(await query<{id:string}>("DELETE FROM discount_codes WHERE id=$1 RETURNING id",[id])).rows[0];if(!row)throw new Error("Discount not found");return{id:row.id};}
function mapDiscount(row:DiscountRow){return{id:String(row.id),code:String(row.code),type:String(row.type),value:Number(row.value),minimumSubtotal:Number(row.minimum_subtotal),maximumDiscount:row.maximum_discount==null?null:Number(row.maximum_discount),active:Boolean(row.active),startsAt:row.starts_at?new Date(String(row.starts_at)).toISOString():null,expiresAt:row.expires_at?new Date(String(row.expires_at)).toISOString():null,usageLimit:row.usage_limit==null?null:Number(row.usage_limit),usageCount:Number(row.usage_count),createdAt:new Date(String(row.created_at)).toISOString(),updatedAt:new Date(String(row.updated_at)).toISOString()};}
