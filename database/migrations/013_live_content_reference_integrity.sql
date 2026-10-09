BEGIN;

CREATE OR REPLACE FUNCTION navigation_target_exists(
  target_value text,
  link_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN link_kind = 'category' THEN EXISTS (
      SELECT 1 FROM categories c
      WHERE c.active = true
        AND (
          c.id = target_value OR
          c.slug = regexp_replace(target_value, '^/category/', '')
        )
    )
    WHEN link_kind = 'collection' THEN EXISTS (
      SELECT 1 FROM collections c
      WHERE c.active = true
        AND (
          c.id = target_value OR
          c.slug = regexp_replace(target_value, '^/collections/', '')
        )
    )
    WHEN link_kind = 'page' THEN
      left(target_value, 1) = '/' AND left(target_value, 2) <> '//'
    WHEN link_kind = 'url' THEN target_value ~* '^https://'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION validate_visible_navigation_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.visible = true AND NOT navigation_target_exists(NEW.target, NEW.link_type) THEN
    RAISE EXCEPTION 'Visible navigation items must point to an active category/collection or a valid page/HTTPS URL.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS navigation_validate_live_target ON navigation;
CREATE TRIGGER navigation_validate_live_target
BEFORE INSERT OR UPDATE ON navigation
FOR EACH ROW
EXECUTE FUNCTION validate_visible_navigation_target();

CREATE OR REPLACE FUNCTION protect_live_catalog_reference_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    IF OLD.status = 'published' AND NEW.status <> 'published' AND EXISTS (
      SELECT 1 FROM homepage_sections h
      WHERE h.enabled = true
        AND h.type = 'product-grid'
        AND h.reference_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'This product is used by an enabled homepage section. Change or disable that section before unpublishing the product.';
    END IF;
  ELSIF TG_TABLE_NAME = 'categories' THEN
    IF OLD.active = true AND NEW.active = false THEN
      IF EXISTS (
        SELECT 1 FROM navigation n
        WHERE n.visible = true
          AND n.link_type = 'category'
          AND (
            n.target = OLD.id OR
            regexp_replace(n.target, '^/category/', '') = OLD.slug
          )
      ) THEN
        RAISE EXCEPTION 'This category is used by visible navigation. Hide or change the navigation item first.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM homepage_sections h
        WHERE h.enabled = true
          AND h.reference_id = OLD.id
          AND h.type IN ('product-grid', 'category-grid')
      ) THEN
        RAISE EXCEPTION 'This category is used by an enabled homepage section. Change or disable that section first.';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'collections' THEN
    IF OLD.active = true AND NEW.active = false THEN
      IF EXISTS (
        SELECT 1 FROM navigation n
        WHERE n.visible = true
          AND n.link_type = 'collection'
          AND (
            n.target = OLD.id OR
            regexp_replace(n.target, '^/collections/', '') = OLD.slug
          )
      ) THEN
        RAISE EXCEPTION 'This collection is used by visible navigation. Hide or change the navigation item first.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM homepage_sections h
        WHERE h.enabled = true
          AND h.reference_id = OLD.id
          AND h.type IN ('product-grid', 'collection-feature')
      ) THEN
        RAISE EXCEPTION 'This collection is used by an enabled homepage section. Change or disable that section first.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_protect_live_reference_state ON products;
CREATE TRIGGER products_protect_live_reference_state
BEFORE UPDATE OF status ON products
FOR EACH ROW
EXECUTE FUNCTION protect_live_catalog_reference_state();

DROP TRIGGER IF EXISTS categories_protect_live_reference_state ON categories;
CREATE TRIGGER categories_protect_live_reference_state
BEFORE UPDATE OF active ON categories
FOR EACH ROW
EXECUTE FUNCTION protect_live_catalog_reference_state();

DROP TRIGGER IF EXISTS collections_protect_live_reference_state ON collections;
CREATE TRIGGER collections_protect_live_reference_state
BEFORE UPDATE OF active ON collections
FOR EACH ROW
EXECUTE FUNCTION protect_live_catalog_reference_state();

CREATE OR REPLACE FUNCTION protect_navigation_reference_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'categories' AND EXISTS (
    SELECT 1 FROM navigation n
    WHERE n.visible = true
      AND n.link_type = 'category'
      AND (
        n.target = OLD.id OR
        regexp_replace(n.target, '^/category/', '') = OLD.slug
      )
  ) THEN
    RAISE EXCEPTION 'This category is used by visible navigation. Hide or change the navigation item before deleting it.';
  END IF;

  IF TG_TABLE_NAME = 'collections' AND EXISTS (
    SELECT 1 FROM navigation n
    WHERE n.visible = true
      AND n.link_type = 'collection'
      AND (
        n.target = OLD.id OR
        regexp_replace(n.target, '^/collections/', '') = OLD.slug
      )
  ) THEN
    RAISE EXCEPTION 'This collection is used by visible navigation. Hide or change the navigation item before deleting it.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS categories_protect_navigation_reference ON categories;
CREATE TRIGGER categories_protect_navigation_reference
BEFORE DELETE ON categories
FOR EACH ROW
EXECUTE FUNCTION protect_navigation_reference_delete();

DROP TRIGGER IF EXISTS collections_protect_navigation_reference ON collections;
CREATE TRIGGER collections_protect_navigation_reference
BEFORE DELETE ON collections
FOR EACH ROW
EXECUTE FUNCTION protect_navigation_reference_delete();

-- Replace the generic homepage delete guard with type-aware checks so IDs
-- that happen to collide across catalogue tables do not create false blocks.
CREATE OR REPLACE FUNCTION protect_enabled_homepage_reference_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' AND EXISTS (
    SELECT 1 FROM homepage_sections h
    WHERE h.enabled = true
      AND h.type = 'product-grid'
      AND h.reference_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'This product is used by an enabled homepage section. Change or disable that section before deleting it.';
  END IF;

  IF TG_TABLE_NAME = 'categories' AND EXISTS (
    SELECT 1 FROM homepage_sections h
    WHERE h.enabled = true
      AND h.type IN ('product-grid', 'category-grid')
      AND h.reference_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'This category is used by an enabled homepage section. Change or disable that section before deleting it.';
  END IF;

  IF TG_TABLE_NAME = 'collections' AND EXISTS (
    SELECT 1 FROM homepage_sections h
    WHERE h.enabled = true
      AND h.type IN ('product-grid', 'collection-feature')
      AND h.reference_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'This collection is used by an enabled homepage section. Change or disable that section before deleting it.';
  END IF;

  RETURN OLD;
END;
$$;

INSERT INTO schema_migrations(version)
VALUES ('013_live_content_reference_integrity')
ON CONFLICT (version) DO NOTHING;

COMMIT;
