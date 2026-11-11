import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {initialState,validateConfig,mutate} from '../lib/domain.js';
import {setup,readState,executeWrite} from '../lib/db.js';
const pairs={'Stock Dolphin':['435KM-STD','490KM-EXT'],'Stock Atto 3':['Premium','Extended Range']};

test('submodel configuration validates each parent independently and preserves older clients',()=>{
 const base=initialState().config;
 const config=validateConfig({...base,submodels:pairs},base);
 assert.deepEqual(config.submodels,pairs);
 assert.deepEqual(validateConfig(base,config).submodels,pairs);
 for(const submodels of [null,[],{'Stock Dolphin':['Same',' same ']},{'Stock Dolphin':['']},{'Stock Dolphin':'wrong'},JSON.parse('{"__proto__":[]}')])assert.throws(()=>validateConfig({...base,submodels},base));
 assert.deepEqual(validateConfig({...base,submodels:{'Stock Dolphin':[]}},base).submodels,{'Stock Dolphin':[]});
});

test('vehicle forms select only the chosen model, reset on parent change, and retain legacy edits',async()=>{
 const context=vm.createContext({document:{readyState:'loading',addEventListener(){}}});
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,viewModal,viewSettings,onInputEvent,setRender(fn){render=fn;}};\nif (document.readyState === 'loading')"),context);
 const {S,viewModal,viewSettings,onInputEvent,setRender}=context.ui;
 S.config={...initialState().config,submodels:pairs};S.modal={type:'add'};S.form={model:'Stock Dolphin',submodel:'435KM-STD'};
 let html=viewModal();assert.ok(html.includes('data-in="form-submodel"'));assert.ok(html.includes('490KM-EXT'));assert.ok(!html.includes('value="Extended Range"'));
 let renders=0;setRender(()=>{renders++;});
 onInputEvent({target:{value:'Stock Atto 3',getAttribute:key=>key==='data-in'?'form-model':null}});
 assert.equal(S.form.submodel,'');assert.equal(renders,1);html=viewModal();assert.ok(html.includes('Extended Range'));assert.ok(!html.includes('490KM-EXT'));
 S.modal={type:'edit',carId:1};S.cars=[{id:1,model:'Stock Atto 3',submodel:'Legacy trim',vin:'OLD'}];S.form={model:'Stock Atto 3',submodel:'Legacy trim'};
 assert.ok(viewModal().includes('value="Legacy trim" selected'));
 S.role='keeper';assert.ok(viewSettings().includes('data-act="submodel-add"'));
 S.role='claim';assert.ok(!viewSettings().includes('data-act="submodel-add"'));
});

test('Stock can persist linked submodels; invalid combinations are rejected and SQL renames keep the link',async()=>{
 const pg=new PGlite(),db={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};
 try {
  await setup(db);
  await executeWrite({action:'saveConfig',role:'keeper',requestId:'submodels-config',payload:{expectedRevision:0,config:{submodels:pairs}}},'config',db);
  assert.deepEqual((await readState(db)).config.submodels,pairs);
  const add={action:'addCar',role:'keeper',requestId:'submodels-car',payload:{model:'Stock Dolphin',submodel:'435KM-STD',vin:'SUBMODEL',buyPrice:10}};
  await executeWrite(add,'car',db);
  await assert.rejects(executeWrite({...add,requestId:'submodels-bad',payload:{...add.payload,vin:'OTHER',submodel:'Premium'}},'bad',db),/รุ่นย่อยต้องตรง/);
  await assert.rejects(executeWrite({action:'saveConfig',role:'claim',requestId:'submodels-forbidden',payload:{expectedRevision:1,config:{submodels:pairs}}},'forbidden',db),e=>e.status===403);
  await pg.query("UPDATE app_options SET value='DOLPHIN' WHERE option_group='models' AND value='Stock Dolphin'");
  let state=await readState(db);assert.deepEqual(state.config.submodels.DOLPHIN,pairs['Stock Dolphin']);assert.equal(state.config.submodels['Stock Dolphin'],undefined);assert.equal(state.cars[0].model,'DOLPHIN');
  const config=structuredClone(state.config);config.models=config.models.map(model=>model==='DOLPHIN'?'DOLPHIN NEW':model);
  await executeWrite({action:'saveConfig',role:'admin',requestId:'submodels-rename',payload:{expectedRevision:state.configRevision,config}},'rename',db);
  state=await readState(db);assert.deepEqual(state.config.submodels['DOLPHIN NEW'],pairs['Stock Dolphin']);assert.equal(state.cars[0].model,'DOLPHIN NEW');
 } finally {await pg.close();}
});

test('editing legacy submodels remains possible while an empty configured list blocks new entries',()=>{
 const state=initialState();state.config.submodels={'Stock Dolphin':[]};state.cars=[{id:1,vin:'LEGACY',model:'Stock Dolphin',submodel:'Retired',status:'Available',claims:[]}];
 assert.doesNotThrow(()=>mutate(state,{action:'updateCar',carId:1,payload:{vin:'LEGACY',model:'Stock Dolphin',submodel:'Retired',buyPrice:10}}));
 assert.throws(()=>mutate(state,{action:'addCar',payload:{vin:'NEW',model:'Stock Dolphin',submodel:'Retired',buyPrice:10}}),/รุ่นย่อยต้องตรง/);
});
