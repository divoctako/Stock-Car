import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {initialState,snapshot,authorizeRole,writeActions,mutate} from '../lib/domain.js';
import {cookie,sessionIdentity} from '../lib/auth.js';

test('role action matrix denies Sale writes and keeps Stock and Claim responsibilities separate',()=>{
  const stock=['addFloorCar','updateFloorCar','promoteFloorCar','addCar','updateCar','importCars','previewImportCars','transferCar','deliverCar'];
  const claims=['saveClaims','addVehicleClaim','markInspected'];
  const state=initialState();
  for(const role of ['admin','sales','keeper','claim']) {
    const identity={role,version:0};
    for(const action of [...writeActions,'previewImportCars','revealRolePassword','bootstrap','refresh']) {
      const allowed=role==='admin'||['bootstrap','refresh'].includes(action)||(action==='saveConfig'&&['keeper','claim'].includes(role))||(role==='keeper'&&stock.includes(action))||(role==='claim'&&claims.includes(action));
      const run=()=>authorizeRole(state,identity,{action,role});
      if(allowed)assert.doesNotThrow(run,role+': '+action);else assert.throws(run,error=>error.status===403,role+': '+action);
    }
    if(role!=='admin')assert.throws(()=>authorizeRole(state,identity,{action:'bootstrap',role:'admin'}),/ตำแหน่ง/);
  }
});

test('Sale bootstrap exposes only active stock; Claim excludes Floor Plan and unrelated stock finance',()=>{
  const state=initialState();state.otherClaims=[{id:1,detail:'Other claim'}];
  const base={vin:'STOCK',status:'Available',buyPrice:100,batteryNumber:'BAT',claims:[{detail:'Private claim'}],customerName:'Customer',salesCode:'S001'};
  state.cars=[{id:1,...base},{id:2,...base,status:'Reserved'},{id:3,...base,status:'FloorPlan'},{id:4,...base,status:'Delivered'}];
  const sale=snapshot(state,'','sales');assert.deepEqual(sale.cars.map(c=>c.id),[1,2]);assert.deepEqual(sale.otherClaims,[]);
  assert.ok(sale.cars.every(car=>car.claims.length===0 && !('customerName' in car) && !('salesCode' in car)));
  assert.deepEqual(sale.rolePasswordStatus,{});assert.deepEqual(sale.config.banks,[]);
  const claim=snapshot(state,'','claim');assert.deepEqual(claim.cars.map(c=>c.id),[1,2,4]);
  assert.ok(claim.cars.every(car=>!('buyPrice' in car) && !('batteryNumber' in car)));assert.equal(claim.otherClaims.length,1);
  assert.deepEqual(snapshot(state,'','keeper').cars,state.cars);
});

test('navigation, edit controls and settings match the role matrix',async()=>{
  const context=vm.createContext({document:{readyState:'loading',addEventListener(){}}});
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,can,derive,viewSidebar,viewSettings,viewStock,allowedTabs};\nif (document.readyState === 'loading')"),context);
  const {S,can,derive,viewSidebar,viewSettings,viewStock,allowedTabs}=context.ui;
  S.cars=[{id:1,vin:'ACTIVE',model:'Seal',submodel:'Premium',color:'ขาว',status:'Available'}];
  const tabs=['dashboard-stock','floor','stock','dashboard-claims','claims','inspect','claimsdone','transfers','settings'];
  for(const role of ['admin','sales','keeper','claim']){
    S.role=role;const sidebar=viewSidebar(derive());
    for(const tab of tabs)assert.equal(sidebar.includes('data-v="'+tab+'"'),allowedTabs(role).includes(tab),role+': '+tab);
    assert.equal(can().stock,['admin','keeper'].includes(role));assert.equal(can().claims,['admin','claim'].includes(role));
  }
  S.role='keeper';const settings=viewSettings();assert.match(settings,/ตั้งค่าเกี่ยวกับรถ/);assert.match(settings,/data-group="models"/);assert.doesNotMatch(settings,/data-group="banks"|show-role-password|open-role-password/);
  S.role='claim';const bankSettings=viewSettings();assert.match(bankSettings,/data-group="banks"/);assert.doesNotMatch(bankSettings,/data-group="models"|setting-status|setting-month|show-role-password|open-role-password/);
  S.role='sales';assert.doesNotMatch(viewStock(derive()),/data-act="open-(add|edit|deliver|transfer|import-cars)"/);
});

test('Claim is accepted as a signed login role and cannot impersonate Admin',()=>{
  process.env.APP_PIN='test-pin';process.env.SESSION_SECRET='test-secret-longer-than-32-characters';
  const session=cookie(false,'claim',0).split(';')[0];
  assert.equal(sessionIdentity({headers:{cookie:session}}).role,'claim');
  assert.equal(sessionIdentity({headers:{cookie:session.replace('.claim.','.admin.')}}),null);
});

test('Stock and Claim save scoped setting patches without overwriting other categories or accepting injected keys',()=>{
  const state=initialState(),save=(role,config,revision)=>mutate(state,{action:'saveConfig',role,payload:{config,expectedRevision:revision}});
  const beforeBanks=structuredClone(state.config.banks);
  save('keeper',{models:['New model'],locations:['New location'],statusLabels:{Available:'ขายได้',Reserved:'จองแล้ว',Delivered:'ส่งแล้ว',Transferred:'โอนแล้ว'}},0);
  assert.deepEqual(state.config.banks,beforeBanks);assert.equal(state.configRevision,1);
  const before=structuredClone(state);
  for(const [role,config] of [['keeper',{banks:['Injected bank']}],['claim',{models:['Injected model']}],['claim',{settings:{brandName:'Injected'}}],['sales',{banks:['Bank']}]]) {
    assert.throws(()=>save(role,config,1),error=>error.status===403);assert.deepEqual(state,before);
  }
  assert.throws(()=>save('claim',{banks:['Bank A']},0),/ถูกแก้ไขแล้ว/);
  save('claim',{banks:['Bank A','Bank B']},1);
  assert.deepEqual(state.config.models,['New model']);assert.deepEqual(state.config.locations,['New location']);
  assert.equal(state.config.statusLabels.Available,'ขายได้');assert.deepEqual(state.config.banks,['Bank A','Bank B']);
  assert.equal(state.configRevision,2);
});

test('frontend settings save only the current role scope even when its draft contains other values',async()=>{
  const context=vm.createContext({document:{readyState:'loading',addEventListener(){},getElementById(){return null;}}});
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,beginSettings,saveSettings,setCall(fn){call=fn;}};\nif (document.readyState === 'loading')"),context);
  const {S,beginSettings,saveSettings,setCall}=context.ui;
  let sent;setCall((action,body)=>{sent={action,body};});
  S.config=initialState().config;S.role='claim';beginSettings();S.settingsDraft.banks=['Bank'];S.settingsDraft.models=['Do not send'];S.settingsDirty=true;
  saveSettings();assert.equal(sent.action,'saveConfig');assert.deepEqual(Object.keys(sent.body.payload.config),['banks','claimTypes']);
  S.role='keeper';beginSettings();S.settingsDraft.banks=['Do not send'];S.settingsDirty=true;saveSettings();
  assert.equal(Object.keys(sent.body.payload.config).sort().join(','),'colorHex,colors,locations,models,statusLabels,submodels');
});
