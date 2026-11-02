-- Serialize every writer before touching data, including SQL Console writers.
CREATE OR REPLACE FUNCTION public.stock_lock_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE public.app_meta SET revision=revision+1,updated_at=clock_timestamp() WHERE id=1;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.stock_row_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_car bigint; new_car bigint; next_id bigint;
BEGIN
 IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'Record IDs cannot be changed';
 END IF;
 IF TG_OP='INSERT' AND NEW.id IS NULL THEN
   IF TG_TABLE_NAME='cars' THEN
     SELECT greatest(coalesce(max(id),0)+1,coalesce((SELECT value::bigint FROM public.app_values WHERE scope='state' AND owner='' AND path=ARRAY['nextCarId']),1)) INTO next_id FROM public.cars;
   ELSE
     SELECT greatest(coalesce(max(id),0)+1,coalesce((SELECT value::bigint FROM public.app_values WHERE scope='state' AND owner='' AND path=ARRAY['nextClaimId']),1)) INTO next_id FROM public.claims;
   END IF;
   NEW.id=next_id;
 END IF;
 IF TG_TABLE_NAME='cars' THEN
   IF TG_OP<>'DELETE' THEN
     IF NEW.status IS NULL THEN NEW.status='Available'; END IF;
     IF NEW.status<>'FloorPlan' AND (NEW.vin IS NULL OR btrim(NEW.vin)='') THEN RAISE EXCEPTION 'VIN is required'; END IF;
     IF current_setting('stock.app_write',true) IS DISTINCT FROM '1' AND NEW.inspected IS TRUE AND
       (TG_OP='INSERT' OR OLD.inspected IS DISTINCT FROM NEW.inspected) THEN
       IF NOT EXISTS(SELECT 1 FROM public.claims WHERE car_id=NEW.id) OR
         EXISTS(SELECT 1 FROM public.claims WHERE car_id=NEW.id AND (date_received IS NULL OR coalesce(amount_received,0)<=0)) THEN
         RAISE EXCEPTION 'All claims must have received payment before inspection';
       END IF;
     END IF;
     IF TG_OP='INSERT' THEN
       INSERT INTO public.app_values(scope,owner,path,kind,value) VALUES('state','',ARRAY['nextCarId'],'number',(NEW.id+1)::text)
       ON CONFLICT(scope,owner,path) DO UPDATE SET value=greatest(app_values.value::bigint,NEW.id+1)::text;
     END IF;
   END IF;
 ELSE
   IF current_setting('stock.app_write',true) IS DISTINCT FROM '1' THEN
     IF TG_OP='UPDATE' AND NEW.car_id IS NULL AND NEW.inspected IS TRUE AND OLD.inspected IS DISTINCT FROM NEW.inspected AND
       (NEW.date_received IS NULL OR coalesce(NEW.amount_received,0)<=0) THEN
       RAISE EXCEPTION 'Claim must have received payment before inspection';
     END IF;
     IF TG_OP<>'INSERT' THEN old_car=OLD.car_id; END IF;
     IF TG_OP<>'DELETE' THEN new_car=NEW.car_id; END IF;
     UPDATE public.cars SET inspected=false WHERE id=old_car OR id=new_car;
     IF TG_OP='INSERT' OR TG_OP='UPDATE' AND
       (NEW.detail,NEW.amount,NEW.date_received,NEW.amount_received,NEW.bank,NEW.car_id) IS DISTINCT FROM
       (OLD.detail,OLD.amount,OLD.date_received,OLD.amount_received,OLD.bank,OLD.car_id) THEN
       NEW.inspected=false;
     END IF;
   END IF;
   IF TG_OP='INSERT' THEN
     INSERT INTO public.app_values(scope,owner,path,kind,value) VALUES('state','',ARRAY['nextClaimId'],'number',(NEW.id+1)::text)
     ON CONFLICT(scope,owner,path) DO UPDATE SET value=greatest(app_values.value::bigint,NEW.id+1)::text;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.stock_credential_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.salt,NEW.hash,NEW.iv,NEW.ciphertext,NEW.tag) IS DISTINCT FROM (OLD.salt,OLD.hash,OLD.iv,OLD.ciphertext,OLD.tag) THEN
   NEW.version=greatest(NEW.version,OLD.version+1);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_credential_version ON public.role_credentials;
CREATE TRIGGER stock_credential_version BEFORE UPDATE ON public.role_credentials FOR EACH ROW EXECUTE FUNCTION public.stock_credential_version();

CREATE OR REPLACE FUNCTION public.stock_audit_manual() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id bigint; owner_id text;
BEGIN
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('cars','claims') AND TG_OP='DELETE' THEN
   DELETE FROM public.app_values WHERE scope=CASE TG_TABLE_NAME WHEN 'cars' THEN 'car' ELSE 'claim' END AND owner=OLD.id::text;
 END IF;
 IF current_setting('stock.app_write',true)='1' THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='app_options' THEN
   INSERT INTO public.app_values(scope,owner,path,kind,value) VALUES('state','',ARRAY['configRevision'],'number','1')
   ON CONFLICT(scope,owner,path) DO UPDATE SET value=(app_values.value::bigint+1)::text;
 END IF;
 IF TG_TABLE_NAME='cars' THEN
   IF TG_OP='DELETE' THEN target_id=OLD.id; ELSE target_id=NEW.id; END IF;
 ELSIF TG_TABLE_NAME='claims' THEN
   IF TG_OP='DELETE' THEN target_id=OLD.car_id; ELSE target_id=NEW.car_id; END IF;
 END IF;
 INSERT INTO public.audit_log(id,role,action,car_id,timestamp)
 SELECT coalesce(max(id),0)+1,current_user,'sql:'||lower(TG_OP)||':'||TG_TABLE_NAME,target_id,clock_timestamp() FROM public.audit_log;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.stock_option_rename() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.id=NEW.option_group||':'||NEW.value;
 IF TG_OP='INSERT' THEN RETURN NEW; END IF;
 IF NEW.option_group<>OLD.option_group THEN RAISE EXCEPTION 'Option group cannot be changed'; END IF;
 IF current_setting('stock.app_write',true) IS DISTINCT FROM '1' AND NEW.value IS DISTINCT FROM OLD.value THEN
   IF NEW.option_group='models' THEN UPDATE public.cars SET model=NEW.value WHERE model=OLD.value;
   ELSIF NEW.option_group='colors' THEN UPDATE public.cars SET color=NEW.value WHERE color=OLD.value;
   ELSIF NEW.option_group='locations' THEN UPDATE public.cars SET location=NEW.value WHERE location=OLD.value;
   ELSIF NEW.option_group='banks' THEN UPDATE public.claims SET bank=NEW.value WHERE bank=OLD.value;
   END IF;
 END IF;
 RETURN NEW;
END $$;

-- TRUNCATE would bypass row auditing and cascade semantics; use DELETE instead.
CREATE OR REPLACE FUNCTION public.stock_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Use DELETE so history and related records are handled safely'; END $$;

DO $$ DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['cars','claims','app_options','role_credentials','request_receipts','audit_log','login_attempts','app_values'] LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS stock_write_lock ON public.%I',tbl);
   EXECUTE format('CREATE TRIGGER stock_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.stock_lock_write()',tbl);
   EXECUTE format('DROP TRIGGER IF EXISTS stock_no_truncate ON public.%I',tbl);
   EXECUTE format('CREATE TRIGGER stock_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.stock_no_truncate()',tbl);
   IF tbl NOT IN ('audit_log','login_attempts','request_receipts') THEN
     EXECUTE format('DROP TRIGGER IF EXISTS stock_manual_audit ON public.%I',tbl);
     EXECUTE format('CREATE TRIGGER stock_manual_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stock_audit_manual()',tbl);
   END IF;
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['cars','claims'] LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS stock_row_rules ON public.%I',tbl);
   EXECUTE format('CREATE TRIGGER stock_row_rules BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stock_row_rules()',tbl);
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS stock_option_rename ON public.app_options;
CREATE TRIGGER stock_option_rename BEFORE INSERT OR UPDATE ON public.app_options FOR EACH ROW EXECUTE FUNCTION public.stock_option_rename();
