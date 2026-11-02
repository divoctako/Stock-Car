import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {initialState,validateConfig} from '../lib/domain.js';
import {setup,executeWrite,readState} from '../lib/db.js';
async function ui() {
 const context=vm.createContext({document:{readyState:'loading',addEventListener(){},getElementById(){return {focus(){}};}}});
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,derive,viewClaims,viewInspect,viewClaimsDone,viewSettings,viewModal,onClick,setRender(fn){render=fn;}};\nif (document.readyState === 'loading')"),context);
 context.ui.setRender(()=>{});return context.ui;
}
test('claim model filters intersect search, stay separate by tab, and reset without filtering other claims',async()=>{
 const u=await ui(),{S}=u;S.config=initialState().config;
 S.cars=Array.from({length:6},(_,i)=>({id:i+1,vin:'VIN'+i,model:i%2?'Model B':'Retired Model',color:'ขาว',status:'Delivered',releaseDate:'2026-11-02',inspected:i>=4,claims:[{id:i+1,detail:'Claim',amount:100,amountReceived:i<2?'':100,dateReceived:i<2?'':'2026-11-02'}]}));
 S.otherClaims=[{id:99,detail:'Other',amount:100,amountReceived:100,dateReceived:'2026-11-02',inspected:true}];
 S.claimModelFilter='Retired Model';S.inspectModelFilter='Model B';S.claimsDoneModelFilter='Retired Model';
 let d=u.derive();assert.equal(d.claimCars.length,1);assert.equal(d.inspectCars.length,1);assert.equal(d.claimsDoneCars.length,1);
 assert.equal(d.claimCars[0].model,'Retired Model');assert.equal(d.inspectCars[0].model,'Model B');
 assert.ok(u.viewClaims(d).includes('Retired Model'));assert.ok(u.viewInspect(d).includes('filter-inspectModel'));assert.ok(u.viewClaimsDone(d).includes('filter-claimsDoneModel'));
 S.claimQuery='VIN1';assert.equal(u.derive().claimCars.length,0);
 u.onClick({target:{closest:()=>({getAttribute:key=>key==='data-act'?'clear-claim':null})}});
 assert.equal(S.claimModelFilter,'');assert.equal(S.claimQuery,'');assert.equal(S.inspectModelFilter,'Model B');
 S.claimScopes.claimsdone='other';assert.equal(u.derive().otherDoneRows.length,1);assert.ok(!u.viewClaimsDone(u.derive()).includes('filter-claimsDoneModel'));
});
test('configured claim choices appear in editable dropdowns in every claim form and historical/custom text is retained',async()=>{
 const u=await ui(),{S}=u;S.config=initialState().config;S.config.claimTypes=['เงินสนับสนุน','ค่าอะไหล่','<ตัวเลือก>'];
 S.cars=[{id:1,vin:'VIN',model:'Model',status:'Available',claims:[]}];
 for(const type of ['deliver','claim','other','add-vehicle-claim']) {
   S.modal={type,carId:1};S.form={detail:'พิมพ์เอง',claimCarIds:[1],claims:[{detail:'รายการเดิมที่ไม่อยู่ในตัวเลือก',amount:100}]};
   const html=u.viewModal();assert.ok(html.includes('list="claim-detail-options"'),type);assert.ok(html.includes('value="ค่าอะไหล่"'));assert.ok(html.includes('&lt;ตัวเลือก&gt;'));assert.ok(html.includes(type==='add-vehicle-claim'?'พิมพ์เอง':'รายการเดิมที่ไม่อยู่ในตัวเลือก'));
 }
 S.role='claim';assert.ok(u.viewSettings().includes('data-group="claimTypes"'));
 S.role='keeper';assert.ok(!u.viewSettings().includes('data-group="claimTypes"'));
});
test('claim choices validate and persist with Claim permissions, while free-text claims stay allowed',async()=>{
 const pg=new PGlite(),db={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};
 try {
  await setup(db);
  await executeWrite({action:'saveConfig',role:'claim',requestId:'claim-options-save',payload:{expectedRevision:0,config:{banks:[],claimTypes:['เงินสนับสนุน','ค่าอะไหล่']}}},'options',db);
  let state=await readState(db);assert.deepEqual(state.config.claimTypes,['เงินสนับสนุน','ค่าอะไหล่']);
  await executeWrite({action:'saveClaims',role:'claim',carId:0,requestId:'claim-options-custom',claims:[{detail:'พิมพ์เองนอกตัวเลือก',amount:100}]},'custom',db);
  state=await readState(db);assert.equal(state.otherClaims[0].detail,'พิมพ์เองนอกตัวเลือก');
  for(const claimTypes of [null,['ซ้ำ',' ซ้ำ '],[''],['a'.repeat(241)]])assert.throws(()=>validateConfig({...state.config,claimTypes},state.config));
  assert.deepEqual(validateConfig({...state.config,claimTypes:[]},state.config).claimTypes,[]);
  await assert.rejects(executeWrite({action:'saveConfig',role:'keeper',requestId:'claim-options-forbidden',payload:{expectedRevision:1,config:{claimTypes:['Forbidden']}}},'forbidden',db),e=>e.status===403);
 } finally {await pg.close();}
});
