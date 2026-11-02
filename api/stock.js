import { createHash } from 'node:crypto';
import { authenticated,sessionIdentity,cookie } from '../lib/auth.js';
import { readState, executeWrite } from '../lib/db.js';
import { AppError, readActions, writeActions, snapshot, previewCarImport,authorizeRole } from '../lib/domain.js';
import { sameOrigin, bodyJson, sendError } from '../lib/http.js';
import {revealRolePassword} from '../lib/passwords.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new AppError('ใช้ POST เท่านั้น', 405); }
    sameOrigin(req);
    if (!authenticated(req)) throw new AppError('กรุณาเข้าสู่ระบบ', 401, 'NEED_CODE');
    const body = bodyJson(req);
    const identity=sessionIdentity(req),state=await readState();
    delete body._session;
    authorizeRole(state,identity,body);
    body._session=identity;
    if(identity.role!=='admin')body.role=identity.role;
    if(body.action==='revealRolePassword')return res.status(200).json(revealRolePassword(state,identity,body.payload?.targetRole,process.env.APP_PIN));
    if (body.action === 'previewImportCars') return res.status(200).json(previewCarImport(state,body));
    if (readActions.has(body.action)) return res.status(200).json({...snapshot(state,'',identity.role),sessionRole:identity.role});
    if (!writeActions.has(body.action)) throw new AppError('ไม่รู้จักคำสั่ง', 400, 'UNKNOWN_ACTION');
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestId || '')) throw new AppError('กรุณาส่ง requestId ที่ถูกต้อง');
    const payload = { action: body.action, carId: body.carId, carIds: body.carIds, claimId: body.claimId, payload: body.payload, claims: body.claims, role: body.role };
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const result=await executeWrite(body,fingerprint);
    if(body.action==='saveRolePassword' && body.payload.targetRole===identity.role)res.setHeader('Set-Cookie',cookie(true));
    return res.status(200).json(result);
  } catch (error) { return sendError(res, error); }
}
