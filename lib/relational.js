import { isDeepStrictEqual } from 'node:util';

// Domain objects are assembled only in memory; persisted values are SQL scalars.
export const carFields = {
  id:'bigint', vin:'text', model:'text', submodel:'text', color:'text', location:'text', status:'text', stockStatus:'text',
  buyPrice:'numeric', sellPrice:'numeric', amountFinanced:'numeric', receiveDate:'date', paymentDueDate:'date',
  batteryNumber:'text', frontMotorNumber:'text', rearMotorNumber:'text', engineNumber:'text', manufactureYear:'text',
  salesCode:'text', customerName:'text', releaseDate:'date', inspected:'boolean', transferDate:'date', transferTo:'text', claimsNotProvided:'boolean'
};
export const claimFields = {id:'bigint',detail:'text',amount:'numeric',dateReceived:'date',amountReceived:'numeric',bank:'text',inspected:'boolean'};
export const snake = key => key.replace(/[A-Z]/g, c=>'_'+c.toLowerCase());
export const quote = key => '"'+key.replaceAll('"','""')+'"';
// pg parses DATE as local midnight. Keep the calendar day, never shift to UTC.
const dateText = value => value instanceof Date ? [String(value.getFullYear()).padStart(4,'0'),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-') : String(value).slice(0,10);

function flatten(value, path=[], rows=[]) {
  if (value && typeof value==='object') {
    rows.push({path,kind:Array.isArray(value)?'array':'object',value:null});
    for (const [key,item] of Object.entries(value)) flatten(item,[...path,key],rows);
  } else rows.push({path,kind:value===null?'null':typeof value,value:value===null?null:String(value)});
  return rows;
}
function expand(rows) {
  let root;
  for (const row of [...rows].sort((a,b)=>a.path.length-b.path.length)) {
    const value=row.kind==='object'?{}:row.kind==='array'?[]:row.kind==='null'?null:row.kind==='number'?Number(row.value):row.kind==='boolean'?row.value==='true':row.value;
    if (!row.path.length) {root=value;continue;}
    let parent=root;
    for(const key of row.path.slice(0,-1)) parent=parent[key];
    Object.defineProperty(parent,row.path.at(-1),{value,writable:true,enumerable:true,configurable:true});
  }
  return root;
}
function encodeRecord(record, fields) {
  const row={present_fields:Object.keys(record).filter(k=>k in fields),null_fields:Object.keys(record).filter(k=>k in fields&&record[k]===null)};
  for(const [key,type] of Object.entries(fields)) row[snake(key)]=record[key]===undefined || record[key]==='' && type!=='text'?null:record[key];
  return row;
}
function decodeRecord(row, fields) {
  const record={};
  for(const [key,type] of Object.entries(fields)) {
    const value=row[snake(key)];
    if(value===null && !row.present_fields.includes(key))continue;
    record[key]=value===null?(row.null_fields.includes(key)?null:''):type==='numeric'||type==='bigint'?Number(value):type==='date'?dateText(value):value;
  }
  return record;
}
function attributes(scope,owner,object) {return flatten(object).map(row=>({scope,owner,...row}));}

export function encodeDocument(document) {
  const {state}=document;
  const tables={cars:[],claims:[],app_options:[],role_credentials:[],request_receipts:[],audit_log:[],login_attempts:[],app_values:[]};
  for(const car of state.cars) {
    tables.cars.push(encodeRecord(car,carFields));
    const extra=Object.fromEntries(Object.entries(car).filter(([k])=>!(k in carFields)&&k!=='claims'));
    tables.app_values.push(...attributes('car',String(car.id),extra));
    for(const claim of car.claims||[]) addClaim(claim,car.id);
  }
  for(const claim of state.otherClaims) addClaim(claim,null);
  function addClaim(claim,carId) {
    tables.claims.push({...encodeRecord(claim,claimFields),car_id:carId});
    tables.app_values.push(...attributes('claim',String(claim.id),Object.fromEntries(Object.entries(claim).filter(([k])=>!(k in claimFields)))));
  }
  for(const group of ['models','colors','locations','banks']) (state.config[group]||[]).forEach((value,index)=>tables.app_options.push({id:group+':'+value,option_group:group,position:index,value,hex:group==='colors'?state.config.colorHex[value]||null:null}));
  const config={...state.config};for(const key of ['models','colors','locations','banks'])delete config[key];
  tables.app_values.push(...attributes('config','',config));
  const meta={...state};for(const key of ['cars','otherClaims','config','roleCredentials'])delete meta[key];
  tables.app_values.push(...attributes('state','',meta));
  tables.app_values.push(...attributes('flags','',{roleCredentials:Object.hasOwn(state,'roleCredentials')}));
  for(const [role,credential] of Object.entries(state.roleCredentials||{})) {
    tables.role_credentials.push({role,version:credential.version,salt:credential.salt,hash:credential.hash,iv:credential.encryptedPassword?.iv??null,ciphertext:credential.encryptedPassword?.ciphertext??null,tag:credential.encryptedPassword?.tag??null});
    tables.app_values.push(...attributes('credential',role,Object.fromEntries(Object.entries(credential).filter(([k])=>!['version','salt','hash','encryptedPassword'].includes(k)))));
  }
  document.receipts.forEach(r=>tables.request_receipts.push({request_id:r.requestId,fingerprint:r.fingerprint,message:r.message,timestamp:r.timestamp}));
  document.audit.forEach((r,i)=>{
    tables.audit_log.push({id:i+1,role:r.role??null,action:r.action??null,car_id:r.carId??null,request_id:r.requestId??null,timestamp:r.timestamp,present_fields:Object.keys(r).filter(k=>['role','action','carId','requestId','timestamp'].includes(k))});
    tables.app_values.push(...attributes('audit',String(i+1),Object.fromEntries(Object.entries(r).filter(([k])=>!['role','action','carId','requestId','timestamp'].includes(k)))));
  });
  document.attempts.forEach(r=>tables.login_attempts.push({key:r.key,count:r.count,first_at:new Date(r.firstAt).toISOString()}));
  return tables;
}

export async function loadDocument(client) {
  const tables={};
  // All callers hold a consistent snapshot or the global write lock.
  for(const name of ['cars','claims','app_options','role_credentials','request_receipts','audit_log','login_attempts','app_values']) tables[name]=(await client.query('SELECT * FROM public.'+name)).rows;
  const attr=(scope,owner)=>expand(tables.app_values.filter(r=>r.scope===scope&&r.owner===owner))||{};
  const state=attr('state','');state.config=attr('config','');
  for(const group of ['models','colors','locations','banks'])state.config[group]=tables.app_options.filter(r=>r.option_group===group).sort((a,b)=>a.position-b.position).map(r=>r.value);
  state.config.colorHex ||= {};
  for(const r of tables.app_options.filter(r=>r.option_group==='colors'))if(r.hex)state.config.colorHex[r.value]=r.hex;
  state.cars=tables.cars.sort((a,b)=>Number(a.id)-Number(b.id)).map(r=>({...decodeRecord(r,carFields),...attr('car',String(r.id)),claims:[]}));
  const cars=new Map(state.cars.map(c=>[c.id,c]));state.otherClaims=[];
  for(const r of tables.claims.sort((a,b)=>Number(a.id)-Number(b.id))) {
    const claim={...decodeRecord(r,claimFields),...attr('claim',String(r.id))};
    if(r.car_id===null)state.otherClaims.push(claim);else cars.get(Number(r.car_id)).claims.push(claim);
  }
  const credentials=tables.role_credentials;
  if(credentials.length || attr('flags','').roleCredentials)state.roleCredentials={};
  for(const r of credentials) {
    state.roleCredentials ||= {};
    state.roleCredentials[r.role]={version:r.version,salt:r.salt,hash:r.hash,...attr('credential',r.role)};
    if(r.iv!==null)state.roleCredentials[r.role].encryptedPassword={iv:r.iv,ciphertext:r.ciphertext,tag:r.tag};
  }
  state.nextCarId=Math.max(state.nextCarId||1,...state.cars.map(c=>c.id+1));
  state.nextClaimId=Math.max(state.nextClaimId||1,...tables.claims.map(c=>Number(c.id)+1));
  const audit=tables.audit_log.sort((a,b)=>Number(a.id)-Number(b.id)).map(r=>{
    const out=attr('audit',String(r.id));
    for(const [key,column] of [['role','role'],['action','action'],['carId','car_id'],['requestId','request_id'],['timestamp','timestamp']]) {
      if(r[column]!==null || r.present_fields.includes(key))out[key]=key==='timestamp'?new Date(r[column]).toISOString():key==='carId'?Number(r[column]):r[column];
    }
    return out;
  });
  return {state,audit,receipts:tables.request_receipts.sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp)).map(r=>({requestId:r.request_id,fingerprint:r.fingerprint,message:r.message,timestamp:new Date(r.timestamp).toISOString()})),attempts:tables.login_attempts.map(r=>({key:r.key,count:r.count,firstAt:new Date(r.first_at).getTime()}))};
}

const keys={cars:['id'],claims:['id'],app_options:['id'],role_credentials:['role'],request_receipts:['request_id'],audit_log:['id'],login_attempts:['key'],app_values:['scope','owner','path']};
export async function persistDocument(client,document,previous=null) {
  const next=encodeDocument(document), before=previous?encodeDocument(previous):Object.fromEntries(Object.keys(next).map(k=>[k,[]]));
  const key=(table,row)=>JSON.stringify(keys[table].map(k=>row[k]));
  // Remove dependent rows first; deleting a car also cascades its claims.
  for(const table of ['claims','cars','app_options','role_credentials','request_receipts','audit_log','login_attempts','app_values']) {
    const wanted=new Set(next[table].map(r=>key(table,r)));
    for(const row of before[table])if(!wanted.has(key(table,row)))await client.query(`DELETE FROM public.${table} WHERE ${keys[table].map((k,i)=>quote(k)+'=$'+(i+1)).join(' AND ')}`,keys[table].map(k=>row[k]));
  }
  for(const table of Object.keys(next)) {
    const old=new Map(before[table].map(r=>[key(table,r),r]));
    const changed=next[table].filter(row=>!isDeepStrictEqual(row,old.get(key(table,row))));
    for(let start=0;start<changed.length;start+=200) {
      const batch=changed.slice(start,start+200),cols=Object.keys(batch[0]),updates=cols.filter(c=>!keys[table].includes(c));
      const values=batch.flatMap(row=>cols.map(c=>row[c]));
      const tuples=batch.map((_,r)=>'('+cols.map((_,c)=>'$'+(r*cols.length+c+1)).join(',')+')').join(',');
      await client.query(`INSERT INTO public.${table} (${cols.map(quote).join(',')}) VALUES ${tuples} ON CONFLICT (${keys[table].map(quote).join(',')}) DO UPDATE SET ${updates.map(c=>quote(c)+'=excluded.'+quote(c)).join(',')}`,values);
    }
  }
}
