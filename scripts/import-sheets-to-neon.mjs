import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const source = process.argv[2],
  connectionString =
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!source)
  throw new Error(
    "Usage: npm run db:import-sheets -- path/to/google-sheets-export.json",
  );
if (!connectionString)
  throw new Error(
    "Set DATABASE_URL_UNPOOLED or DATABASE_URL before importing.",
  );
const data = JSON.parse(await readFile(path.resolve(source), "utf8"));
const rows = (name) => (Array.isArray(data[name]) ? data[name] : []);
const bool = (value) =>
  value === true || String(value).toLowerCase() === "true";
const num = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const array = (value) =>
  Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
const json = (value) => {
  if (typeof value === "object" && value !== null) return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return [];
  }
};
const timestamp = (value) => (value ? new Date(value) : new Date());
function receipt(value) {
  try {
    const url = new URL(String(value || "")),
      parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    let rest = parts.slice(3);
    if (/^v\d+$/.test(rest[0] || "")) rest = rest.slice(1);
    const last = rest.pop() || "",
      dot = last.lastIndexOf("."),
      name = dot > 0 ? last.slice(0, dot) : last,
      format = dot > 0 ? last.slice(dot + 1) : "",
      publicId = [...rest, name].join("/");
    return publicId.startsWith("zevenra/payment-receipts/")
      ? { publicId, resourceType: parts[1] || "image", format }
      : { publicId: "", resourceType: "", format: "" };
  } catch {
    return { publicId: "", resourceType: "", format: "" };
  }
}

const pool = new Pool({ connectionString, max: 1 }),
  client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const row of [...rows("Categories")].sort(
    (a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)),
  ))
    await client.query(
      `INSERT INTO categories(id,name,slug,description,image_url,mobile_image_url,video_url,active,featured,show_in_navigation,show_on_homepage,parent_id,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,description=EXCLUDED.description,image_url=EXCLUDED.image_url,mobile_image_url=EXCLUDED.mobile_image_url,video_url=EXCLUDED.video_url,active=EXCLUDED.active,featured=EXCLUDED.featured,show_in_navigation=EXCLUDED.show_in_navigation,show_on_homepage=EXCLUDED.show_on_homepage,parent_id=EXCLUDED.parent_id,sort_order=EXCLUDED.sort_order,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.name,
        row.slug,
        row.description || "",
        row.imageUrl || "",
        row.mobileImageUrl || "",
        row.videoUrl || "",
        bool(row.active),
        bool(row.featured),
        bool(row.showInNavigation),
        bool(row.showOnHomepage),
        row.parentId || null,
        num(row.sortOrder),
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("SizeCharts"))
    await client.query(
      `INSERT INTO size_charts(id,name,unit,columns_json,rows_json,notes,image_url,created_at,updated_at) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,unit=EXCLUDED.unit,columns_json=EXCLUDED.columns_json,rows_json=EXCLUDED.rows_json,notes=EXCLUDED.notes,image_url=EXCLUDED.image_url,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.name,
        row.unit || "cm",
        JSON.stringify(json(row.columnsJson || row.columns)),
        JSON.stringify(json(row.rowsJson || row.rows)),
        row.notes || "",
        row.imageUrl || "",
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("Products"))
    await client.query(
      `INSERT INTO products(id,slug,name,short_description,description,price,compare_at_price,category_id,subcategory,size_chart_id,media,material,fit,care,tags,featured,new_arrival,preorder_enabled,preorder_message,status,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::text[],$16,$17,$18,$19,$20,$21,$22,$23) ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,short_description=EXCLUDED.short_description,description=EXCLUDED.description,price=EXCLUDED.price,compare_at_price=EXCLUDED.compare_at_price,category_id=EXCLUDED.category_id,subcategory=EXCLUDED.subcategory,size_chart_id=EXCLUDED.size_chart_id,media=EXCLUDED.media,material=EXCLUDED.material,fit=EXCLUDED.fit,care=EXCLUDED.care,tags=EXCLUDED.tags,featured=EXCLUDED.featured,new_arrival=EXCLUDED.new_arrival,preorder_enabled=EXCLUDED.preorder_enabled,preorder_message=EXCLUDED.preorder_message,status=EXCLUDED.status,sort_order=EXCLUDED.sort_order,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.slug,
        row.name,
        row.shortDescription || "",
        row.description || "",
        num(row.price),
        row.compareAtPrice ? num(row.compareAtPrice) : null,
        row.categoryId,
        row.subcategory || "",
        row.sizeChartId || null,
        JSON.stringify(json(row.mediaJson || row.media)),
        row.material || "",
        row.fit || "",
        row.care || "",
        array(row.tags),
        bool(row.featured),
        bool(row.newArrival),
        bool(row.preorderEnabled),
        row.preorderMessage || "",
        row.status || "draft",
        num(row.sortOrder),
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("Variants"))
    await client.query(
      `INSERT INTO variants(id,product_id,sku,color,size,stock,low_stock_threshold,active,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET product_id=EXCLUDED.product_id,sku=EXCLUDED.sku,color=EXCLUDED.color,size=EXCLUDED.size,stock=EXCLUDED.stock,low_stock_threshold=EXCLUDED.low_stock_threshold,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.productId,
        row.sku,
        row.color,
        row.size,
        num(row.stock),
        num(row.lowStockThreshold, 1),
        bool(row.active),
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("Collections"))
    await client.query(
      `INSERT INTO collections(id,name,slug,description,hero_image,mobile_image,video_url,cta_label,active,show_in_navigation,show_on_homepage,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,description=EXCLUDED.description,hero_image=EXCLUDED.hero_image,mobile_image=EXCLUDED.mobile_image,video_url=EXCLUDED.video_url,cta_label=EXCLUDED.cta_label,active=EXCLUDED.active,show_in_navigation=EXCLUDED.show_in_navigation,show_on_homepage=EXCLUDED.show_on_homepage,sort_order=EXCLUDED.sort_order,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.name,
        row.slug,
        row.description || "",
        row.heroImage || "",
        row.mobileImage || "",
        row.videoUrl || "",
        row.ctaLabel || "",
        bool(row.active),
        bool(row.showInNavigation),
        bool(row.showOnHomepage),
        num(row.sortOrder),
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("ProductCollections"))
    await client.query(
      "INSERT INTO product_collections(product_id,collection_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [row.productId, row.collectionId],
    );
  for (const row of rows("Navigation"))
    await client.query(
      `INSERT INTO navigation(id,label,link_type,target,visible,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,link_type=EXCLUDED.link_type,target=EXCLUDED.target,visible=EXCLUDED.visible,sort_order=EXCLUDED.sort_order,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.label,
        row.linkType,
        row.target,
        bool(row.visible),
        num(row.sortOrder),
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("HomepageSections"))
    await client.query(
      `INSERT INTO homepage_sections(id,type,enabled,title,subtitle,desktop_media,mobile_media,cta_label,cta_link,reference_id,text_position,overlay,spacing,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(id) DO UPDATE SET type=EXCLUDED.type,enabled=EXCLUDED.enabled,title=EXCLUDED.title,subtitle=EXCLUDED.subtitle,desktop_media=EXCLUDED.desktop_media,mobile_media=EXCLUDED.mobile_media,cta_label=EXCLUDED.cta_label,cta_link=EXCLUDED.cta_link,reference_id=EXCLUDED.reference_id,text_position=EXCLUDED.text_position,overlay=EXCLUDED.overlay,spacing=EXCLUDED.spacing,sort_order=EXCLUDED.sort_order,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.type,
        bool(row.enabled),
        row.title,
        row.subtitle || "",
        row.desktopMedia || "",
        row.mobileMedia || "",
        row.ctaLabel || "",
        row.ctaLink || "",
        row.referenceId || "",
        row.textPosition || "left",
        num(row.overlay),
        row.spacing || "normal",
        num(row.sortOrder),
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("Customers"))
    await client.query(
      `INSERT INTO customers(id,first_name,last_name,email,mobile,address1,address2,city,district,postal_code,password_hash,password_salt,status,created_at,updated_at,last_login_at) VALUES($1,$2,$3,lower($4),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(id) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,email=EXCLUDED.email,mobile=EXCLUDED.mobile,address1=EXCLUDED.address1,address2=EXCLUDED.address2,city=EXCLUDED.city,district=EXCLUDED.district,postal_code=EXCLUDED.postal_code,password_hash=EXCLUDED.password_hash,password_salt=EXCLUDED.password_salt,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,last_login_at=EXCLUDED.last_login_at`,
      [
        row.id,
        row.firstName,
        row.lastName,
        row.email,
        row.mobile || "",
        row.address1 || "",
        row.address2 || "",
        row.city || "",
        row.district || "",
        row.postalCode || "",
        row.passwordHash,
        row.passwordSalt,
        row.status || "active",
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
        row.lastLoginAt ? timestamp(row.lastLoginAt) : null,
      ],
    );
  for (const row of rows("CourierProviders"))
    await client.query(
      `INSERT INTO courier_providers(id,name,phone,notes,pricing_mode,flat_rate,active,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,notes=EXCLUDED.notes,pricing_mode=EXCLUDED.pricing_mode,flat_rate=EXCLUDED.flat_rate,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.name,
        row.phone || "",
        row.notes || "",
        row.pricingMode || "zone",
        num(row.flatRate),
        bool(row.active),
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("DeliveryRates"))
    await client.query(
      `INSERT INTO delivery_rates(id,courier_provider_id,name,fee,active,districts,cities,postal_codes,fallback,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6::text[],$7::text[],$8::text[],$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET courier_provider_id=EXCLUDED.courier_provider_id,name=EXCLUDED.name,fee=EXCLUDED.fee,active=EXCLUDED.active,districts=EXCLUDED.districts,cities=EXCLUDED.cities,postal_codes=EXCLUDED.postal_codes,fallback=EXCLUDED.fallback,sort_order=EXCLUDED.sort_order,updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.courierProviderId,
        row.name,
        num(row.fee),
        bool(row.active),
        array(row.districts),
        array(row.cities),
        array(row.postalCodes),
        bool(row.fallback),
        num(row.sortOrder),
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
      ],
    );
  for (const row of rows("SiteSettings"))
    await client.query(
      "INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2::jsonb,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",
      [row.key, JSON.stringify(row.value), timestamp(row.updatedAt)],
    );
  for (const row of rows("Orders")) {
    const asset = receipt(row.paymentReceiptUrl);
    await client.query(
      `INSERT INTO orders(order_id,created_at,updated_at,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,delivery_notes,courier_provider_id,courier_name,delivery_pricing_mode,delivery_rate_plan,delivery_zone_name,fulfilment_courier_provider_id,fulfilment_courier_name,tracking_number,tracking_url,courier_sent_date,payment_method,payment_status,payment_reference,payment_receipt_public_id,payment_receipt_resource_type,payment_receipt_format,subtotal,delivery_fee,total,stock_state,order_status,source,has_preorder) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37) ON CONFLICT(order_id) DO UPDATE SET updated_at=EXCLUDED.updated_at,payment_status=EXCLUDED.payment_status,order_status=EXCLUDED.order_status,fulfilment_courier_provider_id=EXCLUDED.fulfilment_courier_provider_id,fulfilment_courier_name=EXCLUDED.fulfilment_courier_name,tracking_number=EXCLUDED.tracking_number,tracking_url=EXCLUDED.tracking_url,courier_sent_date=EXCLUDED.courier_sent_date`,
      [
        row.orderId,
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
        row.customerId || null,
        row.customerName,
        row.phone,
        row.whatsapp || "",
        row.email || "",
        row.address1 || "",
        row.address2 || "",
        row.city,
        row.district,
        row.postalCode || "",
        row.deliveryNotes || "",
        row.courierProviderId || null,
        row.courierName || "",
        row.deliveryPricingMode || "zone",
        row.deliveryRatePlan || "",
        row.deliveryZoneName || "",
        row.fulfilmentCourierProviderId || null,
        row.fulfilmentCourierName || "",
        row.trackingNumber || "",
        row.trackingUrl || "",
        row.courierSentDate ? timestamp(row.courierSentDate) : null,
        row.paymentMethod || "cod",
        row.paymentStatus || "",
        row.paymentReference || "",
        asset.publicId,
        asset.resourceType,
        asset.format,
        num(row.subtotal),
        num(row.deliveryFee),
        num(row.total),
        bool(row.stockDeducted) ? "reserved" : "not_applicable",
        String(row.orderStatus || "pending").toLowerCase(),
        row.source || "web",
        bool(row.hasPreorder),
      ],
    );
  }
  await client.query("DELETE FROM order_items WHERE order_id=ANY($1::text[])", [
    rows("Orders").map((row) => row.orderId),
  ]);
  for (const row of rows("OrderItems"))
    await client.query(
      `INSERT INTO order_items(order_id,product_id,variant_id,sku,product_name,color,size,quantity,unit_price,line_total,is_preorder) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        row.orderId,
        row.productId || null,
        row.variantId || null,
        row.sku || "",
        row.productName || row.name || "Item",
        row.color || "",
        row.size || "",
        num(row.quantity, 1),
        num(row.unitPrice),
        num(row.lineTotal, num(row.unitPrice) * num(row.quantity, 1)),
        bool(row.isPreorder),
      ],
    );
  for (const row of rows("Preorders"))
    await client.query(
      `INSERT INTO preorders(request_id,created_at,updated_at,customer_id,customer_name,phone,whatsapp,email,address1,address2,city,district,postal_code,product_id,variant_id,product_name,sku,color,size,quantity,requested_price,confirmed_price,status,batch_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) ON CONFLICT(request_id) DO UPDATE SET updated_at=EXCLUDED.updated_at,confirmed_price=EXCLUDED.confirmed_price,status=EXCLUDED.status,batch_id=EXCLUDED.batch_id,notes=EXCLUDED.notes,address1=EXCLUDED.address1,address2=EXCLUDED.address2,city=EXCLUDED.city,district=EXCLUDED.district,postal_code=EXCLUDED.postal_code`,
      [
        row.requestId,
        timestamp(row.createdAt),
        timestamp(row.updatedAt),
        row.customerId || null,
        row.customerName,
        row.phone || "",
        row.whatsapp,
        row.email || "",
        row.address1 || "",
        row.address2 || "",
        row.city || "",
        row.district || "",
        row.postalCode || "",
        row.productId || null,
        row.variantId || null,
        row.productName,
        row.sku,
        row.color || "",
        row.size || "",
        num(row.quantity, 1),
        num(row.requestedPrice),
        row.confirmedPrice ? num(row.confirmedPrice) : null,
        row.status || "new",
        row.batchId || "",
        row.notes || "",
      ],
    );
  for (const row of rows("AuditLog"))
    await client.query(
      "INSERT INTO audit_logs(created_at,actor,action,entity_type,entity_id,details) SELECT $1,$2,$3,$4,$5,$6::jsonb WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE created_at=$1 AND actor=$2 AND action=$3 AND entity_type=$4 AND entity_id=$5)",
      [
        timestamp(row.createdAt),
        row.actor || "migration",
        row.action || "",
        row.entityType || row.entity || "",
        row.entityId || "",
        JSON.stringify(json(row.details || row.detailsJson || {})),
      ],
    );
  await client.query("COMMIT");
  console.log(
    "Google Sheets export imported successfully. Source data was not changed.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
