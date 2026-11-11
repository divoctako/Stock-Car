import {writeFile} from 'node:fs/promises';
import {carFields,claimFields,snake,quote} from '../lib/relational.js';
const columns=fields=>Object.entries(fields).map(([key,type])=>`  ${quote(snake(key))} ${type}${key==='id'?' PRIMARY KEY CHECK (id > 0)':''}`).join(',\n');
const sql=`-- Relational source of truth. No JSON/JSONB storage columns.
CREATE TABLE IF NOT EXISTS public.app_meta (
 id smallint PRIMARY KEY CHECK(id=1), revision bigint NOT NULL DEFAULT 1,
 schema_version integer NOT NULL DEFAULT 2, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_meta(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.cars (
${columns(carFields)},
 present_fields text[] NOT NULL DEFAULT '{}', null_fields text[] NOT NULL DEFAULT '{}',
 CONSTRAINT cars_status_valid CHECK(status IS NOT NULL AND btrim(status)<>'' AND length(status)<=80),
 CONSTRAINT cars_stock_status_valid CHECK(stock_status IS NULL OR (btrim(stock_status)<>'' AND length(stock_status)<=80 AND stock_status NOT IN ('Delivered','Transferred','FloorPlan'))),
 CHECK(buy_price >= 0 AND sell_price >= 0 AND amount_financed >= 0),
 CHECK(manufacture_year IS NULL OR manufacture_year='' OR manufacture_year ~ '^[0-9]{4}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS cars_vin_unique ON public.cars(upper(btrim(vin))) WHERE vin IS NOT NULL AND btrim(vin)<>'';
CREATE TABLE IF NOT EXISTS public.claims (
${columns(claimFields)},
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
`;
await writeFile(new URL('../sql/relational-schema.sql',import.meta.url),sql);
