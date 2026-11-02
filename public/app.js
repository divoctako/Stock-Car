
/* ============================================================
   ระบบจัดการสต๊อกรถยนต์ + เคลมเงิน — Frontend
   สื่อสารกับ Node.js API บน Vercel
   ============================================================ */
(function () {
'use strict';

var API_URL = '/api/stock';

// ------------------------------------------------------------
// ค่าคงที่
// ------------------------------------------------------------
var ROLES = {
  admin:  { key:'admin',  label:'Admin',        user:'ผู้ดูแลระบบ',  hint:'สิทธิ์เต็ม: จัดการสต๊อก, ตัดขาย, ส่งมอบ และเงินเคลมได้ทั้งหมด' },
  keeper: { key:'keeper', label:'Stock', user:'ผู้ดูแลสต๊อก', hint:'จัดการ Floor Plan สต๊อกรถ และค่าตั้งเกี่ยวกับรถ • งานเคลมดูอย่างเดียว' },
  sales:  { key:'sales',  label:'Sale', user:'ฝ่ายขาย', hint:'ดูได้เฉพาะ Dashboard สต๊อกและสต๊อกรถ • แก้ไขไม่ได้' },
  claim:  { key:'claim', label:'Claim', user:'ผู้ดูแลเงินเคลม', hint:'จัดการงานเคลมเงิน ตรวจงาน เคลมเงินแล้ว และตั้งค่าบัญชีธนาคาร' }
};
var TH_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
var STATUS_META = {
  Available:   ['พร้อมขาย',  'c-green'],
  Reserved:    ['จอง',       'c-amber'],
  Delivered:   ['ส่งมอบแล้ว','c-blue'],
  Transferred: ['ตัดขายแล้ว','c-gray']
};
// ช่วงอายุสต๊อก (วัน) นับจากวันที่รับรถเข้า
var AGE_BUCKETS = [
  { key:'a',  label:'0-30 วัน',      min:0,  max:30,       cls:'c-green', hex:'var(--chart-green)' },
  { key:'b',  label:'31-60 วัน',     min:31, max:60,       cls:'c-blue',  hex:'var(--chart-emerald)' },
  { key:'c',  label:'61-90 วัน',     min:61, max:90,       cls:'c-amber', hex:'var(--chart-amber)' },
  { key:'d',  label:'3–6 เดือน',     min:91, max:180,      cls:'c-amber', hex:'var(--chart-amber)' },
  { key:'e',  label:'6–9 เดือน',     min:181,max:270,      cls:'c-red',   hex:'var(--chart-red)' },
  { key:'f',  label:'9–12 เดือน',    min:271,max:365,      cls:'c-red',   hex:'var(--chart-red)' },
  { key:'g',  label:'เกิน 12 เดือน', min:366,max:Infinity, cls:'c-red',   hex:'var(--chart-red)' }
];
var MODAL_META = {
  'delete-car':['ลบรถออกจากระบบ','เฉพาะ Admin · ลบรถพร้อมรายการเคลมที่เกี่ยวข้อง','ยืนยันลบรถ','560px'],
  'current-password':['รหัสผ่านปัจจุบัน','เฉพาะ Admin เท่านั้น','','520px'],
  'promote-floor':['นำรถเข้า Stock','ตรวจข้อมูลครบก่อนย้ายจาก Floor Plan','ยืนยันนำเข้า Stock','720px'],
  'role-password':['ตั้งรหัสผ่านตำแหน่ง','กำหนดรหัสผ่านใหม่สำหรับการเข้าสู่ระบบ','บันทึกรหัสผ่าน','520px'],
  'import-cars':['นำเข้ารถจาก CSV','ตรวจข้อมูลก่อนเพิ่มรถใหม่เข้าสต๊อก','ยืนยันนำเข้า','1040px'],
  'dashboard-group':['รายการรถจากกราฟ','เลือกรถเพื่อดูรายละเอียดและจัดการ','','900px'],
  'dashboard-car':['รายละเอียดรถ','ข้อมูลรถจากสต๊อก','','780px'],
  'select-claim-car': ['เพิ่มงานเคลมเกี่ยวกับรถ','ขั้นตอน 1 จาก 2 · ค้นหาและเลือกรถได้หลายคัน','ถัดไป','780px'],
  'add-vehicle-claim': ['รายละเอียดงานเคลม','ขั้นตอน 2 จาก 2 · กรอกครั้งเดียว ใช้กับรถทุกคันที่เลือก','บันทึกงานเคลม','780px'],
  add:      ['เพิ่มรถใหม่เข้าสต๊อก','กรอกข้อมูลรถยนต์พื้นฐาน','บันทึกเข้าสต๊อก','680px'],
  edit:     ['แก้ไขรายละเอียดรถ','ปรับปรุงข้อมูลรถยนต์ในสต๊อก','บันทึกการแก้ไข','680px'],
  deliver:  ['ส่งมอบรถให้ลูกค้า','บันทึกการปล่อยรถและตั้งรายการเงินเคลม','ยืนยันส่งมอบ','620px'],
  transfer: ['ตัดขายให้ที่อื่น','โอนรถออกจากสต๊อกไปยังดีลเลอร์/สาขาอื่น','ยืนยันตัดขาย','520px'],
  claim:    ['บันทึกยอดเงินเคลมเข้าบัญชี','ระบุยอดเงินก้อนที่เข้ามาในแต่ละรอบ พร้อมบัญชีธนาคาร','บันทึกเงินเข้า','660px'],
  other:    ['รายการเคลมอื่น (ไม่เกี่ยวกับรถยนต์)','เงินเคลมที่ไม่ได้ผูกกับรถคันใดคันหนึ่ง เช่น ค่าการตลาด ค่าอบรม ป้ายโฆษณา','บันทึกรายการ','660px']
};

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
var S = {
  ready: false,
  bootError: '',
  busy: false,
  authed: null,          // null = ยังไม่รู้ / false = ต้องล็อกอิน / true = เข้าสู่ระบบแล้ว
  loginBusy: false,
  loginError: '',
  brandHint: 'Stock',
  accessCode: '',
  codeRequired: false,
  role: 'admin',
  sessionRole:'admin',loginRole:'admin',rolePasswordStatus:{},floorQuery:'',
  tab: 'dashboard-stock',
  sidebarOpen:false, latestQuery:'',
  stockScrollLeft:0,
  updatedAt:null,
  modal: null,          // { type, carId }
  form: {},
  toast: null,          // { msg, err }
  cars: [],
  otherClaims: [],      // รายการเคลมที่ไม่ผูกกับรถ (carId = 0 ในชีต Claims)
  config: { models:[], colors:[], colorHex:{}, locations:[], banks:[], settings:{} },
  configRevision: 0,
  settingsDraft: null, settingsColors: [], settingsRevision: 0, settingsDirty: false,
  stockQuery:'', stockStatusFilter:'', stockLocationFilter:'', stockModelFilter:'',
  stockSubmodelFilter:'', stockColorFilter:'', stockYearFilter:'',
  dashboardFilters:{query:'',model:'',submodel:'',color:'',location:'',status:'',year:'',age:'',due:'',dueFrom:'',dueTo:''},
  dashboardFiltersOpen:false,
  dashboardDrill:null,
  inspectQuery:'',
  claimScopes: { claims:'vehicle', inspect:'vehicle', claimsdone:'vehicle' },
  claimQuery:'', claimPayFilter:'', claimMonthFilter:'', claimYearFilter:'',
  claimsDoneQuery:'', claimsDoneMonthFilter:'', claimsDoneYearFilter:'',
  transferQuery:'', transferModelFilter:''
};
var _toastTimer = null;

// ------------------------------------------------------------
// Utils
// ------------------------------------------------------------
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fmt(n) { var v = Number(n) || 0; return v.toLocaleString('en-US'); }
function today() {
  var d = new Date(), m = d.getMonth()+1, dd = d.getDate();
  return d.getFullYear() + '-' + (m<10?'0':'') + m + '-' + (dd<10?'0':'') + dd;
}
function colorHex(name) { return S.config.colorHex[name] || '#c3c8ce'; }
function statusLabel(key) { return (S.config.statusLabels || {})[key] || (STATUS_META[key] || ['—'])[0]; }
function statusMeta(key) { return [statusLabel(key), (STATUS_META[key] || ['', 'c-gray'])[1]]; }
function payLabel(key) { return (S.config.claimPayLabels || {})[key] || (key === 'some' ? 'รับบางส่วนแล้ว' : 'ยังไม่ได้รับเลย'); }
// จำนวนวันนับจากวันที่รับรถเข้าถึงวันนี้ (null = ไม่มีวันที่รับ)
function daysSince(dateStr) {
  if (!dateStr) return null;
  var p = String(dateStr).slice(0, 10).split('-');
  if (p.length !== 3) return null;
  var y = Number(p[0]), m = Number(p[1]), dd = Number(p[2]);
  if (!y || !m || !dd) return null;
  var n = new Date();
  var diff = Math.floor((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(y, m-1, dd)) / 86400000);
  return diff < 0 ? 0 : diff;
}
function ageBucket(age) {
  for (var i = 0; i < AGE_BUCKETS.length; i++) {
    if (age >= AGE_BUCKETS[i].min && age <= AGE_BUCKETS[i].max) return AGE_BUCKETS[i];
  }
  return AGE_BUCKETS[AGE_BUCKETS.length - 1];
}
function ageTag(age) {
  if (age === null || age === undefined) return '<span class="pill-sm c-gray">ไม่ระบุ</span>';
  return '<span class="pill-sm wide ' + ageBucket(age).cls + '">' + age + ' วัน</span>';
}
function isRecv(ci) { return !!(ci && ci.dateReceived && Number(ci.amountReceived) > 0); }
function isFull(c) {
  var cl = c.claims || [];
  if (!cl.length) return false;
  for (var i=0;i<cl.length;i++) if (!isRecv(cl[i])) return false;
  return true;
}
function can() {
  return { deleteCars: S.role === 'admin' && S.sessionRole === 'admin', stock: S.role === 'admin' || S.role === 'keeper',
           claims: S.role === 'admin' || S.role === 'claim' };
}
function deleteCarButton(car) {
  return can().deleteCars ? '<button class="btn-sm delete-car-btn" data-act="open-delete-car" data-id="'+car.id+'">ลบรถ</button>' : '';
}
function allowedTabs(role){
  if(role==='sales')return ['dashboard-stock','stock'];
  if(role==='claim')return ['dashboard-claims','claims','inspect','claimsdone','settings'];
  return ['dashboard-stock','floor','stock','dashboard-claims','claims','inspect','claimsdone','transfers','settings'];
}
function defaultTab(role){return role==='claim'?'claims':'dashboard-stock';}
function carById(id) {
  for (var i=0;i<S.cars.length;i++) if (S.cars[i].id === Number(id)) return S.cars[i];
  return null;
}
function readRole() {
  try { var r = window.localStorage.getItem('csm_role'); if (ROLES[r]) return r; } catch (e) {}
  return 'admin';
}
function saveRole(r) { try { window.localStorage.setItem('csm_role', r); } catch (e) {} }

function toast(msg, isErr) {
  S.toast = { msg: msg, err: !!isErr };
  renderToast();
  if (isErr && S.modal) {
    var feedback = document.getElementById('modal-feedback');
    if (feedback) feedback.textContent = msg;
  }
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { S.toast = null; renderToast(); }, isErr ? 4200 : 2600);
}

// ------------------------------------------------------------
// Render root
// ------------------------------------------------------------
var _rendering = false;
var _stockScrollObserver = null;
var _returnFocus = '', _restoreFocus = false, _modalType = '';

function render() {
  // กัน render ซ้อน: การเปลี่ยน innerHTML จะทำให้เกิด blur/change ย้อนกลับเข้ามา
  if (_rendering) return;
  _rendering = true;

  var ae = document.activeElement;
  var oldContent = document.querySelector('main.content');
  var scrollTop = S.renderedTab === S.tab && oldContent ? oldContent.scrollTop : 0;
  var key = (ae && ae.getAttribute) ? ae.getAttribute('data-k') : null;
  var ss = null, se = null;
  try { ss = ae.selectionStart; se = ae.selectionEnd; } catch (e) {}

  try {
    if (ae && ae.blur && ae !== document.body) ae.blur();
    document.getElementById('root').innerHTML = viewApp();
    document.getElementById('overlay-root').innerHTML = viewModal();
  } finally {
    _rendering = false;
  }
  renderBusy();
  setupStockScroll();
  var newContent = document.querySelector('main.content');
  if (newContent) newContent.scrollTop = scrollTop;
  S.renderedTab = S.tab;

  if (key) {
    var el = document.querySelector('[data-k="' + key + '"]');
    if (el) {
      el.focus();
      try { if (ss !== null && ss !== undefined) el.setSelectionRange(ss, se); } catch (e) {}
    }
  }

  // หน้าเข้าสู่ระบบ: โฟกัสช่องรหัสผ่านให้อัตโนมัติ
  if (S.authed === false && !S.loginBusy) {
    var pin = document.getElementById('pinInput');
    if (pin && document.activeElement !== pin) pin.focus();
  }
  if (_restoreFocus) {
    var opener = document.querySelector(_returnFocus || '[data-act="toggle-sidebar"]');
    if (opener) opener.focus();
    _restoreFocus = false;
  } else if (S.modal && _modalType !== S.modal.type) {
    var firstField = document.querySelector('#overlay-root input, #overlay-root select') || document.querySelector('#overlay-root button');
    if (firstField) firstField.focus();
  }
  _modalType = S.modal ? S.modal.type : '';
}
function renderToast() {
  var t = S.toast;
  document.getElementById('toast-root').innerHTML = t
    ? '<div class="toast' + (t.err ? ' err' : '') + '">' + esc(t.msg) + '</div>' : '';
}
function renderBusy() {
  document.getElementById('busy-root').innerHTML = S.busy
    ? '<div class="busy"><div class="spinner"></div></div>' : '';
}

// ------------------------------------------------------------
// Derived data
// ------------------------------------------------------------
function dashboardMatches(car) {
  var f = S.dashboardFilters, query = f.query.trim().toLowerCase();
  if (query && String(car.vin || '').toLowerCase().indexOf(query) < 0) return false;
  if (['model','submodel','color','location','status'].some(function (key) { return f[key] && car[key] !== f[key]; })) return false;
  if (f.year && String(car.manufactureYear || '') !== f.year) return false;
  if (f.age) {
    var age = daysSince(car.receiveDate), bucket = AGE_BUCKETS.find(function (b) { return b.key === f.age; });
    if (age === null || !bucket || age < bucket.min || age > bucket.max) return false;
  }
  var due = String(car.paymentDueDate || '').slice(0,10), now = today();
  if (f.due === 'missing' && due) return false;
  if (f.due === 'overdue' && (!due || due >= now)) return false;
  if (f.due === 'today' && due !== now) return false;
  if (f.due === 'week') {
    var end = new Date(now + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate()+7);
    if (!due || due < now || due > end.toISOString().slice(0,10)) return false;
  }
  if (f.due === 'range' && ((f.dueFrom && (!due || due < f.dueFrom)) || (f.dueTo && (!due || due > f.dueTo)))) return false;
  return true;
}
function dashboardCars() {
  return S.cars.filter(function (car) { return (car.status === 'Available' || car.status === 'Reserved') && dashboardMatches(car); });
}
function dashboardDrillCars() {
  var group = S.dashboardDrill;
  return dashboardCars().filter(function (car) {
    if (!group) return true;
    if (group.age) {
      var age = daysSince(car.receiveDate);
      return age !== null && ageBucket(age).key === group.age;
    }
    return (!group.model || (car.model || 'ไม่ระบุรุ่น') === group.model)
      && (!group.submodel || (car.submodel || 'ไม่ระบุรุ่นย่อย') === group.submodel)
      && (!group.color || (car.color || 'ไม่ระบุสี') === group.color);
  });
}
function derive() {
  var q = function (s) { return (s || '').trim().toLowerCase(); };
  var match = function (c, s) { return [c.vin, c.model, c.submodel, c.batteryNumber, c.frontMotorNumber, c.manufactureYear].join(' ').toLowerCase().indexOf(s) >= 0; };

  var stockAll = S.cars.filter(function (c) { return c.status === 'Available' || c.status === 'Reserved'; });
  var dashboardStock = dashboardCars();
  var sq = q(S.stockQuery);
  var stockCars = stockAll.filter(function (c) {
    return (!sq || match(c, sq) || [c.color,c.location,c.status,statusLabel(c.status)].join(' ').toLowerCase().indexOf(sq) >= 0)
      && (!S.stockStatusFilter   || c.status === S.stockStatusFilter)
      && (!S.stockLocationFilter || c.location === S.stockLocationFilter)
      && (!S.stockModelFilter    || c.model === S.stockModelFilter)
      && (!S.stockSubmodelFilter || c.submodel === S.stockSubmodelFilter)
      && (!S.stockColorFilter || c.color === S.stockColorFilter)
      && (!S.stockYearFilter || String(c.manufactureYear || '') === S.stockYearFilter);
  });
  var stockFiltered = !!(sq || S.stockStatusFilter || S.stockLocationFilter || S.stockModelFilter || S.stockSubmodelFilter || S.stockColorFilter || S.stockYearFilter);
  var stockSubmodels = Array.from(new Set(stockAll.filter(function (car) { return !S.stockModelFilter || car.model === S.stockModelFilter; }).map(function (car) { return car.submodel; }).filter(Boolean))).sort(function (a,b) { return a.localeCompare(b,'th'); });
  var stockYears = Array.from(new Set(stockAll.map(function (car) { return String(car.manufactureYear || ''); }).filter(Boolean))).sort().reverse();

  var transferAll = S.cars.filter(function (c) { return c.status === 'Transferred'; });
  var tq = q(S.transferQuery);
  var transferCars = transferAll.filter(function (c) {
    return (!tq || (c.vin + ' ' + c.model + ' ' + c.submodel + ' ' + (c.transferTo||'')).toLowerCase().indexOf(tq) >= 0)
      && (!S.transferModelFilter || c.model === S.transferModelFilter);
  });
  var transferFiltered = !!(tq || S.transferModelFilter);

  var delivered        = S.cars.filter(function (c) { return c.status === 'Delivered'; });
  var claimVehicles    = S.cars.filter(function (c) { return (c.status === 'Delivered' && !c.claimsNotProvided) || (c.claims || []).length > 0; });
  var deliveredPending = claimVehicles.filter(function (c) { return !isFull(c); });
  var awaitingInspect  = claimVehicles.filter(function (c) { return isFull(c) && !c.inspected; });
  var deliveredDone    = claimVehicles.filter(function (c) { return isFull(c) && c.inspected; });

  var byDate = function (a, b) { return (a.releaseDate || '').localeCompare(b.releaseDate || ''); };
  var ym = function (d) { return d ? d.split('-') : ['','']; };

  var cq = q(S.claimQuery);
  var claimCars = deliveredPending.filter(function (c) {
    if (cq && !match(c, cq)) return false;
    var some = (c.claims||[]).some(isRecv);
    if (S.claimPayFilter === 'some' && !some) return false;
    if (S.claimPayFilter === 'none' && some) return false;
    var p = ym(c.releaseDate);
    if (S.claimMonthFilter && p[1] !== S.claimMonthFilter) return false;
    if (S.claimYearFilter  && p[0] !== S.claimYearFilter)  return false;
    return true;
  }).sort(byDate);
  var claimFiltered = !!(cq || S.claimPayFilter || S.claimMonthFilter || S.claimYearFilter);

  var iq = q(S.inspectQuery);
  var inspectCars = awaitingInspect.filter(function (c) { return !iq || match(c, iq); }).sort(byDate);

  var dq = q(S.claimsDoneQuery);
  var claimsDoneCars = deliveredDone.filter(function (c) {
    if (dq && !match(c, dq)) return false;
    var p = ym(c.releaseDate);
    if (S.claimsDoneMonthFilter && p[1] !== S.claimsDoneMonthFilter) return false;
    if (S.claimsDoneYearFilter  && p[0] !== S.claimsDoneYearFilter)  return false;
    return true;
  }).sort(byDate);
  var claimsDoneFiltered = !!(dq || S.claimsDoneMonthFilter || S.claimsDoneYearFilter);

  // ---- รายการเคลมอื่น (ไม่ผูกกับรถ) ----
  var otherAll = S.otherClaims || [];
  var otherPending = otherAll.filter(function (ci) { return !isRecv(ci); });
  var otherInspect = otherAll.filter(function (ci) { return isRecv(ci) && !ci.inspected; });
  var otherDone = otherAll.filter(function (ci) { return isRecv(ci) && ci.inspected; });
  var matchOther = function (ci, query) {
    return !query || (String(ci.detail || '') + ' ' + String(ci.bank || '')).toLowerCase().indexOf(query) >= 0;
  };
  var otherPendingRows = otherPending.filter(function (ci) { return matchOther(ci, cq); });
  var otherInspectRows = otherInspect.filter(function (ci) { return matchOther(ci, iq); });
  var otherDoneRows = otherDone.filter(function (ci) {
    var p = ym(ci.dateReceived);
    return matchOther(ci, dq) && (!S.claimsDoneMonthFilter || p[1] === S.claimsDoneMonthFilter)
      && (!S.claimsDoneYearFilter || p[0] === S.claimsDoneYearFilter);
  });
  var otherYears = {};
  otherDone.forEach(function (ci) { if (ci.dateReceived) otherYears[ci.dateReceived.slice(0,4)] = true; });

  // สรุปยอดเงินเคลม (รวมรายการที่ไม่ผูกกับรถด้วย)
  var claimPending = 0, claimReceived = 0, claimItems = 0;
  var tally = function (ci) {
    claimItems++;
    if (isRecv(ci)) claimReceived += Number(ci.amountReceived) || 0;
    else claimPending += Number(ci.amount) || 0;
  };
  claimVehicles.forEach(function (c) { (c.claims || []).forEach(tally); });
  otherAll.forEach(tally);

  var stockValue = dashboardStock.reduce(function (a, c) { return a + (Number(c.buyPrice) || 0); }, 0);
  var stockPriceMissing = dashboardStock.filter(function (c) { return c.buyPrice === null || c.buyPrice === undefined || c.buyPrice === ''; }).length;

  var counts = {};
  dashboardStock.forEach(function (c) { counts[c.model] = (counts[c.model] || 0) + 1; });
  var maxc = 1;
  Object.keys(counts).forEach(function (k) { if (counts[k] > maxc) maxc = counts[k]; });
  var modelBars = Object.keys(counts).map(function (k) { return { model:k, count:counts[k] }; })
                    .sort(function (a,b) { return b.count - a.count; })
                    .map(function (o) { o.pct = Math.round(o.count / maxc * 100) + '%'; return o; });

  // ---- อายุสต๊อก: นับจากวันที่รับเข้า ----
  var ageRows = dashboardStock.map(function (c) { return { car:c, age:daysSince(c.receiveDate) }; })
    .sort(function (a, b) {
      return (b.age === null ? -1 : b.age) - (a.age === null ? -1 : a.age);
    });
  var ageVals = [];
  ageRows.forEach(function (r) { if (r.age !== null) ageVals.push(r.age); });
  var ageAvg = ageVals.length
    ? Math.round(ageVals.reduce(function (a, b) { return a + b; }, 0) / ageVals.length) : 0;
  var ageMax = ageVals.length ? Math.max.apply(null, ageVals) : 0;
  var ageOver90 = ageVals.filter(function (v) { return v > 90; }).length;

  var bCount = {};
  AGE_BUCKETS.forEach(function (b) { bCount[b.key] = 0; });
  ageVals.forEach(function (v) { bCount[ageBucket(v).key]++; });
  var bMax = 1;
  AGE_BUCKETS.forEach(function (b) { if (bCount[b.key] > bMax) bMax = bCount[b.key]; });
  var ageBars = AGE_BUCKETS.map(function (b) {
    return { key:b.key, label:b.label, min:b.min, max:b.max, hex:b.hex, count:bCount[b.key],
             pct: Math.round(bCount[b.key] / bMax * 100) + '%' };
  });

  // ---- สรุปสต๊อกตาม รุ่น / รุ่นย่อย / สถานที่ ----
  var gMap = {}, gKeys = [];
  ageRows.forEach(function (r) {
    var c = r.car;
    var model = c.model || '—', sub = c.submodel || '—', loc = c.location || '—';
    var k = model + '' + sub + '' + loc;
    if (!gMap[k]) { gMap[k] = { model:model, submodel:sub, location:loc, count:0, ages:[] }; gKeys.push(k); }
    gMap[k].count++;
    if (r.age !== null) gMap[k].ages.push(r.age);
  });
  var stockGroups = gKeys.map(function (k) {
    var g = gMap[k];
    if (g.ages.length) {
      g.avgAge = Math.round(g.ages.reduce(function (a, b) { return a + b; }, 0) / g.ages.length);
      g.maxAge = Math.max.apply(null, g.ages);
    } else { g.avgAge = null; g.maxAge = null; }
    return g;
  }).sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
    return (b.maxAge || 0) - (a.maxAge || 0);
  });

  var years = {};
  S.cars.forEach(function (c) { if (c.releaseDate) years[c.releaseDate.split('-')[0]] = 1; });

  return {
    dashboardCars:dashboardStock, dashboardTransfers:transferAll.filter(dashboardMatches),
    stockAll:stockAll, stockCars:stockCars, stockFiltered:stockFiltered,stockSubmodels:stockSubmodels,stockYears:stockYears,
    transferAll:transferAll, transferCars:transferCars, transferFiltered:transferFiltered,
    deliveredPending:deliveredPending, awaitingInspect:awaitingInspect, deliveredDone:deliveredDone,
    claimCars:claimCars, claimFiltered:claimFiltered,
    otherAll:otherAll,
    otherPending:otherPending, otherInspect:otherInspect, otherDone:otherDone,
    otherPendingRows:otherPendingRows, otherInspectRows:otherInspectRows, otherDoneRows:otherDoneRows,
    otherYears:Object.keys(otherYears).sort(),
    inspectCars:inspectCars,
    claimsDoneCars:claimsDoneCars, claimsDoneFiltered:claimsDoneFiltered,
    claimPending:claimPending, claimReceived:claimReceived, claimItems:claimItems,
    stockValue:stockValue, stockPriceMissing:stockPriceMissing, modelBars:modelBars,
    ageRows:ageRows, ageAvg:ageAvg, ageMax:ageMax, ageOver90:ageOver90,
    ageBars:ageBars, stockGroups:stockGroups,
    releaseYears:Object.keys(years).sort()
  };
}

function claimTotals(c) { return claimTotalsOf(c.claims || []); }
function claimTotalsOf(cl) {
  var total = cl.reduce(function (a,x) { return a + (Number(x.amount)||0); }, 0);
  var recv  = cl.filter(isRecv).reduce(function (a,x) { return a + (Number(x.amountReceived)||0); }, 0);
  var out   = cl.filter(function (x) { return !isRecv(x); }).reduce(function (a,x) { return a + (Number(x.amount)||0); }, 0);
  var full  = cl.length > 0 && cl.every(isRecv);
  var some  = cl.some(isRecv);
  return { total:total, recv:recv, out:out, full:full, some:some };
}

// ------------------------------------------------------------
// Views
// ------------------------------------------------------------
function glassScene(className) {
  return '<div class="' + className + '" aria-hidden="true"><span class="login-orb login-orb-violet"></span><span class="login-orb login-orb-blue"></span><span class="login-orb login-orb-coral"></span></div>';
}
function viewApp() {
  if (S.authed === false) return viewLogin();
  if (S.bootError) {
    return '<div class="boot"><div class="boot-err"><b>เปิดระบบไม่สำเร็จ</b><br>' + esc(S.bootError) +
      '<br><br>กรุณาลองใหม่ หรือติดต่อผู้ดูแลระบบเพื่อตรวจสอบการเชื่อมต่อฐานข้อมูล' +
      '<br><br><button class="btn btn-outline" data-act="retry-boot">ลองใหม่</button>' +
      ' <button class="btn btn-outline" data-act="logout">ออกจากระบบ</button></div></div>';
  }
  if (!S.ready) {
    return '<div class="skeleton-shell" role="status" aria-label="กำลังโหลดข้อมูล"><div class="skeleton-line"></div><div class="skeleton-grid">' + Array(4).fill('<div class="skeleton-box"></div>').join('') + '</div><div class="skeleton-box skeleton-chart"></div></div>';
  }
  if(allowedTabs(S.role).indexOf(S.tab)<0)S.tab=defaultTab(S.role);
  var d = derive();
  return '<div class="app">' + viewHeader() + '<button class="drawer-backdrop' + (S.sidebarOpen ? ' open' : '') + '" data-act="close-sidebar" aria-label="ปิดเมนู" tabindex="-1"></button><div class="body-row">' + viewSidebar(d) +
         '<main class="content">' + viewTab(d) + '</main></div></div>';
}

function viewHeader() {
  var brand = S.config.settings.brandName || 'Stock';
  S.brandHint = brand;
  var R = ROLES[S.role];
  var name = R.user;
  var initial = (name || 'U').replace(/^คุณ/, '').charAt(0).toUpperCase();
  var pills = Object.keys(ROLES).map(function (k) {
    if(S.sessionRole!=='admin' && k!==S.sessionRole)return '';
    return '<button class="role-pill' + (S.role === k ? ' on' : '') + '" data-act="role" data-v="' + k + '">' +
           esc(ROLES[k].label) + '</button>';
  }).join('');
  return '<header class="topbar">' +
    '<button class="drawer-toggle" data-act="toggle-sidebar" aria-label="เปิดเมนูหลัก" aria-controls="app-sidebar" aria-expanded="' + S.sidebarOpen + '">☰</button>' +
    '<div class="header-brand" style="display:flex;align-items:center;gap:16px">' +
      '<div class="brand-lockup" role="img" aria-label="PIJITPHET MOTOR CAR">' +
        '<span class="brand-symbol"><img src="/pijithet-logo.png" alt="" width="250" height="159"></span>' +
        '<span class="brand-wordmark"><img src="/pijithet-logo.png" alt="" width="250" height="159"></span>' +
      '</div>' +
      '<div><div class="brand-th">ระบบจัดการสต๊อกรถยนต์</div><div class="brand-en">Car Stock Management</div></div>' +
    '</div>' +
    '<div style="flex:1"></div>' +
    '<div class="role-switch"><span class="lbl">มุมมองสิทธิ์</span>' + pills + '</div>' +
    window.CSMTheme.button('') +
    '<button class="icon-btn-dark" data-act="refresh" title="โหลดข้อมูลล่าสุดจาก PostgreSQL">⟳</button>' +
    (S.codeRequired ? '<button class="icon-btn-dark" data-act="logout" title="ออกจากระบบ">⏻</button>' : '') +
    '<div style="display:flex;align-items:center;gap:10px;padding-left:6px">' +
      '<div style="text-align:right"><div class="user-name">' + esc(name) + '</div>' +
      '<div class="user-role">' + esc(R.label) + '</div></div>' +
      '<div class="avatar">' + esc(initial) + '</div>' +
    '</div></header>';
}

function navBtn(tab, icon, label, count, warn) {
  if(allowedTabs(S.role).indexOf(tab)<0)return '';
  var paths = {
    'dashboard-stock': '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="11" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="18" width="7" height="3" rx="1"/>',
    stock: '<path d="m5 11 2-6h10l2 6M5 17v3m14-3v3M3 11h18v6H3zM6 14h2m8 0h2"/>',
    floor: '<path d="M3 21V6l9-4 9 4v15M7 21v-9h10v9M7 16h10"/>',
    'dashboard-claims': '<path d="M4 20h16M7 16v-5m5 5V4m5 12V8"/>',
    claims: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 4h6m-4 3h1M6 5V3h11"/>',
    inspect: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5m-13-10 2 2 3-4"/>',
    claimsdone: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
    transfers: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
    settings: '<path d="m10 3-.6 2.1-2 .9-2-.6-2 3.4 1.5 1.5v2.4L3.4 14l2 3.4 2-.5 2 .9.6 2.2h4l.6-2.2 2-.9 2 .5 2-3.4-1.5-1.3v-2.4l1.5-1.5-2-3.4-2 .6-2-.9L14 3z"/><circle cx="12" cy="11.5" r="3"/>'
  };
  icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[tab] || '') + '</svg>';
  var on = S.tab === tab;
  var badge = (count === null) ? '' :
    '<span class="nav-badge' + (!on && warn ? ' warn' : '') + '">' + count + '</span>';
  return '<button class="nav-btn' + (on ? ' on' : '') + '" data-act="tab" data-v="' + tab + '" title="' + esc(label) + '" aria-label="' + esc(label) + '"' + (on ? ' aria-current="page"' : '') + '>' +
         '<span class="ic">' + icon + '</span><span class="tx">' + esc(label) + '</span>' + badge + '</button>';
}

function viewSidebar(d) {
  return '<nav id="app-sidebar" class="sidebar' + (S.sidebarOpen ? ' open' : '') + '" aria-label="เมนูหลัก">' +
    '<button class="drawer-close" data-act="close-sidebar" aria-label="ปิดเมนูหลัก">✕</button>' +
    '<div class="nav-label">เมนูหลัก</div>' +
    navBtn('dashboard-stock', '◧', 'แดชบอร์ดสต๊อก', null, false) +
    navBtn('floor', '', 'รถใน Floor Plan', S.cars.filter(function(c){return c.status==='FloorPlan';}).length, false) +
    navBtn('stock', '▦', 'สต๊อกรถ', d.stockAll.length, false) +
    navBtn('dashboard-claims', '◨', 'แดชบอร์ดเคลม', null, false) +
    navBtn('claims', '₿', 'เคลมเงิน', d.deliveredPending.length + d.otherPending.length, d.claimPending > 0) +
    navBtn('inspect', '🔍', 'ตรวจงาน', d.awaitingInspect.length + d.otherInspect.length, d.awaitingInspect.length + d.otherInspect.length > 0) +
    navBtn('claimsdone', '✓', 'เคลมเงินแล้ว', d.deliveredDone.length + d.otherDone.length, false) +
    navBtn('transfers', '⇄', 'รถตัดขายให้ที่อื่น', d.transferAll.length, false) +
    '<div style="flex:1"></div>' +
    navBtn('settings', '', 'ตั้งค่า', null, false) +
    '<div class="perm-hint">' + esc(ROLES[S.role].hint) + '</div>' +
  '</nav>';
}

function viewTab(d) {
  if(allowedTabs(S.role).indexOf(S.tab)<0)return '<div class="empty">ไม่มีสิทธิ์เข้าถึงแท็บนี้</div>';
  switch (S.tab) {
    case 'settings':        return viewSettings();
    case 'floor':           return viewFloor();
    case 'stock':           return viewStock(d);
    case 'claims':          return viewClaims(d);
    case 'inspect':         return viewInspect(d);
    case 'claimsdone':      return viewClaimsDone(d);
    case 'transfers':       return viewTransfers(d);
    case 'dashboard-claims':return viewDashboardClaims(d);
    default:                return viewDashboardStock(d);
  }
}

var SETTING_GROUPS = [
  { key:'models', title:'รุ่นรถ', description:'ใช้ในแบบฟอร์มรถและตัวกรองรุ่น', placeholder:'เช่น Stock Atto 3' },
  { key:'colors', title:'สีรถ', description:'ชื่อสีและสีที่แสดงบนการ์ดรถ', placeholder:'เช่น ขาวมุก' },
  { key:'locations', title:'สถานที่ / Location', description:'โชว์รูม สาขา หรือลานจอดรถ', placeholder:'เช่น โชว์รูมสำนักงานใหญ่' },
  { key:'banks', title:'บัญชีธนาคาร', description:'บัญชีที่เลือกเมื่อรับเงินเคลม', placeholder:'ธนาคาร · เลขบัญชี · ชื่อบัญชี' }
];
function beginSettings() {
  S.settingsDraftRole=S.role;
  S.settingsDraft = JSON.parse(JSON.stringify(S.config));
  var draft = S.settingsDraft;
  S.settingsColors = draft.colors.map(function (name) { return draft.colorHex[name] || '#c3c8ce'; });
  draft.statusLabels = Object.assign({ Available:'พร้อมขาย', Reserved:'จอง', Delivered:'ส่งมอบแล้ว', Transferred:'ตัดขายแล้ว' }, draft.statusLabels || {});
  draft.claimPayLabels = Object.assign({ some:'รับบางส่วนแล้ว', none:'ยังไม่ได้รับเลย' }, draft.claimPayLabels || {});
  draft.monthNames = draft.monthNames || TH_MONTHS.slice(1);
  S.settingsRevision = S.configRevision; S.settingsDirty = false;
}
function markSettingsDirty() {
  S.settingsDirty = true;
  var badge = document.getElementById('settings-state');
  if (badge) { badge.textContent = 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก'; badge.className = 'pill c-amber'; }
  var save = document.getElementById('settings-save');
  if (save) save.disabled = false;
}
function viewSettings() {
  if (!['admin','keeper','claim'].includes(S.role)) return '<div class="empty">ไม่มีสิทธิ์เข้าถึงการตั้งค่า</div>';
  if (!S.settingsDraft || S.settingsDraftRole!==S.role) beginSettings();
  var draft = S.settingsDraft;
  var groups = SETTING_GROUPS.filter(function(group){return canSettingGroup(group.key);}).map(function (group) {
    var list = draft[group.key];
    var rows = list.map(function (value, index) {
      var attrs = ' data-group="' + group.key + '" data-idx="' + index + '"';
      return '<div class="setting-option"><span class="setting-index">' + (index + 1) + '</span>' +
        (group.key === 'colors' ? '<input class="setting-color" type="color" aria-label="ค่าสีรายการที่ ' + (index + 1) + '" data-in="setting-color" data-k="setting-color-' + index + '"' + attrs + ' value="' + esc(S.settingsColors[index]) + '">' : '') +
        '<input class="setting-value" aria-label="' + group.title + ' รายการที่ ' + (index + 1) + '" data-in="setting-value" data-k="setting-' + group.key + '-' + index + '"' + attrs + ' value="' + esc(value) + '" maxlength="240" placeholder="' + group.placeholder + '">' +
        '<div class="setting-row-actions"><button class="setting-icon" data-act="setting-up"' + attrs + ' aria-label="ย้าย' + group.title + 'รายการที่ ' + (index + 1) + 'ขึ้น"' + (!index ? ' disabled' : '') + '>↑</button>' +
        '<button class="setting-icon" data-act="setting-down"' + attrs + ' aria-label="ย้าย' + group.title + 'รายการที่ ' + (index + 1) + 'ลง"' + (index === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="setting-icon setting-remove" data-act="setting-remove"' + attrs + ' aria-label="ลบ' + group.title + 'รายการที่ ' + (index + 1) + '"' + (group.key !== 'banks' && list.length === 1 ? ' disabled' : '') + '>×</button></div></div>';
    }).join('');
    return '<section class="card setting-card"><div class="setting-card-head"><div><h2>' + group.title + '</h2><p>' + group.description + '</p></div><span class="pill c-gray">' + list.length + ' รายการ</span></div>' +
      '<div class="setting-options">' + (rows || '<div class="setting-empty">ยังไม่มีบัญชีธนาคาร เพิ่มบัญชีที่ทีมใช้รับเงินได้เลย</div>') + '</div>' +
      '<div class="setting-card-foot"><button class="btn-sm soft" data-act="setting-add" data-group="' + group.key + '"' + (list.length >= 200 ? ' disabled' : '') + '>+ เพิ่ม' + group.title + '</button></div></section>';
  }).join('');
  var fixed = (S.role==='claim'?[]:Object.keys(draft.statusLabels)).map(function (key) {
    return '<label class="fld"><span>สถานะรถ · ' + esc(key) + '</span><input data-in="setting-status" data-k="setting-status-' + key + '" data-key="' + key + '" value="' + esc(draft.statusLabels[key]) + '" maxlength="80"></label>';
  }).join('') + (S.role==='admin'?Object.keys(draft.claimPayLabels):[]).map(function (key) {
    return '<label class="fld"><span>ตัวกรองเคลม · ' + (key === 'some' ? 'รับบางส่วน' : 'ยังไม่รับ') + '</span><input data-in="setting-pay" data-k="setting-pay-' + key + '" data-key="' + key + '" value="' + esc(draft.claimPayLabels[key]) + '" maxlength="80"></label>';
  }).join('');
  var months = draft.monthNames.map(function (name, index) {
    return '<label class="fld"><span>เดือน ' + String(index + 1).padStart(2, '0') + '</span><input data-in="setting-month" data-k="setting-month-' + index + '" data-idx="' + index + '" value="' + esc(name) + '" maxlength="80"></label>';
  }).join('');
  return '<div class="page-head settings-page-head"><div><h1 class="page">ตั้งค่า</h1><p class="sub">'+(S.role==='keeper'?'ตั้งค่าเกี่ยวกับรถ: รุ่น สี สถานที่ และชื่อสถานะรถ':S.role==='claim'?'ตั้งค่าบัญชีธนาคารสำหรับรับเงินเคลม':'จัดการตัวเลือก Dropdown ทั้งระบบจากที่เดียว')+'</p></div><span id="settings-state" class="pill ' + (S.settingsDirty ? 'c-amber' : 'c-green') + '">' + (S.settingsDirty ? 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก' : 'ใช้ค่าที่บันทึกแล้ว') + '</span></div>' +
    '<div class="settings-toolbar"><p>ปรับชื่อ ลำดับ และตัวเลือก แล้วกดบันทึกเพื่อให้ทั้งทีมใช้งาน</p><div><button class="btn btn-outline" data-act="settings-reload">โหลดค่าล่าสุด</button><button id="settings-save" class="btn btn-primary" data-act="settings-save"' + (!S.settingsDirty ? ' disabled' : '') + '>บันทึกการตั้งค่า</button></div></div>' +
    (S.role==='admin'?'<section class="card card-pad" style="margin-bottom:20px"><h2 class="card-title">รหัสผ่านแต่ละตำแหน่ง</h2><p class="sub">Admin จัดการรหัสผ่านได้ ผู้ใช้ต้องเข้าสู่ระบบตามตำแหน่ง กดดูรหัสปัจจุบันได้เฉพาะ Admin</p><div class="role-password-list">'+Object.keys(ROLES).map(function(role){return '<div><strong>'+esc(ROLES[role].label)+'</strong><span class="sub">'+(S.rolePasswordStatus[role]?'ตั้งรหัสผ่านแล้ว':role==='admin'?'ใช้รหัส Admin เริ่มต้น':'ยังไม่เปิดใช้งาน')+'</span><button class="btn btn-outline" data-act="show-role-password" data-v="'+role+'">ดูรหัสปัจจุบัน '+esc(ROLES[role].label)+'</button><button class="btn btn-outline" data-act="open-role-password" data-v="'+role+'">ตั้งรหัสผ่าน '+esc(ROLES[role].label)+'</button></div>';}).join('')+'</div></section>':'') +
    '<div class="setting-grid">' + groups + '</div>' +
    (S.role!=='claim'?'<details class="card setting-advanced"><summary>ชื่อสถานะ'+(S.role==='admin'?'และเดือน':'รถ')+'ที่แสดงใน Dropdown <span>ปรับข้อความแสดงผล</span></summary><div class="setting-advanced-body"><p class="sub">เปลี่ยนได้เฉพาะชื่อที่แสดง สถานะยังทำงานตามขั้นตอนเดิม</p><div class="setting-label-grid">' + fixed + '</div>'+(S.role==='admin'?'<h2>ชื่อเดือน</h2><div class="setting-month-grid">' + months + '</div>':'')+'</div></details>':'') +
    '<div class="settings-history-note">การลบหรือเปลี่ยนชื่อตัวเลือกมีผลกับรายการที่เลือกใหม่ ข้อมูลรถและเคลมที่บันทึกไว้แล้วจะยังคงค่าเดิม</div>';
}

function canSettingGroup(group){
  return S.role==='admin' || (S.role==='keeper' && ['models','colors','locations'].indexOf(group)>=0) || (S.role==='claim' && group==='banks');
}
function saveSettings() {
  if (!S.settingsDraft || !S.settingsDirty || !['admin','keeper','claim'].includes(S.role)) return;
  var config = JSON.parse(JSON.stringify(S.settingsDraft));
  config.colorHex = Object.fromEntries(config.colors.map(function (name, i) { return [name, S.settingsColors[i]]; }));
  if(S.role==='keeper')config={models:config.models,colors:config.colors,colorHex:config.colorHex,locations:config.locations,statusLabels:config.statusLabels};
  if(S.role==='claim')config={banks:config.banks};
  call('saveConfig', { role:S.role, payload:{ config:config, expectedRevision:S.settingsRevision } }, beginSettings);
}

function statCards(stats, gridClass) {
  var icons = ['<path d="m5 11 2-6h10l2 6M5 17v3m14-3v3M3 11h18v6H3zM6 14h2m8 0h2"/>','<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>','<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 4 14 4 14 0V6M5 12c0 4 14 4 14 0"/>','<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/>'];
  var cards = stats.map(function (s, i) {
    return '<div class="stat-card"><div class="kpi-head"><span class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[s.iconIndex === undefined ? i % icons.length : s.iconIndex] + '</svg></span><div class="stat-label">' + esc(s.label) + '</div></div>' +
      '<div style="display:flex;align-items:baseline;gap:6px">' +
      '<span class="stat-value' + (String(s.value).length > 6 ? ' long' : '') + (s.color === 'var(--amber)' ? ' warning' : '') + '" style="color:' + s.color + '">' + esc(s.value) + '</span>' +
      '<span class="stat-unit">' + esc(s.unit) + '</span></div>' +
      '<div class="stat-sub">' + esc(s.sub) + '</div>' + (s.action ? '<button class="stat-link" data-act="' + esc(s.action) + '">ดูรายการรอเคลม →</button>' : '') + '</div>';
  }).join('');
  return '<div class="' + gridClass + '">' + cards + '</div>';
}
function pageHeadDate(title) {
  var todayLabel = new Date(S.updatedAt || Date.now()).toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' });
  return '<div class="page-head dashboard-page-head" style="align-items:baseline;flex-wrap:wrap;margin-bottom:20px">' +
    '<h1 class="page">' + esc(title) + '</h1>' +
    '<span style="font-size:14px;color:var(--muted)">อัปเดตล่าสุด ' + esc(todayLabel) + '</span></div>';
}

// ---------- 1a. Dashboard: สต๊อก ----------
function viewDashboardFilters(d) {
  var f = S.dashboardFilters, all = d.stockAll;
  function values(key, cars) { return Array.from(new Set((cars || all).map(function (car) { return String(car[key] || ''); }).filter(Boolean))).sort(function (a,b) { return a.localeCompare(b,'th'); }); }
  function field(label, control) { return '<label class="stock-filter-field"><span>' + label + '</span>' + control + '</label>'; }
  function select(key,label,options) { return selectBox('dash-' + key,f[key],label,options); }
  var submodels = values('submodel',all.filter(function (car) { return !f.model || car.model === f.model; }));
  var active = Object.keys(f).some(function (key) { return !!f[key]; });
  var rangeError = f.due === 'range' && f.dueFrom && f.dueTo && f.dueFrom > f.dueTo;
  return '<section class="card stock-filters dashboard-filters" aria-label="ตัวกรอง Dashboard สต๊อก"><div class="dashboard-filter-toolbar"><button class="btn btn-outline" data-act="toggle-dashboard-filters" data-k="dashboard-filter-toggle" aria-label="Filter" aria-expanded="' + S.dashboardFiltersOpen + '" aria-controls="dashboard-filter-panel"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg> Filter' + (active ? '<span class="dashboard-filter-active">ใช้งานอยู่</span>' : '') + '<span aria-hidden="true">' + (S.dashboardFiltersOpen ? '⌃' : '⌄') + '</span></button><span>แสดง <strong>' + d.dashboardCars.length + '</strong> จาก ' + all.length + ' คัน</span></div><div id="dashboard-filter-panel"' + (S.dashboardFiltersOpen ? '' : ' hidden') + '><div class="stock-search-row"><div class="search-wrap"><span class="ic" aria-hidden="true">⌕</span><input type="search" aria-label="ค้นหา VIN ใน Dashboard" data-in="dash-query" data-k="dash-query" value="' + esc(f.query) + '" placeholder="ค้นหา VIN รถ…"></div></div><div class="stock-filter-grid">' +
    field('รุ่นรถ',select('model','ทุกรุ่น',values('model'))) +
    field('รุ่นย่อย',select('submodel','ทุกรุ่นย่อย',submodels)) +
    field('สีรถ',select('color','ทุกสี',values('color'))) +
    field('สถานที่',select('location','ทุกสถานที่',values('location'))) +
    field('สถานะ',select('status','พร้อมขาย + จอง',[{value:'Available',label:statusLabel('Available')},{value:'Reserved',label:statusLabel('Reserved')}])) +
    field('ปีผลิต',select('year','ทุกปีผลิต',values('manufactureYear').reverse())) +
    field('อายุรถ',select('age','ทุกช่วงอายุ',AGE_BUCKETS.map(function (b) { return {value:b.key,label:b.label}; }))) +
    field('วันครบกำหนดจ่าย',select('due','ทุกกำหนดจ่าย',[{value:'overdue',label:'เกินกำหนด'},{value:'today',label:'ครบกำหนดวันนี้'},{value:'week',label:'ภายใน 7 วัน'},{value:'missing',label:'ยังไม่ระบุวันจ่าย'},{value:'range',label:'เลือกช่วงวันที่'}])) +
    (f.due === 'range' ? field('ตั้งแต่วันที่','<input type="date" data-in="dash-dueFrom" data-k="dash-dueFrom" value="' + esc(f.dueFrom) + '">') + field('ถึงวันที่','<input type="date" data-in="dash-dueTo" data-k="dash-dueTo" value="' + esc(f.dueTo) + '">') : '') +
    '</div>' + (rangeError ? '<p role="alert" class="dashboard-range-error">วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด</p>' : '') +
    '<div class="stock-filter-summary"><span>คลิกสีในกราฟเพื่อดูและจัดการรถ</span>' + clearBtn('clear-dashboard',active) + '</div></div></section>';
}
function viewDashboardStock(d) {
  var stock = d.dashboardCars;
  var stats = [
    { label:'รถในสต๊อก',        value:stock.length,    unit:'คัน', color:'var(--text)', sub:S.dashboardFilters.status ? statusLabel(S.dashboardFilters.status) : 'พร้อมขาย + จอง' },
    S.role==='sales' ? {label:'รถจอง',value:stock.filter(function(car){return car.status==='Reserved';}).length,unit:'คัน',color:'var(--amber)',sub:'รถจองตามตัวกรอง'} : { label:'ตัดขายให้ที่อื่น',  value:d.dashboardTransfers.length, unit:'คัน', color:'var(--muted)', sub:'โอนออกสะสมตามตัวกรอง' },
    { label:'มูลค่าสต๊อก', value:stock.length && d.stockPriceMissing === stock.length ? '—' : fmt(d.stockValue), unit:stock.length && d.stockPriceMissing === stock.length ? '' : '฿', color:'var(--green)', sub:d.stockPriceMissing ? 'ไม่ระบุราคาทุน ' + d.stockPriceMissing + ' คัน' : 'ราคาซื้อรวม' },
    { label:'อายุสต๊อกเฉลี่ย',   value:d.ageAvg,             unit:'วัน', color:(d.ageOver90 ? 'var(--amber)' : 'var(--text)'),
      sub:'นับจากวันที่รับเข้า · สูงสุด ' + d.ageMax + ' วัน · เกิน 90 วัน ' + d.ageOver90 + ' คัน' }
  ];

  var bars = d.modelBars.length ? d.modelBars.map(function (m) {
    return '<button class="bar-row dashboard-chart-row" data-act="open-dashboard-model" data-model="' + esc(m.model) + '" aria-label="' + esc(m.model + ' ' + m.count + ' คัน ดูรายการรถ') + '"><span class="bar-label">' + esc(m.model) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + m.pct + '"></span></span>' +
      '<span class="bar-count">' + m.count + '</span></button>';
  }).join('') : '<div style="font-size:14px;color:var(--placeholder)">ยังไม่มีรถในสต๊อก</div>';

  var ageBars = stock.length ? d.ageBars.map(function (b) {
    return '<button class="bar-row dashboard-chart-row" data-act="open-dashboard-age" data-age="' + b.key + '" aria-label="อายุรถ ' + esc(b.label) + ' ' + b.count + ' คัน ดูรายการรถ" title="' + b.min + (b.max === Infinity ? ' วันขึ้นไป' : '–' + b.max + ' วัน') + '"' + (b.count ? '' : ' disabled') + '><span class="bar-label">' + esc(b.label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + b.pct + ';background:' + b.hex + '"></span></span>' +
      '<span class="bar-count">' + b.count + '</span></button>';
  }).join('') : '<div style="font-size:14px;color:var(--placeholder)">ยังไม่มีรถในสต๊อก</div>';

  // สรุปตาม รุ่น / รุ่นย่อย / สถานที่ + อายุ
  var groupRows = d.stockGroups.map(function (g) {
    return '<tr>' +
      '<td style="font-weight:600">' + esc(g.model) + '</td>' +
      '<td style="color:var(--text-2)">' + esc(g.submodel) + '</td>' +
      '<td style="color:var(--text-2)">' + esc(g.location) + '</td>' +
      '<td class="ta-r" style="font-weight:600">' + g.count + '</td>' +
      '<td class="ta-r" style="color:var(--muted)">' + (g.avgAge === null ? '—' : g.avgAge + ' วัน') + '</td>' +
      '<td class="ta-r">' + ageTag(g.maxAge) + '</td></tr>';
  }).join('');

  var groupTable = '<div class="table-wrap" style="margin-bottom:16px">' +
    '<div class="card-head-tbl"><div class="card-title-row"><div class="card-title">สรุปสต๊อกตามรุ่น / รุ่นย่อย / สถานที่</div>' +
      '<span class="card-title-note">' + d.stockGroups.length + ' กลุ่ม · อายุนับจากวันที่รับเข้า</span></div></div>' +
    '<div class="scroll-x"><table class="data" style="min-width:760px"><thead><tr>' +
      '<th>รุ่น</th><th>รุ่นย่อย</th><th>สถานที่</th><th class="ta-r">จำนวน</th>' +
      '<th class="ta-r">อายุเฉลี่ย</th><th class="ta-r">อายุมากสุด</th></tr></thead><tbody>' + groupRows +
    '</tbody></table></div>' +
    (d.stockGroups.length ? '' : '<div class="empty">ไม่มีรถในสต๊อก</div>') + '</div>';

  // รายคัน เรียงตามอายุมาก → น้อย
  var carRows = d.ageRows.map(function (r) {
    var car = r.car, sm = statusMeta(car.status);
    return '<tr>' +
      '<td class="mono" style="font-weight:500;color:var(--text-2)">' + esc(car.vin) + '</td>' +
      '<td style="font-weight:600">' + esc(car.model) + '</td>' +
      '<td style="color:var(--text-2)">' + esc(car.submodel) + '</td>' +
      '<td><span style="display:inline-flex;align-items:center;gap:7px"><span class="dot" style="background:' + esc(colorHex(car.color)) + '"></span>' + esc(car.color) + '</span></td>' +
      '<td style="color:var(--text-2)">' + esc(car.location) + '</td>' +
      '<td style="color:var(--muted)">' + esc(car.receiveDate || '—') + '</td>' +
      '<td class="ta-r">' + ageTag(r.age) + '</td>' +
      '<td><span class="pill ' + sm[1] + '">' + esc(sm[0]) + '</span></td></tr>';
  }).join('');

  var carTable = '<div class="table-wrap">' +
    '<div class="card-head-tbl"><div class="card-title-row"><div class="card-title">อายุรถรายคัน (นับจากวันที่รับเข้า)</div>' +
      '<span class="card-title-note">เรียงจากค้างสต๊อกนานที่สุด</span></div></div>' +
    '<div class="scroll-x"><table class="data" style="min-width:940px"><thead><tr>' +
      '<th>VIN no.</th><th>รุ่น</th><th>รุ่นย่อย</th><th>สี</th><th>สถานที่</th>' +
      '<th>วันที่รับเข้า</th><th class="ta-r">Age</th><th>สถานะ</th></tr></thead><tbody>' + carRows +
    '</tbody></table></div>' +
    (d.ageRows.length ? '' : '<div class="empty">ไม่มีรถในสต๊อก</div>') + '</div>';

  return '<div>' + pageHeadDate('ภาพรวมสต๊อก') + viewDashboardFilters(d) + statCards(stats, 'stat-grid') +
    viewStockColorChart(stock) + '<div class="grid-2-eq">' +
      '<div class="card card-pad-lg"><div class="card-title">สต๊อกคงเหลือตามรุ่น</div>' +
        '<div style="display:flex;flex-direction:column;gap:13px">' + bars + '</div></div>' +
      '<div class="card card-pad-lg"><div class="card-title">อายุสต๊อก (นับจากวันที่รับเข้า)</div>' +
        '<div style="display:flex;flex-direction:column;gap:13px">' + ageBars + '</div></div>' +
    '</div>' +
    viewLatestCars(d) + '<details class="stock-reports"><summary>รายงานสรุปสต๊อกและอายุรถรายคัน</summary>' + groupTable + carTable + '</details>' +
    '</div>';
}

function stockColorGroups(cars) {
  var groups = new Map(), usedColors = new Set();
  cars.forEach(function (car) {
    if (car.status !== 'Available' && car.status !== 'Reserved') return;
    var model = car.model || 'ไม่ระบุรุ่น', submodel = car.submodel || 'ไม่ระบุรุ่นย่อย', color = car.color || 'ไม่ระบุสี';
    var key = JSON.stringify([model,submodel]);
    if (!groups.has(key)) groups.set(key,{model:model,submodel:submodel,total:0,colors:new Map()});
    var group = groups.get(key);
    group.total++; group.colors.set(color,(group.colors.get(color) || 0)+1); usedColors.add(color);
  });
  var rows = Array.from(groups.values()).sort(function (a,b) { return a.model.localeCompare(b.model,'th') || a.submodel.localeCompare(b.submodel,'th'); });
  var colors = Array.from(new Set((S.config.colors || []).concat(Array.from(usedColors).sort(function (a,b) { return a.localeCompare(b,'th'); })))).filter(function (color) { return usedColors.has(color); });
  var max = Math.max.apply(null,[1].concat(rows.map(function (row) { return row.total; })));
  var rawStep = max/5, magnitude = Math.pow(10,Math.floor(Math.log10(rawStep)));
  var step = Math.max(1,[1,2,5,10].map(function (n) { return n*magnitude; }).filter(function (n) { return n >= rawStep; })[0]);
  return {rows:rows,colors:colors,step:step,max:Math.ceil(max/step)*step,total:rows.reduce(function (sum,row) { return sum+row.total; },0)};
}
function swatchTextColor(hex) {
  var value = /^#[a-f\d]{3}$/i.test(hex) ? '#' + hex.slice(1).split('').map(function (c) { return c+c; }).join('') : hex;
  if (!/^#[a-f\d]{6}$/i.test(value)) return '#172f2a';
  var rgb = value.slice(1).match(/../g).map(function (c) { var v = parseInt(c,16)/255; return v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); });
  var lum = rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
  return (lum+.05)/.05 >= 1.05/(lum+.05) ? '#000000' : '#ffffff';
}
function viewStockColorChart(cars) {
  var chart = stockColorGroups(cars);
  var head = '<div class="stock-color-head"><div><h2 class="card-title">สต๊อกแยกตามรุ่น รุ่นย่อย และสี</h2><p class="sub">รวมรถพร้อมขายและรถจอง · แท่งแต่ละสีแสดงจำนวนรถสีนั้น</p></div><span class="stock-color-total">รวม ' + fmt(chart.total) + ' คัน</span></div>';
  if (!chart.rows.length) return '<section class="card card-pad-lg stock-color-card">' + head + '<div class="empty">ยังไม่มีรถพร้อมขายหรือรถจองในสต๊อก</div></section>';
  var legend = '<div class="stock-color-legend" aria-label="สีรถ">' + chart.colors.map(function (color) {
    return '<span><i class="stock-color-dot" style="background:' + esc(colorHex(color)) + '"></i>' + esc(color) + '</span>';
  }).join('') + '</div>';
  var previousModel = '';
  var rows = chart.rows.map(function (row) {
    var newModel = previousModel !== row.model; previousModel = row.model;
    var descriptions = chart.colors.filter(function (color) { return row.colors.has(color); });
    var breakdown = descriptions.map(function (color) { return color + ' ' + row.colors.get(color) + ' คัน'; }).join(' · ');
    return '<div class="stock-color-row' + (newModel ? ' new-model' : '') + '"><div class="stock-color-label"><strong>' + esc(row.model) + '</strong><span>' + esc(row.submodel) + '</span></div>' +
      '<div class="stock-color-plot"><div class="stock-color-grid" style="--grid-step:' + chart.step/chart.max*100 + '%"><div class="stock-color-bar" role="group" aria-label="' + esc(row.model + ' ' + row.submodel + ': ' + breakdown + ' รวม ' + row.total + ' คัน') + '" style="width:' + row.total/chart.max*100 + '%">' +
      descriptions.map(function (color) {
        var count = row.colors.get(color), hex = colorHex(color);
        return '<button type="button" class="stock-color-segment" data-act="open-dashboard-group" data-model="' + esc(row.model) + '" data-submodel="' + esc(row.submodel) + '" data-color="' + esc(color) + '" aria-label="' + esc(row.model + ' ' + row.submodel + ' สี' + color + ' ' + count + ' คัน ดูรายการรถ') + '" title="' + esc(color + ': ' + count + ' คัน · คลิกดูรถ') + '" style="width:' + count/row.total*100 + '%;background-color:' + esc(hex) + ';color:' + swatchTextColor(hex) + '"><span' + (count/chart.max < .045 ? ' class="sr-only"' : '') + '>' + count + '</span></button>';
      }).join('') + '</div></div><div class="stock-color-breakdown">' + descriptions.map(function (color) {
        return '<span><i class="stock-color-dot" style="background:' + esc(colorHex(color)) + '"></i>' + esc(color) + ' <b>' + row.colors.get(color) + '</b></span>';
      }).join('') + '</div></div><strong class="stock-color-row-total">' + row.total + '<small>คัน</small></strong></div>';
  }).join('');
  var ticks = [];
  for (var value=0;value<=chart.max;value+=chart.step) ticks.push('<span>' + value + '</span>');
  return '<section class="card card-pad-lg stock-color-card" aria-label="กราฟแท่งซ้อนสีแยกรุ่นและรุ่นย่อย">' + head + legend +
    '<div class="stock-color-chart">' + rows + '<div class="stock-color-axis"><span></span><div>' + ticks.join('') + '</div><span></span></div></div><p class="stock-color-caption">จำนวนรถ (คัน) · ทุกแถวใช้มาตราส่วนเดียวกัน</p></section>';
}

function viewLatestCars(d) {
  var query = S.latestQuery.trim().toLowerCase();
  var rows = (d.dashboardCars || d.stockAll).filter(function (car) {
    return [car.vin,car.model,car.submodel,car.color,statusLabel(car.status)].join(' ').toLowerCase().indexOf(query) >= 0;
  }).sort(function (a,b) { return (b.receiveDate || '').localeCompare(a.receiveDate || '') || b.id - a.id; }).slice(0,8);
  return '<div class="table-wrap"><div class="latest-head"><h2 class="card-title">รายการรถล่าสุด</h2>' +
    '<div class="search-wrap"><span class="ic" aria-hidden="true">⌕</span><input aria-label="ค้นหารถล่าสุด" data-k="latest-search" data-in="latest-search" value="' + esc(S.latestQuery) + '" placeholder="ค้นหา VIN, รุ่นรถ, สี, สถานะ"></div>' +
    '<button class="btn btn-primary" data-act="view-stock">ดูสต๊อกทั้งหมด</button></div><div class="scroll-x"><table class="data latest-table"><thead><tr><th>#</th><th>รุ่นรถ / VIN</th><th>สี</th><th>สถานะ</th><th>อายุสต๊อก</th><th>วันที่รับเข้า</th><th>จัดการ</th></tr></thead><tbody>' +
    rows.map(function (car,i) {
      var sm = statusMeta(car.status);
      return '<tr><td>' + (i+1) + '</td><td><button class="dashboard-car-link" data-act="open-dashboard-car" data-id="' + car.id + '"><strong>' + esc(car.model) + '</strong><small>' + esc(car.vin) + '</small></button></td>' +
        '<td><span class="dot" style="background:' + esc(colorHex(car.color)) + '"></span> ' + esc(car.color) + '</td><td><span class="pill ' + sm[1] + '">' + esc(sm[0]) + '</span></td>' +
        '<td>' + ageTag(daysSince(car.receiveDate)) + '</td><td>' + esc(car.receiveDate || '—') + '</td><td><details class="row-menu"><summary aria-label="จัดการรถ ' + esc(car.vin) + '">⋯</summary><div class="row-actions">' +
        '<button class="btn-sm ghost" data-act="view-stock" data-id="' + car.id + '">ดูในสต๊อก</button>' +
        (can().stock ? '<button class="btn-sm soft" data-act="open-edit" data-id="' + car.id + '">แก้ไข</button>' : '') + deleteCarButton(car) + '</div></details></td></tr>';
    }).join('') + '</tbody></table></div>' + (rows.length ? '' : '<div class="empty">' + (query ? 'ไม่พบรถที่ตรงกับการค้นหา' : 'ยังไม่มีรถในสต๊อก') + '</div>') + '</div>';
}

// ---------- 1b. Dashboard: เคลม ----------
function viewDashboardClaims(d) {
  var otherPendingAmount = d.otherPending.reduce(function (sum, claim) { return sum + (Number(claim.amount) || 0); }, 0);
  var stats = [
    { label:'รถที่รอเคลม', value:d.deliveredPending.length, unit:'คัน', color:'var(--primary)', sub:'งานเคลมที่เกี่ยวกับรถ' },
    { label:'รอเคลม (ไม่เกี่ยวกับรถ)', iconIndex:2, value:d.otherPending.length, unit:'รายการ', color:'var(--primary)', sub:'คงเหลือ ' + fmt(otherPendingAmount) + ' ฿', action:'view-other-pending' },
    { label:'รอตรวจงาน', iconIndex:1, value:d.awaitingInspect.length,  unit:'คัน', color:'var(--muted)', sub:'รับเงินครบ รอตรวจ' },
    { label:'รอรับเงิน', iconIndex:2, value:fmt(d.claimPending),       unit:'฿',   color:'var(--amber)', sub:'ยอดเคลมค้างรับ' },
    { label:'รับเงินแล้ว', iconIndex:3, value:fmt(d.claimReceived),      unit:'฿',   color:'var(--green)', sub:'ยอดเคลมสะสม' }
  ];

  var tot = d.claimPending + d.claimReceived;
  var pct = tot ? Math.round(d.claimReceived / tot * 100) : 0;

  return '<div>' + pageHeadDate('ภาพรวมเงินเคลม') + statCards(stats, 'stat-grid claims-stat-grid') +
    '<div class="card card-pad-lg"><div class="card-title">สถานะเงินเคลม</div>' +
      '<div style="display:flex;flex-direction:column;gap:14px">' +
        '<div><div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px">' +
          '<span style="color:var(--muted)">รอรับเงิน</span><span style="font-weight:600;color:var(--amber)">' + fmt(d.claimPending) + ' ฿</span></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:14px">' +
          '<span style="color:var(--muted)">รับเงินแล้ว</span><span style="font-weight:600;color:var(--green)">' + fmt(d.claimReceived) + ' ฿</span></div></div>' +
        '<div class="progress"><div style="width:' + pct + '%;background:var(--chart-green)"></div><div style="flex:1;background:var(--chart-amber)"></div></div>' +
        '<div style="font-size:14px;color:var(--faint)">มีรายการเคลมทั้งหมด ' + d.claimItems + ' รายการ — เกี่ยวกับรถ ' +
          (d.claimItems - d.otherAll.length) + ' รายการ + รายการเคลมอื่น ' + d.otherAll.length + ' รายการ</div>' +
      '</div></div>' +
    '</div>';
}

// ---------- helpers: filter controls ----------
function searchBox(key, val, placeholder, label) {
  return '<div class="search-wrap"><span class="ic">⌕</span>' +
    '<input aria-label="' + esc(label || placeholder) + '" data-k="search-' + key + '" data-in="search-' + key + '" value="' + esc(val) + '" placeholder="' + esc(placeholder) + '"></div>';
}
function selectBox(key, val, firstLabel, options) {
  var opts = '<option value="">' + esc(firstLabel) + '</option>' + options.map(function (o) {
    var v = (typeof o === 'object') ? o.value : o;
    var l = (typeof o === 'object') ? o.label : o;
    return '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
  }).join('');
  return '<select aria-label="' + esc(firstLabel) + '" class="filter" data-k="filter-' + key + '" data-in="filter-' + key + '">' + opts + '</select>';
}
function clearBtn(act, show) {
  return show ? '<button class="clear-filters" data-act="' + act + '">ล้างตัวกรอง</button>' : '';
}
function monthOptions() {
  var out = [];
  for (var i = 1; i <= 12; i++) out.push({ value: (i<10?'0':'') + i, label: (S.config.monthNames || TH_MONTHS.slice(1))[i - 1] });
  return out;
}

// ---------- 2. Stock ----------
var FLOOR_REQUIRED={vin:'VIN',model:'รุ่นรถ',submodel:'รุ่นย่อย',color:'สี',location:'สถานที่',buyPrice:'ราคาซื้อ',receiveDate:'วันที่รับเข้า',paymentDueDate:'วันครบจ่ายเงิน',batteryNumber:'Battery number/code',frontMotorNumber:'เลขมอเตอร์/เลขเครื่อง',manufactureYear:'ปีผลิต'};
function floorMissing(car){return Object.keys(FLOOR_REQUIRED).filter(function(key){return car[key]==null || String(car[key]).trim()==='';});}
function viewFloor(){
  var all=S.cars.filter(function(c){return c.status==='FloorPlan';}),query=S.floorQuery.trim().toLowerCase();
  var rows=all.filter(function(c){return [c.vin,c.model,c.submodel,c.color,c.location,c.batteryNumber,c.frontMotorNumber].join(' ').toLowerCase().indexOf(query)>=0;});
  return '<div class="page-head"><div><h1 class="page">รถใน Floor Plan</h1><p class="sub">รถที่รอข้อมูลครบก่อนเข้า Stock · '+all.length+' คัน</p></div><div style="flex:1"></div>'+(can().stock?'<button class="btn btn-outline" data-act="open-import-cars">นำเข้า CSV</button><button class="btn btn-primary" data-act="open-add">+ เพิ่มรถใน Floor Plan</button>':'')+'</div><div class="filters">'+searchBox('floor',S.floorQuery,'ค้นหา VIN รุ่น สี หรือสถานที่…','ค้นหารถใน Floor Plan')+'</div><div class="table-wrap"><div class="scroll-x"><table class="data" style="min-width:1000px"><thead><tr><th>VIN</th><th>รุ่น / รุ่นย่อย</th><th>สี / สถานที่</th><th>วันที่รับ / ครบจ่าย</th><th>ความครบถ้วน</th><th>จัดการ</th></tr></thead><tbody>'+rows.map(function(c){var missing=floorMissing(c);return '<tr><td>'+esc(c.vin||'ยังไม่ระบุ VIN')+'</td><td>'+esc(c.model||'—')+'<br>'+esc(c.submodel||'—')+'</td><td>'+esc(c.color||'—')+'<br>'+esc(c.location||'—')+'</td><td>'+esc(c.receiveDate||'—')+'<br>'+esc(c.paymentDueDate||'—')+'</td><td><span class="pill '+(missing.length?'c-amber':'c-green')+'">'+(missing.length?'ขาด '+missing.length+' ช่อง':'ข้อมูลครบ')+'</span></td><td>'+(can().stock?'<div class="row-actions"><button class="btn-sm ghost" data-act="open-edit" data-id="'+c.id+'">แก้ไข</button><button class="btn-sm soft" data-act="open-promote-floor" data-id="'+c.id+'">นำเข้า Stock</button>'+deleteCarButton(c)+'</div>':'ดูอย่างเดียว')+'</td></tr>';}).join('')+'</tbody></table></div>'+(rows.length?'':'<div class="empty">ยังไม่มีรถใน Floor Plan ที่ตรงกับการค้นหา</div>')+'</div>';
}
function viewStock(d) {
  var c = can();
  var head = '<div class="page-head"><div><h1 class="page">สต๊อกรถปัจจุบัน</h1>' +
    '<p class="sub">รถที่ยังอยู่ในโชว์รูม ' + d.stockAll.length + ' คัน</p></div><div style="flex:1"></div>' +
    (c.stock
      ? '<button class="btn btn-outline" data-act="open-import-cars">นำเข้า CSV</button><button class="btn btn-primary" data-act="open-add" style="display:flex;align-items:center;gap:7px"><span style="font-size:18px;line-height:1">+</span> เพิ่มรถใหม่</button>'
      : '<span class="readonly-pill">โหมดดูอย่างเดียว (Read-only)</span>') + '</div>';

  function stockFilter(label, control) { return '<label class="stock-filter-field"><span>' + label + '</span>' + control + '</label>'; }
  var filters = '<div class="card stock-filters"><div class="stock-search-row">' + searchBox('stock', S.stockQuery, 'ค้นหา VIN, รุ่น, รุ่นย่อย, สี, สถานที่, แบตเตอรี่, เลขมอเตอร์ หรือปีผลิต…','ค้นหาสต๊อกรถ') + '</div><div class="stock-filter-grid">' +
    stockFilter('รุ่นรถ',selectBox('stockModel', S.stockModelFilter, 'ทุกรุ่น', S.config.models)) +
    stockFilter('รุ่นย่อย',selectBox('stockSubmodel', S.stockSubmodelFilter, 'ทุกรุ่นย่อย', d.stockSubmodels)) +
    stockFilter('สีรถ',selectBox('stockColor', S.stockColorFilter, 'ทุกสี', S.config.colors)) +
    stockFilter('สถานที่',selectBox('stockLocation', S.stockLocationFilter, 'ทุกสถานที่', S.config.locations)) +
    stockFilter('สถานะ',selectBox('stockStatus', S.stockStatusFilter, 'ทุกสถานะ', [{value:'Available',label:statusLabel('Available')},{value:'Reserved',label:statusLabel('Reserved')}])) +
    stockFilter('ปีผลิต',selectBox('stockYear', S.stockYearFilter, 'ทุกปีผลิต', d.stockYears)) +
    '</div><div class="stock-filter-summary"><span>แสดง <strong>' + d.stockCars.length + '</strong> จาก ' + d.stockAll.length + ' คัน</span>' + clearBtn('clear-stock',d.stockFiltered) + '</div></div>';

  var rows = d.stockCars.map(function (car) {
    var sm = statusMeta(car.status);
    var actions = c.stock
      ? '<span style="display:inline-flex;gap:7px;justify-content:flex-end">' +
        '<button class="btn-sm ghost" data-act="open-edit" data-id="' + car.id + '">แก้ไข</button>' +
        '<button class="btn-sm soft" data-act="open-deliver" data-id="' + car.id + '">ส่งมอบ</button>' +
        '<button class="btn-sm ghost" data-act="open-transfer" data-id="' + car.id + '">ตัดขาย</button>' + deleteCarButton(car) + '</span>'
      : '<span style="font-size:14px;color:var(--muted)">—</span>';
    return '<tr>' +
      '<td class="mono" style="font-weight:500;color:var(--text-2)">' + esc(car.vin) + '</td>' +
      '<td><div style="font-weight:600">' + esc(car.model) + '</div><div style="font-size:14px;color:var(--faint)">' + esc(car.submodel) + '</div></td>' +
      '<td><span style="display:inline-flex;align-items:center;gap:7px"><span class="dot" style="background:' + esc(colorHex(car.color)) + '"></span>' + esc(car.color) + '</span></td>' +
      '<td style="color:var(--text-2)">' + esc(car.location) + '</td>' +
      '<td class="ta-r" style="font-weight:500">' + (car.buyPrice == null || car.buyPrice === '' ? 'ไม่ระบุ' : fmt(car.buyPrice)) + '</td>' +
      '<td style="color:var(--muted)">' + esc(car.receiveDate) + '</td>' +
      '<td>' + esc(car.paymentDueDate || '—') + '</td>' +
      '<td class="mono">' + esc(car.batteryNumber || '—') + '</td>' +
      '<td class="mono">' + esc(car.frontMotorNumber || '—') + '</td>' +
      '<td>' + esc(car.manufactureYear || '—') + '</td>' +
      '<td><span class="pill ' + sm[1] + '">' + esc(sm[0]) + '</span></td>' +
      '<td class="ta-r" style="padding:10px 16px">' + actions + '</td></tr>';
  }).join('');

  var table = '<div class="table-wrap stock-table-wrap"><div class="stock-scroll-controls"><button class="icon-btn-dark" data-act="stock-scroll-left" aria-label="เลื่อนตารางไปทางซ้าย">←</button><div class="stock-scroll-track"><span>เลื่อนซ้าย–ขวาเพื่อดูข้อมูลรถทั้งหมด</span><div class="stock-scrollbar" tabindex="0" role="region" aria-label="แถบเลื่อนตารางสต๊อกแนวนอน"><div></div></div></div><button class="icon-btn-dark" data-act="stock-scroll-right" aria-label="เลื่อนตารางไปทางขวา">→</button></div><div class="scroll-x stock-scroll-viewport" tabindex="0" role="region" aria-label="ตารางสต๊อกรถ เลื่อนซ้ายขวาได้"><table class="data stock-table" style="min-width:1500px"><thead><tr>' +
    '<th>VIN no.</th><th>รุ่นรถ / รุ่นย่อย</th><th>สี</th><th>Location</th><th class="ta-r">ราคาซื้อ</th>' +
    '<th>วันที่รับ</th><th>วันครบจ่ายเงิน</th><th>Battery number/code</th><th>เลขมอเตอร์/เลขเครื่อง</th><th>ปีผลิต</th><th>สถานะ</th><th class="ta-r">จัดการ</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (d.stockCars.length ? '' : '<div class="empty">' + (d.stockFiltered ? 'ไม่พบรถที่ตรงกับการค้นหา' : 'ไม่มีรถในสต๊อก') + '</div>') +
    '</div>';

  return '<div>' + head + filters + table + '</div>';
}

function setupStockScroll() {
  if (_stockScrollObserver) { _stockScrollObserver.disconnect(); _stockScrollObserver=null; }
  var viewport = document.querySelector('.stock-scroll-viewport');
  var scrollbar = document.querySelector('.stock-scrollbar');
  if (!viewport || !scrollbar) return;
  var left = document.querySelector('[data-act="stock-scroll-left"]');
  var right = document.querySelector('[data-act="stock-scroll-right"]');
  function update() {
    var max = Math.max(0,viewport.scrollWidth-viewport.clientWidth);
    S.stockScrollLeft = viewport.scrollLeft;
    left.disabled = viewport.scrollLeft <= 1;
    right.disabled = viewport.scrollLeft >= max-1;
  }
  function resize() {
    scrollbar.firstElementChild.style.width = viewport.scrollWidth + 'px';
    viewport.scrollLeft = Math.min(S.stockScrollLeft,Math.max(0,viewport.scrollWidth-viewport.clientWidth));
    scrollbar.scrollLeft = viewport.scrollLeft; update();
  }
  viewport.onscroll = function () { if (Math.abs(scrollbar.scrollLeft-viewport.scrollLeft)>1) scrollbar.scrollLeft=viewport.scrollLeft; update(); };
  scrollbar.onscroll = function () { if (Math.abs(viewport.scrollLeft-scrollbar.scrollLeft)>1) viewport.scrollLeft=scrollbar.scrollLeft; update(); };
  resize();
  if (typeof ResizeObserver !== 'undefined') {
    _stockScrollObserver = new ResizeObserver(resize);
    _stockScrollObserver.observe(viewport); _stockScrollObserver.observe(viewport.querySelector('table'));
  }
}

// ---------- claim card (ใช้ร่วมกัน 3 แท็บ) ----------
function claimItemRows(claims) {
  return (claims || []).map(function (ci) {
    var paid = isRecv(ci);
    var line = paid ? ('รับ ' + fmt(ci.amountReceived) + ' ฿ · ' + esc(ci.dateReceived) + ' · ' + esc(ci.bank || '—'))
                    : 'ยังไม่ได้รับเงิน';
    return '<div class="claim-item' + (paid ? ' paid' : '') + '">' +
      '<div style="flex:1;min-width:150px"><div class="d1">' + esc(ci.detail) + '</div>' +
      '<div class="d2' + (paid ? ' paid' : '') + '">' + line + '</div></div>' +
      '<span class="amt">ตั้งไว้ ' + fmt(ci.amount) + ' ฿</span>' +
      '<span class="pill-sm ' + (paid ? 'c-green' : 'c-amber') + '">' + (paid ? 'รับแล้ว' : 'รอรับ') + '</span></div>';
  }).join('');
}

function claimCard(car, mode) {
  var t = claimTotals(car);
  var c = can();
  var right, pill, actions = '';

  if (mode === 'claims') {
    pill = '<span class="pill-pay ' + (t.full ? 'c-green' : (t.some ? 'c-blue' : 'c-amber')) + '">' +
           (t.full ? 'รับครบแล้ว' : (t.some ? 'รับบางส่วน' : 'รอรับเงิน')) + '</span>';
    right = '<div class="claim-money"><div class="lbl">เงินเข้าแล้ว / ยอดเคลม</div>' +
            '<div class="val"><span style="color:var(--green)">' + fmt(t.recv) + '</span> / ' + fmt(t.total) + ' ฿</div>' +
            '<div class="out">คงเหลือ ' + fmt(t.out) + ' ฿</div></div>';
    if (c.claims) actions = '<button class="btn-md primary" data-act="open-claim" data-id="' + car.id + '">อัปเดตเงินเคลม</button>';
  } else if (mode === 'inspect') {
    pill = '<span class="pill-pay c-blue">รอตรวจงาน</span>';
    right = '<div class="claim-money"><div class="lbl">เงินเข้าแล้ว / ยอดเคลม</div>' +
            '<div class="val"><span style="color:var(--green)">' + fmt(t.recv) + '</span> / ' + fmt(t.total) + ' ฿</div></div>';
    if (c.claims) actions = '<span style="display:inline-flex;gap:8px">' +
      '<button class="btn-md ghost" data-act="open-claim" data-id="' + car.id + '">แก้ไข</button>' +
      '<button class="btn-md primary" data-act="inspect" data-id="' + car.id + '">ตรวจแล้ว</button></span>';
  } else {
    pill = '<span class="pill-pay c-green">รับครบแล้ว</span>';
    right = '<div class="claim-money"><div class="lbl">เงินเข้าแล้ว / ยอดเคลม</div>' +
            '<div class="val"><span style="color:var(--green)">' + fmt(t.recv) + '</span> / ' + fmt(t.total) + ' ฿</div></div>';
  }

  return '<div class="card card-pad"><div class="claim-card-head">' +
    '<span class="dot-lg" style="background:' + esc(colorHex(car.color)) + '"></span>' +
    '<div><div class="claim-title">' + esc(car.model) + ' <span>· ' + esc(car.submodel) + '</span></div>' +
      '<div class="claim-meta">VIN ' + esc(car.vin) + (car.releaseDate ? ' · ส่งมอบ ' + esc(car.releaseDate) + ' · ราคาขาย ' + fmt(car.sellPrice) + ' ฿' : ' · ' + esc(statusLabel(car.status)) + ' · ' + esc(car.location || '—')) + '</div>' +
      '<div class="claim-meta2">รหัสขาย <span style="font-weight:600">' + esc(car.salesCode) + '</span> · ลูกค้า <span style="font-weight:600">' + esc(car.customerName) + '</span></div></div>' +
    '<div style="flex:1"></div>' + right + pill + actions + deleteCarButton(car) + '</div>' +
    '<div class="claim-items">' + claimItemRows(car.claims) + '</div></div>';
}

// ---------- Claim subtabs and non-vehicle claim cards ----------
function claimScopeTabs(page, vehicleCount, otherCount) {
  var active = S.claimScopes[page];
  return '<div class="claim-subtabs" role="tablist" aria-label="ประเภทเคลมเงิน">' +
    [{key:'vehicle',label:'เกี่ยวกับรถ',count:vehicleCount},{key:'other',label:'ไม่เกี่ยวกับรถ',count:otherCount}].map(function (item) {
      var on = active === item.key;
      return '<button id="claim-tab-' + page + '-' + item.key + '" class="claim-subtab' + (on ? ' on' : '') + '" role="tab" tabindex="' + (on ? '0' : '-1') + '" aria-selected="' + on + '" aria-controls="claim-panel-' + page + '" data-act="claim-scope" data-v="' + item.key + '">' +
        item.label + '<span class="claim-subtab-count">' + item.count + '</span></button>';
    }).join('') + '</div>';
}
function claimPanel(page, html) {
  return '<section id="claim-panel-' + page + '" role="tabpanel" aria-labelledby="claim-tab-' + page + '-' + S.claimScopes[page] + '">' + html + '</section>';
}
function otherClaimCard(ci, mode) {
  var received = isRecv(ci), c = can(), actions = '';
  if (c.claims && mode !== 'done') {
    actions = '<button class="btn-md ' + (mode === 'inspect' ? 'ghost' : 'primary') + '" data-act="open-other" data-id="' + ci.id + '">' + (mode === 'inspect' ? 'แก้ไข' : 'อัปเดตเงินเคลม') + '</button>';
    if (mode === 'inspect') actions += '<button class="btn-md primary" data-act="inspect-other" data-id="' + ci.id + '">ตรวจแล้ว</button>';
  }
  return '<div class="card card-pad"><div class="claim-card-head">' +
    '<div><div class="claim-title">' + esc(ci.detail) + '</div><div class="claim-meta2">ไม่เกี่ยวกับรถยนต์' +
      (received ? ' · รับเงิน ' + esc(ci.dateReceived) + ' · ' + esc(ci.bank || '—') : '') + '</div></div>' +
    '<div style="flex:1"></div><div class="claim-money"><div class="lbl">เงินเข้าแล้ว / ยอดเคลม</div>' +
    '<div class="val"><span style="color:var(--green)">' + fmt(received ? ci.amountReceived : 0) + '</span> / ' + fmt(ci.amount) + ' ฿</div></div>' +
    '<span class="pill-pay ' + (mode === 'done' ? 'c-green' : mode === 'inspect' ? 'c-blue' : 'c-amber') + '">' +
    (mode === 'done' ? 'ตรวจแล้ว' : mode === 'inspect' ? 'รอตรวจงาน' : 'รอรับเงิน') + '</span>' + actions + '</div></div>';
}
function claimList(rows, other, mode, empty) {
  return rows.length ? '<div class="stack">' + rows.map(function (item) { return other ? otherClaimCard(item, mode) : claimCard(item, mode); }).join('') + '</div>'
    : '<div class="card empty">' + empty + '</div>';
}

// ---------- 3. Claims ----------
function viewClaims(d) {
  var c = can(), other = S.claimScopes.claims === 'other';
  var head = '<div class="page-head"><div><h1 class="page">เคลมเงิน</h1>' +
    '<p class="sub">ติดตามยอดเงินเคลมและอัปเดตเงินที่ได้รับจริง</p></div><div style="flex:1"></div>' +
    (c.claims ? (other ? '<button class="btn btn-primary" data-act="open-other">+ เพิ่มรายการเคลมที่ไม่เกี่ยวกับรถ</button>' : '<button class="btn btn-primary" data-act="open-vehicle-claim">+ เพิ่มงานเคลมเกี่ยวกับรถ</button>') :
      !c.claims ? '<span class="readonly-pill">โหมดดูอย่างเดียว (Read-only)</span>' : '') + '</div>';
  var filters = '<div class="filters">' + searchBox('claims', S.claimQuery, other ? 'ค้นหารายละเอียด, บัญชีธนาคาร...' : 'ค้นหา VIN, รุ่นรถ...') +
    (other ? '' : selectBox('claimPay', S.claimPayFilter, 'สถานะเคลมทั้งหมด', [{value:'some',label:payLabel('some')},{value:'none',label:payLabel('none')}]) +
      selectBox('claimMonth', S.claimMonthFilter, 'ทุกเดือน (ส่งมอบ)', monthOptions()) + selectBox('claimYear', S.claimYearFilter, 'ทุกปี', d.releaseYears)) +
    clearBtn('clear-claim', other ? !!S.claimQuery.trim() : d.claimFiltered) + '</div>';
  var list = claimList(other ? d.otherPendingRows : d.claimCars, other, 'claims',
    (other ? !!S.claimQuery.trim() : d.claimFiltered) ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีรายการรอรับเงินเคลม');
  return '<div>' + head + claimScopeTabs('claims', d.deliveredPending.length, d.otherPending.length) + claimPanel('claims', filters + list) + '</div>';
}

// ---------- 4. Inspect ----------
function viewInspect(d) {
  var other = S.claimScopes.inspect === 'other';
  var head = '<div class="page-head-simple"><h1 class="page">ตรวจงาน</h1><p class="sub">รายการที่รับเงินแล้ว รอตรวจสอบก่อนปิดงาน</p></div>';
  var filters = '<div class="filters">' + searchBox('inspect', S.inspectQuery, other ? 'ค้นหารายละเอียด, บัญชีธนาคาร...' : 'ค้นหา VIN, รุ่นรถ...') + '</div>';
  return '<div>' + head + claimScopeTabs('inspect', d.awaitingInspect.length, d.otherInspect.length) + claimPanel('inspect', filters +
    claimList(other ? d.otherInspectRows : d.inspectCars, other, 'inspect', S.inspectQuery.trim() ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีรายการรอตรวจงาน')) + '</div>';
}

// ---------- 5. Claims done ----------
function viewClaimsDone(d) {
  var other = S.claimScopes.claimsdone === 'other';
  var head = '<div class="page-head-simple"><h1 class="page">เคลมเงินแล้ว</h1><p class="sub">รายการที่รับเงินและตรวจสอบเรียบร้อยแล้ว</p></div>';
  var filters = '<div class="filters">' + searchBox('claimsdone', S.claimsDoneQuery, other ? 'ค้นหารายละเอียด, บัญชีธนาคาร...' : 'ค้นหา VIN, รุ่นรถ...') +
    selectBox('claimsDoneMonth', S.claimsDoneMonthFilter, other ? 'ทุกเดือน (รับเงิน)' : 'ทุกเดือน (ส่งมอบ)', monthOptions()) +
    selectBox('claimsDoneYear', S.claimsDoneYearFilter, 'ทุกปี', other ? d.otherYears : d.releaseYears) + clearBtn('clear-claimsdone', d.claimsDoneFiltered) + '</div>';
  return '<div>' + head + claimScopeTabs('claimsdone', d.deliveredDone.length, d.otherDone.length) + claimPanel('claimsdone', filters +
    claimList(other ? d.otherDoneRows : d.claimsDoneCars, other, 'done', d.claimsDoneFiltered ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีรายการที่ตรวจสอบเรียบร้อยแล้ว')) + '</div>';
}
// ---------- 6. Transfers ----------
function viewTransfers(d) {
  var head = '<div class="page-head-simple"><h1 class="page">รถตัดขายให้ที่อื่น</h1>' +
    '<p class="sub">ประวัติการตัดโอนรถ (Archive) • ' + d.transferAll.length + ' คัน</p></div>';
  var filters = '<div class="filters">' + searchBox('transfers', S.transferQuery, 'ค้นหา VIN, รุ่นรถ, ปลายทาง...') +
    selectBox('transferModel', S.transferModelFilter, 'ทุกรุ่น', S.config.models) +
    clearBtn('clear-transfer', d.transferFiltered) + '</div>';
  var rows = d.transferCars.map(function (car) {
    return '<tr><td class="mono" style="font-weight:500;color:var(--text-2)">' + esc(car.vin) + '</td>' +
      '<td><div style="font-weight:600">' + esc(car.model) + '</div><div style="font-size:14px;color:var(--faint)">' + esc(car.submodel) + '</div></td>' +
      '<td><span style="display:inline-flex;align-items:center;gap:7px"><span class="dot" style="background:' + esc(colorHex(car.color)) + '"></span>' + esc(car.color) + '</span></td>' +
      '<td style="color:var(--muted)">' + esc(car.receiveDate) + '</td>' +
      '<td style="color:var(--text-2);font-weight:500">' + esc(car.transferDate) + '</td>' +
      '<td style="color:var(--text-2)">' + esc(car.transferTo) + '</td>' + (can().deleteCars ? '<td>'+deleteCarButton(car)+'</td>' : '') + '</tr>';
  }).join('');
  var table = '<div class="table-wrap"><div class="scroll-x"><table class="data" style="min-width:760px"><thead><tr>' +
    '<th>VIN no.</th><th>รุ่นรถ / รุ่นย่อย</th><th>สี</th><th>วันที่รับเข้า</th><th>วันที่ตัดขาย</th><th>ปลายทาง</th>' + (can().deleteCars ? '<th>จัดการ</th>' : '') +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (d.transferCars.length ? '' : '<div class="empty">' + (d.transferFiltered ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีประวัติการตัดขาย') + '</div>') + '</div>';
  return '<div>' + head + filters + table + '</div>';
}

// ------------------------------------------------------------
// Modal
// ------------------------------------------------------------
function optionList(list, val) {
  if (val && list.indexOf(val) < 0) list = [val].concat(list);
  return list.map(function (o) {
    return '<option value="' + esc(o) + '"' + (String(val) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>';
  }).join('');
}
// ตัวเลือกบัญชีธนาคาร — รายการมาจากชีต "บัญชีธนาคาร" ผ่าน config.banks
function bankOptions(selected) {
  var list = S.config.banks || [];
  var cur  = (selected === null || selected === undefined) ? '' : String(selected);
  var html = '<option value="">— ยังไม่ระบุ —</option>';
  if (!list.length) html += '<option value="" disabled>(ยังไม่ได้ตั้งค่าบัญชีธนาคาร)</option>';
  html += optionList(list, cur);
  // บัญชีที่เคยบันทึกไว้แต่ถูกลบ/แก้ชื่อในชีตแล้ว — คงไว้ไม่ให้ค่าเดิมหาย
  if (cur && list.map(String).indexOf(cur) < 0) {
    html += '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (ไม่มีในรายการแล้ว)</option>';
  }
  return html;
}
function fld(label, inner, required) {
  return '<label class="fld"><span>' + esc(label) +
         (required ? ' <span class="req">*</span>' : '') + '</span>' + inner + '</label>';
}
function inp(key, type, val, ph, extraClass, attrs) {
  return '<input data-k="form-' + key + '" data-in="form-' + key + '" type="' + type + '" value="' + esc(val) + '"' +
         (ph ? ' placeholder="' + esc(ph) + '"' : '') + (extraClass ? ' class="' + extraClass + '"' : '') + (attrs ? ' ' + attrs : '') + '>';
}

function matchingClaimCars() {
  var query = String(S.form.appliedCarSearch || '').trim().toLowerCase();
  return S.cars.filter(function (item) {
    if(item.status==='FloorPlan')return false;
    return !query || [item.vin,item.model,item.submodel,item.color,item.location,item.batteryNumber,item.frontMotorNumber].join(' ').toLowerCase().indexOf(query) >= 0;
  });
}
function selectedClaimCars() {
  var ids = S.form.claimCarIds || [];
  return S.cars.filter(function (item) { return ids.indexOf(item.id) >= 0; });
}
function claimCarLabel(item) {
  return '<strong>' + esc(item.vin) + '</strong><span>' + esc(item.model + ' · ' + item.submodel + ' · สี' + item.color) + '</span>' +
    '<small>' + esc(item.location || '—') + ' · ' + esc(statusLabel(item.status)) + '</small>';
}
function updateVehicleClaimSummary() {
  var count = (S.form.claimCarIds || []).length;
  document.querySelectorAll('[data-selected-car-count]').forEach(function (el) { el.textContent = count; });
  var total = document.querySelector('[data-vehicle-claim-total]');
  if (total) total.textContent = fmt((Number(S.form.amount) || 0) * count) + ' ฿';
}
function viewModal() {
  if (!S.modal) return '';
  var m = S.modal, f = S.form, meta = MODAL_META[m.type] || ['','','ยืนยัน','560px'];
  var car = m.carId ? carById(m.carId) : null;
  var carLine = car ? (car.model + ' · ' + car.submodel + ' · สี' + car.color + ' · VIN ' + car.vin) : '';
  if(m.floor)meta=[m.type==='add'?'เพิ่มรถใน Floor Plan':'แก้ไขรถใน Floor Plan','กรอกเท่าที่มีได้ ต้องครบทุกช่องก่อนย้ายเข้า Stock','บันทึก Floor Plan','680px'];
  if(m.type==='import-cars' && f.target==='floor')meta=['นำเข้า Floor Plan จาก CSV','เว้นข้อมูลที่ยังไม่มีได้ ตรวจ VIN ซ้ำก่อนนำเข้า','ยืนยันนำเข้า Floor Plan','1040px'];
  var body = '';

  if(m.type === 'delete-car') {
    body='<div class="car-line">'+esc(carLine)+'</div><p>ต้องการลบรถคันนี้ออกจากระบบหรือไม่?</p><p class="delete-car-warning">รายการเคลมที่เกี่ยวข้อง '+(car?(car.claims||[]).length:0)+' รายการจะถูกลบด้วย การลบนี้ไม่สามารถกู้คืนผ่านหน้าแอปได้</p><p class="sub">ระบบจะเก็บประวัติการลบไว้</p>';
  } else if(m.type === 'current-password') {
    body='<p class="sub">ตำแหน่ง: <strong>'+esc(ROLES[f.targetRole].label)+'</strong></p>'+(f.loading?'<p role="status">กำลังโหลด…</p>':f.currentPassword!=null?'<label class="fld">รหัสผ่านปัจจุบัน<input readonly autocomplete="off" type="'+(f.visible?'text':'password')+'" value="'+esc(f.currentPassword)+'"></label><button class="btn btn-outline" data-act="toggle-current-password">'+(f.visible?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน')+'</button>':'<p class="sub" role="status">'+esc(f.reason || 'ไม่มีรหัสผ่านที่แสดงได้')+'</p>');
  } else if(m.type === 'role-password') {
    body='<p class="sub">ตำแหน่ง: <strong>'+esc(ROLES[f.targetRole].label)+'</strong> · ยาว 8–128 ตัวอักษร</p>'+fld('รหัสผ่านใหม่',inp('password','password',f.password,'รหัสผ่านใหม่','','autocomplete="new-password" maxlength="128"'))+fld('ยืนยันรหัสผ่าน',inp('passwordConfirm','password',f.passwordConfirm,'กรอกรหัสผ่านอีกครั้ง','','autocomplete="new-password" maxlength="128"'))+'<p class="sub">เมื่อบันทึก ผู้ใช้ตำแหน่งนี้ต้องเข้าสู่ระบบใหม่</p>';
  } else if(m.type === 'promote-floor') {
    var missing=car?floorMissing(car):Object.keys(FLOOR_REQUIRED);
    body='<div class="car-line">'+esc(carLine)+'</div><p class="sub">'+(missing.length?'ยังไม่สามารถนำเข้า Stock ได้ กรุณาแก้ไขข้อมูลให้ครบ':'ข้อมูลครบแล้ว พร้อมย้ายเข้า Stock โดยใช้รถคันเดิม ไม่สร้างข้อมูลซ้ำ')+'</p><div class="floor-checklist">'+Object.keys(FLOOR_REQUIRED).map(function(key){return '<div class="'+(missing.indexOf(key)>=0?'csv-import-error':'')+'">'+(missing.indexOf(key)>=0?'○ ':'✓ ')+esc(FLOOR_REQUIRED[key])+': '+esc(car && car[key]!=null && car[key]!==''?car[key]:'ยังไม่ระบุ')+'</div>';}).join('')+'</div>'+(can().stock?'<button class="btn btn-outline" data-act="open-edit" data-id="'+m.carId+'">แก้ไขข้อมูลรถ</button>':'');
  } else if (m.type === 'import-cars') {
    var preview=f.preview;
    body='<div class="csv-import-tools"><a class="btn btn-outline" href="/stock-import-template.csv" download>ดาวน์โหลดแบบฟอร์ม CSV</a><label class="fld">เลือกไฟล์ CSV<input type="file" accept=".csv,text/csv" data-in="import-cars-file" aria-label="เลือกไฟล์ CSV"' + (f.loading ? ' disabled' : '') + '></label></div>' +
      '<p class="sub">สูงสุด 500 คัน / 200 KB · บันทึกเป็น CSV UTF-8 · วันที่ใช้ YYYY-MM-DD (ค.ศ.)</p>' +
      '<p class="sub">'+(f.target==='floor'?'นำเข้า Floor Plan: เว้นข้อมูลที่ยังไม่มีได้ทุกช่อง ใช้หัวคอลัมน์ตามแบบฟอร์ม':'ช่องบังคับ: vin, model, submodel, color, location, receiveDate')+' · รุ่น สี และสถานที่ที่กรอกต้องตรงกับหน้าตั้งค่า · status ใช้ Available หรือ Reserved (ว่าง = พร้อมขาย)</p>' +
      '<p class="sub">buyPrice = ราคาซื้อ (เว้นว่างได้), paymentDueDate = วันครบจ่าย, batteryNumber = รหัสแบตเตอรี่, frontMotorNumber = เลขมอเตอร์/เลขเครื่อง, manufactureYear = ปีผลิต · ตั้งคอลัมน์รหัสเป็นข้อความใน Excel เพื่อเก็บเลข 0 ด้านหน้า</p>' +
      '<div class="note">เพิ่มเฉพาะรถใหม่ ไม่เขียนทับ VIN เดิม หากมีข้อผิดพลาดจะยังไม่นำเข้าทั้งไฟล์</div>' +
      (f.fileName ? '<p class="sub">ไฟล์: '+esc(f.fileName)+'</p>' : '') +
      (f.loading ? '<p role="status">กำลังตรวจข้อมูล…</p>' : '') +
      (f.error ? '<p class="csv-import-error" role="alert">'+esc(f.error)+'</p>' : '');
    if(preview)body+='<div class="csv-import-summary" role="status">ทั้งหมด <strong>'+preview.total+'</strong> คัน · ผ่าน <strong>'+preview.valid+'</strong> · ต้องแก้ไข <strong>'+preview.invalid+'</strong></div><div class="scroll-x csv-import-preview"><table class="data"><thead><tr><th>แถว</th><th>VIN</th><th>รุ่น / รุ่นย่อย</th><th>สี / สถานที่</th><th>ราคาซื้อ</th><th>วันที่รับ / ครบจ่าย</th><th>ผลตรวจ</th></tr></thead><tbody>'+preview.rows.map(function(row){var p=row.payload;return '<tr><td>'+row.line+'</td><td class="mono">'+esc(p.vin)+'</td><td>'+esc(p.model)+'<br>'+esc(p.submodel)+'</td><td>'+esc(p.color)+'<br>'+esc(p.location)+'</td><td>'+(p.buyPrice==null||p.buyPrice===''?'ไม่ระบุ':esc(fmt(p.buyPrice)))+'</td><td>'+esc(p.receiveDate)+'<br>'+esc(p.paymentDueDate||'—')+'</td><td class="'+(row.errors.length?'csv-import-error':'')+'">'+(row.errors.length?row.errors.map(esc).join('<br>'):'พร้อมนำเข้า')+'</td></tr>';}).join('')+'</tbody></table></div>';
  } else if (m.type === 'dashboard-group') {
    var group = S.dashboardDrill, grouped = dashboardDrillCars();
    var groupAge = group && group.age ? AGE_BUCKETS.find(function (b) { return b.key === group.age; }) : null;
    var groupLabel = groupAge ? 'อายุรถ ' + groupAge.label + ' (' + groupAge.min + (groupAge.max === Infinity ? ' วันขึ้นไป)' : '–' + groupAge.max + ' วัน)') : (group ? [group.model,group.submodel,group.color ? 'สี' + group.color : ''].filter(Boolean).join(' · ') : 'รถตามตัวกรอง');
    body = '<div class="car-line">' + esc(groupLabel) + ' · <strong>' + grouped.length + ' คัน</strong></div><div class="dashboard-car-list">' + grouped.map(function (item) {
      var sm = statusMeta(item.status);
      return '<button class="dashboard-car-row" data-act="open-dashboard-car" data-id="' + item.id + '"><span><strong>' + esc(item.model + ' · ' + item.submodel) + '</strong><span class="mono">VIN ' + esc(item.vin) + '</span><span>' + esc(item.color + ' · ' + item.location) + ' · ครบจ่าย ' + esc(item.paymentDueDate || 'ยังไม่ระบุ') + '</span></span><span><span class="pill ' + sm[1] + '">' + esc(sm[0]) + '</span><span class="dashboard-car-row-age">' + ageTag(daysSince(item.receiveDate)) + '</span></span><span aria-hidden="true">→</span></button>';
    }).join('') + (grouped.length ? '' : '<div class="empty">ไม่มีรถกลุ่มนี้ในสต๊อกตามตัวกรองแล้ว</div>') + '</div>';
  } else if (m.type === 'dashboard-car') {
    if (!car) body = '<div class="empty">ไม่พบข้อมูลรถ</div>';
    else {
      var sm = statusMeta(car.status), age = daysSince(car.receiveDate);
      var fields = [['VIN',car.vin],['รุ่นรถ',car.model],['รุ่นย่อย',car.submodel],['สี',car.color],['สถานที่',car.location],['ปีผลิต',car.manufactureYear],['วันที่รับเข้า',car.receiveDate],['อายุสต๊อก',age === null ? '' : age + ' วัน'],['วันครบกำหนดจ่าย',car.paymentDueDate],['ราคาซื้อ',car.buyPrice == null || car.buyPrice === '' ? '' : fmt(car.buyPrice) + ' ฿'],['Battery number/code',car.batteryNumber],['เลขมอเตอร์/เลขเครื่อง',car.frontMotorNumber],['เลขเครื่องยนต์',car.engineNumber],['เลขมอเตอร์หลัง',car.rearMotorNumber]];
      var manageActions = can().stock && (car.status === 'Available' || car.status === 'Reserved') ? '<div class="dashboard-manage-actions"><button class="btn btn-primary" data-act="open-edit" data-id="' + car.id + '">แก้ไขข้อมูลรถ</button><button class="btn btn-outline" data-act="open-transfer" data-id="' + car.id + '">ตัดขายให้ที่อื่น</button><button class="btn btn-primary" data-act="open-deliver" data-id="' + car.id + '">ส่งมอบลูกค้า</button></div>' : '';
      body = '<div class="car-line"><strong>' + esc(car.model + ' · ' + car.submodel) + '</strong> <span class="pill ' + sm[1] + '">' + esc(sm[0]) + '</span></div>' + manageActions + '<dl class="dashboard-car-details">' + fields.map(function (field) { return '<div><dt>' + esc(field[0]) + '</dt><dd>' + esc(field[1] || 'ไม่ระบุ') + '</dd></div>'; }).join('') + '</dl>';
    }
  } else if (m.type === 'select-claim-car') {
    var results = matchingClaimCars(), selected = f.claimCarIds || [];
    body = '<div class="claim-car-search">' + fld('ค้นหารถ', inp('carSearch','search',f.carSearch,'ค้นหา VIN, รุ่นรถ, สี, สถานที่...')) +
      '<button class="btn btn-primary" data-act="search-claim-cars">ค้นหา</button></div>' +
      '<div class="claim-car-tools"><span>พบ ' + results.length + ' คัน · เลือกแล้ว <strong data-selected-car-count>' + selected.length + '</strong> คัน</span>' +
      '<div><button class="btn-sm ghost" data-act="select-claim-results">เลือกทั้งหมดที่ค้นพบ</button><button class="btn-sm ghost" data-act="clear-claim-selection">ล้างการเลือก</button></div></div>' +
      '<div class="claim-car-list" role="group" aria-label="เลือกรถที่ต้องการเพิ่มงานเคลม">' + results.map(function (item) {
        return '<label class="claim-car-option"><input type="checkbox" data-in="claim-car-selection" data-id="' + item.id + '"' +
          (selected.indexOf(item.id) >= 0 ? ' checked' : '') + '><span>' + claimCarLabel(item) + '</span></label>';
      }).join('') + (results.length ? '' : '<div class="empty">' + (S.cars.length ? 'ไม่พบรถที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลรถ กรุณาเพิ่มรถในสต๊อกก่อน') + '</div>') + '</div>' +
      '<p class="sub">เลือกข้ามการค้นหาได้ รายละเอียดและยอดเคลมจะใช้เหมือนกันกับทุกคันที่เลือก</p>';
  } else if (m.type === 'add-vehicle-claim') {
    var selectedCars = selectedClaimCars();
    body = '<div class="claim-car-tools"><strong>รถที่เลือก ' + selectedCars.length + ' คัน</strong></div><div class="claim-car-list claim-car-review">' +
      selectedCars.map(function (item) { return '<div class="claim-car-option"><span>' + claimCarLabel(item) + '</span></div>'; }).join('') + '</div>' +
      '<div class="form-grid" style="margin-top:20px">' + fld('รายละเอียดการเคลม (เหมือนกันทุกคัน)', inp('detail','text',f.detail,'เช่น เงินสนับสนุนการขาย / ค่าอะไหล่','', 'maxlength="240"'), true) +
      fld('ยอดเงินเคลมต่อคัน (บาท)', inp('amount','number',f.amount,'0','', 'min="0.01" step="0.01"'), true) + '</div>' +
      '<div class="sum-bar"><span>รวม <strong>' + selectedCars.length + '</strong> คัน × ยอดเคลมต่อคัน</span><strong data-vehicle-claim-total>' + fmt((Number(f.amount) || 0) * selectedCars.length) + ' ฿</strong></div>';
  } else if (m.type === 'add' || m.type === 'edit') {
    body = '<div class="form-grid">' +
      fld('รุ่นรถ', '<select data-k="form-model" data-in="form-model">' + (m.floor?'<option value="">ยังไม่ระบุ</option>':'') + optionList(S.config.models, f.model) + '</select>') +
      fld('รุ่นย่อย (Sub-model)', inp('submodel','text',f.submodel,'เช่น Extended Range'), !m.floor) +
      fld('สี', '<select data-k="form-color" data-in="form-color">' + (m.floor?'<option value="">ยังไม่ระบุ</option>':'') + optionList(S.config.colors, f.color) + '</select>') +
      fld('Location', '<select data-k="form-location" data-in="form-location">' + (m.floor?'<option value="">ยังไม่ระบุ</option>':'') + optionList(S.config.locations, f.location) + '</select>') +
      fld('VIN no.', '<input class="mono" data-k="form-vin" data-in="form-vin" value="' + esc(f.vin) + '" placeholder="LGXCE4CB...">', !m.floor) +
      fld('Battery number/code', inp('batteryNumber','text',f.batteryNumber,'หมายเลขหรือรหัสแบตเตอรี่','mono','maxlength="120"')) +
      fld('เลขมอเตอร์/เลขเครื่อง', inp('frontMotorNumber','text',f.frontMotorNumber,'หมายเลขมอเตอร์/เลขเครื่อง','mono','maxlength="120"')) +
      fld('ปีผลิต (ค.ศ. / พ.ศ.)', inp('manufactureYear','text',f.manufactureYear,'เช่น 2026 หรือ 2569','','inputmode="numeric" maxlength="4" pattern="[0-9]{4}"')) +
      fld('ราคาซื้อ (บาท)', inp('buyPrice','number',f.buyPrice,'0')) +
      fld('สถานะ', '<select data-k="form-status" data-in="form-status">' +
        '<option value="Available"' + (f.status === 'Available' ? ' selected' : '') + '>' + esc(statusLabel('Available')) + '</option>' +
        '<option value="Reserved"'  + (f.status === 'Reserved'  ? ' selected' : '') + '>' + esc(statusLabel('Reserved')) + '</option></select>') +
      fld('วันที่รับ', inp('receiveDate','date',f.receiveDate,'')) +
      fld(m.floor?'วันครบจ่ายเงิน (ต้องกรอกก่อนเข้า Stock)':'วันครบจ่ายเงิน (ไม่บังคับ)', inp('paymentDueDate','date',f.paymentDueDate,'')) +
      '</div>';

  } else if (m.type === 'transfer') {
    body = '<div class="car-line">' + esc(carLine) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:14px">' +
        fld('วันที่ตัดขาย', inp('transferDate','date',f.transferDate,''), true) +
        fld('หมายเหตุ / ปลายทางที่ตัดขาย', inp('transferTo','text',f.transferTo,'เช่น สาขาเชียงใหม่ / ดีลเลอร์ XYZ')) +
        '<div class="note">เมื่อยืนยัน รถจะถูกย้ายออกจากสต๊อกไปยังแท็บ "รถตัดขายให้ที่อื่น" และเปลี่ยนสถานะเป็น Transferred</div>' +
      '</div>';

  } else if (m.type === 'deliver') {
    var rows = (f.claims || []).map(function (ci, i) {
      return '<div class="row-inline" data-claim-index="' + i + '">' +
        '<input class="detail" data-k="claim-' + i + '-detail" data-in="claim-' + i + '-detail" value="' + esc(ci.detail) + '" placeholder="รายละเอียดเงินเคลม เช่น ส่วนลดโรงงาน">' +
        '<input class="amount" type="number" data-k="claim-' + i + '-amount" data-in="claim-' + i + '-amount" value="' + esc(ci.amount) + '" placeholder="ยอด (บาท)">' +
        '<button class="btn-del" data-act="remove-claim" data-idx="' + i + '">×</button></div>';
    }).join('');
    body = '<div class="car-line">' + esc(carLine) + '</div>' +
      '<div class="form-grid" style="margin-bottom:18px">' +
        fld('รหัสขาย (Sales Code)', '<input class="mono" data-k="form-salesCode" data-in="form-salesCode" value="' + esc(f.salesCode) + '" placeholder="เช่น SC-2607-014">', true) +
        fld('ชื่อลูกค้า (Customer Name)', inp('customerName','text',f.customerName,'ชื่อ-นามสกุลลูกค้า'), true) +
        fld('วันที่ปล่อย (ส่งมอบ)', inp('releaseDate','date',f.releaseDate,''), true) +
        fld('ราคาขาย (บาท)', inp('sellPrice','number',f.sellPrice,'0'), true) +
      '</div>' +
      '<div style="display:flex;align-items:center;margin-bottom:10px">' +
        '<div style="font-size:15px;font-weight:600">รายการเงินเคลม</div><div style="flex:1"></div>' +
        '<button class="btn-sm soft" data-act="add-claim">+ เพิ่มรายการ</button></div>' +
      '<div data-claim-list style="display:flex;flex-direction:column;gap:9px">' + rows + '</div>' +
      '<div class="note" style="margin-top:14px">เมื่อยืนยัน รถจะย้ายไปแท็บ "เคลมเงิน" เพื่อติดตามการรับเงินต่อไป</div>';

  } else if (m.type === 'claim' || m.type === 'other') {
    var items = (f.claims || []).map(function (ci, i) {
      var paid = isRecv(ci);
      var isNew = !ci.id;
      var amountCell = isNew
        ? '<input style="width:110px;padding:8px 9px;border:1px solid var(--input-border);border-radius:7px;font-size:14px" type="number" data-k="claim-' + i + '-amount" data-in="claim-' + i + '-amount" value="' + esc(ci.amount) + '" placeholder="ยอด (บาท)">'
        : '<span style="font-size:14px;color:var(--muted);white-space:nowrap">ตั้งไว้ ' + fmt(ci.amount) + ' ฿</span>';
      var delCell = isNew ? '<button class="btn-del xs" data-act="remove-claim" data-idx="' + i + '">×</button>' : '';
      return '<div class="claim-edit' + (paid ? ' paid' : '') + '" data-claim-index="' + i + '">' +
        '<div class="claim-edit-top">' +
          '<label class="fld-sm" style="flex:1">รายละเอียดรายการเคลม' +
            '<input data-k="claim-' + i + '-detail" data-in="claim-' + i + '-detail" value="' + esc(ci.detail) + '" placeholder="รายละเอียดเงินเคลม"></label>' +
          amountCell +
          '<span data-claim-status class="pill-sm wide ' + (paid ? 'c-green' : 'c-amber') + '">' + (paid ? 'รับแล้ว' : 'รอรับ') + '</span>' +
          delCell +
        '</div>' +
        '<div class="claim-edit-bot">' +
          '<label class="fld-sm" style="width:140px">วันที่รับเงิน<input type="date" data-k="claim-' + i + '-dateReceived" data-in="claim-' + i + '-dateReceived" value="' + esc(ci.dateReceived) + '"></label>' +
          '<label class="fld-sm" style="width:130px">ยอดเงินที่รับ (บาท)<input type="number" data-k="claim-' + i + '-amountReceived" data-in="claim-' + i + '-amountReceived" value="' + esc(ci.amountReceived) + '" placeholder="0"></label>' +
          '<label class="fld-sm" style="flex:1;min-width:180px">บัญชีธนาคารที่เงินเข้า' +
            '<select data-k="claim-' + i + '-bank" data-in="claim-' + i + '-bank">' +
            bankOptions(ci.bank) + '</select></label>' +
        '</div></div>';
    }).join('');
    var recvTotal = (f.claims || []).filter(isRecv).reduce(function (a,x) { return a + (Number(x.amountReceived)||0); }, 0);
    var outTotal  = (f.claims || []).filter(function (x) { return !isRecv(x); }).reduce(function (a,x) { return a + (Number(x.amount)||0); }, 0);
    body = (m.type === 'other'
        ? '<div class="car-line">รายการเคลมที่ไม่ได้ผูกกับรถคันใดคันหนึ่ง — จะแสดงเป็นการ์ดแยกในแท็บเคลมเงิน และนับรวมในแดชบอร์ดเคลม</div>'
        : '<div class="car-line">' + esc(carLine) + '</div>') +
      '<div style="font-size:14px;color:var(--faint);margin-bottom:12px">แต่ละรายการเคลมผูกกับยอดเงินเข้าของตัวเอง — กรอกวันที่รับเงิน ยอดที่รับ และบัญชีที่เงินเข้าในรายการนั้นๆ</div>' +
      '<div style="display:flex;align-items:center;margin-bottom:10px"><div style="flex:1"></div>' +
        '<button class="btn-sm soft" data-act="add-claim">+ เพิ่มรายการเคลม</button></div>' +
      '<div data-claim-list style="display:flex;flex-direction:column;gap:12px">' + items + '</div>' +
      '<div class="sum-bar"><span>รับเงินแล้ว <span data-claim-total="received" style="font-weight:600;color:var(--green)">' + fmt(recvTotal) + ' ฿</span></span>' +
      '<span>คงเหลือรอรับ <span data-claim-total="pending" style="font-weight:600;color:var(--amber)">' + fmt(outTotal) + ' ฿</span></span></div>';
  }

  return '<div class="overlay" data-act="close-modal">' +
    '<div role="dialog" aria-modal="true" aria-labelledby="modal-title" class="modal' + (m.type === 'add' || m.type === 'edit' ? ' car-details-modal' : '') + '" style="width:' + meta[3] + '" data-stop="1">' +
      '<div class="modal-head"><div><div id="modal-title" class="modal-title">' + esc(meta[0]) + '</div>' +
        '<div class="modal-sub">' + esc(meta[1]) + '</div></div><div style="flex:1"></div>' +
      '<button class="modal-x" data-act="close-modal">✕</button></div>' +
      '<div class="modal-body">' + body + '<div id="modal-feedback" class="modal-feedback" role="alert"></div></div>' +
      '<div class="modal-foot">' + (m.type === 'dashboard-car' && m.fromGroup ? '<button class="btn btn-outline" data-act="back-dashboard-group">กลับไปรายชื่อรถ</button>' : '') + (m.returnTo ? '<button class="btn btn-outline" data-act="close-modal">กลับรายละเอียดรถ</button>' : '') + (m.type === 'add-vehicle-claim' ? '<button class="btn btn-outline" data-act="back-claim-car">ย้อนกลับ</button>' : '') + '<button class="btn btn-outline" data-act="close-modal">' + (m.type.indexOf('dashboard-') === 0 ? 'ปิด' : 'ยกเลิก') + '</button>' +
      (meta[2] ? '<button class="btn '+(m.type==='delete-car'?'btn-danger':'btn-primary')+'" data-act="confirm"' + ((m.type === 'import-cars' && (f.loading || !f.preview || f.preview.invalid || !f.preview.total)) || (m.type==='promote-floor' && missing.length) ? ' disabled' : '') + '>' + esc(meta[2]) + '</button>' : '') + '</div>' +
    '</div></div>';
}

// ------------------------------------------------------------
// Events
// ------------------------------------------------------------
var SEARCH_MAP = { floor:'floorQuery',stock:'stockQuery', claims:'claimQuery', transfers:'transferQuery',
                   claimsdone:'claimsDoneQuery', inspect:'inspectQuery' };
var FILTER_MAP = { stockStatus:'stockStatusFilter', stockLocation:'stockLocationFilter', stockSubmodel:'stockSubmodelFilter',stockColor:'stockColorFilter',stockYear:'stockYearFilter',
                   stockModel:'stockModelFilter', claimPay:'claimPayFilter',
                   claimMonth:'claimMonthFilter', claimYear:'claimYearFilter',
                   claimsDoneMonth:'claimsDoneMonthFilter', claimsDoneYear:'claimsDoneYearFilter',
                   transferModel:'transferModelFilter' };

// Patch derived receipt labels without replacing focused inputs or restarting modal animations.
function updateClaimFeedback(idx) {
  if (!S.modal || (S.modal.type !== 'claim' && S.modal.type !== 'other')) return;
  var overlay = document.getElementById('overlay-root');
  var row = overlay.querySelector('[data-claim-index="' + idx + '"]');
  var paid = isRecv(S.form.claims[idx]);
  if (row) {
    row.classList.toggle('paid', paid);
    var badge = row.querySelector('[data-claim-status]');
    if (badge) {
      badge.classList.toggle('c-green', paid);
      badge.classList.toggle('c-amber', !paid);
      badge.textContent = paid ? 'รับแล้ว' : 'รอรับ';
    }
  }
  var received = 0, pending = 0;
  S.form.claims.forEach(function (claim) {
    if (isRecv(claim)) received += Number(claim.amountReceived) || 0;
    else pending += Number(claim.amount) || 0;
  });
  var receivedLabel = overlay.querySelector('[data-claim-total="received"]');
  var pendingLabel = overlay.querySelector('[data-claim-total="pending"]');
  if (receivedLabel) receivedLabel.textContent = fmt(received) + ' ฿';
  if (pendingLabel) pendingLabel.textContent = fmt(pending) + ' ฿';
}

function onInputEvent(e) {
  if (_rendering) return;
  var el = e.target;
  var k = el && el.getAttribute && el.getAttribute('data-in');
  if (!k) return;
  var v = el.value;
  if(k==='login-role'){S.loginRole=v;return;}
  if (k === 'import-cars-file') { if(e.type === 'change') loadCarCSV(el.files && el.files[0]); return; }
  var dashboardKey = k.indexOf('filter-dash-') === 0 ? k.slice(12) : (k.indexOf('dash-') === 0 ? k.slice(5) : '');
  if (dashboardKey && Object.prototype.hasOwnProperty.call(S.dashboardFilters,dashboardKey)) {
    S.dashboardFilters[dashboardKey] = v;
    if (dashboardKey === 'model') S.dashboardFilters.submodel = '';
    if (dashboardKey === 'due' && v !== 'range') { S.dashboardFilters.dueFrom=''; S.dashboardFilters.dueTo=''; }
    render(); return;
  }
  if (k === 'latest-search') { S.latestQuery = v; render(); return; }
  if (k === 'claim-car-selection' && S.modal && S.modal.type === 'select-claim-car') {
    var carId = Number(el.getAttribute('data-id'));
    var selectedIds = S.form.claimCarIds || [];
    if (el.checked && selectedIds.indexOf(carId) < 0) selectedIds.push(carId);
    if (!el.checked) selectedIds = selectedIds.filter(function (id) { return id !== carId; });
    S.form.claimCarIds = selectedIds; updateVehicleClaimSummary(); return;
  }
  if (k.indexOf('setting-') === 0 && S.settingsDraft && ['admin','keeper','claim'].includes(S.role)) {
    var group = el.getAttribute('data-group');
    var index = Number(el.getAttribute('data-idx'));
    if (k === 'setting-value' && canSettingGroup(group) && S.settingsDraft[group]) S.settingsDraft[group][index] = v;
    else if (k === 'setting-color' && canSettingGroup('colors')) S.settingsColors[index] = v;
    else if (k === 'setting-status' && ['admin','keeper'].includes(S.role)) S.settingsDraft.statusLabels[el.getAttribute('data-key')] = v;
    else if (k === 'setting-pay' && S.role==='admin') S.settingsDraft.claimPayLabels[el.getAttribute('data-key')] = v;
    else if (k === 'setting-month' && S.role==='admin') S.settingsDraft.monthNames[index] = v;
    else return;
    markSettingsDirty(); return;
  }

  if (k.indexOf('search-') === 0) {
    var sk = SEARCH_MAP[k.slice(7)];
    if (sk) { S[sk] = v; render(); }
    return;
  }
  if (k.indexOf('filter-') === 0) {
    var fk = FILTER_MAP[k.slice(7)];
    if (fk) { S[fk] = v; if (fk === 'stockModelFilter') S.stockSubmodelFilter=''; render(); }
    return;
  }
  if (k.indexOf('form-') === 0) {
    S.form[k.slice(5)] = v;
    if (S.modal && S.modal.type === 'add-vehicle-claim' && k === 'form-amount') updateVehicleClaimSummary();
    return;
  }
  if (k.indexOf('claim-') === 0) {
    var seg = k.split('-');           // claim-<idx>-<field>
    var idx = Number(seg[1]);
    var field = seg.slice(2).join('-');
    if (!S.form.claims || !S.form.claims[idx]) return;
    S.form.claims[idx][field] = v;
    if (field === 'dateReceived' || field === 'amountReceived' || field === 'amount') updateClaimFeedback(idx);
    return;
  }
}

function addDraftClaim() {
  if (!S.modal || ['deliver','claim','other'].indexOf(S.modal.type) < 0) return;
  var list = document.querySelector('#overlay-root [data-claim-list]');
  if (!list) return;
  if (!S.form.claims) S.form.claims = [];
  var index = S.form.claims.length;
  S.form.claims.push({ detail:'', amount:'', dateReceived:'', amountReceived:'', bank:'' });
  // Render into an inert template, then insert only the new row. The live modal stays intact.
  var template = document.createElement('template');
  template.innerHTML = viewModal();
  list.appendChild(template.content.querySelector('[data-claim-index="' + index + '"]'));
  updateClaimFeedback(index);
}
function removeDraftClaim(index) {
  if (!S.modal || !S.form.claims || !S.form.claims[index]) return;
  if (S.modal.type !== 'deliver' && S.form.claims[index].id) return;
  var list = document.querySelector('#overlay-root [data-claim-list]');
  var row = list && list.querySelector('[data-claim-index="' + index + '"]');
  if (!row) return;
  S.form.claims.splice(index, 1);
  row.remove();
  Array.from(list.children).forEach(function (item, i) {
    item.setAttribute('data-claim-index', i);
    item.querySelectorAll('[data-in],[data-k]').forEach(function (input) {
      ['data-in','data-k'].forEach(function (attr) {
        var value = input.getAttribute(attr);
        if (value) input.setAttribute(attr, value.replace(/^claim-\d+-/, 'claim-' + i + '-'));
      });
    });
    var remove = item.querySelector('[data-act="remove-claim"]');
    if (remove) remove.setAttribute('data-idx', i);
  });
  updateClaimFeedback(0);
  var focusTarget = list.querySelector('[data-claim-index="' + Math.min(index,S.form.claims.length-1) + '"] input') || document.querySelector('#overlay-root [data-act="add-claim"]');
  if (focusTarget) focusTarget.focus({preventScroll:true});
}

function onClick(e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var el = t.closest('[data-act]');
  if (!el) return;
  var act = el.getAttribute('data-act');
  if (act.indexOf('open-') === 0) _returnFocus = '[data-act="' + act + '"]' + (el.hasAttribute('data-id') ? '[data-id="' + el.getAttribute('data-id') + '"]' : '');

  // คลิกพื้นหลัง modal เพื่อปิด (แต่ไม่ปิดเมื่อคลิกในกล่อง)
  if (act === 'close-modal' && el.classList.contains('overlay') && e.target !== el) return;

  var id = Number(el.getAttribute('data-id') || 0);
  var dashboardBack = S.modal && S.modal.type === 'dashboard-car' ? Object.assign({},S.modal) : null;

  switch (act) {
    case 'show-role-password': {
      if(S.sessionRole!=='admin' || S.role!=='admin')break;
      var currentForm={targetRole:el.getAttribute('data-v'),loading:true,currentPassword:null,visible:true,reason:''};
      S.modal={type:'current-password'};S.form=currentForm;render();
      api('revealRolePassword',{payload:{targetRole:currentForm.targetRole},role:'admin'}).then(function(result){
        if(S.form!==currentForm)return;
        currentForm.currentPassword=result.password;currentForm.reason=result.reason;currentForm.loading=false;render();
      }).catch(function(error){if(S.form!==currentForm)return;currentForm.reason=error.message;currentForm.loading=false;render();});break;
    }
    case 'toggle-current-password':
      if(S.modal && S.modal.type==='current-password'){S.form.visible=!S.form.visible;render();}break;
    case 'open-import-cars':
      if (!can().stock) break;
      S.modal={type:'import-cars'};S.form={target:S.tab==='floor'?'floor':'stock',csvText:'',fileName:'',preview:null,loading:false,error:''};render();break;
    case 'open-role-password':
      if(S.sessionRole!=='admin' || S.role!=='admin')break;
      S.modal={type:'role-password'};S.form={targetRole:el.getAttribute('data-v'),password:'',passwordConfirm:''};render();break;
    case 'open-promote-floor':
      if(!can().stock || !carById(id) || carById(id).status!=='FloorPlan')break;
      S.modal={type:'promote-floor',carId:id};S.form={};render();break;
    case 'toggle-dashboard-filters':
      S.dashboardFiltersOpen = !S.dashboardFiltersOpen; render(); break;
    case 'clear-dashboard':
      Object.keys(S.dashboardFilters).forEach(function (key) { S.dashboardFilters[key]=''; }); render(); break;
    case 'open-dashboard-group':
      S.dashboardDrill = {model:el.getAttribute('data-model'),submodel:el.getAttribute('data-submodel'),color:el.getAttribute('data-color')};
      S.modal = {type:'dashboard-group'}; S.form={}; render(); break;
    case 'open-dashboard-age':
      if (!AGE_BUCKETS.some(function (b) { return b.key === el.getAttribute('data-age'); })) break;
      S.dashboardDrill = {age:el.getAttribute('data-age')};
      S.modal = {type:'dashboard-group'}; S.form={}; render(); break;
    case 'open-dashboard-model':
      S.dashboardDrill = {model:el.getAttribute('data-model')};
      S.modal = {type:'dashboard-group'}; S.form={}; render(); break;
    case 'open-dashboard-car':
      if (!carById(id)) break;
      if (!S.modal || S.modal.type !== 'dashboard-group') S.dashboardDrill=null;
      S.modal = {type:'dashboard-car',carId:id,fromGroup:!!S.dashboardDrill}; S.form={}; render(); break;
    case 'back-dashboard-group':
      S.modal = {type:'dashboard-group'}; S.form={}; render(); break;
    case 'stock-scroll-left':
    case 'stock-scroll-right': {
      var stockViewport = document.querySelector('.stock-scroll-viewport');
      if (stockViewport) stockViewport.scrollBy({left:(act === 'stock-scroll-left' ? -1 : 1)*Math.max(240,stockViewport.clientWidth*.65),behavior:'auto'});
      break;
    }
    case 'view-other-pending':
      S.tab='claims'; S.claimScopes.claims='other'; S.claimQuery=''; S.claimPayFilter=''; S.claimMonthFilter=''; S.claimYearFilter=''; render(); break;
    case 'toggle-sidebar':
      S.sidebarOpen = !S.sidebarOpen; render();
      if (S.sidebarOpen) document.querySelector('nav.sidebar .nav-btn.on').focus();
      break;
    case 'close-sidebar':
      S.sidebarOpen=false; render(); document.querySelector('[data-act="toggle-sidebar"]').focus(); break;
    case 'view-stock':
      S.stockQuery = id ? carById(id).vin : ''; S.stockStatusFilter=''; S.stockModelFilter=''; S.stockLocationFilter=''; S.stockSubmodelFilter=''; S.stockColorFilter=''; S.stockYearFilter=''; S.tab='stock'; render(); break;
    case 'toggle-theme': window.CSMTheme.toggle(); break;
    case 'open-vehicle-claim':
      if (!can().claims) break;
      S.modal = { type:'select-claim-car' }; S.form = { claimCarIds:[], carSearch:'', appliedCarSearch:'', detail:'', amount:'' }; render(); break;
    case 'search-claim-cars':
      S.form.appliedCarSearch = S.form.carSearch || ''; render(); break;
    case 'select-claim-results':
      S.form.claimCarIds = Array.from(new Set((S.form.claimCarIds || []).concat(matchingClaimCars().map(function (item) { return item.id; })))); render(); break;
    case 'clear-claim-selection': S.form.claimCarIds = []; render(); break;
    case 'back-claim-car':
      S.modal = { type:'select-claim-car' }; render(); break;
    case 'claim-scope': {
      var scope = el.getAttribute('data-v');
      if (!Object.prototype.hasOwnProperty.call(S.claimScopes, S.tab) || ['vehicle','other'].indexOf(scope) < 0 || S.claimScopes[S.tab] === scope) break;
      S.claimScopes[S.tab] = scope;
      if (S.tab === 'claims') { S.claimQuery=''; S.claimPayFilter=''; S.claimMonthFilter=''; S.claimYearFilter=''; }
      if (S.tab === 'inspect') S.inspectQuery='';
      if (S.tab === 'claimsdone') { S.claimsDoneQuery=''; S.claimsDoneMonthFilter=''; S.claimsDoneYearFilter=''; }
      render();
      document.getElementById('claim-tab-' + S.tab + '-' + scope).focus();
      break;
    }
    case 'settings-save': saveSettings(); break;
    case 'settings-reload': call('refresh', {}, beginSettings); break;
    case 'setting-add':
    case 'setting-remove':
    case 'setting-up':
    case 'setting-down': {
      if (!S.settingsDraft) break;
      var group = el.getAttribute('data-group');
      if (!canSettingGroup(group) || !SETTING_GROUPS.some(function (g) { return g.key === group; })) break;
      var list = S.settingsDraft[group], index = Number(el.getAttribute('data-idx'));
      if (act === 'setting-add') {
        if (list.length >= 200) break;
        list.push(''); if (group === 'colors') S.settingsColors.push('#c3c8ce');
      } else if (act === 'setting-remove') {
        if (group !== 'banks' && list.length <= 1) break;
        list.splice(index, 1); if (group === 'colors') S.settingsColors.splice(index, 1);
      } else {
        var destination = index + (act === 'setting-up' ? -1 : 1);
        if (destination < 0 || destination >= list.length) break;
        var item = list[index]; list[index] = list[destination]; list[destination] = item;
        if (group === 'colors') { var hex = S.settingsColors[index]; S.settingsColors[index] = S.settingsColors[destination]; S.settingsColors[destination] = hex; }
      }
      markSettingsDirty(); render(); break;
    }
    case 'tab': {
      var wasDrawerOpen = S.sidebarOpen;
      S.tab = el.getAttribute('data-v'); S.sidebarOpen=false; render();
      if (wasDrawerOpen) document.querySelector('[data-act="toggle-sidebar"]').focus();
      break;
    }
    case 'role':  if(S.sessionRole!=='admin')break; S.role = el.getAttribute('data-v'); saveRole(S.role); S.modal = null; S.form = {}; render(); break;
    case 'refresh': doRefresh(); break;
    case 'logout': doLogout(); break;
    case 'retry-boot': S.bootError = ''; S.ready = false; render(); bootstrap(); break;

    case 'clear-stock':      S.stockQuery=''; S.stockStatusFilter=''; S.stockLocationFilter=''; S.stockModelFilter=''; S.stockSubmodelFilter=''; S.stockColorFilter=''; S.stockYearFilter=''; render(); break;
    case 'clear-claim':      S.claimQuery=''; S.claimPayFilter=''; S.claimMonthFilter=''; S.claimYearFilter=''; render(); break;
    case 'clear-claimsdone': S.claimsDoneQuery=''; S.claimsDoneMonthFilter=''; S.claimsDoneYearFilter=''; render(); break;
    case 'clear-transfer':   S.transferQuery=''; S.transferModelFilter=''; render(); break;

    case 'open-delete-car':
      if(!can().deleteCars || !carById(id))break;
      S.modal={type:'delete-car',carId:id};S.form={};render();break;

    case 'open-add':
      if(!can().stock)break;
      S.modal = { type:'add',floor:S.tab==='floor' };
      S.form = { model:S.config.models[0]||'', submodel:'', color:S.config.colors[0]||'',
                 location:S.config.locations[0]||'', vin:'', buyPrice:'', status:'Available', receiveDate:today(),
                 paymentDueDate:'', batteryNumber:'', frontMotorNumber:'', manufactureYear:'' };
      if(S.modal.floor){S.form.model='';S.form.color='';S.form.location='';S.form.receiveDate='';}
      render(); break;

    case 'open-edit': {
      var c = carById(id); if (!c) break;
      if (!can().stock || ['Available','Reserved','FloorPlan'].indexOf(c.status) < 0) break;
      S.modal = { type:'edit', carId:id, floor:c.status==='FloorPlan',returnTo:dashboardBack };
      S.form = { model:c.model, submodel:c.submodel, color:c.color, location:c.location,
                 vin:c.vin, buyPrice:c.buyPrice, status:c.stockStatus || c.status, receiveDate:c.receiveDate,
                 paymentDueDate:c.paymentDueDate||'', batteryNumber:c.batteryNumber||'',
                 frontMotorNumber:c.frontMotorNumber||'', manufactureYear:c.manufactureYear||'' };
      render(); break;
    }
    case 'open-transfer':
      if (!can().stock || !carById(id) || ['Available','Reserved'].indexOf(carById(id).status) < 0) break;
      S.modal = { type:'transfer', carId:id, returnTo:dashboardBack };
      S.form = { transferDate: today(), transferTo:'' };
      render(); break;

    case 'open-deliver':
      if (!can().stock || !carById(id) || ['Available','Reserved'].indexOf(carById(id).status) < 0) break;
      S.modal = { type:'deliver', carId:id, returnTo:dashboardBack };
      S.form = { salesCode:'', customerName:'', releaseDate:today(), sellPrice:'', claims:[{ detail:'', amount:'' }] };
      render(); break;

    case 'open-claim': {
      var cc = carById(id); if (!cc) break;
      S.modal = { type:'claim', carId:id };
      S.form = { claims: (cc.claims || []).map(function (x) {
        return { id:x.id, detail:x.detail, amount:x.amount, dateReceived:x.dateReceived,
                 amountReceived:x.amountReceived, bank:x.bank };
      }) };
      render(); break;
    }

    case 'open-other': {
      var oc = (S.otherClaims || []).filter(function (x) { return id && x.id === id; }).map(function (x) {
        return { id:x.id, detail:x.detail, amount:x.amount, dateReceived:x.dateReceived,
                 amountReceived:x.amountReceived, bank:x.bank };
      });
      // A specific record opens on its own; the add action starts with one blank row.
      if (!id) oc.push({ detail:'', amount:'', dateReceived:'', amountReceived:'', bank:'' });
      S.modal = { type:'other' };
      S.form = { claims: oc };
      render(); break;
    }

    case 'add-claim':
      addDraftClaim(); break;

    case 'remove-claim': {
      var i = Number(el.getAttribute('data-idx'));
      removeDraftClaim(i); break;
    }

    case 'inspect': doInspect(id); break;
    case 'inspect-other': call('markInspected', { carId:0, claimId:id, role:S.role }); break;
    case 'close-modal': closeModal(); render(); break;
    case 'confirm': doConfirm(); break;
  }
}

// ------------------------------------------------------------
// Server calls: same-origin Vercel API, no automatic mutation retry.
function requestJson(url, options) {
  return fetch(url, Object.assign({ credentials: 'same-origin' }, options)).then(function (res) {
    return res.json().catch(function () { throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (HTTP ' + res.status + ')'); });
  });
}
function requestId() { return crypto.randomUUID(); }

function api(action, extra) {
  var body = { action: action };
  if (action !== 'bootstrap' && action !== 'refresh') body.requestId = requestId();
  if (extra) for (var k in extra) body[k] = extra[k];
  return requestJson(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (data) {
    if (!data) throw new Error('ไม่ได้รับข้อมูลจากเซิร์ฟเวอร์');
    if (data.ok !== true) {
      var e = new Error(data.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์');
      e.code = data.error || '';
      throw e;
    }
    return data;
  });
}

function call(action, extra, onOk) {
  if (S.busy) return;
  S.busy = true; renderBusy();
  api(action, extra).then(function (res) {
    S.busy = false;
    S.updatedAt = Date.now();
    if (res.cars) S.cars = res.cars;
    if(res.rolePasswordStatus)S.rolePasswordStatus=res.rolePasswordStatus;
    if (res.otherClaims) S.otherClaims = res.otherClaims;
    if (res.config) {
      S.config = res.config; S.configRevision = res.configRevision || 0;
      if (S.settingsDraft && !S.settingsDirty && action !== 'saveConfig') beginSettings();
    }
    if (onOk) onOk(res);
    render();
    if (res.message) toast(res.message);
  }).catch(function (err) {
    S.busy = false;
    if (err && err.code === 'NEED_CODE') { lockOut(err.message); return; }
    render();
    toast(err && err.message ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', true);
  });
}

function doRefresh() { call('refresh', {}); }
function doInspect(id) { call('markInspected', { carId: id, role: S.role }); }

function doConfirm() {
  var m = S.modal, f = S.form;
  if (!m) return;
  if(m.type==='delete-car') {
    if(!can().deleteCars || !carById(m.carId) || S.busy)return;
    call('deleteCar',{carId:m.carId,role:'admin'},function(){S.modal=null;S.form={};});return;
  }
  if(m.type==='role-password') {
    if(f.password!==f.passwordConfirm)return toast('รหัสผ่านยืนยันไม่ตรงกัน',true);
    if(f.password.length<8 || f.password.length>128)return toast('รหัสผ่านต้องยาว 8–128 ตัวอักษร',true);
    var targetRole=f.targetRole;
    call('saveRolePassword',{payload:{targetRole:targetRole,password:f.password},role:'admin'},function(){closeModal();if(targetRole===S.sessionRole)lockOut('ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบอีกครั้ง');});return;
  }
  if(m.type==='promote-floor') {
    if(!can().stock || !carById(m.carId) || floorMissing(carById(m.carId)).length)return;
    call('promoteFloorCar',{carId:m.carId,role:S.role},closeModal);return;
  }
  if(m.type === 'import-cars') {
    if(!can().stock || f.loading || !f.preview || f.preview.invalid || !f.preview.total)return;
    call('importCars',{payload:{csv:f.csvText,target:f.target},role:S.role},closeModal);return;
  }
  if (m.type === 'select-claim-car') {
    var chosen = selectedClaimCars();
    if (!chosen.length || chosen.length !== (f.claimCarIds || []).length) return toast('กรุณาเลือกรถที่ต้องการเพิ่มงานเคลม', true);
    if (chosen.length > 500) return toast('เลือกได้สูงสุด 500 คันต่อครั้ง', true);
    S.modal = { type:'add-vehicle-claim' }; render(); return;
  }
  if (m.type === 'add-vehicle-claim') {
    if (!String(f.detail || '').trim() || !Number.isFinite(Number(f.amount)) || Number(f.amount) <= 0)
      return toast('กรุณาระบุรายละเอียดและยอดเงินเคลมที่มากกว่า 0', true);
    if (!selectedClaimCars().length) return toast('กรุณาเลือกรถที่ต้องการเพิ่มงานเคลม', true);
    call('addVehicleClaim', { carIds:f.claimCarIds.slice(), payload:{ detail:f.detail, amount:Number(f.amount) }, role:S.role }, function () {
      S.tab='claims'; S.claimScopes.claims='vehicle';
      S.claimQuery=''; S.claimPayFilter=''; S.claimMonthFilter=''; S.claimYearFilter=''; closeModal();
    });
    return;
  }

  if (m.type === 'add' || m.type === 'edit') {
    if (!m.floor && (!f.vin || !String(f.vin).trim() || !f.submodel || !String(f.submodel).trim())) {
      return toast('กรุณากรอก VIN และรุ่นย่อยให้ครบ', true);
    }
    var payload = { model:f.model, submodel:f.submodel, color:f.color, location:f.location,
                    vin:f.vin, buyPrice:f.buyPrice, status:f.status, receiveDate:f.receiveDate,
                    paymentDueDate:f.paymentDueDate, batteryNumber:f.batteryNumber,
                    frontMotorNumber:f.frontMotorNumber, manufactureYear:f.manufactureYear };
    if (m.type === 'add') call(m.floor?'addFloorCar':'addCar', { payload: payload, role: S.role }, closeModal);
    else                  call(m.floor?'updateFloorCar':'updateCar', { carId: m.carId, payload: payload, role: S.role }, closeModal);
    return;
  }

  if (m.type === 'transfer') {
    if (!f.transferDate) return toast('กรุณาระบุวันที่ตัดขาย', true);
    call('transferCar', { carId: m.carId, role: S.role,
      payload: { transferDate:f.transferDate, transferTo:f.transferTo } }, closeModal);
    return;
  }

  if (m.type === 'deliver') {
    if (!f.salesCode || !f.customerName || !f.releaseDate || !f.sellPrice) {
      return toast('กรุณากรอกรหัสขาย, ชื่อลูกค้า, วันที่ปล่อยและราคาขายให้ครบ', true);
    }
    var claims = (f.claims || []).filter(function (c) { return c.detail && Number(c.amount) > 0; })
                                 .map(function (c) { return { detail:c.detail, amount:Number(c.amount) }; });
    call('deliverCar', { carId: m.carId, role: S.role,
      payload: { salesCode:f.salesCode, customerName:f.customerName, releaseDate:f.releaseDate,
                 sellPrice:f.sellPrice, claims:claims } }, closeModal);
    return;
  }

  if (m.type === 'claim' || m.type === 'other') {
    var list = (f.claims || []).filter(function (c) { return c.id || c.detail || Number(c.amount) > 0; })
      .map(function (c) {
        return { id:c.id || '', detail:c.detail || '', amount:Number(c.amount) || 0,
                 dateReceived:c.dateReceived || '',
                 amountReceived:(c.amountReceived === '' || c.amountReceived === null || c.amountReceived === undefined)
                                ? '' : Number(c.amountReceived),
                 bank:c.bank || '' };
      });
    // carId = 0 หมายถึงรายการเคลมที่ไม่ผูกกับรถ (ฝั่ง Vercel ข้ามการตรวจหารถให้)
    call('saveClaims', { carId: (m.type === 'other' ? 0 : m.carId), claims: list, role: S.role }, closeModal);
    return;
  }
}

function closeModal() {
  var back = S.modal && S.modal.returnTo;
  S.modal = back || null; S.form = {}; _restoreFocus = !back;
}

async function loadCarCSV(file) {
  if(!file || !S.modal || S.modal.type !== 'import-cars')return;
  var form=S.form;
  form.csvText='';form.preview=null;form.error='';form.fileName=file.name;form.loading=true;render();
  try {
    if(!/\.csv$/i.test(file.name) || file.size>200*1024)throw new Error('กรุณาเลือกไฟล์ .csv ขนาดไม่เกิน 200 KB');
    var text;
    try {text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
    catch(error){throw new Error('อ่านภาษาในไฟล์ไม่ได้ กรุณาบันทึกเป็น CSV UTF-8');}
    var result=await api('previewImportCars',{payload:{csv:text,target:form.target},role:S.role});
    if(S.form!==form)return;
    form.csvText=text;form.preview=result;
  } catch(error) {if(S.form===form)form.error=error.message || 'อ่านไฟล์ CSV ไม่สำเร็จ';}
  finally {if(S.form===form){form.loading=false;render();}}
}

// ------------------------------------------------------------
// เข้าสู่ระบบด้วย cookie อายุ 12 ชั่วโมง
// ------------------------------------------------------------
function readCode() { return ''; }
function saveCode() { try { window.localStorage.removeItem('csm_code'); } catch (e) {} }

function viewLogin() {
  return '<div class="login-wrap">' + glassScene('login-orbs') + window.CSMTheme.button('login-theme-toggle') + '<form class="login-card" id="loginForm">' +
    '<div class="login-brand"><img src="/pijithet-logo.png" alt="PIJITPHET MOTOR CAR" width="250" height="159"></div>' +
    '<div class="login-eyebrow"><span></span> STOCK WORKSPACE</div>' +
    '<div class="login-title">ระบบจัดการสต๊อกรถยนต์</div>' +
    '<div class="login-sub">ดูแลสต๊อกและติดตามเงินเคลมในพื้นที่เดียว</div>' +
    '<label class="login-field">ตำแหน่ง<select data-in="login-role" aria-label="ตำแหน่งเข้าสู่ระบบ">'+Object.keys(ROLES).map(function(role){return '<option value="'+role+'"'+(S.loginRole===role?' selected':'')+'>'+esc(ROLES[role].label)+'</option>';}).join('')+'</select></label>' +
    '<label class="login-field">รหัสเข้าใช้งาน' +
      '<input id="pinInput" type="password" autocomplete="current-password" placeholder="กรอกรหัสเข้าใช้งาน"' +
      (S.loginBusy ? ' disabled' : '') + '></label>' +
    (S.loginError ? '<div class="login-err">' + esc(S.loginError) + '</div>' : '') +
    '<button class="btn btn-primary login-btn" type="submit"' + (S.loginBusy ? ' disabled' : '') + '>' +
      (S.loginBusy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ') + '</button>' +
    '<div class="login-foot"><span class="secure-dot"></span> พื้นที่ทำงานสำหรับทีมของคุณ</div>' +
  '</form></div>';
}

function submitLogin(e) {
  if (e) e.preventDefault();
  if (S.loginBusy) return;
  var el = document.getElementById('pinInput');
  var code = el ? el.value : '';
  if (!code) { S.loginError = 'กรุณากรอกรหัสเข้าใช้งาน'; render(); return; }
  S.loginBusy = true; S.loginError = ''; render();
  requestJson('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: code,role:S.loginRole }) }).then(function (res) {
    if (!res.ok) throw new Error(res.message || 'เข้าสู่ระบบไม่สำเร็จ');
    return api('bootstrap');
  }).then(function (res) {
    S.loginBusy = false;
    saveCode();
    applyBootstrap(res);
  }).catch(function (err) {
    S.loginBusy = false;
    S.accessCode = '';
    S.loginError = (err && err.message) ? err.message : 'เข้าสู่ระบบไม่สำเร็จ';
    render();
  });
}

function lockOut(msg) {
  S.settingsDraft = null; S.settingsDirty = false;
  S.authed = false; S.ready = false; S.cars = []; S.otherClaims = []; S.modal = null; S.form = {};
  S.accessCode = ''; saveCode('');
  S.loginError = msg || ''; S.busy = false; S.loginBusy = false;
  render();
}

function doLogout() {
  requestJson('/api/login', { method: 'DELETE' }).then(function (res) {
    if (!res.ok) throw new Error(res.message || 'ออกจากระบบไม่สำเร็จ');
    lockOut('ออกจากระบบแล้ว');
  }).catch(function (err) { toast(err.message, true); });
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
function applyBootstrap(res) {
  S.sessionRole=res.sessionRole || 'admin';S.role=S.sessionRole;
  S.rolePasswordStatus=res.rolePasswordStatus || {};
  S.codeRequired = !!res.accessCodeRequired;
  S.authed = true;
  S.ready = true;
  S.bootError = '';
  S.config = res.config;
  S.configRevision = res.configRevision || 0;
  S.cars = res.cars || [];
  S.otherClaims = res.otherClaims || [];
  S.updatedAt = Date.now();
  render();
}

function bootstrap() {
  api('bootstrap').then(applyBootstrap).catch(function (err) {
    if (err && err.code === 'NEED_CODE') {
      S.authed = false; S.ready = false; S.accessCode = '';
      S.loginError = S.loginError || '';
      render();
      return;
    }
    S.bootError = err && err.message ? err.message : String(err);
    S.ready = true;
    render();
  });
}

function boot() {
  S.role = readRole();
  saveCode();
  document.addEventListener('input', onInputEvent);
  document.addEventListener('change', onInputEvent);
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (S.modal) { closeModal(); render(); e.preventDefault(); return; }
      if (S.sidebarOpen) { S.sidebarOpen=false; render(); document.querySelector('[data-act="toggle-sidebar"]').focus(); e.preventDefault(); return; }
    }
    if (e.key === 'Tab' && (S.modal || (S.sidebarOpen && window.matchMedia('(max-width:767px)').matches))) {
      var region = document.querySelector(S.modal ? '#overlay-root .modal' : 'nav.sidebar');
      var focusable = Array.from(region.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,summary,[tabindex="0"]')).filter(function (node) { return node.getClientRects().length; });
      var first = focusable[0], last = focusable[focusable.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.key === 'Enter' && e.target.getAttribute('data-in') === 'form-carSearch') {
      e.preventDefault(); S.form.appliedCarSearch = S.form.carSearch || ''; render(); return;
    }
    if (!e.target.closest || !e.target.closest('.claim-subtab')) return;
    if (['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key) < 0) return;
    e.preventDefault();
    var scope = e.key === 'Home' ? 'vehicle' : e.key === 'End' ? 'other' : S.claimScopes[S.tab] === 'vehicle' ? 'other' : 'vehicle';
    document.getElementById('claim-tab-' + S.tab + '-' + scope).click();
  });
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'loginForm') submitLogin(e);
  });
  bootstrap();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();

