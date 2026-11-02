"""Read the supplied inventory workbook into a local-only mockup fixture. Never edits Excel."""
import collections
import datetime as dt
import json
from pathlib import Path
import re
import sys
import openpyxl

def text(value):
    if value is None or str(value).strip() in ('-', ''):
        return ''
    return str(value).strip()

def date(value):
    if not value:
        return ''
    if isinstance(value, (dt.datetime, dt.date)):
        year = value.year - 543 if value.year > 2400 else value.year
        return value.replace(year=year).date().isoformat() if isinstance(value, dt.datetime) else value.replace(year=year).isoformat()
    match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', str(value))
    if match:
        day, month, year = map(int, match.groups())
        if year < 100:
            year += 2500
        if year > 2400:
            year -= 543
        return dt.date(year, month, day).isoformat()
    raise ValueError('Unrecognized date: ' + str(value))

def model_parts(asset):
    asset = re.sub(r'\s+', ' ', text(asset)).strip()
    match = re.match(r'^(?:BYD\s+)?(DOLPHIN|ATTO\s*[123]|SEALION\s*[567]|SEAL\s*[56]|T3)', asset, re.I)
    if not match:
        raise ValueError('Unrecognized model: ' + asset)
    name = re.sub(r'(ATTO|SEALION|SEAL)\s*(\d)', r'\1 \2', match[1], flags=re.I).title()
    submodel = asset[match.end():].strip(' -')
    submodel = re.sub(r'\s+BLUE$', '', submodel, flags=re.I)
    if submodel.startswith('(') and submodel.endswith(')'):
        submodel = submodel[1:-1]
    return 'BYD ' + name, submodel or 'ไม่ระบุรุ่นย่อย'

source, destination = map(Path, sys.argv[1:3])
workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
colors = {'WHITE':'ขาว','BLACK':'ดำ','GREY':'เทา','GRAY':'เทา','BLUE':'น้ำเงิน','GREEN':'เขียว','PURPLE':'ม่วง'}
hexes = {'ขาว':'#eef0f2','ดำ':'#22262b','เทา':'#8b9099','น้ำเงิน':'#213a8f','เขียว':'#5c8974','ม่วง':'#9d8bb5'}
cars, sheets, warnings, seen = [], [], [], set()
for sheet in list(workbook)[:2]:
    if not sheet.title.strip().startswith('สต๊อก BYD'):
        raise ValueError('Unexpected stock sheet: ' + sheet.title)
    branch = 'ขอนแก่น' if 'ขอนแก่น' in sheet.title else 'สกลนคร'
    count = 0
    for row_number, row in enumerate(sheet.iter_rows(values_only=True), 1):
        if len(row) < 18 or not re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}', text(row[9])):
            continue
        vin = text(row[9])
        if vin in seen:
            raise ValueError('Duplicate VIN: ' + vin)
        seen.add(vin)
        color_key = text(row[10]).upper()
        if color_key not in colors and text(row[11]).upper() in colors:
            color_key = text(row[11]).upper()
            warnings.append({'sheet':sheet.title.strip(),'row':row_number,'issue':'สีอยู่ในคอลัมน์ Type จึงอ่านสีจากคอลัมน์ L'})
        if color_key not in colors:
            raise ValueError('Unmapped color at ' + sheet.title + ':' + str(row_number))
        model, submodel = model_parts(row[8])
        parked = text(row[7])
        sold = 'ขาย' in parked
        location = parked or branch
        if sold:
            location = next((name for prefix,name in [('ขก','ขอนแก่น'),('สกล','สกลนคร'),('สว่าง','สว่างแดนดิน'),('กระนวน','กระนวน')] if parked.startswith(prefix)),branch)
        arrival = date(row[2])
        if not arrival:
            warnings.append({'sheet':sheet.title.strip(),'row':row_number,'issue':'ไม่ระบุวันที่รถลง'})
        cars.append({
            'id':len(cars)+1,'model':model,'submodel':submodel,'color':colors[color_key],
            'vin':vin,'location':location,'status':'Delivered' if sold else 'Available',
            'buyPrice':None,'receiveDate':arrival,'paymentDueDate':date(row[6]),
            'batteryNumber':text(row[13]),'frontMotorNumber':text(row[15]) or text(row[14]),
            'rearMotorNumber':text(row[16]),'engineNumber':text(row[14]),
            'manufactureYear':str(int(row[17])) if isinstance(row[17],(float,int)) else text(row[17]),
            'salesCode':parked if sold else '', 'customerName':'','releaseDate':'','sellPrice':None,
            'inspected':False,'transferDate':'','transferTo':'','claims':[],'claimsNotProvided':True,
            'amountFinanced':row[12] if isinstance(row[12],(int,float)) else None,
            'source':{'sheet':sheet.title.strip(),'row':row_number,'assetType':text(row[8]),
                      'paymentNote':text(row[1]),'parkingNote':parked,'firstFinanceDate':date(row[3]),
                      'vehicleType':text(row[11]) if text(row[11]).upper() not in colors else ''}
        })
        count += 1
    sheets.append({'sheet':sheet.title.strip(),'vehicles':count})
workbook.close()
ordered_unique = lambda key: list(dict.fromkeys(car[key] for car in cars))
fixture = {'config':{'models':ordered_unique('model'),'colors':ordered_unique('color'),
                    'colorHex':hexes,'locations':ordered_unique('location'),'banks':[],
                    'settings':{'brandName':'PIJITPHET'}},
           'cars':cars,'otherClaims':[],
           'source':{'filename':source.name,'sheets':sheets,'warnings':warnings,
                     'notes':['ราคาทุนไม่ระบุ วงเงิน Amount Financed เก็บแยกไว้','วันที่รถลงแปลง พ.ศ. เป็น ค.ศ.',
                              'หมายเหตุสถานที่จอดที่มีคำว่าขาย จัดเป็นส่งมอบแล้ว แต่ไม่สร้างวันที่ขายหรืองานเคลมขึ้นเอง']}}
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(fixture,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'vehicles':len(cars),'status':dict(collections.Counter(car['status'] for car in cars)),
                  'groups':len(set((car['model'],car['submodel']) for car in cars)),
                  'sheets':sheets,'warnings':warnings},ensure_ascii=False))
