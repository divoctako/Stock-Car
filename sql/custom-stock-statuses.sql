-- Upgrade existing databases without changing or deleting any vehicle data.
ALTER TABLE public.cars
 DROP CONSTRAINT IF EXISTS cars_status_check,
 DROP CONSTRAINT IF EXISTS cars_stock_status_check,
 DROP CONSTRAINT IF EXISTS cars_status_valid,
 DROP CONSTRAINT IF EXISTS cars_stock_status_valid,
 ADD CONSTRAINT cars_status_valid CHECK(status IS NOT NULL AND btrim(status)<>'' AND length(status)<=80),
 ADD CONSTRAINT cars_stock_status_valid CHECK(stock_status IS NULL OR (btrim(stock_status)<>'' AND length(stock_status)<=80 AND stock_status NOT IN ('Delivered','Transferred','FloorPlan')));
