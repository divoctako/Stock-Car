import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function setup() {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-27T05:00:00Z'])); }
    static now() { return new Clock().getTime(); }
  }
  const context=vm.createContext({Date:Clock,document:{readyState:'loading',addEventListener(){}}});
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')",`render=function(){};
    globalThis.ui={S,derive,dashboardMatches,dashboardCars,dashboardDrillCars,viewDashboardFilters,viewDashboardStock,viewModal,onClick,onInputEvent,doConfirm,closeModal,setCall(fn){call=fn;}};
    if (document.readyState === 'loading')`),context);
  const ui=context.ui;
  const base={id:1,vin:'VIN-1',model:'Seal',submodel:'Premium',color:'ขาว',location:'ขอนแก่น',status:'Available',manufactureYear:'2026',buyPrice:100,receiveDate:'2026-09-27',paymentDueDate:'2026-10-27',batteryNumber:'001BAT',frontMotorNumber:'001MOTOR'};
  ui.S.cars=[base,{...base,id:2,vin:'VIN-2',status:'Reserved',receiveDate:'2026-09-26',paymentDueDate:'2026-11-03',buyPrice:200},
    {...base,id:3,vin:'VIN-3',submodel:'Performance',color:'ดำ',receiveDate:'2026-08-28',paymentDueDate:'2026-10-26'},
    {...base,id:4,vin:'VIN-4',model:'Dolphin',submodel:'Dynamic',receiveDate:'2026-08-27',paymentDueDate:'2026-11-04'},
    {...base,id:5,vin:'VIN-5',receiveDate:'2026-07-29',paymentDueDate:''},
    {...base,id:6,vin:'VIN-6',receiveDate:'2026-07-28',paymentDueDate:''},
    {...base,id:7,vin:'VIN-7',receiveDate:'',paymentDueDate:''},
    {...base,id:8,vin:'SOLD',status:'Delivered',claims:[]}];
  ui.click=(action,attrs={})=>{
    const el={getAttribute(key){return key==='data-act'?action:attrs[key]??null;},hasAttribute(key){return key in attrs;},classList:{contains(){return false;}}};
    ui.onClick({target:{closest(){return el;}}});
  };
  ui.input=(key,value)=>ui.onInputEvent({target:{value,getAttribute(){return key;}}});
  return ui;
}

test('dashboard filters intersect, include available + reserved, and use exact age/due boundaries',async()=>{
  const {S,derive,dashboardCars,dashboardMatches}=await setup();
  const f=S.dashboardFilters, ids=()=>dashboardCars().map(c=>c.id).join(',');
  assert.equal(ids(),'1,2,3,4,5,6,7');
  for(const [age,expected] of [['a','1'],['b','2,3'],['c','4,5'],['d','6']]) {f.age=age;assert.equal(ids(),expected,age);}
  f.age='';
  for(const [due,expected] of [['today','1'],['week','1,2'],['overdue','3'],['missing','5,6,7']]) {f.due=due;assert.equal(ids(),expected,due);}
  f.due='range';f.dueFrom='2026-10-27';f.dueTo='2026-11-03';assert.equal(ids(),'1,2');
  f.status='Reserved';f.model='Seal';f.submodel='Premium';f.color='ขาว';f.location='ขอนแก่น';f.year='2026';
  let d=derive();assert.equal(d.dashboardCars.length,1);assert.equal(d.stockValue,200);assert.equal(d.ageAvg,31);assert.equal(d.modelBars[0].count,1);assert.equal(d.stockGroups[0].count,1);
  assert.equal(d.stockAll.length,7,'dashboard filtering does not alter stock/sidebar totals');
  f.query='vin-2';assert.equal(ids(),'2');f.query='VIN-1';assert.equal(ids(),'');
  f.query='';f.dueFrom='2026-11-04';assert.equal(ids(),'','reversed date range cannot show a misleading result');
  assert.equal(dashboardMatches(S.cars[6]),false,'missing dates excluded from a bounded range');
});

test('model-dependent trims, filter reset and other pages remain independent',async()=>{
  const {S,derive,viewDashboardFilters,input,click}=await setup();
  S.stockQuery='VIN-3';S.dashboardFilters.submodel='Premium';
  input('filter-dash-model','Dolphin');
  assert.equal(S.dashboardFilters.submodel,'');
  let html=viewDashboardFilters(derive());
  assert.match(html,/>Dynamic<\/option>/);assert.doesNotMatch(html,/>Premium<\/option>/);
  assert.equal(derive().stockCars[0].vin,'VIN-3');
  input('filter-dash-due','range');input('dash-dueFrom','2026-10-01');input('dash-dueTo','2026-10-31');
  input('filter-dash-due','missing');assert.equal(S.dashboardFilters.dueFrom,'');assert.equal(S.dashboardFilters.dueTo,'');
  click('clear-dashboard');assert.ok(Object.values(S.dashboardFilters).every(value=>value===''));
  assert.equal(derive().dashboardCars.length,7);assert.equal(S.stockQuery,'VIN-3');
});

test('month age bands partition stock with matching filter, chart and drill-down at every boundary',async()=>{
  const {S,derive,dashboardCars,dashboardDrillCars,viewDashboardStock,viewDashboardFilters,viewModal,click}=await setup();
  const base=S.cars[0];
  S.cars=[90,91,180,181,270,271,365,366,null].map((age,index)=>{
    const day=new Date('2026-10-27T00:00:00Z');day.setUTCDate(day.getUTCDate()-(age || 0));
    return {...base,id:index+1,vin:'AGE-'+age,receiveDate:age===null?'':day.toISOString().slice(0,10)};
  });
  for(const [key,expected,label] of [['c','1','61-90 วัน'],['d','2,3','3–6 เดือน'],['e','4,5','6–9 เดือน'],['f','6,7','9–12 เดือน'],['g','8','เกิน 12 เดือน']]) {
    S.dashboardFilters.age=key;
    assert.equal(dashboardCars().map(c=>c.id).join(','),expected,label);
    const d=derive(), count=expected.split(',').length;
    assert.equal(d.ageBars.find(b=>b.key===key).count,count);
    assert.match(viewDashboardFilters(d),new RegExp(label));
    assert.match(viewDashboardStock(d),new RegExp('อายุรถ '+label+' '+count+' คัน ดูรายการรถ'));
    click('open-dashboard-age',{'data-age':key});
    assert.equal(dashboardDrillCars().map(c=>c.id).join(','),expected);
    assert.match(viewModal(),new RegExp('อายุรถ '+label));
  }
  S.dashboardFilters.age='';
  assert.equal(derive().ageBars.reduce((sum,b)=>sum+b.count,0),8,'missing receipt date never enters an age bucket');
  click('open-dashboard-age',{'data-age':'g'});assert.equal(dashboardDrillCars().length,1);
  click('open-dashboard-model',{'data-model':'Seal'});assert.equal(dashboardDrillCars().length,9);
});

test('chart drill-down keeps filtered cars, reuses management forms, refreshes after save and respects role',async()=>{
  const {S,derive,viewModal,viewDashboardStock,dashboardDrillCars,click,doConfirm,setCall,closeModal}=await setup();
  S.dashboardFilters.due='week';
  const dashboard=viewDashboardStock(derive());
  assert.match(dashboard,/data-act="open-dashboard-group"/);assert.match(dashboard,/รวม 2 คัน/);
  click('open-dashboard-group',{'data-model':'Seal','data-submodel':'Premium','data-color':'ขาว'});
  assert.equal(dashboardDrillCars().map(c=>c.id).join(','),'1,2');
  assert.match(viewModal(),/VIN-2/);assert.doesNotMatch(viewModal(),/VIN-3/);
  click('open-dashboard-car',{'data-id':'2'});
  let html=viewModal();assert.match(html,/001BAT/);assert.match(html,/001MOTOR/);assert.match(html,/ส่งมอบลูกค้า/);
  S.role='sales';assert.doesNotMatch(viewModal(),/data-act="open-(edit|deliver|transfer)"/);
  click('open-edit',{'data-id':'2'});assert.equal(S.modal.type,'dashboard-car');
  S.role='admin';
  for(const [action,type] of [['open-edit','edit'],['open-transfer','transfer'],['open-deliver','deliver']]) {
    click(action,{'data-id':'2'});assert.equal(S.modal.type,type);closeModal();assert.equal(S.modal.type,'dashboard-car');
  }
  click('open-edit',{'data-id':'2'});S.form.location='สกลนคร';
  setCall((action,extra,done)=>{assert.equal(action,'updateCar');assert.equal(extra.carId,2);Object.assign(S.cars[1],extra.payload);done();});
  doConfirm();assert.equal(S.modal.type,'dashboard-car');assert.match(viewModal(),/สกลนคร/);assert.equal(S.dashboardFilters.due,'week');
  click('open-transfer',{'data-id':'2'});
  setCall((action,extra,done)=>{assert.equal(action,'transferCar');S.cars[1].status='Transferred';done();});
  doConfirm();assert.equal(S.modal.type,'dashboard-car');assert.doesNotMatch(viewModal(),/data-act="open-edit"/);
  assert.equal(derive().dashboardCars.length,1);click('back-dashboard-group');assert.equal(dashboardDrillCars().length,1);
});
