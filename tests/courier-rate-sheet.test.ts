import test from "node:test";
import assert from "node:assert/strict";
import { duplicateCourierRateKeys, normalizeCourierRateImportRows, parseCourierRateFile, suggestedCourierRateField } from "../api/_data/courier-rate-parser.ts";
import { initialCourierSelection } from "../src/services/deliverySettings.ts";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit=0;bit<8;bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function xlsxBase64(rows: string[][]) {
  const esc=(value:string)=>value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row,index)=>`<row r="${index+1}">${row.map((value,column)=>`<c r="${String.fromCharCode(65+column)}${index+1}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files:Record<string,string>={
    "[Content_Types].xml":`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels":`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rates" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml":sheet,
  };
  const chunks:Buffer[]=[],central:Buffer[]=[];let offset=0;
  for(const [name,value] of Object.entries(files)){const n=Buffer.from(name),data=Buffer.from(value),crc=crc32(data),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);chunks.push(local,n,data);const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42);central.push(entry,n);offset+=local.length+n.length+data.length;}
  const centralSize=central.reduce((sum,item)=>sum+item.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,...central,end]).toString("base64");
}

test("detects courier CSV headers and preserves quoted values", async () => {
  const csv = [
    "From Branch,To District,To City,Charge for 1st kg,Charge per additional 1kg",
    'Colombo,Colombo,"Colombo 01, Fort",350,100',
    "Kandy,Kandy,Peradeniya,450,120",
  ].join("\n");
  const result = await parseCourierRateFile("rates.csv", Buffer.from(csv).toString("base64"));
  assert.deepEqual(result.headers, ["From Branch","To District","To City","Charge for 1st kg","Charge per additional 1kg"]);
  assert.equal(result.headerRowNumber, 1);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].rowNumber, 2);
  assert.equal(result.rows[0].raw["To City"], "Colombo 01, Fort");
});

test("ignores blank CSV rows while preserving physical row numbers", async () => {
  const csv="From Branch,To District,To City,Charge for 1st kg,Charge per additional 1kg\n\nColombo,Colombo,Fort,350,100";
  const result=await parseCourierRateFile("rates.csv",Buffer.from(csv).toString("base64"));
  assert.equal(result.rows.length,1); assert.equal(result.rows[0].rowNumber,3);
});

test("parses XLSX rows and preserves physical sheet row numbers", async () => {
  const result=await parseCourierRateFile("rates.xlsx",xlsxBase64([["From Branch","To District","To City","Charge for 1st kg","Charge per additional 1kg"],["","","","",""] ,["Colombo","Colombo","Fort","350","100"]]));
  assert.equal(result.rows.length,1); assert.equal(result.rows[0].rowNumber,3); assert.equal(result.rows[0].raw["To City"],"Fort");
});

test("detects Koombiyo-style headers after a title row and begins data on row 3", async () => {
  const headers=["From Branch","To District","To City","Charge for 1st kg","Charge per additional 1kg"];
  const result=await parseCourierRateFile("koombiyo.xlsx",xlsxBase64([["Koombiyo Delivery","Delivery Rates"],headers,["Colombo","Colombo","Fort","350","100"]]));
  assert.equal(result.headerRowNumber,2);
  assert.deepEqual(result.headers,headers);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].rowNumber,3);
  assert.equal(result.rows[0].raw["From Branch"],"Colombo");
});

test("detects headers after blank leading rows", async () => {
  const result=await parseCourierRateFile("rates.xlsx",xlsxBase64([[""],[""],["From Branch","To District","To City","Charge for 1st kg","Charge per additional 1kg"],["Colombo","Colombo","Fort","350","100"]]));
  assert.equal(result.headerRowNumber,3);
  assert.equal(result.rows[0].rowNumber,4);
});

test("rejects a sheet without a recognizable header row", async () => {
  await assert.rejects(()=>parseCourierRateFile("unknown.xlsx",xlsxBase64([["Delivery rates"],["Colombo","Fort","350"]])),/recognizable courier-rate header row/);
});

test("auto-maps all five real courier headers", () => {
  assert.deepEqual(Object.fromEntries(["From Branch","To District","To City","Charge for 1st kg","Charge per additional 1kg"].map(header=>[header,suggestedCourierRateField(header)])),{
    "From Branch":"fromBranch","To District":"destinationDistrict","To City":"destinationCity","Charge for 1st kg":"firstKgCharge","Charge per additional 1kg":"additionalKgCharge",
  });
});

test("global import requires explicit courier while courier-scoped import preselects it", () => {
  const couriers=[{id:"courier-1",name:"Koombiyo",active:true}] as never[];
  assert.equal(initialCourierSelection(couriers),"");
  assert.equal(initialCourierSelection(couriers,"courier-1"),"courier-1");
});

test("normalizes database insert rows without nullable row_number", () => {
  const payload=normalizeCourierRateImportRows([{rowNumber:7,raw:{City:"Fort"}}]);
  assert.deepEqual(payload,[{row_number:7,raw:{City:"Fort"}}]); assert.equal(payload[0].row_number,7);
});

test("duplicate destination detection remains case and whitespace insensitive", () => {
  const duplicates=duplicateCourierRateKeys([{district:"Colombo",city:"Fort"},{district:" colombo ",city:"fort"},{district:"Kandy",city:"Peradeniya"}]);
  assert.equal(duplicates.has("colombo\u0000fort"),true); assert.equal(duplicates.size,1);
});

test("parses a multi-thousand-row XLSX within the import limit", async () => {
  const rows=[["From Branch","To District","To City","Charge for 1st kg","Charge per additional 1kg"],...Array.from({length:9001},(_,index)=>["Colombo","Colombo",`Area ${index+1}`,"350","100"])];
  const result=await parseCourierRateFile("large.xlsx",xlsxBase64(rows));
  assert.equal(result.rows.length,9001); assert.equal(result.rows.at(-1)?.rowNumber,9002);
});

test("rejects unsupported courier rate-sheet formats", async () => {
  await assert.rejects(() => parseCourierRateFile("rates.xls", Buffer.from("data").toString("base64")), /xlsx or \.csv/);
});
