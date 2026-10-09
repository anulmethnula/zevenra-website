BEGIN;

CREATE OR REPLACE FUNCTION validate_category_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_parent_id text;
BEGIN
  IF NEW.parent_id IS NULL OR btrim(NEW.parent_id) = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A category cannot be its own parent.';
  END IF;

  SELECT parent_id
  INTO parent_parent_id
  FROM categories
  WHERE id = NEW.parent_id;

  IF FOUND AND parent_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'A subcategory cannot be used as another category parent.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM categories child
    WHERE child.parent_id = NEW.id AND child.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Move this category''s subcategories before making it a subcategory.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_validate_hierarchy ON categories;
CREATE TRIGGER categories_validate_hierarchy
BEFORE INSERT OR UPDATE OF parent_id ON categories
FOR EACH ROW
EXECUTE FUNCTION validate_category_hierarchy();

ALTER TABLE categories
  ADD CONSTRAINT categories_name_nonblank CHECK (btrim(name) <> '') NOT VALID;
ALTER TABLE categories
  ADD CONSTRAINT categories_slug_nonblank CHECK (btrim(slug) <> '') NOT VALID;
ALTER TABLE collections
  ADD CONSTRAINT collections_name_nonblank CHECK (btrim(name) <> '') NOT VALID;
ALTER TABLE collections
  ADD CONSTRAINT collections_slug_nonblank CHECK (btrim(slug) <> '') NOT VALID;
ALTER TABLE products
  ADD CONSTRAINT products_name_nonblank CHECK (btrim(name) <> '') NOT VALID;
ALTER TABLE products
  ADD CONSTRAINT products_slug_nonblank CHECK (btrim(slug) <> '') NOT VALID;

INSERT INTO schema_migrations(version)
VALUES ('014_category_hierarchy_guard')
ON CONFLICT (version) DO NOTHING;

COMMIT;
