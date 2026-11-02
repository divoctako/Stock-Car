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
