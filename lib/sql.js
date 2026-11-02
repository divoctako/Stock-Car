// Split our checked-in SQL scripts, including PL/pgSQL dollar-quoted bodies.
export async function runSql(client,sql) {
  let start=0,quote=null,line=false,block=false;
  for(let i=0;i<sql.length;i++) {
    const c=sql[i],n=sql[i+1];
    if(line) {if(c==='\n')line=false;continue;}
    if(block) {if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote) {
      if(quote==='$$') {if(c==='$'&&n==='$'){quote=null;i++;}}
      else if(c===quote){if(n===quote)i++;else quote=null;}
      continue;
    }
    if(c==='-'&&n==='-'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'){quote=c;continue;}
    if(c==='$'&&n==='$'){quote='$$';i++;continue;}
    if(c===';'){const statement=sql.slice(start,i).trim();if(statement)await client.query(statement);start=i+1;}
  }
  const last=sql.slice(start).trim();if(last&&!/^--[^\n]*$/.test(last))await client.query(last);
}
