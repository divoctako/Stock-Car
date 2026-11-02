import { cookie, equal, loginKey } from '../lib/auth.js';
import { clearLoginAttempts, reserveLoginAttempt,readState } from '../lib/db.js';
import {verifyPassword} from '../lib/passwords.js';
import { AppError } from '../lib/domain.js';
import { sameOrigin, bodyJson, sendError } from '../lib/http.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    sameOrigin(req);
    if (req.method === 'DELETE') { res.setHeader('Set-Cookie', cookie(true)); return res.status(200).json({ ok: true }); }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, DELETE'); throw new AppError('ใช้ POST หรือ DELETE เท่านั้น', 405); }
    const body = bodyJson(req);
    const key = loginKey(req);
    if (!await reserveLoginAttempt(key)) throw new AppError('ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 10 นาที', 429, 'RATE_LIMIT');
    const state=await readState(),role=body.role || 'admin';
    if(!['admin','keeper','sales','claim'].includes(role))throw new AppError('กรุณาเลือกตำแหน่ง');
    const credential=state.roleCredentials?.[role];
    const valid=credential ? verifyPassword(body.pin,credential) : role==='admin' && body.pin && equal(String(body.pin),process.env.APP_PIN);
    if(!valid)throw new AppError('ตำแหน่งหรือรหัสผ่านไม่ถูกต้อง กรุณาติดต่อ Admin หากยังไม่ได้ตั้งรหัสผ่าน',401,'NEED_CODE');
    await clearLoginAttempts(key);
    res.setHeader('Set-Cookie', cookie(false,role,credential?.version || 0));
    return res.status(200).json({ ok: true,role });
  } catch (error) { return sendError(res, error); }
}
