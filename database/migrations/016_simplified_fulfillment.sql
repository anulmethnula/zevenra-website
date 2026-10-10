BEGIN;

CREATE TABLE IF NOT EXISTS delivery_methods (
  type text PRIMARY KEY CHECK (type IN ('flat','area_group','pickup')),
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  fee bigint CHECK (fee IS NULL OR fee >= 0),
  minimum_delivery_days integer CHECK (minimum_delivery_days IS NULL OR minimum_delivery_days > 0),
  maximum_delivery_days integer CHECK (maximum_delivery_days IS NULL OR maximum_delivery_days >= minimum_delivery_days),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO delivery_methods(type,display_name,sort_order) VALUES
 ('flat','Standard Delivery',1),
 ('area_group','Area Group Delivery',2),
 ('pickup','Collect From Branch',3)
ON CONFLICT(type) DO NOTHING;

CREATE TABLE IF NOT EXISTS delivery_area_groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  fee bigint CHECK (fee IS NULL OR fee >= 0),
  active boolean NOT NULL DEFAULT true,
  is_fallback boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_area_groups_one_fallback_idx
  ON delivery_area_groups((is_fallback)) WHERE is_fallback AND active;

INSERT INTO delivery_area_groups(id,name,sort_order,is_fallback) VALUES
 ('colombo-city','Colombo City 01–15',1,false),
 ('colombo-suburbs','Colombo Suburbs',2,false),
 ('western-other','Western Province Other',3,false),
 ('major-outstation','Major Outstation Cities',4,false),
 ('other-outstation','Other Outstation',5,true)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS delivery_area_locations (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES delivery_area_groups(id) ON DELETE RESTRICT,
  district text NOT NULL,
  town text NOT NULL,
  normalized_town text NOT NULL,
  postcode text,
  aliases text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (postcode IS NULL OR postcode ~ '^[0-9]{5}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_area_locations_active_identity_idx
  ON delivery_area_locations(lower(btrim(district)),normalized_town,COALESCE(postcode,'')) WHERE active;
CREATE INDEX IF NOT EXISTS delivery_area_locations_lookup_idx
  ON delivery_area_locations(lower(btrim(district)),normalized_town,postcode) WHERE active;

CREATE TABLE IF NOT EXISTS delivery_district_defaults (
  district text PRIMARY KEY,
  group_id text NOT NULL REFERENCES delivery_area_groups(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO delivery_district_defaults(district,group_id) VALUES
 ('Colombo','western-other'),('Gampaha','western-other'),('Kalutara','western-other')
ON CONFLICT(district) DO NOTHING;

CREATE TABLE IF NOT EXISTS pickup_locations (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Colombo postal city identities. Fees remain intentionally unset.
INSERT INTO delivery_area_locations(id,group_id,district,town,normalized_town,postcode,aliases)
SELECT 'colombo-'||lpad(n::text,2,'0'),'colombo-city','Colombo','Colombo '||lpad(n::text,2,'0'),
       'colombo '||n::text,lpad(n::text,3,'0')||'00',
       ARRAY['Colombo '||n::text,'Colombo'||lpad(n::text,2,'0'),'Col '||lpad(n::text,2,'0')]
FROM generate_series(1,15) n ON CONFLICT(id) DO NOTHING;

INSERT INTO delivery_area_locations(id,group_id,district,town,normalized_town,aliases) VALUES
 ('suburb-dehiwala','colombo-suburbs','Colombo','Dehiwala','dehiwala','{}'),
 ('suburb-mount-lavinia','colombo-suburbs','Colombo','Mount Lavinia','mount lavinia','{}'),
 ('suburb-moratuwa','colombo-suburbs','Colombo','Moratuwa','moratuwa','{}'),
 ('suburb-nugegoda','colombo-suburbs','Colombo','Nugegoda','nugegoda','{}'),
 ('suburb-kotte','colombo-suburbs','Colombo','Sri Jayawardenepura Kotte','sri jayawardenepura kotte',ARRAY['Kotte']),
 ('suburb-rajagiriya','colombo-suburbs','Colombo','Rajagiriya','rajagiriya','{}'),
 ('suburb-battaramulla','colombo-suburbs','Colombo','Battaramulla','battaramulla','{}'),
 ('suburb-maharagama','colombo-suburbs','Colombo','Maharagama','maharagama','{}'),
 ('suburb-kottawa','colombo-suburbs','Colombo','Kottawa','kottawa','{}'),
 ('suburb-homagama','colombo-suburbs','Colombo','Homagama','homagama','{}'),
 ('suburb-malabe','colombo-suburbs','Colombo','Malabe','malabe','{}'),
 ('suburb-kaduwela','colombo-suburbs','Colombo','Kaduwela','kaduwela','{}'),
 ('suburb-piliyandala','colombo-suburbs','Colombo','Piliyandala','piliyandala','{}'),
 ('suburb-boralesgamuwa','colombo-suburbs','Colombo','Boralesgamuwa','boralesgamuwa','{}'),
 ('suburb-athurugiriya','colombo-suburbs','Colombo','Athurugiriya','athurugiriya','{}'),
 ('major-kandy','major-outstation','Kandy','Kandy','kandy','{}'),
 ('major-galle','major-outstation','Galle','Galle','galle','{}'),
 ('major-matara','major-outstation','Matara','Matara','matara','{}'),
 ('major-kurunegala','major-outstation','Kurunegala','Kurunegala','kurunegala','{}'),
 ('major-jaffna','major-outstation','Jaffna','Jaffna','jaffna','{}'),
 ('major-anuradhapura','major-outstation','Anuradhapura','Anuradhapura','anuradhapura','{}'),
 ('major-ratnapura','major-outstation','Ratnapura','Ratnapura','ratnapura','{}'),
 ('major-badulla','major-outstation','Badulla','Badulla','badulla','{}'),
 ('major-trincomalee','major-outstation','Trincomalee','Trincomalee','trincomalee','{}'),
 ('major-batticaloa','major-outstation','Batticaloa','Batticaloa','batticaloa','{}'),
 ('major-ampara','major-outstation','Ampara','Ampara','ampara','{}'),
 ('major-polonnaruwa','major-outstation','Polonnaruwa','Polonnaruwa','polonnaruwa','{}'),
 ('major-nuwara-eliya','major-outstation','Nuwara Eliya','Nuwara Eliya','nuwara eliya','{}'),
 ('major-kegalle','major-outstation','Kegalle','Kegalle','kegalle','{}'),
 ('major-puttalam','major-outstation','Puttalam','Puttalam','puttalam','{}'),
 ('major-hambantota','major-outstation','Hambantota','Hambantota','hambantota','{}'),
 ('major-vavuniya','major-outstation','Vavuniya','Vavuniya','vavuniya','{}'),
 ('major-kilinochchi','major-outstation','Kilinochchi','Kilinochchi','kilinochchi','{}'),
 ('major-mannar','major-outstation','Mannar','Mannar','mannar','{}'),
 ('major-mullaitivu','major-outstation','Mullaitivu','Mullaitivu','mullaitivu','{}'),
 ('major-matale','major-outstation','Matale','Matale','matale','{}'),
 ('major-monaragala','major-outstation','Monaragala','Monaragala','monaragala','{}')
ON CONFLICT(id) DO NOTHING;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_method text CHECK (fulfillment_method IS NULL OR fulfillment_method IN ('flat','area_group','pickup')),
  ADD COLUMN IF NOT EXISTS delivery_method_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_area_group_id text,
  ADD COLUMN IF NOT EXISTS delivery_area_group_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pickup_location_id text,
  ADD COLUMN IF NOT EXISTS pickup_branch_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pickup_branch_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pickup_instructions text NOT NULL DEFAULT '';

INSERT INTO schema_migrations(version) VALUES ('016_simplified_fulfillment')
ON CONFLICT(version) DO NOTHING;
COMMIT;
