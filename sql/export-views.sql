-- Live relational reporting views, with Thai Excel column headers.
CREATE OR REPLACE VIEW public.export_cars AS
SELECT
  id AS "รหัสรถ",
  vin AS "เลขตัวถัง",
  model AS "รุ่น",
  submodel AS "รุ่นย่อย",
  color AS "สี",
  location AS "สถานที่",
  CASE status
    WHEN 'Available' THEN 'พร้อมขาย' WHEN 'Reserved' THEN 'จองแล้ว'
    WHEN 'Delivered' THEN 'ส่งมอบแล้ว' WHEN 'Transferred' THEN 'โอนแล้ว'
    WHEN 'FloorPlan' THEN 'ฟลอร์แพลน' ELSE status END AS "สถานะ",
  stock_status AS "สถานะสต็อกฟลอร์แพลน",
  buy_price AS "ราคาทุน",
  sell_price AS "ราคาขาย",
  amount_financed AS "ยอดจัดไฟแนนซ์",
  receive_date AS "วันที่รับเข้า",
  payment_due_date AS "วันครบกำหนด",
  battery_number AS "เลขแบตเตอรี่",
  front_motor_number AS "เลขมอเตอร์หน้า",
  rear_motor_number AS "เลขมอเตอร์หลัง",
  engine_number AS "เลขเครื่องยนต์",
  manufacture_year AS "ปีผลิต",
  sales_code AS "รหัสฝ่ายขาย",
  customer_name AS "ลูกค้า",
  release_date AS "วันส่งมอบ",
  inspected AS "ตรวจแล้ว",
  transfer_date AS "วันโอน",
  transfer_to AS "ปลายทาง",
  claims_not_provided AS "ยังไม่ระบุเคลม",
  (SELECT count(*) FROM public.claims k WHERE k.car_id=c.id) AS "จำนวนรายการเคลม"
FROM public.cars AS c;

CREATE OR REPLACE VIEW public.export_claims AS
SELECT k.id AS "รหัสเคลม",
 CASE WHEN k.car_id IS NULL THEN 'เคลมอื่น ๆ' ELSE 'เคลมรถยนต์' END AS "ประเภท",
 k.car_id AS "รหัสรถ", c.vin AS "เลขตัวถัง", c.model AS "รุ่น",
 k.detail AS "รายละเอียด", k.amount AS "ยอดเคลม", k.date_received AS "วันรับเงิน",
 k.amount_received AS "ยอดรับแล้ว", k.bank AS "บัญชี", k.inspected AS "ตรวจแล้ว"
FROM public.claims k LEFT JOIN public.cars c ON c.id=k.car_id;

CREATE OR REPLACE VIEW public.export_audit AS
SELECT timestamp AT TIME ZONE 'Asia/Bangkok' AS "เวลาไทย",
 role AS "บทบาท", action AS "การกระทำ", car_id AS "รหัสรถ", request_id AS "รหัสคำขอ"
FROM public.audit_log;
