// Storage gateway. The table codec is bundled below by scripts/build-sheets.mjs.
function doPost(e) {
 var lock=LockService.getScriptLock();
 try {
  var b=JSON.parse(e.postData.contents), p=PropertiesService.getScriptProperties(), token=p.getProperty('SHEETS_API_TOKEN');
  if(!token || token.length<32 || b.token!==token) return out_({ok:false,status:403,message:'Forbidden'});
  if(!lock.tryLock(8000)) return out_({ok:false,status:503,message:'Database busy'});
  var book=SpreadsheetApp.openById(p.getProperty('SPREADSHEET_ID'));
  if(b.operation==='setup') {
   var system=book.getSheetByName('ระบบ');
   if(!system || !system.getLastRow()) {
    var legacy=book.getSheetByName('Database');
    if(legacy && legacy.getLastRow()) throw Error('Migrate legacy Database before setup');
    save_(book,encodeTables({state:b.state,receipts:[],audit:[],attempts:[]},0));
   }
   return out_({ok:true});
  }
  var names=Object.keys(encodeTables({state:{cars:[],otherClaims:[],config:{},roleCredentials:{}},audit:[],receipts:[],attempts:[]},0));
  var tables={};names.forEach(function(name){var sheet=book.getSheetByName(name);if(!sheet)throw Error('Missing table '+name);tables[name]=sheet.getDataRange().getValues();});
  var current=decodeTables(tables);
  var digest=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(tables)));
  var revision=String(current.revision)+':'+digest;
  if(b.operation==='read') return out_({ok:true,revision:revision,document:current.document});
  if(b.operation!=='commit') return out_({ok:false,status:400,message:'Unknown operation'});
  if(b.revision!==revision) return out_({ok:false,status:409,code:'REVISION_CONFLICT',message:'Revision conflict'});
  var encoded=encodeTables(b.document,current.revision+1);
  decodeTables(encoded);
  save_(book,encoded);
  return out_({ok:true});
 } catch(error) {console.error(error.message);return out_({ok:false,status:503,message:'Google Sheets storage unavailable; check Apps Script configuration'});}
 finally {if(lock.hasLock())lock.releaseLock();}
}
function out_(v){return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}
function save_(book,tables){
 var requests=[], existing={};book.getSheets().forEach(function(s){existing[s.getName()]=s;});
 Object.keys(tables).forEach(function(name,index){
  var rows=tables[name],s=existing[name],id=s?s.getSheetId():100000+index;
  if(!s) requests.push({addSheet:{properties:{sheetId:id,title:name,gridProperties:{rowCount:Math.max(1000,rows.length),columnCount:Math.max(26,rows[0].length),frozenRowCount:1}}}});
  else {
   if(rows.length>s.getMaxRows())requests.push({appendDimension:{sheetId:id,dimension:'ROWS',length:rows.length-s.getMaxRows()}});
   if(rows[0].length>s.getMaxColumns())requests.push({appendDimension:{sheetId:id,dimension:'COLUMNS',length:rows[0].length-s.getMaxColumns()}});
  }
  var end=s?Math.max(rows.length,s.getLastRow()):rows.length;
  requests.push({updateCells:{range:{sheetId:id,startRowIndex:0,endRowIndex:end,startColumnIndex:0,endColumnIndex:s?Math.max(rows[0].length,s.getLastColumn()):rows[0].length},rows:rows.map(function(r){return {values:r.map(function(v){return {userEnteredValue:typeof v==='number'?{numberValue:v}:typeof v==='boolean'?{boolValue:v}:{stringValue:String(v)}};})};}),fields:'userEnteredValue'}});
 });
 Sheets.Spreadsheets.batchUpdate({requests:requests},book.getId());
}

// Also bundled verbatim into Apps Script by scripts/build-sheets.mjs.
const TABLE_LABELS = {id:'รหัส',vin:'เลขตัวถัง',model:'รุ่น',submodel:'รุ่นย่อย',color:'สี',location:'สถานที่',buyPrice:'ราคาทุน',sellPrice:'ราคาขาย',receiveDate:'วันที่รับเข้า',status:'สถานะ',paymentDueDate:'วันครบกำหนด',batteryNumber:'เลขแบตเตอรี่',frontMotorNumber:'เลขมอเตอร์หน้า',rearMotorNumber:'เลขมอเตอร์หลัง',manufactureYear:'ปีผลิต',salesCode:'รหัสฝ่ายขาย',customerName:'ลูกค้า',releaseDate:'วันส่งมอบ',inspected:'ตรวจแล้ว',transferDate:'วันโอน',transferTo:'ปลายทาง',carId:'รหัสรถ',detail:'รายละเอียด',amount:'ยอดเคลม',dateReceived:'วันรับเงิน',amountReceived:'ยอดรับแล้ว',bank:'บัญชี',role:'บทบาท',version:'เวอร์ชัน',salt:'Salt',hash:'Hash รหัสผ่าน',requestId:'รหัสคำขอ',fingerprint:'ลายนิ้วมือคำขอ',message:'ข้อความ',timestamp:'เวลา',action:'การกระทำ',key:'ชื่อค่า',value:'ค่า',type:'ชนิดข้อมูล',count:'จำนวนครั้ง',firstAt:'เวลาเริ่ม (epoch ms)',group:'หมวด',order:'ลำดับ',hex:'รหัสสี'};
function flatten_(object, prefix, result) {
  Object.keys(object).forEach(function(key) {
    if (['__proto__','constructor','prototype'].includes(key) || key.includes('.')) throw Error('Unsupported field: '+key);
    var value=object[key], path=prefix?prefix+'.'+key:key;
    if(value && typeof value==='object') {
      flatten_(value,path,result);
    } else if(value!==undefined) result[path]=value===null?'':value;
  });
  return result;
}
function table_(records, base) {
  var flat=records.map(function(r){return flatten_(r,'',{});});
  var keys=Array.from(new Set(base.concat(...flat.map(Object.keys))));
  return [keys.map(function(k){return (TABLE_LABELS[k]||k)+' ['+k+']';})].concat(flat.map(function(r){return keys.map(function(k){return r[k]===undefined?'':r[k];});}));
}
function records_(rows) {
  if(!rows || !rows.length) throw Error('Missing table');
  var keys=rows[0].map(function(h){var match=String(h).match(/\[([^\]]+)\]$/);if(!match)throw Error('Invalid table header: '+h);return match[1];});
  return rows.slice(1).filter(function(r){return r.some(function(v){return v!=='';});}).map(function(row){
    var out={};keys.forEach(function(key,i){if(key.includes('.') && (row[i]===undefined || row[i]===''))return;var parts=key.split('.'),target=out;
      parts.forEach(function(part,j){if(['__proto__','constructor','prototype'].includes(part))throw Error('Invalid field');if(j===parts.length-1)target[part]=row[i]===undefined?'':row[i];else target=target[part]||(target[part]={});});});return out;
  });
}
function kv_(object) {return Object.keys(object).map(function(key){var value=object[key];if(value && typeof value==='object')throw Error('Unexpected setting: '+key);return {key:key,value:value,type:typeof value};});}
function unkv_(rows) {var out={};records_(rows).forEach(function(r){if(['__proto__','constructor','prototype'].includes(r.key))throw Error('Invalid setting');out[r.key]=r.type==='number'?Number(r.value):r.type==='boolean'?(r.value===true || r.value==='true'):String(r.value);});return out;}
function expand_(flat) {var out={};Object.keys(flat).forEach(function(key){var parts=key.split('.'),target=out;parts.forEach(function(part,i){if(['__proto__','constructor','prototype'].includes(part))throw Error('Invalid setting');if(i===parts.length-1)target[part]=flat[key];else target=target[part]||(target[part]=/^\d+$/.test(parts[i+1])?[]:{});});});return out;}
function encodeTables(document,revision) {
  var state=document.state, meta=Object.assign({},state), claims=[];
  ['cars','otherClaims','config','roleCredentials'].forEach(function(k){delete meta[k];});
  meta.revision=revision;
  var cars=state.cars.map(function(car){var copy=Object.assign({},car);delete copy.claims;(car.claims||[]).forEach(function(c){claims.push(Object.assign({},c,{carId:car.id}));});return copy;});
  state.otherClaims.forEach(function(c){claims.push(Object.assign({},c,{carId:0}));});
  var options=[];['models','colors','locations','banks'].forEach(function(group){(state.config[group]||[]).forEach(function(value,index){options.push({group:group,order:index+1,value:value,hex:group==='colors'?state.config.colorHex[value]||'':''});});});
  var credentials=Object.keys(state.roleCredentials||{}).map(function(role){return Object.assign({role:role},state.roleCredentials[role]);});
  var extraConfig=Object.assign({},state.config);['models','colors','locations','banks','colorHex'].forEach(function(k){delete extraConfig[k];});
  return {
    'รถยนต์':table_(cars,['id','vin','model','submodel','color','location','status','buyPrice','receiveDate']),
    'เคลม':table_(claims,['id','carId','detail','amount','dateReceived','amountReceived','bank']),
    'ตัวเลือก':table_(options,['group','order','value','hex']),
    'การตั้งค่า':table_(kv_(flatten_(extraConfig,'',{})),['key','value','type']),
    'ผู้ใช้งาน':table_(credentials,['role','version','salt','hash']),
    'ประวัติ':table_(document.audit,['timestamp','role','action','carId','requestId']),
    'คำขอ':table_(document.receipts,['requestId','fingerprint','message','timestamp']),
    'การเข้าสู่ระบบ':table_(document.attempts,['key','count','firstAt']),
    'ระบบ':table_(kv_(meta),['key','value','type'])
  };
}
function decodeTables(tables) {
  var state=unkv_(tables['ระบบ']),revision=state.revision;delete state.revision;
  state.cars=records_(tables['รถยนต์']);state.otherClaims=[];
  var cars=new Map();state.cars.forEach(function(car){if(cars.has(car.id))throw Error('Duplicate car ID');car.claims=[];cars.set(car.id,car);});
  records_(tables['เคลม']).forEach(function(claim){var id=claim.carId;delete claim.carId;if(id===0)state.otherClaims.push(claim);else {if(!cars.has(id))throw Error('Claim references missing car');cars.get(id).claims.push(claim);}});
  state.config=Object.assign({settings:{}},expand_(unkv_(tables['การตั้งค่า'])),{models:[],colors:[],locations:[],banks:[],colorHex:{}});
  records_(tables['ตัวเลือก']).sort(function(a,b){return a.order-b.order;}).forEach(function(r){if(!['models','colors','locations','banks'].includes(r.group))throw Error('Invalid option group');state.config[r.group].push(r.value);if(r.group==='colors')state.config.colorHex[r.value]=r.hex;});
  state.roleCredentials={};records_(tables['ผู้ใช้งาน']).forEach(function(r){var role=r.role;delete r.role;if(!['admin','keeper','sales','claim'].includes(role))throw Error('Invalid role');state.roleCredentials[role]=r;});
  if(!Number.isSafeInteger(revision))throw Error('Invalid revision');
  return {revision:revision,document:{state:state,audit:records_(tables['ประวัติ']),receipts:records_(tables['คำขอ']),attempts:records_(tables['การเข้าสู่ระบบ'])}};
}
