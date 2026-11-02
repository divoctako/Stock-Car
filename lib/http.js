import { AppError } from './domain.js';
export function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('ไม่อนุญาตคำขอจากเว็บไซต์อื่น', 403, 'FORBIDDEN');
  if (req.headers.origin) {
    const host = req.headers.host;
    let origin;
    try { origin = new URL(req.headers.origin); } catch { throw new AppError('Origin ไม่ถูกต้อง', 403); }
    if (origin.host !== host) throw new AppError('ไม่อนุญาตคำขอจากเว็บไซต์อื่น', 403, 'FORBIDDEN');
  }
}
export function bodyJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new AppError('ต้องส่ง application/json', 415);
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw new AppError('JSON ไม่ถูกต้อง'); } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('ข้อมูลคำขอไม่ถูกต้อง');
  if (Buffer.byteLength(JSON.stringify(body)) > 512 * 1024) throw new AppError('ข้อมูลเกิน 512 KB', 413);
  return body;
}
export function sendError(res, error) {
  if (!error.status) console.error('API error:', error.code || error.name);
  return res.status(error.status || 500).json({ ok: false, error: error.code && error.status ? error.code : 'SERVER_ERROR',
    message: error.status ? error.message : 'ระบบยังไม่พร้อมใช้งาน กรุณาตรวจ Environment Variables และการตั้งค่าฐานข้อมูล' });
}
