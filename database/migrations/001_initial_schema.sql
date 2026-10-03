BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  mobile_image_url text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  show_in_navigation boolean NOT NULL DEFAULT false,
  show_on_homepage boolean NOT NULL DEFAULT false,
  parent_id text REFERENCES categories(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS size_charts (
  id text PRIMARY KEY,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'cm',
  columns_json jsonb NOT NULL DEFAULT '[]',
  rows_json jsonb NOT NULL DEFAULT '[]',
  notes text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price bigint NOT NULL CHECK (price >= 0),
  compare_at_price bigint CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  category_id text NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory text NOT NULL DEFAULT '',
  size_chart_id text REFERENCES size_charts(id) ON DELETE SET NULL,
  media jsonb NOT NULL DEFAULT '[]',
  material text NOT NULL DEFAULT '',
  fit text NOT NULL DEFAULT '',
  care text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  new_arrival boolean NOT NULL DEFAULT false,
  preorder_enabled boolean NOT NULL DEFAULT false,
  preorder_message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('published', 'draft', 'archived')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS products_status_sort_idx ON products(status, sort_order);

CREATE TABLE IF NOT EXISTS variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  color text NOT NULL,
  size text NOT NULL,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 1 CHECK (low_stock_threshold >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, color, size)
);

CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);

CREATE TABLE IF NOT EXISTS collections (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  hero_image text NOT NULL DEFAULT '',
  mobile_image text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  show_in_navigation boolean NOT NULL DEFAULT false,
  show_on_homepage boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_collections (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  collection_id text NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  PRIMARY KEY(product_id, collection_id)
);

CREATE TABLE IF NOT EXISTS navigation (
  id text PRIMARY KEY,
  label text NOT NULL,
  link_type text NOT NULL CHECK (link_type IN ('category', 'collection', 'page', 'url')),
  target text NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS homepage_sections (
  id text PRIMARY KEY,
  type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  desktop_media text NOT NULL DEFAULT '',
  mobile_media text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT '',
  cta_link text NOT NULL DEFAULT '',
  reference_id text NOT NULL DEFAULT '',
  text_position text NOT NULL DEFAULT 'left' CHECK (text_position IN ('left', 'center', 'right')),
  overlay integer NOT NULL DEFAULT 0 CHECK (overlay BETWEEN 0 AND 100),
  spacing text NOT NULL DEFAULT 'normal' CHECK (spacing IN ('compact', 'normal', 'generous')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  mobile text NOT NULL DEFAULT '',
  address1 text NOT NULL DEFAULT '',
  address2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_idx ON customers(lower(email));

CREATE TABLE IF NOT EXISTS courier_providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  pricing_mode text NOT NULL CHECK (pricing_mode IN ('zone', 'flat')),
  flat_rate bigint NOT NULL DEFAULT 0 CHECK (flat_rate >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_rates (
  id text PRIMARY KEY,
  courier_provider_id text NOT NULL REFERENCES courier_providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  fee bigint NOT NULL CHECK (fee >= 0),
  active boolean NOT NULL DEFAULT true,
  districts text[] NOT NULL DEFAULT '{}',
  cities text[] NOT NULL DEFAULT '{}',
  postal_codes text[] NOT NULL DEFAULT '{}',
  fallback boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_rates_courier_idx ON delivery_rates(courier_provider_id, active, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_rates_one_fallback_idx ON delivery_rates(courier_provider_id) WHERE fallback AND active;

CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  order_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  whatsapp text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address1 text NOT NULL,
  address2 text NOT NULL DEFAULT '',
  city text NOT NULL,
  district text NOT NULL,
  postal_code text NOT NULL DEFAULT '',
  delivery_notes text NOT NULL DEFAULT '',
  courier_provider_id text,
  courier_name text NOT NULL DEFAULT '',
  delivery_pricing_mode text NOT NULL DEFAULT 'zone' CHECK (delivery_pricing_mode IN ('zone', 'flat')),
  delivery_rate_plan text NOT NULL DEFAULT '',
  delivery_zone_name text NOT NULL DEFAULT '',
  fulfilment_courier_provider_id text,
  fulfilment_courier_name text NOT NULL DEFAULT '',
  tracking_number text NOT NULL DEFAULT '',
  tracking_url text NOT NULL DEFAULT '',
  courier_sent_date timestamptz,
  payment_method text NOT NULL CHECK (payment_method IN ('cod', 'bank')),
  payment_status text NOT NULL,
  payment_reference text NOT NULL DEFAULT '',
  payment_receipt_public_id text NOT NULL DEFAULT '',
  payment_receipt_resource_type text NOT NULL DEFAULT '',
  payment_receipt_format text NOT NULL DEFAULT '',
  subtotal bigint NOT NULL CHECK (subtotal >= 0),
  delivery_fee bigint NOT NULL CHECK (delivery_fee >= 0),
  total bigint NOT NULL CHECK (total >= 0),
  stock_state text NOT NULL DEFAULT 'reserved' CHECK (stock_state IN ('reserved', 'restored', 'not_applicable')),
  order_status text NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'sourcing', 'packed', 'shipped', 'delivered', 'cancelled')),
  source text NOT NULL DEFAULT 'web',
  has_preorder boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_email_idx ON orders(lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(order_status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  product_id text REFERENCES products(id) ON DELETE SET NULL,
  variant_id text REFERENCES variants(id) ON DELETE SET NULL,
  sku text NOT NULL,
  product_name text NOT NULL,
  color text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price bigint NOT NULL CHECK (unit_price >= 0),
  line_total bigint NOT NULL CHECK (line_total >= 0),
  is_preorder boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id);

CREATE TABLE IF NOT EXISTS preorders (
  request_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  whatsapp text NOT NULL,
  email text NOT NULL DEFAULT '',
  address1 text NOT NULL DEFAULT '',
  address2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  product_id text REFERENCES products(id) ON DELETE SET NULL,
  variant_id text REFERENCES variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text NOT NULL,
  color text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK (quantity > 0),
  requested_price bigint NOT NULL CHECK (requested_price >= 0),
  confirmed_price bigint CHECK (confirmed_price IS NULL OR confirmed_price >= 0),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'confirmed', 'batched', 'ordered', 'in_transit', 'arrived', 'ready', 'converted', 'cancelled')),
  batch_id text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  converted_order_id text REFERENCES orders(order_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS preorders_customer_idx ON preorders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preorders_status_idx ON preorders(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS preorders_active_customer_variant_idx
  ON preorders(variant_id, customer_id)
  WHERE customer_id IS NOT NULL AND status NOT IN ('cancelled', 'converted');

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('001_initial_schema')
ON CONFLICT (version) DO NOTHING;

COMMIT;
