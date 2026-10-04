import { randomUUID } from "node:crypto";
import { query, withTransaction } from "../_db.js";
import { homepageSectionSchema } from "../_shared.js";
import {
  mapCategory,
  mapCollection,
  mapCourier,
  mapDeliveryRate,
  mapHomepageSection,
  mapNavigation,
  mapProduct,
  mapSizeChart,
} from "./mappers.js";

const productSelect = `
 SELECT p.*,
  COALESCE((SELECT array_agg(pc.collection_id ORDER BY pc.collection_id) FROM product_collections pc WHERE pc.product_id=p.id),'{}') AS collection_ids,
  COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.color,v.size) FROM variants v WHERE v.product_id=p.id),'[]') AS variants
 FROM products p`;

export async function listProducts(publishedOnly = false) {
  const result = await query<Record<string, unknown>>(
    `${productSelect}${publishedOnly ? " WHERE p.status='published'" : ""} ORDER BY p.sort_order,p.name`,
  );
  return result.rows.map(mapProduct);
}

export async function listPublicProducts(input: Record<string, unknown>) {
  const page = Math.max(1, Math.floor(Number(input.page) || 1)), pageSize = Math.min(48, Math.max(1, Math.floor(Number(input.pageSize) || 24))), search = String(input.search || "").trim().slice(0, 100), category = String(input.category || ""), collection = String(input.collection || ""), sort = String(input.sort || "featured");
  const values: unknown[] = [], conditions = ["p.status='published'"];
  if (search) { values.push(`%${search.toLowerCase()}%`); conditions.push(`(lower(p.name) LIKE $${values.length} OR lower(p.description) LIKE $${values.length})`); }
  if (category) { values.push(category); conditions.push(`(p.category_id=$${values.length} OR EXISTS(SELECT 1 FROM categories child WHERE child.id=p.category_id AND child.parent_id=$${values.length}))`); }
  if (collection) { values.push(collection); conditions.push(`EXISTS(SELECT 1 FROM product_collections pc WHERE pc.product_id=p.id AND pc.collection_id=$${values.length})`); }
  if (String(input.new) === "true") conditions.push("p.new_arrival=true");
  const orders: Record<string,string> = { featured:"p.featured DESC,p.sort_order,p.name", newest:"p.new_arrival DESC,p.updated_at DESC", price_asc:"p.price ASC,p.name", price_desc:"p.price DESC,p.name" }, order = orders[sort] || orders.featured;
  const where = ` WHERE ${conditions.join(" AND ")}`, total = Number((await query<{count:number}>(`SELECT count(*)::int count FROM products p${where}`, values)).rows[0]?.count || 0);
  values.push(pageSize, (page - 1) * pageSize);
  const rows = await query<Record<string,unknown>>(`${productSelect}${where} ORDER BY ${order} LIMIT $${values.length-1} OFFSET $${values.length}`, values);
  return { items: rows.rows.map(mapProduct), page, pageSize, total, pageCount: Math.max(1, Math.ceil(total/pageSize)) };
}

export async function getProductById(id: string) {
  const result = await query<Record<string, unknown>>(
    `${productSelect} WHERE p.id=$1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}

export async function listAdminProducts(input: Record<string, unknown>) {
  const q = String(input.q || "").trim().slice(0, 100),
    category = String(input.category || "all"),
    status = String(input.status || "all"),
    sort = String(input.sort || "updated_desc"),
    page = Math.max(1, Math.floor(Number(input.page) || 1)),
    pageSize = Math.min(100, Math.max(10, Math.floor(Number(input.pageSize) || 25)));
  if (!["all", "published", "draft", "archived"].includes(status))
    throw new Error("Invalid product status filter.");
  const sorts: Record<string, string> = {
      updated_desc: "p.updated_at DESC,p.name",
      name_asc: "p.name ASC",
      name_desc: "p.name DESC",
      stock_asc: "total_stock ASC,p.name",
      stock_desc: "total_stock DESC,p.name",
      price_asc: "p.price ASC,p.name",
      price_desc: "p.price DESC,p.name",
    },
    orderBy = sorts[sort];
  if (!orderBy) throw new Error("Invalid product sort.");
  const values: unknown[] = [], conditions: string[] = [];
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(p.name) LIKE $${values.length} OR lower(p.slug) LIKE $${values.length} OR EXISTS(SELECT 1 FROM unnest(p.tags) tag WHERE lower(tag) LIKE $${values.length}) OR EXISTS(SELECT 1 FROM variants sv WHERE sv.product_id=p.id AND lower(sv.sku) LIKE $${values.length}) OR lower(COALESCE(c.name,'')) LIKE $${values.length} OR lower(COALESCE(parent.name,'')) LIKE $${values.length})`);
  }
  if (category !== "all") { values.push(category); conditions.push(`(p.category_id=$${values.length} OR c.parent_id=$${values.length})`); }
  if (status !== "all") { values.push(status); conditions.push(`p.status=$${values.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    countValues = [...values],
    total = Number((await query<{ count: number }>(`SELECT count(*)::int count FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id ${where}`, countValues)).rows[0]?.count || 0);
  values.push(pageSize, (page - 1) * pageSize);
  const rows = (await query<Record<string, unknown>>(`SELECT p.id,p.name,p.slug,p.price,p.status,p.preorder_enabled,p.updated_at,p.category_id,c.name category_name,parent.id parent_category_id,parent.name parent_category_name,COALESCE(p.media->0->>'url','') thumbnail,COUNT(v.id) FILTER(WHERE v.active)::int variant_count,COALESCE(SUM(v.stock) FILTER(WHERE v.active),0)::int total_stock,COUNT(v.id) FILTER(WHERE v.active AND v.stock<=v.low_stock_threshold)::int low_stock_count FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id LEFT JOIN variants v ON v.product_id=p.id ${where} GROUP BY p.id,c.id,parent.id ORDER BY ${orderBy} LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows;
  const counts = (await query<Record<string, unknown>>(`SELECT COALESCE(parent.id,c.id) id,COUNT(DISTINCT p.id)::int count FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id GROUP BY COALESCE(parent.id,c.id)`)).rows;
  return { items: rows.map(row => ({ id:String(row.id),name:String(row.name),slug:String(row.slug),price:Number(row.price),status:String(row.status),preorderEnabled:Boolean(row.preorder_enabled),updatedAt:String(row.updated_at),categoryId:String(row.category_id||""),categoryName:String(row.category_name||""),parentCategoryId:String(row.parent_category_id||""),parentCategoryName:String(row.parent_category_name||""),thumbnail:String(row.thumbnail||""),variantCount:Number(row.variant_count)||0,totalStock:Number(row.total_stock)||0,lowStockCount:Number(row.low_stock_count)||0 })), page, pageSize, total, pageCount: Math.max(1, Math.ceil(total/pageSize)), categoryCounts: Object.fromEntries(counts.map(row => [String(row.id||""),Number(row.count)||0])) };
}

export async function getProductBySlug(slug: string) {
  const result = await query<Record<string, unknown>>(
    `${productSelect} WHERE p.slug=$1 AND p.status='published' LIMIT 1`,
    [slug],
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}

export async function listCategories() {
  return (
    await query<Record<string, unknown>>(
      "SELECT * FROM categories ORDER BY sort_order,name",
    )
  ).rows.map(mapCategory);
}
export async function listCollections() {
  return (
    await query<Record<string, unknown>>(
      "SELECT * FROM collections ORDER BY sort_order,name",
    )
  ).rows.map(mapCollection);
}
export async function listSizeCharts() {
  return (
    await query<Record<string, unknown>>(
      "SELECT * FROM size_charts ORDER BY name",
    )
  ).rows.map(mapSizeChart);
}
export async function listNavigation() {
  return (
    await query<Record<string, unknown>>(
      "SELECT * FROM navigation ORDER BY sort_order,label",
    )
  ).rows.map(mapNavigation);
}
export async function listHomepageSections() {
  return (
    await query<Record<string, unknown>>(
      "SELECT * FROM homepage_sections ORDER BY sort_order,id",
    )
  ).rows.map(mapHomepageSection);
}
export async function saveHomepageSection(input: Record<string, unknown>) {
  const value = homepageSectionSchema.parse(input);
  return withTransaction(async (client) => {
    const previous = (await client.query<Record<string, unknown>>("SELECT * FROM homepage_sections WHERE id=$1 FOR UPDATE", [value.id])).rows[0];
    await client.query(`INSERT INTO homepage_sections(id,type,enabled,title,subtitle,desktop_media,mobile_media,cta_label,cta_link,reference_id,text_position,overlay,spacing,sort_order,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()) ON CONFLICT(id) DO UPDATE SET type=EXCLUDED.type,enabled=EXCLUDED.enabled,title=EXCLUDED.title,subtitle=EXCLUDED.subtitle,desktop_media=EXCLUDED.desktop_media,mobile_media=EXCLUDED.mobile_media,cta_label=EXCLUDED.cta_label,cta_link=EXCLUDED.cta_link,reference_id=EXCLUDED.reference_id,text_position=EXCLUDED.text_position,overlay=EXCLUDED.overlay,spacing=EXCLUDED.spacing,sort_order=EXCLUDED.sort_order,updated_at=now()`, [value.id,value.type,value.enabled,value.title,value.subtitle||"",value.desktopMedia||"",value.mobileMedia||"",value.ctaLabel||"",value.ctaLink||"",value.referenceId||"",value.textPosition,value.overlay,value.spacing,value.sortOrder]);
    const action = previous ? (previous.enabled !== value.enabled ? (value.enabled ? "section_enabled" : "section_disabled") : "section_edited") : "section_created";
    await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner',$2,'homepage_section',$1,$3::jsonb)",[value.id,action,JSON.stringify({type:value.type,title:value.title})]);
    return mapHomepageSection((await client.query<Record<string, unknown>>("SELECT * FROM homepage_sections WHERE id=$1",[value.id])).rows[0]);
  });
}
export async function duplicateHomepageSection(id: string) {
  return withTransaction(async(client)=>{const row=(await client.query<Record<string,unknown>>("SELECT * FROM homepage_sections WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!row)throw new Error("Homepage section not found.");const nextId=randomUUID(),max=Number((await client.query<{value:number}>("SELECT COALESCE(max(sort_order),0)::int value FROM homepage_sections")).rows[0]?.value||0);await client.query("INSERT INTO homepage_sections(id,type,enabled,title,subtitle,desktop_media,mobile_media,cta_label,cta_link,reference_id,text_position,overlay,spacing,sort_order,updated_at) VALUES($1,$2,false,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())",[nextId,row.type,`${row.title||"Untitled"} Copy`,row.subtitle,row.desktop_media,row.mobile_media,row.cta_label,row.cta_link,row.reference_id,row.text_position,row.overlay,row.spacing,max+1]);await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','section_duplicated','homepage_section',$1,$2::jsonb)",[nextId,JSON.stringify({sourceId:id})]);return mapHomepageSection((await client.query<Record<string,unknown>>("SELECT * FROM homepage_sections WHERE id=$1",[nextId])).rows[0]);});
}
export async function reorderHomepageSections(ids: string[]) {
  if(!ids.length||new Set(ids).size!==ids.length||ids.length>100)throw new Error("Invalid homepage section order.");
  return withTransaction(async(client)=>{const existing=await client.query<{id:string}>("SELECT id FROM homepage_sections WHERE id=ANY($1::text[]) FOR UPDATE",[ids]);if(existing.rowCount!==ids.length)throw new Error("One or more homepage sections no longer exist.");for(let index=0;index<ids.length;index++)await client.query("UPDATE homepage_sections SET sort_order=$2,updated_at=now() WHERE id=$1",[ids[index],index+1]);await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','sections_reordered','homepage','homepage',$1::jsonb)",[JSON.stringify({ids})]);return (await client.query<Record<string,unknown>>("SELECT * FROM homepage_sections ORDER BY sort_order,id")).rows.map(mapHomepageSection);});
}
export async function deleteHomepageSection(id:string){return withTransaction(async(client)=>{const row=(await client.query<Record<string,unknown>>("DELETE FROM homepage_sections WHERE id=$1 RETURNING title,type",[id])).rows[0];if(!row)throw new Error("Homepage section not found.");await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','section_deleted','homepage_section',$1,$2::jsonb)",[id,JSON.stringify({title:row.title,type:row.type})]);return {deleted:true};});}
export async function listCouriers(activeOnly = false) {
  return (
    await query<Record<string, unknown>>(
      `SELECT * FROM courier_providers${activeOnly ? " WHERE active=true" : ""} ORDER BY name`,
    )
  ).rows.map(mapCourier);
}
export async function listDeliveryRates() {
  return (
    await query<Record<string, unknown>>(
      "SELECT * FROM delivery_rates ORDER BY sort_order,name",
    )
  ).rows.map(mapDeliveryRate);
}
export async function listSettings() {
  return (
    await query<{ key: string; value: unknown }>(
      "SELECT key,value FROM site_settings ORDER BY key",
    )
  ).rows;
}

export async function storeBootstrap() {
  const [
    products,
    categories,
    collections,
    sizeCharts,
    navigation,
    homepageSections,
    settings,
    couriers,
    deliveryRates,
  ] = await Promise.all([
    listProducts(true),
    listCategories(),
    listCollections(),
    listSizeCharts(),
    listNavigation(),
    listHomepageSections(),
    listSettings(),
    listCouriers(true),
    listDeliveryRates(),
  ]);
  return {
    products,
    categories,
    collections,
    sizeCharts,
    navigation,
    homepageSections,
    settings,
    couriers,
    deliveryRates,
  };
}

type Entity =
  | "categories"
  | "collections"
  | "size_charts"
  | "navigation"
  | "homepage_sections";
const definitions = {
  categories: {
    columns: [
      "name",
      "slug",
      "description",
      "image_url",
      "mobile_image_url",
      "video_url",
      "active",
      "featured",
      "show_in_navigation",
      "show_on_homepage",
      "parent_id",
      "sort_order",
    ],
    keys: [
      "name",
      "slug",
      "description",
      "imageUrl",
      "mobileImageUrl",
      "videoUrl",
      "active",
      "featured",
      "showInNavigation",
      "showOnHomepage",
      "parentId",
      "sortOrder",
    ],
  },
  collections: {
    columns: [
      "name",
      "slug",
      "description",
      "hero_image",
      "mobile_image",
      "video_url",
      "cta_label",
      "active",
      "show_in_navigation",
      "show_on_homepage",
      "sort_order",
    ],
    keys: [
      "name",
      "slug",
      "description",
      "heroImage",
      "mobileImage",
      "videoUrl",
      "ctaLabel",
      "active",
      "showInNavigation",
      "showOnHomepage",
      "sortOrder",
    ],
  },
  size_charts: {
    columns: [
      "name",
      "unit",
      "columns_json",
      "rows_json",
      "notes",
      "image_url",
    ],
    keys: ["name", "unit", "columns", "rows", "notes", "imageUrl"],
  },
  navigation: {
    columns: ["label", "link_type", "target", "visible", "sort_order"],
    keys: ["label", "linkType", "target", "visible", "sortOrder"],
  },
  homepage_sections: {
    columns: [
      "type",
      "enabled",
      "title",
      "subtitle",
      "desktop_media",
      "mobile_media",
      "cta_label",
      "cta_link",
      "reference_id",
      "text_position",
      "overlay",
      "spacing",
      "sort_order",
    ],
    keys: [
      "type",
      "enabled",
      "title",
      "subtitle",
      "desktopMedia",
      "mobileMedia",
      "ctaLabel",
      "ctaLink",
      "referenceId",
      "textPosition",
      "overlay",
      "spacing",
      "sortOrder",
    ],
  },
} as const;

export async function saveEntity(
  table: Entity,
  input: Record<string, unknown>,
) {
  const definition = definitions[table],
    id = String(input.id || randomUUID()),
    values = definition.keys.map((key) => {
      const value = input[key];
      return ["columns", "rows"].includes(key)
        ? JSON.stringify(value || [])
        : (value ?? null);
    }),
    placeholders = values.map((_, index) => `$${index + 2}`).join(","),
    updates = definition.columns
      .map((column) => `${column}=EXCLUDED.${column}`)
      .join(",");
  await query(
    `INSERT INTO ${table}(id,${definition.columns.join(",")},updated_at) VALUES($1,${placeholders},now()) ON CONFLICT(id) DO UPDATE SET ${updates},updated_at=now()`,
    [id, ...values],
  );
  return { id, ...input };
}

export async function deleteEntity(table: Entity, id: string) {
  await query(`DELETE FROM ${table} WHERE id=$1`, [id]);
  return { deleted: true };
}

export async function saveProduct(input: Record<string, unknown>) {
  const id = String(input.id || randomUUID()),
    variants = Array.isArray(input.variants)
      ? (input.variants as Record<string, unknown>[])
      : [],
    collectionIds = Array.isArray(input.collectionIds)
      ? input.collectionIds.map(String)
      : [];
  if (!input.name || !input.slug || Number(input.price) <= 0)
    throw new Error("Product name, slug and price are required.");
  if (
    !variants.some(
      (variant) => variant.active === true || String(variant.active) === "true",
    )
  )
    throw new Error("Add at least one active size / stock variant.");
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO products(id,slug,name,short_description,description,price,compare_at_price,category_id,subcategory,size_chart_id,media,material,fit,care,tags,featured,new_arrival,preorder_enabled,preorder_message,status,sort_order,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::text[],$16,$17,$18,$19,$20,$21,now())
   ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,short_description=EXCLUDED.short_description,description=EXCLUDED.description,price=EXCLUDED.price,compare_at_price=EXCLUDED.compare_at_price,category_id=EXCLUDED.category_id,subcategory=EXCLUDED.subcategory,size_chart_id=EXCLUDED.size_chart_id,media=EXCLUDED.media,material=EXCLUDED.material,fit=EXCLUDED.fit,care=EXCLUDED.care,tags=EXCLUDED.tags,featured=EXCLUDED.featured,new_arrival=EXCLUDED.new_arrival,preorder_enabled=EXCLUDED.preorder_enabled,preorder_message=EXCLUDED.preorder_message,status=EXCLUDED.status,sort_order=EXCLUDED.sort_order,updated_at=now()`,
      [
        id,
        input.slug,
        input.name,
        input.shortDescription || "",
        input.description || "",
        input.price,
        input.compareAtPrice || null,
        input.categoryId,
        input.subcategory || "",
        input.sizeChartId || null,
        JSON.stringify(input.media || []),
        input.material || "",
        input.fit || "",
        input.care || "",
        input.tags || [],
        Boolean(input.featured),
        Boolean(input.newArrival),
        Boolean(input.preorderEnabled),
        input.preorderMessage || "",
        input.status || "draft",
        input.sortOrder || 0,
      ],
    );
    const ids: string[] = [];
    for (const variant of variants) {
      const variantId = String(variant.id || randomUUID());
      ids.push(variantId);
      await client.query(
        `INSERT INTO variants(id,product_id,sku,color,size,stock,low_stock_threshold,active,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO UPDATE SET sku=EXCLUDED.sku,color=EXCLUDED.color,size=EXCLUDED.size,stock=EXCLUDED.stock,low_stock_threshold=EXCLUDED.low_stock_threshold,active=EXCLUDED.active,updated_at=now()`,
        [
          variantId,
          id,
          variant.sku,
          variant.color,
          variant.size,
          variant.stock,
          variant.lowStockThreshold ?? 1,
          Boolean(variant.active),
        ],
      );
    }
    await client.query(
      "DELETE FROM variants WHERE product_id=$1 AND NOT(id=ANY($2::text[]))",
      [id, ids],
    );
    await client.query("DELETE FROM product_collections WHERE product_id=$1", [
      id,
    ]);
    for (const collectionId of collectionIds)
      await client.query(
        "INSERT INTO product_collections(product_id,collection_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id, collectionId],
      );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','save','product',$1,$2::jsonb)",
      [id, JSON.stringify({ name: input.name })],
    );
  });
  return (
    await query<Record<string, unknown>>(`${productSelect} WHERE p.id=$1`, [id])
  ).rows.map(mapProduct)[0];
}

export async function archiveProduct(id: string) {
  await query(
    "UPDATE products SET status='archived',updated_at=now() WHERE id=$1",
    [id],
  );
  return { archived: true };
}
export async function setProductStatus(id: string, status: string) {
  if (!["published", "draft", "archived"].includes(status))
    throw new Error("Invalid product status.");
  const row = (await query<Record<string, unknown>>(
    "UPDATE products SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,name,status",
    [id, status],
  )).rows[0];
  if (!row) throw new Error("Product not found.");
  await query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','status_changed','product',$1,$2::jsonb)",[id,JSON.stringify({status})]);
  return { id: String(row.id), name: String(row.name), status: String(row.status) };
}
export async function deleteProduct(id: string) {
  const used = await query(
    "SELECT 1 FROM order_items WHERE product_id=$1 LIMIT 1",
    [id],
  );
  if (used.rowCount)
    throw new Error("Archive products that are referenced by orders.");
  await query("DELETE FROM products WHERE id=$1", [id]);
  return { deleted: true };
}

export async function saveSettings(patch: Record<string, unknown>) {
  const current = Object.fromEntries(
      (await listSettings()).map((row) => [row.key, row.value]),
    ),
    next = { ...current, ...patch },
    isTrue = (value: unknown) =>
      value === true || String(value).toLowerCase() === "true";
  if (!String(next.brandName || "").trim())
    throw new Error("Brand name is required.");
  if (
    Number(next.deliveryFlatFee ?? next.deliveryFee ?? 0) < 0 ||
    Number(next.freeDeliveryThreshold ?? 0) < 0
  )
    throw new Error("Delivery amounts cannot be negative.");
  const ordersEnabled = isTrue(next.ordersEnabled ?? true),
    codEnabled = isTrue(next.codEnabled),
    bankEnabled = isTrue(next.bankTransferEnabled ?? next.bankEnabled);
  if (ordersEnabled && !codEnabled && !bankEnabled)
    throw new Error("Enable at least one payment method before online orders.");
  if (
    bankEnabled &&
    (!String(next.bankName || "").trim() ||
      !String(next.bankAccountName ?? next.accountName ?? "").trim() ||
      !String(next.bankAccountNumber ?? next.accountNumber ?? "").trim())
  )
    throw new Error("Complete bank details before enabling bank transfer.");
  for (const [key, value] of Object.entries(patch))
    await query(
      "INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
      [key, JSON.stringify(value)],
    );
  return listSettings();
}

export async function saveCourierConfig(input: Record<string, unknown>) {
  const couriers = Array.isArray(input.couriers)
      ? (input.couriers as Record<string, unknown>[])
      : [],
    rates = Array.isArray(input.rates)
      ? (input.rates as Record<string, unknown>[])
      : [];
  const defaultId = String(input.defaultCourierProviderId || ""),
    defaultCourier = couriers.find(
      (courier) => String(courier.id) === defaultId && Boolean(courier.active),
    );
  if (!defaultCourier)
    throw new Error("Choose one active default checkout courier.");
  for (const courier of couriers) {
    if (!courier.id || !String(courier.name || "").trim())
      throw new Error("Every courier needs an ID and name.");
    if (!["zone", "flat"].includes(String(courier.pricingMode)))
      throw new Error("Courier pricing mode must be zone or flat.");
    if (Number(courier.flatRate || 0) < 0)
      throw new Error("Courier rates cannot be negative.");
    if (courier.active && courier.pricingMode === "zone") {
      const fallbacks = rates.filter(
        (rate) =>
          rate.courierProviderId === courier.id &&
          Boolean(rate.active) &&
          Boolean(rate.fallback),
      );
      if (fallbacks.length !== 1)
        throw new Error(
          "Each active zone-based courier needs one fallback zone.",
        );
    }
  }
  if (rates.some((rate) => Number(rate.fee) < 0))
    throw new Error("Delivery rates cannot be negative.");
  await withTransaction(async (client) => {
    for (const courier of couriers)
      await client.query(
        `INSERT INTO courier_providers(id,name,phone,notes,pricing_mode,flat_rate,active,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,notes=EXCLUDED.notes,pricing_mode=EXCLUDED.pricing_mode,flat_rate=EXCLUDED.flat_rate,active=EXCLUDED.active,updated_at=now()`,
        [
          courier.id,
          courier.name,
          courier.phone || "",
          courier.notes || "",
          courier.pricingMode,
          courier.flatRate || 0,
          Boolean(courier.active),
        ],
      );
    for (const rate of rates)
      await client.query(
        `INSERT INTO delivery_rates(id,courier_provider_id,name,fee,active,districts,cities,postal_codes,fallback,sort_order,updated_at) VALUES($1,$2,$3,$4,$5,$6::text[],$7::text[],$8::text[],$9,$10,now()) ON CONFLICT(id) DO UPDATE SET courier_provider_id=EXCLUDED.courier_provider_id,name=EXCLUDED.name,fee=EXCLUDED.fee,active=EXCLUDED.active,districts=EXCLUDED.districts,cities=EXCLUDED.cities,postal_codes=EXCLUDED.postal_codes,fallback=EXCLUDED.fallback,sort_order=EXCLUDED.sort_order,updated_at=now()`,
        [
          rate.id,
          rate.courierProviderId,
          rate.name,
          rate.fee,
          Boolean(rate.active),
          rate.districts || [],
          rate.cities || [],
          rate.postalCodes || [],
          Boolean(rate.fallback),
          rate.sortOrder || 0,
        ],
      );
    await client.query(
      "DELETE FROM delivery_rates WHERE NOT(id=ANY($1::text[]))",
      [rates.map((rate) => String(rate.id))],
    );
    await client.query(
      "DELETE FROM courier_providers WHERE NOT(id=ANY($1::text[]))",
      [couriers.map((courier) => String(courier.id))],
    );
    await client.query(
      "INSERT INTO site_settings(key,value,updated_at) VALUES('defaultCourierProviderId',$1::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
      [JSON.stringify(defaultId)],
    );
  });
  return {
    couriers: await listCouriers(),
    deliveryRates: await listDeliveryRates(),
    defaultCourierProviderId: defaultId,
  };
}
