import {randomBytes,scryptSync,timingSafeEqual,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return {salt,hash:scryptSync(password,salt,32).toString('hex')};}
export function verifyPassword(password,credential){
  if(typeof password!=='string'||password.length>128||!credential?.salt||!credential?.hash)return false;
  const expected=Buffer.from(credential.hash,'hex'),actual=scryptSync(password,credential.salt,32);
  return expected.length===actual.length && timingSafeEqual(expected,actual);
}
function encryptionKey(){
  const secret=process.env.ROLE_PASSWORD_KEY || process.env.SESSION_SECRET;
  if(!secret || secret.length<32)throw new Error('ต้องตั้ง ROLE_PASSWORD_KEY หรือ SESSION_SECRET อย่างน้อย 32 ตัวอักษร');
  return createHash('sha256').update('role-password:v1:'+secret).digest();
}
export function encryptPassword(password,role){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(Buffer.from(role));
  const ciphertext=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
export function revealRolePassword(state,identity,role,initialAdminPassword){
  if(identity?.role!=='admin')throw Object.assign(new Error('เฉพาะ Admin สามารถดูรหัสผ่านได้'),{status:403,code:'FORBIDDEN'});
  if(!['admin','keeper','sales','claim'].includes(role))throw Object.assign(new Error('ตำแหน่งไม่ถูกต้อง'),{status:400,code:'VALIDATION'});
  const credential=state.roleCredentials?.[role];
  if(!credential)return {ok:true,password:role==='admin'?initialAdminPassword || null:null,reason:role==='admin'?'':'ยังไม่ได้ตั้งรหัสผ่านตำแหน่งนี้'};
  if(!credential.encryptedPassword)return {ok:true,password:null,reason:'รหัสเดิมเก็บเป็น hash กรุณาตั้งรหัสผ่านใหม่หนึ่งครั้งเพื่อเปิดใช้งานการดูรหัส'};
  try {
    const stored=credential.encryptedPassword,decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(stored.iv,'base64'));
    decipher.setAAD(Buffer.from(role));decipher.setAuthTag(Buffer.from(stored.tag,'base64'));
    const password=Buffer.concat([decipher.update(Buffer.from(stored.ciphertext,'base64')),decipher.final()]).toString('utf8');
    return {ok:true,password};
  } catch {return {ok:true,password:null,reason:'อ่านรหัสที่เข้ารหัสไว้ไม่ได้ กรุณาตั้งรหัสผ่านตำแหน่งนี้ใหม่'};}
}
