export const IMPORT_COLUMNS = ['vin','model','submodel','color','location','buyPrice','status','receiveDate','paymentDueDate','batteryNumber','frontMotorNumber','manufactureYear'];

// CSV records retain physical line numbers, including quoted multiline cells.
export function parseCarCSV(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text,'utf8') > 200 * 1024) throw new Error('ไฟล์ CSV ต้องไม่เกิน 200 KB');
  text=text.replace(/^\uFEFF/,'');
  const records=[];let cells=[],cell='',quoted=false,closed=false,line=1,start=1;
  function pushCell(){cells.push(cell);cell='';closed=false;}
  function pushRow(){pushCell();if(cells.some(value=>value.trim()))records.push({line:start,cells});cells=[];start=line+1;}
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}
      else {cell+=ch;if(ch==='\n')line++;}
    } else if(ch===',')pushCell();
    else if(ch==='\n'||ch==='\r') {pushRow();if(ch==='\r'&&text[i+1]==='\n')i++;line++;}
    else if(ch==='"'){if(cell||closed)throw new Error(`แถว ${line}: เครื่องหมายคำพูดใน CSV ไม่ถูกต้อง`);quoted=true;}
    else {if(closed)throw new Error(`แถว ${line}: มีข้อความหลังปิดเครื่องหมายคำพูด`);cell+=ch;}
  }
  if(quoted)throw new Error(`แถว ${start}: ยังไม่ปิดเครื่องหมายคำพูด`);
  if(cell||cells.length||closed)pushRow();
  if(!records.length)throw new Error('ไฟล์ CSV ว่าง');
  const headers=records.shift().cells.map(value=>value.trim().toLowerCase());
  const expected=IMPORT_COLUMNS.map(value=>value.toLowerCase());
  if(new Set(headers).size!==headers.length || headers.some(value=>!expected.includes(value)))throw new Error('หัวคอลัมน์ไม่ถูกต้องหรือซ้ำ กรุณาใช้ไฟล์แบบฟอร์ม CSV');
  for(const key of ['vin','model','submodel','color','location','receiveDate'])if(!headers.includes(key.toLowerCase()))throw new Error(`ไม่พบคอลัมน์ ${key} กรุณาใช้ไฟล์แบบฟอร์ม CSV`);
  if(!records.length || records.length>500)throw new Error('กรุณาระบุข้อมูลรถ 1–500 คันต่อไฟล์');
  return records.map(record=>{
    if(record.cells.length!==headers.length)throw new Error(`แถว ${record.line}: จำนวนคอลัมน์ไม่ตรงกับหัวตาราง`);
    const payload={};headers.forEach((key,index)=>{payload[IMPORT_COLUMNS[expected.indexOf(key)]]=record.cells[index].trim();});
    return {line:record.line,payload};
  });
}
