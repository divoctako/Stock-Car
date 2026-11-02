-- Relational source of truth. No JSON/JSONB storage columns.
CREATE TABLE IF NOT EXISTS public.app_meta (
 id smallint PRIMARY KEY CHECK(id=1), revision bigint NOT NULL DEFAULT 1,
 schema_version integer NOT NULL DEFAULT 2, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_meta(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.cars (
  "id" bigint PRIMARY KEY CHECK (id > 0),
  "vin" text,
  "model" text,
  "submodel" text,
  "color" text,
  "location" text,
  "status" text,
  "stock_status" text,
  "buy_price" numeric,
  "sell_price" numeric,
  "amount_financed" numeric,
  "receive_date" date,
  "payment_due_date" date,
  "battery_number" text,
  "front_motor_number" text,
  "rear_motor_number" text,
  "engine_number" text,
  "manufacture_year" text,
  "sales_code" text,
  "customer_name" text,
  "release_date" date,
  "inspected" boolean,
  "transfer_date" date,
  "transfer_to" text,
  "claims_not_provided" boolean,
 present_fields text[] NOT NULL DEFAULT '{}', null_fields text[] NOT NULL DEFAULT '{}',
 CHECK(status IN ('Available','Reserved','Delivered','Transferred','FloorPlan')),
 CHECK(stock_status IS NULL OR stock_status IN ('Available','Reserved')),
 CHECK(buy_price >= 0 AND sell_price >= 0 AND amount_financed >= 0),
 CHECK(manufacture_year IS NULL OR manufacture_year='' OR manufacture_year ~ '^[0-9]{4}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS cars_vin_unique ON public.cars(upper(btrim(vin))) WHERE vin IS NOT NULL AND btrim(vin)<>'';
CREATE TABLE IF NOT EXISTS public.claims (
  "id" bigint PRIMARY KEY CHECK (id > 0),
  "detail" text,
  "amount" numeric,
  "date_received" date,
  "amount_received" numeric,
  "bank" text,
  "inspected" boolean,
 car_id bigint REFERENCES public.cars(id) ON DELETE CASCADE,
 present_fields text[] NOT NULL DEFAULT '{}', null_fields text[] NOT NULL DEFAULT '{}',
 CHECK(amount > 0), CHECK(amount_received >= 0), CHECK(detail IS NOT NULL AND btrim(detail)<>'')
);
CREATE INDEX IF NOT EXISTS claims_car_id ON public.claims(car_id);
CREATE TABLE IF NOT EXISTS public.app_options (
 id text PRIMARY KEY, option_group text NOT NULL CHECK(option_group IN ('models','colors','locations','banks')),
 position integer NOT NULL CHECK(position>=0), value text NOT NULL CHECK(btrim(value)<>''),
 hex text CHECK(hex IS NULL OR hex ~ '^#[0-9a-fA-F]{6}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS app_options_value_unique ON public.app_options(option_group,lower(btrim(value)));
CREATE TABLE IF NOT EXISTS public.role_credentials (
 role text PRIMARY KEY CHECK(role IN ('admin','keeper','sales','claim')),version integer NOT NULL CHECK(version>0),
 salt text NOT NULL, hash text NOT NULL, iv text, ciphertext text, tag text,
 CHECK ((iv IS NULL AND ciphertext IS NULL AND tag IS NULL) OR (iv IS NOT NULL AND ciphertext IS NOT NULL AND tag IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.request_receipts (
 request_id text PRIMARY KEY, fingerprint text NOT NULL, message text NOT NULL, timestamp timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.audit_log (
 id bigint PRIMARY KEY, role text, action text, car_id bigint, request_id text, timestamp timestamptz NOT NULL DEFAULT now(),
 present_fields text[] NOT NULL DEFAULT '{role,action,carId,requestId,timestamp}'
);
CREATE TABLE IF NOT EXISTS public.login_attempts (
 key text PRIMARY KEY,count integer NOT NULL CHECK(count>=0),first_at timestamptz NOT NULL
);
-- Scalar settings/provenance: one row per path, preserving nested arrays and empty values.
CREATE TABLE IF NOT EXISTS public.app_values (
 scope text NOT NULL, owner text NOT NULL DEFAULT '', path text[] NOT NULL,
 kind text NOT NULL CHECK(kind IN ('object','array','string','number','boolean','null')),
 value text, PRIMARY KEY(scope,owner,path),
 CHECK((kind IN ('object','array','null') AND value IS NULL) OR (kind IN ('string','number','boolean') AND value IS NOT NULL))
);
