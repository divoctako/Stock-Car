import { parseCarCSV } from './car-import.js';
import { hashPassword,encryptPassword } from './passwords.js';
export class AppError extends Error {
  constructor(message, status = 400, code = 'VALIDATION') {
    super(message); this.status = status; this.code = code;
  }
}
const str = value => String(value ?? '').trim();
const requireValue = (value, message) => { if (!str(value)) throw new AppError(message); return str(value); };
function money(value, label = 'จำนวนเงิน') {
  if (value === '' || value == null) return 0;
  const n = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new AppError(label + 'ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  return n;
}
function date(value, required = false) {
  const s = str(value);
  if (!s && !required) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s)
    throw new AppError('กรุณาระบุวันที่ที่ถูกต้อง (YYYY-MM-DD)');
  return s;
}
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function initialState() {
  return {
    config: {
      models: ['Stock Atto 3', 'Stock Dolphin', 'Stock Seal', 'Stock Sealion 6', 'Stock Sealion 7', 'Stock M6', 'Stock Han', 'Stock Tang'],
      colors: ['ขาว', 'ดำ', 'เทา', 'เงิน', 'ฟ้า', 'น้ำเงิน', 'แดง', 'เขียว'],
      colorHex: { 'ขาว': '#eef0f2', 'ดำ': '#22262b', 'เทา': '#8b9099', 'เงิน': '#c3c8ce', 'ฟ้า': '#6db3e8', 'น้ำเงิน': '#213a8f', 'แดง': '#c0392b', 'เขียว': '#2e7d32' },
      locations: ['ไม่ระบุ Location'], banks: [], settings: { brandName: 'Stock' }
    },
    cars: [], otherClaims: [], nextCarId: 1, nextClaimId: 1
  };
}
export const readActions = new Set(['bootstrap', 'refresh']);
export const writeActions = new Set(['deleteCar','saveRolePassword','addFloorCar','updateFloorCar','promoteFloorCar','importCars', 'addCar', 'updateCar', 'transferCar', 'deliverCar', 'addVehicleClaim', 'saveClaims', 'markInspected', 'saveConfig']);
export function snapshot(state, message = '', role = 'admin') {
  let cars=state.cars,otherClaims=state.otherClaims,config=state.config;
  if(role==='sales') {
    cars=cars.filter(car=>['Available','Reserved'].includes(car.status)).map(({claims,salesCode,customerName,releaseDate,sellPrice,transferDate,transferTo,...car})=>({...car,claims:[]}));
    otherClaims=[];config={...config,banks:[]};
  }
  if(role==='claim') {
    const keys=['id','vin','model','submodel','color','location','status','claims','salesCode','customerName','releaseDate','sellPrice','inspected','claimsNotProvided'];
    cars=cars.filter(car=>car.status!=='FloorPlan').map(car=>Object.fromEntries(keys.filter(key=>car[key]!==undefined).map(key=>[key,car[key]])));
  }
  return { ok: true, version: '4.0-vercel-native', today: today(), accessCodeRequired: true,
    config, configRevision: state.configRevision || 0, cars, otherClaims,
    rolePasswordStatus:role==='admin'?Object.fromEntries(['admin','keeper','sales','claim'].map(role=>[role,!!state.roleCredentials?.[role]])):{}, message };
}
export function validateConfig(input, previous = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('ข้อมูลตั้งค่าไม่ถูกต้อง');
  const output = { ...previous };
  const titles = { models: 'รุ่นรถ', colors: 'สี', locations: 'สถานที่', banks: 'บัญชีธนาคาร' };
  for (const key of Object.keys(titles)) {
    const values = input[key];
    if (!Array.isArray(values) || values.length > 200 || (key !== 'banks' && !values.length))
      throw new AppError(`${titles[key]}ต้องมี ${key === 'banks' ? '0' : '1'}–200 รายการ`);
    const seen = new Set();
    output[key] = values.map(value => {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 240) throw new AppError(`${titles[key]}ต้องไม่ว่างและยาวไม่เกิน 240 ตัวอักษร`);
      const label = value.trim();
      const normalized = label.normalize('NFKC').toLocaleLowerCase();
      if (seen.has(normalized)) throw new AppError(`${titles[key]}มีรายการซ้ำ: ${label}`);
      seen.add(normalized); return label;
    });
  }
  output.colorHex = { ...(previous.colorHex || {}) };
  output.colors.forEach((name, index) => {
    const hex = input.colorHex?.[input.colors[index]];
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) throw new AppError('กรุณาเลือกค่าสีให้ครบทุกรายการ');
    Object.defineProperty(output.colorHex, name, { value: hex.toLowerCase(), enumerable: true, writable: true, configurable: true });
  });
  for (const [key, keys] of [['statusLabels', ['Available', 'Reserved', 'Delivered', 'Transferred']], ['claimPayLabels', ['some', 'none']]]) {
    if (input[key] !== undefined) {
      const entries = keys.map(name => [name, requireValue(input[key]?.[name], 'กรุณากรอกชื่อสถานะให้ครบ')]);
      if (entries.some(([, label]) => label.length > 80) || new Set(entries.map(([, label]) => label)).size !== keys.length) throw new AppError('ชื่อสถานะต้องไม่ซ้ำและยาวไม่เกิน 80 ตัวอักษร');
      output[key] = Object.fromEntries(entries);
    }
  }
  if (input.monthNames !== undefined) {
    if (!Array.isArray(input.monthNames) || input.monthNames.length !== 12 || input.monthNames.some(v => typeof v !== 'string' || !v.trim() || v.trim().length > 80)) throw new AppError('ชื่อเดือนต้องมีครบ 12 เดือน');
    output.monthNames = input.monthNames.map(v => v.trim());
    if (new Set(output.monthNames).size !== 12) throw new AppError('ชื่อเดือนต้องไม่ซ้ำ');
  }
  return output;
}
// Same-position replacement of removed values represents a rename. Reordering
// existing values or removing a choice does not rewrite historical records.
export function applyOptionRenames(state, previous, next) {
  for(const [group,field] of [['models','model'],['colors','color'],['locations','location'],['banks','bank']]) {
    const old=previous[group]||[], values=next[group]||[];
    if(old.length!==values.length)continue;
    old.forEach((value,index)=>{
      const renamed=values[index];
      if(value===renamed||values.includes(value)||old.includes(renamed))return;
      if(group==='banks') {
        for(const claim of state.otherClaims)if(claim.bank===value){claim.bank=renamed;claim.inspected=false;}
        for(const car of state.cars)for(const claim of car.claims||[])if(claim.bank===value){claim.bank=renamed;car.inspected=false;}
      } else for(const car of state.cars)if(car[field]===value)car[field]=renamed;
    });
  }
}
function stockCar(car) {
  if (!['Available', 'Reserved'].includes(car.status)) throw new AppError('รถคันนี้ส่งมอบหรือตัดขายแล้ว กรุณารีเฟรชข้อมูล', 409, 'CONFLICT');
}
function carFields(p, state, id, partial = false) {
  const vin = partial ? str(p.vin) : requireValue(p.vin, 'กรุณากรอก VIN no.');
  if (vin && state.cars.some(c => c.id !== id && c.vin.toUpperCase() === vin.toUpperCase())) throw new AppError('VIN นี้มีอยู่ในระบบแล้ว', 409, 'CONFLICT');
  const previous = state.cars.find(car => car.id === id) || {};
  const value = key => p[key] === undefined ? previous[key] : p[key];
  const identifier = (key, label) => {
    const text = str(value(key));
    if (text.length > 120) throw new AppError(`${label}ต้องยาวไม่เกิน 120 ตัวอักษร`);
    return text;
  };
  const manufactureYear = str(value('manufactureYear'));
  if (manufactureYear && (!/^\d{4}$/.test(manufactureYear) || !((Number(manufactureYear) >= 1900 && Number(manufactureYear) <= 2199) || (Number(manufactureYear) >= 2443 && Number(manufactureYear) <= 2742))))
    throw new AppError('กรุณากรอกปีผลิต 4 หลัก เป็น ค.ศ. หรือ พ.ศ.');
  return { vin, submodel: partial ? str(p.submodel) : requireValue(p.submodel, 'กรุณากรอกรุ่นย่อย'), model: str(p.model), color: str(p.color),
    location: str(p.location), buyPrice: partial && (p.buyPrice == null || p.buyPrice === '') ? null : money(p.buyPrice, 'ราคาซื้อ'), receiveDate: date(p.receiveDate) || (partial ? '' : today()),
    paymentDueDate: date(value('paymentDueDate')), batteryNumber: identifier('batteryNumber', 'Battery number/code'),
    frontMotorNumber: identifier('frontMotorNumber', 'เลขมอเตอร์/เลขเครื่อง'), manufactureYear,
    ...(partial ? {status:'FloorPlan',stockStatus:p.status === 'Reserved' ? 'Reserved' : 'Available'} : {status:p.status === 'Reserved' ? 'Reserved' : 'Available'}) };
}
export function previewCarImport(state, body) {
  if (!['admin','keeper'].includes(body.role)) throw new AppError('สิทธิ์นี้ไม่สามารถนำเข้ารถได้',403,'FORBIDDEN');
  let records;
  try { records=parseCarCSV(body.payload?.csv); } catch(error) { throw new AppError(error.message); }
  const seen=new Set();
  const floor=body.payload?.target === 'floor';
  const rows=records.map(({line,payload:p})=>{
    const errors=[];
    const vin=str(p.vin).toUpperCase();
    if(seen.has(vin))errors.push('VIN ซ้ำในไฟล์');
    if(vin)seen.add(vin);
    for(const [key,label] of [['model','รุ่นรถ'],['color','สี'],['location','สถานที่']]) {
      const choices=state.config[{model:'models',color:'colors',location:'locations'}[key]] || [];
      if((!floor || p[key]) && (!p[key] || !choices.includes(p[key])))errors.push(`${label}ต้องตรงกับตัวเลือกในหน้าตั้งค่า`);
    }
    if(!floor && !p.receiveDate)errors.push('กรุณาระบุวันที่รับเข้า');
    const statuses={'':'Available',Available:'Available',Reserved:'Reserved','พร้อมขาย':'Available','จอง':'Reserved'};
    if(!Object.prototype.hasOwnProperty.call(statuses,p.status || ''))errors.push('สถานะต้องเป็น Available / Reserved / พร้อมขาย / จอง');
    if(Object.values(p).some(value=>value.length>240))errors.push('ข้อมูลแต่ละช่องต้องไม่เกิน 240 ตัวอักษร');
    let payload={...p,vin,status:statuses[p.status || '']};
    try {
      payload=carFields(payload,state,undefined,floor);
      if(!p.buyPrice)payload.buyPrice=null;
    } catch(error) { errors.push(error.message); }
    return {line,payload,errors};
  });
  return {ok:true,rows,total:rows.length,valid:rows.filter(row=>!row.errors.length).length,invalid:rows.filter(row=>row.errors.length).length};
}
function claimsArray(value) {
  if (!Array.isArray(value) || value.length > 500) throw new AppError('รายการเคลมไม่ถูกต้องหรือเกิน 500 รายการ');
  if (value.some(c => !c || typeof c !== 'object' || Array.isArray(c))) throw new AppError('ข้อมูลรายการเคลมไม่ถูกต้อง');
  return value;
}
function newClaim(input, state) {
  const detail = requireValue(input.detail, 'กรุณากรอกรายละเอียดเคลม');
  const amount = money(input.amount);
  if (amount <= 0) throw new AppError('ยอดเคลมต้องมากกว่า 0');
  return { id: state.nextClaimId++, detail, amount, dateReceived: '', amountReceived: '', bank: '' };
}
// The caller runs this operation inside a PostgreSQL transaction holding the state row lock.
export function mutate(state, body) {
  if(body._session)authorizeRole(state,body._session,body);
  const { action } = body;
  const p = body.payload || {};
  if (typeof p !== 'object' || Array.isArray(p)) throw new AppError('ข้อมูลแบบฟอร์มไม่ถูกต้อง');
  if(action==='deleteCar') {
    if((body._session?.role||body.role)!=='admin')throw new AppError('เฉพาะ Admin สามารถลบรถได้',403,'FORBIDDEN');
    if(!Number.isSafeInteger(body.carId)||body.carId<=0)throw new AppError('รหัสรถไม่ถูกต้อง');
    const index=state.cars.findIndex(car=>car.id===body.carId);
    if(index<0)throw new AppError('ไม่พบข้อมูลรถคันนี้ กรุณาโหลดข้อมูลล่าสุด',404,'NOT_FOUND');
    const [car]=state.cars.splice(index,1);
    return {message:'ลบรถและรายการเคลมที่เกี่ยวข้องแล้ว',carId:car.id,audit:{vin:car.vin||'',model:car.model||'',status:car.status,deletedClaims:(car.claims||[]).length}};
  }
  if(action === 'saveRolePassword') {
    if(body.role !== 'admin')throw new AppError('เฉพาะ Admin สามารถตั้งรหัสผ่านได้',403,'FORBIDDEN');
    if(!['admin','keeper','sales','claim'].includes(p.targetRole))throw new AppError('ตำแหน่งไม่ถูกต้อง');
    if(typeof p.password !== 'string' || p.password.length<8 || p.password.length>128)throw new AppError('รหัสผ่านต้องยาว 8–128 ตัวอักษร');
    state.roleCredentials ||= {};
    state.roleCredentials[p.targetRole]={...hashPassword(p.password),encryptedPassword:encryptPassword(p.password,p.targetRole),version:(state.roleCredentials[p.targetRole]?.version || 0)+1};
    return {message:'บันทึกรหัสผ่านแล้ว ผู้ใช้ตำแหน่งนี้ต้องเข้าสู่ระบบใหม่',carId:0};
  }
  if(['addFloorCar','updateFloorCar','promoteFloorCar'].includes(action)) {
    if(!['admin','keeper'].includes(body.role))throw new AppError('ไม่มีสิทธิ์จัดการ Floor Plan',403,'FORBIDDEN');
    const existing=action==='addFloorCar' ? null : state.cars.find(c=>c.id===Number(body.carId) && c.status==='FloorPlan');
    if(action!=='addFloorCar' && !existing)throw new AppError('ไม่พบรถใน Floor Plan',409,'CONFLICT');
    if(action==='promoteFloorCar') {
      const labels={vin:'VIN',model:'รุ่นรถ',submodel:'รุ่นย่อย',color:'สี',location:'สถานที่',buyPrice:'ราคาซื้อ',receiveDate:'วันที่รับเข้า',paymentDueDate:'วันครบจ่ายเงิน',batteryNumber:'Battery number/code',frontMotorNumber:'เลขมอเตอร์/เลขเครื่อง',manufactureYear:'ปีผลิต'};
      const missing=Object.keys(labels).filter(key=>existing[key] == null || str(existing[key])==='');
      if(missing.length)throw new AppError('กรุณากรอกข้อมูลให้ครบก่อนเข้าสต๊อก: '+missing.map(key=>labels[key]).join(', '));
      for(const [key,list] of [['model','models'],['color','colors'],['location','locations']])if(!state.config[list].includes(existing[key]))throw new AppError('รุ่น สี และสถานที่ต้องตรงกับหน้าตั้งค่า');
      Object.assign(existing,carFields({...existing,status:existing.stockStatus},state,existing.id));
      delete existing.stockStatus;
      return {message:'ย้ายรถจาก Floor Plan เข้าสต๊อกแล้ว',carId:existing.id};
    }
    const fields=carFields(p,state,existing?.id,true);
    if(Object.values(fields).some(value=>typeof value==='string' && value.length>240))throw new AppError('ข้อมูลแต่ละช่องต้องไม่เกิน 240 ตัวอักษร');
    if(existing)Object.assign(existing,fields);
    else state.cars.push({id:state.nextCarId++,...fields,claims:[],inspected:false,salesCode:'',customerName:'',releaseDate:'',sellPrice:0,transferDate:'',transferTo:''});
    return {message:existing?'บันทึกรถใน Floor Plan แล้ว':'เพิ่มรถใน Floor Plan แล้ว',carId:existing?.id || state.nextCarId-1};
  }
  if (action === 'importCars') {
    const preview=previewCarImport(state,body);
    if(preview.invalid) {
      const row=preview.rows.find(item=>item.errors.length);
      throw new AppError(`ยังไม่นำเข้าข้อมูล: แถว ${row.line} ${row.errors.join(' · ')} (พบ ${preview.invalid} แถวที่ต้องแก้ไข)`,409,'IMPORT_INVALID');
    }
    const cars=preview.rows.map((row,index)=>({id:state.nextCarId+index,...row.payload,salesCode:'',customerName:'',releaseDate:'',sellPrice:0,inspected:false,transferDate:'',transferTo:'',claims:[]}));
    state.cars.push(...cars);state.nextCarId+=cars.length;
    return {message:`นำเข้ารถ ${cars.length} คันเรียบร้อยแล้ว`,carId:0};
  }
  if (action === 'saveConfig') {
    if (!['admin','keeper','claim'].includes(body.role)) throw new AppError('ไม่มีสิทธิ์แก้ไขการตั้งค่า', 403, 'FORBIDDEN');
    if (!Number.isSafeInteger(p.expectedRevision) || p.expectedRevision !== (state.configRevision || 0))
      throw new AppError('ค่าตั้งถูกแก้ไขแล้ว กรุณาโหลดค่าล่าสุดก่อนบันทึกอีกครั้ง', 409, 'CONFIG_CONFLICT');
    const patch=p.config;
    if(!patch || typeof patch!=='object' || Array.isArray(patch))throw new AppError('ข้อมูลตั้งค่าไม่ถูกต้อง');
    if(body.role!=='admin') {
      const keys=body.role==='keeper'?['models','colors','colorHex','locations','statusLabels']:['banks'];
      if(Object.keys(patch).some(key=>!keys.includes(key)))throw new AppError('ไม่สามารถแก้ไขค่าตั้งนอกสิทธิ์ของตำแหน่งนี้',403,'FORBIDDEN');
    }
    const config = validateConfig(body.role==='admin'?patch:{...state.config,...patch}, state.config);
    applyOptionRenames(state,state.config,config);
    state.config = config;
    state.configRevision = (state.configRevision || 0) + 1;
    return { message: 'บันทึกตัวเลือก Dropdown ทั้งหมดแล้ว', carId: 0 };
  }
  let car;
  if (action === 'addVehicleClaim') {
    const ids = body.carIds ?? [body.carId];
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length)
      throw new AppError('กรุณาเลือกรถ 1–500 คัน โดยไม่ซ้ำกัน');
    const cars = ids.map(id => {
      const found = state.cars.find(item => item.id === id);
      if (!found) throw new AppError('ไม่พบข้อมูลรถที่เลือก กรุณาโหลดข้อมูลล่าสุด', 404, 'NOT_FOUND');
      if(found.status==='FloorPlan')throw new AppError('กรุณานำรถจาก Floor Plan เข้าสต๊อกก่อนเพิ่มงานเคลม');
      return found;
    });
    const template = newClaim(p, { nextClaimId:0 });
    for (const item of cars) {
      if (!item.claims) item.claims = [];
      item.claims.push({ ...template, id:state.nextClaimId++ });
      item.inspected = false;
    }
    return { message:`เพิ่มงานเคลมให้รถ ${cars.length} คันแล้ว`, carId:cars.length === 1 ? cars[0].id : 0 };
  }
  if (action !== 'addCar' && !(['saveClaims', 'markInspected'].includes(action) && body.carId === 0)) {
    car = state.cars.find(c => c.id === Number(body.carId));
    if (!car) throw new AppError('ไม่พบข้อมูลรถคันนี้', 404, 'NOT_FOUND');
  }
  let message;
  switch (action) {
    case 'addCar': {
      const fields = carFields(p, state);
      car = { id: state.nextCarId++, ...fields, salesCode: '', customerName: '', releaseDate: '', sellPrice: 0,
        inspected: false, transferDate: '', transferTo: '', claims: [] };
      state.cars.push(car); message = 'เพิ่มรถใหม่เข้าสต๊อกแล้ว'; break;
    }
    case 'updateCar':
      stockCar(car); Object.assign(car, carFields(p, state, car.id)); message = 'บันทึกการแก้ไขข้อมูลรถแล้ว'; break;
    case 'transferCar':
      stockCar(car); Object.assign(car, { status: 'Transferred', transferDate: date(p.transferDate, true), transferTo: str(p.transferTo) || 'ไม่ระบุ' });
      message = 'ตัดขายรถและย้ายไปประวัติการตัดโอนแล้ว'; break;
    case 'deliverCar': {
      stockCar(car);
      const fields = { salesCode: requireValue(p.salesCode, 'กรุณากรอกรหัสขาย'), customerName: requireValue(p.customerName, 'กรุณากรอกชื่อลูกค้า'),
        releaseDate: date(p.releaseDate, true), sellPrice: money(p.sellPrice, 'ราคาขาย') };
      if (!fields.sellPrice) throw new AppError('กรุณากรอกราคาขาย');
      const claims = [...(car.claims || []), ...claimsArray(p.claims || []).filter(c => str(c.detail) || money(c.amount) > 0).map(c => newClaim(c, state))];
      Object.assign(car, fields, { status: 'Delivered', inspected: false, claims });
      message = 'ส่งมอบรถและย้ายไปแท็บเคลมเงินแล้ว'; break;
    }
    case 'saveClaims': {
      const list = car ? car.claims : state.otherClaims;
      const seen = new Set();
      for (const input of claimsArray(body.claims)) {
        if (!input.id && !str(input.detail) && !money(input.amount)) continue;
        let claim;
        if (input.id) {
          const id = Number(input.id);
          claim = list.find(c => c.id === id);
          if (!claim || seen.has(id)) throw new AppError('รหัสเคลมไม่ถูกต้อง ซ้ำ หรือเป็นของรถคันอื่น');
          seen.add(id);
        } else { claim = newClaim(input, state); list.push(claim); }
        const updated = { detail: requireValue(input.detail, 'กรุณากรอกรายละเอียดเคลม'), dateReceived: date(input.dateReceived),
          amountReceived: input.amountReceived === '' || input.amountReceived == null ? '' : money(input.amountReceived), bank: str(input.bank) };
        if (!car && Object.keys(updated).some(key => updated[key] !== claim[key])) claim.inspected = false;
        Object.assign(claim, updated);
      }
      if (car) car.inspected = false;
      message = 'บันทึกยอดเงินเข้าแล้ว'; break;
    }
    case 'markInspected':
      if (!car) {
        const claim = state.otherClaims.find(c => c.id === Number(body.claimId));
        if (!claim) throw new AppError('ไม่พบรายการเคลมนี้', 404, 'NOT_FOUND');
        if (!claim.dateReceived || !(Number(claim.amountReceived) > 0)) throw new AppError('ต้องรับเงินเคลมก่อนตรวจงาน');
        claim.inspected = true;
        message = 'ตรวจแล้ว — ย้ายไปแท็บเคลมเงินแล้ว'; break;
      }
      if (!car.claims.length || !car.claims.every(c => c.dateReceived && Number(c.amountReceived) > 0))
        throw new AppError('ต้องรับเงินเคลมครบทุกรายการก่อนตรวจงาน');
      car.inspected = true; message = 'ตรวจแล้ว — ย้ายไปแท็บเคลมเงินแล้ว'; break;
    default: throw new AppError('ไม่รู้จักคำสั่ง', 400, 'UNKNOWN_ACTION');
  }
  return { message, carId: car?.id || 0 };
}

export function authorizeRole(state,session,body) {
  const role=session?.role;
  if(!['admin','keeper','sales','claim'].includes(role) || session.version !== (state.roleCredentials?.[role]?.version || 0))throw new AppError('รหัสผ่านถูกเปลี่ยน กรุณาเข้าสู่ระบบใหม่',401,'NEED_CODE');
  if(role!=='admin' && body.role && body.role!==role)throw new AppError('ไม่สามารถเปลี่ยนตำแหน่งผู้ใช้ได้',403,'FORBIDDEN');
  const action=body.action;
  if(readActions.has(action))return;
  if(action==='deleteCar' && role!=='admin')throw new AppError('เฉพาะ Admin สามารถลบรถได้',403,'FORBIDDEN');
  if(['revealRolePassword','saveRolePassword'].includes(action) && role!=='admin')throw new AppError('เฉพาะ Admin เท่านั้น',403,'FORBIDDEN');
  if(action==='saveConfig' && !['admin','keeper','claim'].includes(role))throw new AppError('ไม่มีสิทธิ์แก้ไขการตั้งค่า',403,'FORBIDDEN');
  const stock=['addFloorCar','updateFloorCar','promoteFloorCar','addCar','updateCar','importCars','previewImportCars','transferCar','deliverCar'];
  if(stock.includes(action) && !['admin','keeper'].includes(role))throw new AppError('ไม่มีสิทธิ์จัดการรถ',403,'FORBIDDEN');
  if(['saveClaims','addVehicleClaim','markInspected'].includes(action) && !['admin','claim'].includes(role))throw new AppError('ไม่มีสิทธิ์จัดการเงินเคลม',403,'FORBIDDEN');
}
