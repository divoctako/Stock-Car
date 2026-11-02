import {initialState,today} from './domain.js';
import {hashPassword,encryptPassword} from './passwords.js';

// Synthetic data only, built fresh for the current date. No database connection.
export function createDemoState() {
 const state=initialState(),base=today(),year=base.slice(0,4);
 const day=offset=>{const value=new Date(base+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
 state.config.locations=['โชว์รูมสำนักงานใหญ่','สาขาบางนา','ลานเก็บรถตัวอย่าง'];
 state.config.banks=['บัญชีรับเงินตัวอย่าง A','บัญชีรับเงินตัวอย่าง B'];
 state.config.claimTypes=['เงินสนับสนุนการขาย','ส่วนลดโรงงาน','ค่าอะไหล่','ค่าจัดกิจกรรม','ค่าโฆษณา','ค่าอบรม'];
 state.config.settings.brandName='DEMO · ข้อมูลจำลอง';
 state.roleCredentials={};
 for(const role of ['admin','keeper','sales','claim'])state.roleCredentials[role]={...hashPassword('demo1234'),encryptedPassword:encryptPassword('demo1234',role),version:1};
 const ages=[3,15,30,45,75,110,160,210,300,380,420,500];
 const models=state.config.models.slice(0,6),colors=state.config.colors.slice(0,6);
 function car(status,index) {
   const id=state.nextCarId++;
   const item={id,vin:'LDE'+year+String(id).padStart(10,'0'),model:models[index%models.length],submodel:index%2?'Premium':'Extended Range',color:colors[index%colors.length],location:state.config.locations[index%3],status,
    buyPrice:650000+index%6*100000,sellPrice:status==='Delivered'?950000+index%6*100000:0,
    receiveDate:day(-ages[index%ages.length]),paymentDueDate:day([-7,0,3,7,15,30][index%6]),
    batteryNumber:'000BAT'+String(id).padStart(5,'0'),frontMotorNumber:'000MOTOR'+String(id).padStart(5,'0'),rearMotorNumber:'',manufactureYear:year,
    salesCode:status==='Delivered'?'SALE-DEMO-'+id:'',customerName:status==='Delivered'?'ลูกค้าจำลอง '+id:'',releaseDate:status==='Delivered'?day(-10-index%6):'',
    inspected:false,transferDate:status==='Transferred'?day(-index-1):'',transferTo:status==='Transferred'?'ดีลเลอร์ตัวอย่าง '+(index+1):'',claims:[]};
   state.cars.push(item);return item;
 }
 function claim(detail,stage,index) {
   const amount=10000+index*2500,received=stage==='partial'?Math.round(amount/2):stage==='pending'?'':amount;
   return {id:state.nextClaimId++,detail,amount,dateReceived:stage==='pending'?'':day(-index%7-1),amountReceived:received,bank:stage==='pending'?'':state.config.banks[index%2]};
 }
 for(let i=0;i<12;i++)car(i%3===0?'Reserved':'Available',i);
 for(let i=0;i<3;i++) {
   const item=car('FloorPlan',i);item.stockStatus=i%2?'Available':'Reserved';
   if(i<2)Object.assign(item,{buyPrice:null,receiveDate:'',paymentDueDate:'',batteryNumber:'',manufactureYear:''});
 }
 for(let i=0;i<6;i++) {
   const item=car('Delivered',i);item.claims=[claim('เงินสนับสนุนการขาย','pending',i),claim('ค่าจัดกิจกรรม',i%2?'partial':'pending',i+1)];
 }
 for(let i=0;i<3;i++) {
   const item=car('Delivered',i+6);item.claims=[claim('เงินสนับสนุนรอตรวจ','received',i)];
 }
 for(let i=0;i<3;i++) {
   const item=car('Delivered',i+9);item.inspected=true;item.claims=[claim('เงินสนับสนุนตรวจแล้ว','received',i+3)];
 }
 for(let i=0;i<3;i++)car('Transferred',i);
 for(let i=0;i<6;i++) {
   const item=claim(['ค่าโฆษณาจำลอง','ค่าอบรมจำลอง','ค่ากิจกรรมจำลอง'][i%3],i<2?'pending':'received',i);
   item.inspected=i>=4;state.otherClaims.push(item);
 }
 return state;
}
