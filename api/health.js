import {database} from '../lib/db.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false});
  try {
    const {rows}=await database().query("SELECT to_regclass('public.app_meta') IS NOT NULL AS relational, to_regclass('public.app_document') IS NOT NULL AS legacy");
    return res.status(200).json({ok:true,version:'5.0-relational',storage:rows[0].relational?'relational':rows[0].legacy?'legacy':'uninitialized'});
  } catch {return res.status(503).json({ok:false,version:'5.0-relational'});}
}
