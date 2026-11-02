import assert from 'node:assert/strict';
import pg from 'pg';
import {database,readState} from '../lib/db.js';
import {cookie} from '../lib/auth.js';
import stock from '../api/stock.js';

const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
try {
 await client.connect();
 const {rows}=await client.query("SELECT to_regclass('public.app_document') AS legacy, (SELECT count(*) FROM cars) AS cars, (SELECT count(*) FROM export_cars) AS exported");
 assert.equal(rows[0].legacy,null);assert.equal(rows[0].cars,rows[0].exported);
 assert.equal((await client.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('json','jsonb')")).rows[0].count,'0');
 await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout='5s'");
 const car=(await client.query("INSERT INTO cars(vin,status) VALUES('RELATIONAL-VERIFICATION','Available') RETURNING id")).rows[0];
 const claim=(await client.query("INSERT INTO claims(car_id,detail,amount,amount_received,date_received) VALUES($1,'Verification rollback only',100,100,CURRENT_DATE) RETURNING id",[car.id])).rows[0];
 await client.query('UPDATE cars SET inspected=true WHERE id=$1',[car.id]);
 await client.query("UPDATE claims SET detail='Changed in rolled-back verification' WHERE id=$1",[claim.id]);
 assert.equal((await client.query('SELECT inspected FROM cars WHERE id=$1',[car.id])).rows[0].inspected,false);
 await client.query('DELETE FROM cars WHERE id=$1',[car.id]);
 assert.equal((await client.query('SELECT count(*) FROM claims WHERE id=$1',[claim.id])).rows[0].count,'0');
 assert.ok(Number((await client.query("SELECT count(*) FROM audit_log WHERE car_id=$1 AND action='sql:delete:cars'",[car.id])).rows[0].count)>0);
 await client.query('ROLLBACK');
 const state=await readState();
 let apiBootstrap='not run: local auth variables are not configured';
 if(process.env.APP_PIN && process.env.SESSION_SECRET?.length>=32) {
 const version=state.roleCredentials?.admin?.version||0;
 const req={method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',cookie:cookie(false,'admin',version).split(';')[0]},body:{action:'bootstrap'}};
 const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};
 await stock(req,res);assert.equal(res.statusCode,200);assert.equal(res.data.cars.length,state.cars.length);
 apiBootstrap='passed';
 }
 console.log(JSON.stringify({ok:true,cars:state.cars.length,exported:Number(rows[0].exported),legacyDeleted:true,jsonStorageColumns:0,sqlRules:'verified and rolled back',apiBootstrap}));
} catch(error) {
 await client.query('ROLLBACK').catch(()=>{});console.error('Verification failed:',error.message);process.exitCode=1;
} finally {await client.end();await database().end();}
