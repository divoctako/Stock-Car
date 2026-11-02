import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './domain.js';
export const cookieName = 'csm_native_session';
function secret() {
  const problems = [];
  if (!process.env.APP_PIN) problems.push('APP_PIN ยังไม่ได้ตั้งค่า');
  if ((process.env.SESSION_SECRET || '').length < 32) problems.push('SESSION_SECRET ต้องมีอย่างน้อย 32 ตัวอักษร');
  if (problems.length) throw new AppError('การตั้งค่าเซิร์ฟเวอร์ไม่ครบ: ' + problems.join('; ') + ' — ตั้งค่าใน Vercel Production แล้ว Redeploy', 503, 'CONFIGURATION_ERROR');
  return process.env.SESSION_SECRET;
}
export function equal(a, b) {
  const hash = value => createHmac('sha256', secret()).update(String(value)).digest();
  return timingSafeEqual(hash(a), hash(b));
}
function signature(value) { return createHmac('sha256', secret()).update(value + ':' + process.env.APP_PIN).digest('hex'); }
export function cookie(clear = false,role='admin',version=0) {
  const expires = String(Date.now() + 12 * 60 * 60 * 1000);
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production';
  const value=expires+'.'+role+'.'+version;
  return `${cookieName}=${clear ? '' : value + '.' + signature(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 43200}${secure ? '; Secure' : ''}`;
}
export function sessionIdentity(req) {
  const match = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='));
  if (!match) return null;
  const token = match.slice(cookieName.length + 1);
  const [exp,role,version,sig,extra] = token.split('.');
  if(extra || !/^\d+$/.test(exp) || Number(exp)<=Date.now() || !['admin','keeper','sales','claim'].includes(role) || !/^\d+$/.test(version||'') || !sig || !equal(sig,signature(exp+'.'+role+'.'+version)))return null;
  return {role,version:Number(version)};
}
export function authenticated(req){return !!sessionIdentity(req);}
export function loginKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return createHmac('sha256', secret()).update(ip).digest('hex');
}
