const number = (value: unknown) => Number(value) || 0;
const bool = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";
const text = (value: unknown) => String(value ?? "");
const date = (value: unknown) =>
  value instanceof Date ? value.toISOString() : text(value);

export function mapVariant(row: Record<string, unknown>) {
  return {
    id: text(row.id),
    sku: text(row.sku),
    color: text(row.color),
    size: text(row.size),
    stock: number(row.stock),
    lowStockThreshold: number(row.low_stock_threshold),
    active: bool(row.active),
  };
}

export function mapProduct(row: Record<string, unknown>) {
  return {
    id: text(row.id),
    slug: text(row.slug),
    name: text(row.name),
    shortDescription: text(row.short_description),
    description: text(row.description),
    price: number(row.price),
    compareAtPrice:
      row.compare_at_price === null ? undefined : number(row.compare_at_price),
    categoryId: text(row.category_id),
    subcategory: text(row.subcategory),
    collectionIds: Array.isArray(row.collection_ids)
      ? row.collection_ids.map(text)
      : [],
    media: Array.isArray(row.media) ? row.media : [],
    material: text(row.material),
    fit: text(row.fit),
    care: text(row.care),
    tags: Array.isArray(row.tags) ? row.tags.map(text) : [],
    featured: bool(row.featured),
    newArrival: bool(row.new_arrival),
    preorderEnabled: bool(row.preorder_enabled),
    preorderMessage: text(row.preorder_message),
    status: text(row.status),
    sortOrder: number(row.sort_order),
    sizeChartId: text(row.size_chart_id) || undefined,
    shippingWeightGrams: row.shipping_weight_grams == null ? undefined : number(row.shipping_weight_grams),
    variants: Array.isArray(row.variants)
      ? row.variants.map((item) => mapVariant(item as Record<string, unknown>))
      : [],
  };
}

export const mapCategory = (row: Record<string, unknown>) => ({
  id: text(row.id),
  name: text(row.name),
  slug: text(row.slug),
  description: text(row.description),
  imageUrl: text(row.image_url),
  mobileImageUrl: text(row.mobile_image_url),
  videoUrl: text(row.video_url),
  active: bool(row.active),
  featured: bool(row.featured),
  showInNavigation: bool(row.show_in_navigation),
  showOnHomepage: bool(row.show_on_homepage),
  parentId: text(row.parent_id) || undefined,
  sortOrder: number(row.sort_order),
  defaultShippingWeightGrams: row.default_shipping_weight_grams == null ? undefined : number(row.default_shipping_weight_grams),
});
export const mapCollection = (row: Record<string, unknown>) => ({
  id: text(row.id),
  name: text(row.name),
  slug: text(row.slug),
  description: text(row.description),
  heroImage: text(row.hero_image),
  mobileImage: text(row.mobile_image),
  videoUrl: text(row.video_url),
  ctaLabel: text(row.cta_label),
  active: bool(row.active),
  showInNavigation: bool(row.show_in_navigation),
  showOnHomepage: bool(row.show_on_homepage),
  sortOrder: number(row.sort_order),
});
export const mapSizeChart = (row: Record<string, unknown>) => ({
  id: text(row.id),
  name: text(row.name),
  unit: text(row.unit),
  columns: Array.isArray(row.columns_json) ? row.columns_json : [],
  rows: Array.isArray(row.rows_json) ? row.rows_json : [],
  notes: text(row.notes),
  imageUrl: text(row.image_url),
});
export const mapNavigation = (row: Record<string, unknown>) => ({
  id: text(row.id),
  label: text(row.label),
  linkType: text(row.link_type),
  target: text(row.target),
  visible: bool(row.visible),
  sortOrder: number(row.sort_order),
});
export const mapHomepageSection = (row: Record<string, unknown>) => ({
  id: text(row.id),
  type: text(row.type),
  enabled: bool(row.enabled),
  title: text(row.title),
  subtitle: text(row.subtitle),
  desktopMedia: text(row.desktop_media),
  mobileMedia: text(row.mobile_media),
  ctaLabel: text(row.cta_label),
  ctaLink: text(row.cta_link),
  referenceId: text(row.reference_id),
  textPosition: text(row.text_position),
  overlay: number(row.overlay),
  spacing: text(row.spacing),
  sortOrder: number(row.sort_order),
});
export const mapCourier = (row: Record<string, unknown>) => ({
  id: text(row.id),
  name: text(row.name),
  phone: text(row.phone),
  notes: text(row.notes),
  pricingMode: text(row.pricing_mode),
  flatRate: number(row.flat_rate),
  active: bool(row.active),
  createdAt: date(row.created_at),
  updatedAt: date(row.updated_at),
});
export const mapDeliveryRate = (row: Record<string, unknown>) => ({
  id: text(row.id),
  courierProviderId: text(row.courier_provider_id),
  name: text(row.name),
  fee: number(row.fee),
  active: bool(row.active),
  districts: Array.isArray(row.districts) ? row.districts.map(text) : [],
  cities: Array.isArray(row.cities) ? row.cities.map(text) : [],
  postalCodes: Array.isArray(row.postal_codes)
    ? row.postal_codes.map(text)
    : [],
  fallback: bool(row.fallback),
  sortOrder: number(row.sort_order),
});

export function mapCustomer(row: Record<string, unknown>) {
  return {
    id: text(row.id),
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    email: text(row.email),
    mobile: text(row.mobile),
    address1: text(row.address1),
    address2: text(row.address2),
    city: text(row.city),
    district: text(row.district),
    postalCode: text(row.postal_code),
    passwordHash: text(row.password_hash),
    passwordSalt: text(row.password_salt),
    status: text(row.status),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    lastLoginAt: date(row.last_login_at),
  };
}

export function mapOrder(row: Record<string, unknown>) {
  return {
    orderId: text(row.order_id),
    createdAt: date(row.created_at),
    customerId: text(row.customer_id),
    customerName: text(row.customer_name),
    phone: text(row.phone),
    whatsapp: text(row.whatsapp),
    email: text(row.email),
    address1: text(row.address1),
    address2: text(row.address2),
    city: text(row.city),
    district: text(row.district),
    postalCode: text(row.postal_code),
    deliveryNotes: text(row.delivery_notes),
    courierProviderId: text(row.courier_provider_id),
    courierName: text(row.courier_name),
    deliveryPricingMode: text(row.delivery_pricing_mode),
    deliveryRatePlan: text(row.delivery_rate_plan),
    deliveryZoneName: text(row.delivery_zone_name),
    fulfilmentCourierProviderId: text(row.fulfilment_courier_provider_id),
    fulfilmentCourierName: text(row.fulfilment_courier_name),
    trackingNumber: text(row.tracking_number),
    trackingUrl: text(row.tracking_url),
    courierSentDate: date(row.courier_sent_date),
    paymentMethod: text(row.payment_method),
    paymentStatus: text(row.payment_status),
    paymentReference: text(row.payment_reference),
    paymentReceiptUrl: text(row.payment_receipt_public_id)
      ? `order:${text(row.order_id)}`
      : "",
    subtotal: number(row.subtotal),
    discountCode: text(row.discount_code),
    discountAmount: number(row.discount_amount),
    deliveryFee: number(row.delivery_fee),
    totalProductWeightGrams: row.total_product_weight_grams == null ? undefined : number(row.total_product_weight_grams),
    totalShippingWeightGrams: row.total_shipping_weight_grams == null ? undefined : number(row.total_shipping_weight_grams),
    total: number(row.total),
    orderStatus: text(row.order_status),
    source: text(row.source),
    hasPreorder: bool(row.has_preorder),
    stockState: text(row.stock_state),
    returnCount: number(row.return_count),
    items: Array.isArray(row.items)
      ? row.items.map((item) => mapOrderItem(item as Record<string, unknown>))
      : [],
  };
}

export function mapOrderItem(row: Record<string, unknown>) {
  return {
    orderItemId: number(row.id),
    productId: text(row.product_id),
    variantId: text(row.variant_id),
    slug: text(row.slug),
    sku: text(row.sku),
    name: text(row.product_name),
    productName: text(row.product_name),
    image: text(row.image),
    color: text(row.color),
    size: text(row.size),
    quantity: number(row.quantity),
    unitPrice: number(row.unit_price),
    lineTotal: number(row.line_total),
    subtotal: number(row.line_total),
    isPreorder: bool(row.is_preorder),
    shippingWeightGrams: row.shipping_weight_grams == null ? undefined : number(row.shipping_weight_grams),
  };
}

export function mapPreorder(row: Record<string, unknown>) {
  return {
    requestId: text(row.request_id),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    customerId: text(row.customer_id) || undefined,
    customerName: text(row.customer_name),
    phone: text(row.phone),
    whatsapp: text(row.whatsapp),
    email: text(row.email),
    address1: text(row.address1),
    address2: text(row.address2),
    city: text(row.city),
    district: text(row.district),
    postalCode: text(row.postal_code),
    productId: text(row.product_id),
    variantId: text(row.variant_id),
    productName: text(row.product_name),
    sku: text(row.sku),
    color: text(row.color),
    size: text(row.size),
    quantity: number(row.quantity),
    requestedPrice: number(row.requested_price),
    confirmedPrice:
      row.confirmed_price === null ? undefined : number(row.confirmed_price),
    status: text(row.status),
    batchId: text(row.batch_id),
    notes: text(row.notes),
  };
}
