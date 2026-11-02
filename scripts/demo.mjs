// Local mockup only. Never imported by production API routes.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { initialState, snapshot, mutate, readActions, writeActions, previewCarImport,authorizeRole } from '../lib/domain.js';
import {verifyPassword,revealRolePassword} from '../lib/passwords.js';
process.env.ROLE_PASSWORD_KEY ||= randomBytes(32).toString('hex');
import { sameOrigin, bodyJson } from '../lib/http.js';
let state = initialState();
state.config.locations = ['โชว์รูมสำนักงานใหญ่', 'สาขาบางนา'];
state.config.banks = ['บัญชีตัวอย่างสำหรับตรวจหน้าจอ'];
const models = ['Stock Atto 3','Stock Dolphin','Stock Seal','Stock Sealion 6','Stock Sealion 7','Stock M6'];
const colors = ['ขาว','เทา','ดำ','เงิน','น้ำเงิน','ขาว'];
const dates = ['2026-10-15','2026-09-22','2026-08-10','2026-06-15','2026-10-01','2026-09-10'];
for (let i = 0; i < 12; i++) state.cars.push({
  id: i + 1, model: models[i % 6], submodel: i % 2 ? 'Premium' : 'Extended Range', color: colors[i % 6],
  location: state.config.locations[i % 2], vin: `DEMO2026${String(i + 1).padStart(5, '0')}`, buyPrice: 650000 + (i % 6) * 125000,
  receiveDate: dates[i % 6], status: i < 8 ? (i % 3 ? 'Available' : 'Reserved') : i === 11 ? 'Transferred' : 'Delivered',
  paymentDueDate: i % 3 ? '2026-11-15' : '', batteryNumber: `000BAT${String(i + 1).padStart(5, '0')}`,
  frontMotorNumber: `000MOTOR${String(i + 1).padStart(5, '0')}`, manufactureYear: '2026',
  salesCode: 'DEMO-001', customerName: 'ลูกค้าตัวอย่าง', releaseDate: i >= 8 ? '2026-10-20' : '', sellPrice: 1100000,
  inspected: i === 10, transferDate: i === 11 ? '2026-10-19' : '', transferTo: i === 11 ? 'สาขาตัวอย่าง' : '',
  claims: i >= 8 && i < 11 ? [{ id: i * 10, detail: 'เงินสนับสนุนการขาย', amount: 35000, dateReceived: i === 8 ? '' : '2026-10-22', amountReceived: i === 8 ? '' : 35000, bank: i === 8 ? '' : state.config.banks[0] }] : []
});
state.otherClaims = [{ id: 999, detail: 'รายการเคลมตัวอย่าง', amount: 12000, dateReceived: '', amountReceived: '', bank: '' }];

state.nextCarId = 13;
state.nextClaimId = 1000;
// Optional local snapshot lets a developer restart the demo without discarding edits.
let savedDemo;
if (process.env.DEMO_SNAPSHOT) savedDemo = JSON.parse(await readFile(process.env.DEMO_SNAPSHOT, 'utf8'));
else {
  try { savedDemo = JSON.parse(await readFile(new URL('../demo-data/byd-stock.json', import.meta.url), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (savedDemo) {
  const saved = savedDemo;
  state.config = { ...state.config, ...saved.config }; state.cars = saved.cars; state.otherClaims = saved.otherClaims || [];
  state.configRevision = saved.configRevision || 0;
  state.roleCredentials = saved.roleCredentials || {};
  state.nextCarId = Math.max(0, ...state.cars.map(car => car.id)) + 1;
  state.nextClaimId = Math.max(0, ...state.otherClaims.map(claim => claim.id), ...state.cars.flatMap(car => (car.claims || []).map(claim => claim.id))) + 1;
}
const sessions = new Map();
const receipts = new Map();
const assets = { '/stock-import-template.csv': ['stock-import-template.csv','text/csv'], '/premium.css': ['premium.css', 'text/css'], '/pijithet-logo.png': ['pijithet-logo.png', 'image/png'], '/': ['index.html','text/html'], '/index.html': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/theme.js': ['theme.js','text/javascript'], '/styles.css': ['styles.css','text/css'] };
http.createServer(async (req, res) => {
  const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
  res.setHeader('Cache-Control', 'no-store');
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/login' || pathname === '/api/stock') {
      sameOrigin(req);
      if (pathname === '/api/login' && req.method === 'DELETE') {
        res.setHeader('Set-Cookie', 'csm_demo=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return send(200, {ok:true});
      }
      if (req.method !== 'POST') return send(405, {ok:false,message:'ใช้ POST เท่านั้น'});
      const chunks=[]; let size=0;
      for await (const chunk of req) { size += chunk.length; if (size > 512 * 1024) return send(413, {ok:false,message:'ข้อมูลยาวเกินไป'}); chunks.push(chunk); }
      req.body = Buffer.concat(chunks).toString();
      const body = bodyJson(req);
      if (pathname === '/api/login') {
        const role=body.role || 'admin',credential=state.roleCredentials?.[role];
        if(!['admin','keeper','sales','claim'].includes(role) || !(credential ? verifyPassword(body.pin,credential) : role==='admin' && body.pin==='demo1234'))return send(401,{ok:false,message:'ตำแหน่งหรือรหัสผ่านไม่ถูกต้อง (Admin เริ่มต้น: demo1234)'});
        const token=randomBytes(24).toString('hex');
        sessions.set(token,{role,version:credential?.version || 0,expires:Date.now()+12*60*60*1000});
        res.setHeader('Set-Cookie', 'csm_demo=' + token + '; Path=/; HttpOnly; SameSite=Lax'); return send(200, {ok:true,role});
      }
      const token=String(req.headers.cookie || '').split(';').map(c=>c.trim()).find(c=>c.startsWith('csm_demo='))?.slice(9);
      const identity=sessions.get(token);
      if(!identity || identity.expires<Date.now())return send(401,{ok:false,error:'NEED_CODE',message:'กรุณาเข้าสู่ระบบ'});
      delete body._session;
      authorizeRole(state,identity,body);
      body._session=identity;
      if(identity.role!=='admin')body.role=identity.role;
      if(body.action==='revealRolePassword')return send(200,revealRolePassword(state,identity,body.payload?.targetRole,'demo1234'));
      if (body.action === 'previewImportCars') return send(200, previewCarImport(state,body));
      if (readActions.has(body.action)) return send(200, {...snapshot(state,'',identity.role),sessionRole:identity.role});
      if (!writeActions.has(body.action)) return send(400, {ok:false,message:'ไม่รู้จักคำสั่ง'});
      if (receipts.has(body.requestId)) return send(200, snapshot(state, receipts.get(body.requestId),identity.role));
      const draft = structuredClone(state);
      const result = mutate(draft, body);
      state = draft;
      if (body.requestId) receipts.set(body.requestId, result.message);
      return send(200, snapshot(state, result.message,identity.role));
    }
    const asset = assets[pathname];
    if (!asset) { res.statusCode=404;res.end('Not found');return; }
    res.setHeader('Content-Type', asset[1] + (asset[1].startsWith('text/') ? '; charset=utf-8' : ''));
    let content = await readFile(new URL('../public/' + asset[0], import.meta.url));
    if (asset[0] === 'index.html') content = content.toString().replace('<title>', '<title>Mockup · ').replace('</body>', '<div class="demo-notice" style="position:fixed;bottom:8px;right:12px;z-index:90;padding:6px 12px;border-radius:9px;background:#ffffffed;border:1px solid #dce4ed;color:#526174;font:11px Kanit,sans-serif;pointer-events:none">MOCKUP · ข้อมูลตัวอย่าง · รหัส demo1234</div></body>');
    res.end(content);
  } catch (error) { send(error.status || 400, {ok:false,error:error.code || 'VALIDATION',message:error.message}); }
}).listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log('Mockup: http://localhost:' + (process.env.PORT || 3000) + ' | PIN: demo1234 | In-memory sample data only'));
