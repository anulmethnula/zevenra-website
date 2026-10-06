import { randomUUID } from "node:crypto";
import { query, withTransaction } from "../_db.js";
import { parseCourierRateFile, suggestedCourierRateField } from "./courier-rate-parser.js";

const fields = ["fromBranch", "destinationDistrict", "destinationCity", "firstKgCharge", "additionalKgCharge"] as const;
type Mapping = Record<(typeof fields)[number], string>;

const text = (value: unknown) => String(value ?? "").trim();
const key = (district: string, city: string) => `${district.trim().toLocaleLowerCase()}\u0000${city.trim().toLocaleLowerCase()}`;
const moneyValue = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const cleaned = text(value).replace(/[^0-9.-]/g, "");
  return cleaned ? Number(cleaned) : NaN;
};
export async function importCourierRateSheet(input: Record<string, unknown>) {
  const courierProviderId = text(input.courierProviderId), fileName = text(input.fileName), base64 = text(input.base64);
  if (!courierProviderId || !fileName || !base64) throw new Error("Courier, file name and file are required.");
  const parsed = await parseCourierRateFile(fileName, base64), id = randomUUID();
  return withTransaction(async (client) => {
    const courier = await client.query("SELECT 1 FROM courier_providers WHERE id=$1", [courierProviderId]);
    if (!courier.rowCount) throw new Error("Courier provider not found.");
    const version = Number((await client.query<{ version: number }>("SELECT COALESCE(max(version),0)::int+1 version FROM courier_rate_cards WHERE courier_provider_id=$1", [courierProviderId])).rows[0]?.version || 1);
    await client.query(`INSERT INTO courier_rate_cards(id,courier_provider_id,version,source_file_name,source_file_type,detected_headers,total_rows) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, [id,courierProviderId,version,fileName,parsed.extension,JSON.stringify(parsed.headers),parsed.rows.length]);
    await client.query(`INSERT INTO courier_rate_import_rows(rate_card_id,row_number,raw_data)
      SELECT $1,x.row_number,x.raw::jsonb FROM jsonb_to_recordset($2::jsonb) AS x(row_number int,raw jsonb)`, [id,JSON.stringify(parsed.rows)]);
    const suggestions = Object.fromEntries(parsed.headers.map((header) => [header,suggestedCourierRateField(header)]).filter(([,field]) => field));
    return { id, version, fileName, headers: parsed.headers, suggestions, totalRows: parsed.rows.length, preview: parsed.rows.slice(0,8) };
  });
}

export async function validateCourierRateSheet(input: Record<string, unknown>) {
  const id = text(input.id), rawMapping = input.mapping as Record<string, unknown> | undefined;
  if (!id || !rawMapping) throw new Error("Rate card and column mapping are required.");
  const mapping = Object.fromEntries(fields.map((field) => [field,text(rawMapping[field])])) as Mapping;
  if (fields.some((field) => !mapping[field])) throw new Error("Map all five required columns.");
  if (new Set(Object.values(mapping)).size !== fields.length) throw new Error("Each source column can only be mapped once.");
  return withTransaction(async (client) => {
    const card = (await client.query<Record<string, unknown>>("SELECT * FROM courier_rate_cards WHERE id=$1 FOR UPDATE",[id])).rows[0];
    if (!card || card.status !== "draft") throw new Error("Only draft rate cards can be validated.");
    const source = (await client.query<{ row_number:number; raw_data:Record<string,unknown> }>("SELECT row_number,raw_data FROM courier_rate_import_rows WHERE rate_card_id=$1 ORDER BY row_number",[id])).rows;
    const active = (await client.query<Record<string,unknown>>(`SELECT r.destination_district,r.destination_city,r.first_kg_charge,r.additional_kg_charge FROM courier_rates r JOIN courier_rate_cards c ON c.id=r.rate_card_id WHERE c.courier_provider_id=$1 AND c.status='active'`,[card.courier_provider_id])).rows;
    const prior = new Map(active.map((row)=>[key(text(row.destination_district),text(row.destination_city)),row])), occurrences = new Map<string,number>();
    const normalized = source.map((row) => {
      const district=text(row.raw_data[mapping.destinationDistrict]), city=text(row.raw_data[mapping.destinationCity]), fromBranch=text(row.raw_data[mapping.fromBranch]), first=moneyValue(row.raw_data[mapping.firstKgCharge]), additional=moneyValue(row.raw_data[mapping.additionalKgCharge]), errors:string[]=[];
      if(!district)errors.push("Destination district is required."); if(!city)errors.push("Destination city / area is required.");
      if(!Number.isFinite(first)||first<0)errors.push("First kg charge must be zero or more."); if(!Number.isFinite(additional)||additional<0)errors.push("Additional kg charge must be zero or more.");
      const duplicateKey=key(district,city); occurrences.set(duplicateKey,(occurrences.get(duplicateKey)||0)+1);
      const existing=prior.get(duplicateKey), changeKind=!existing?"new":Number(existing.first_kg_charge)!==first||Number(existing.additional_kg_charge)!==additional?"changed":"unchanged";
      return {rowNumber:row.row_number,fromBranch,destinationDistrict:district,destinationCity:city,firstKgCharge:Number.isFinite(first)?first:null,additionalKgCharge:Number.isFinite(additional)?additional:null,errors,duplicateKey,changeKind};
    });
    for(const row of normalized)if(occurrences.get(row.duplicateKey)!>1)row.errors.push("Duplicate destination district and city in this file.");
    const updates=normalized.map((row)=>({rowNumber:row.rowNumber,fromBranch:row.fromBranch,destinationDistrict:row.destinationDistrict,destinationCity:row.destinationCity,firstKgCharge:row.firstKgCharge,additionalKgCharge:row.additionalKgCharge,errors:row.errors,changeKind:row.changeKind,status:row.errors.some(error=>error.startsWith("Duplicate"))?"duplicate":row.errors.length?"invalid":"valid"}));
    await client.query(`UPDATE courier_rate_import_rows target SET validation_status=x.status,validation_errors=x.errors,from_branch=x.from_branch,destination_district=x.destination_district,destination_city=x.destination_city,first_kg_charge=x.first_kg_charge,additional_kg_charge=x.additional_kg_charge,change_kind=x.change_kind FROM jsonb_to_recordset($2::jsonb) AS x(row_number int,status text,errors text[],from_branch text,destination_district text,destination_city text,first_kg_charge numeric,additional_kg_charge numeric,change_kind text) WHERE target.rate_card_id=$1 AND target.row_number=x.row_number`,[id,JSON.stringify(updates.map(row=>({row_number:row.rowNumber,status:row.status,errors:row.errors,from_branch:row.fromBranch,destination_district:row.destinationDistrict,destination_city:row.destinationCity,first_kg_charge:row.firstKgCharge,additional_kg_charge:row.additionalKgCharge,change_kind:row.changeKind})))]);
    const counts={valid:updates.filter(r=>r.status==="valid").length,invalid:updates.filter(r=>r.status==="invalid").length,duplicate:updates.filter(r=>r.status==="duplicate").length,new:updates.filter(r=>r.status==="valid"&&r.changeKind==="new").length,changed:updates.filter(r=>r.status==="valid"&&r.changeKind==="changed").length};
    await client.query("UPDATE courier_rate_cards SET column_mapping=$2::jsonb,valid_rows=$3,invalid_rows=$4,duplicate_rows=$5,new_rows=$6,changed_rows=$7 WHERE id=$1",[id,JSON.stringify(mapping),counts.valid,counts.invalid,counts.duplicate,counts.new,counts.changed]);
    return {...counts,total:updates.length,preview:updates.filter(row=>row.status!=="valid").slice(0,25).concat(updates.filter(row=>row.status==="valid").slice(0,10))};
  });
}

export async function confirmCourierRateSheet(id: string) {
  return withTransaction(async(client)=>{const card=(await client.query<Record<string,unknown>>("SELECT * FROM courier_rate_cards WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!card||card.status!=="draft")throw new Error("Only a validated draft can be confirmed.");if(Number(card.invalid_rows)||Number(card.duplicate_rows))throw new Error("Resolve invalid and duplicate rows before confirming this rate card.");if(!Number(card.valid_rows))throw new Error("Validate the mapped columns before confirming.");await client.query("DELETE FROM courier_rates WHERE rate_card_id=$1",[id]);await client.query(`INSERT INTO courier_rates(rate_card_id,courier_provider_id,from_branch,destination_district,destination_city,first_kg_charge,additional_kg_charge) SELECT $1,$2,from_branch,destination_district,destination_city,first_kg_charge,additional_kg_charge FROM courier_rate_import_rows WHERE rate_card_id=$1 AND validation_status='valid'`,[id,card.courier_provider_id]);await client.query("UPDATE courier_rate_cards SET status='ready' WHERE id=$1",[id]);await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','rate_card_confirmed','courier_rate_card',$1,$2::jsonb)",[id,JSON.stringify({rows:card.valid_rows,fileName:card.source_file_name})]);return {id,status:"ready"};});
}

export async function setCourierRateCardStatus(id:string,activate:boolean){return withTransaction(async(client)=>{const card=(await client.query<Record<string,unknown>>("SELECT * FROM courier_rate_cards WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!card)throw new Error("Rate card not found.");if(activate){if(!["ready","inactive","active"].includes(String(card.status)))throw new Error("Confirm this rate card before activation.");await client.query("UPDATE courier_rate_cards SET status='inactive',deactivated_at=now() WHERE courier_provider_id=$1 AND status='active' AND id<>$2",[card.courier_provider_id,id]);await client.query("UPDATE courier_rate_cards SET status='active',activated_at=now(),deactivated_at=NULL WHERE id=$1",[id]);}else{if(card.status!=="active")throw new Error("Only the active rate card can be deactivated.");await client.query("UPDATE courier_rate_cards SET status='inactive',deactivated_at=now() WHERE id=$1",[id]);}await client.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner',$2,'courier_rate_card',$1,$3::jsonb)",[id,activate?"rate_card_activated":"rate_card_deactivated",JSON.stringify({version:card.version,courierProviderId:card.courier_provider_id})]);return {id,status:activate?"active":"inactive"};});}

export async function listCourierRateCards(courierProviderId=""){const values=courierProviderId?[courierProviderId]:[];return (await query<Record<string,unknown>>(`SELECT c.*,p.name courier_name FROM courier_rate_cards c JOIN courier_providers p ON p.id=c.courier_provider_id${courierProviderId?" WHERE c.courier_provider_id=$1":""} ORDER BY c.imported_at DESC`,values)).rows.map(row=>({id:String(row.id),courierProviderId:String(row.courier_provider_id),courierName:String(row.courier_name),version:Number(row.version),status:String(row.status),fileName:String(row.source_file_name),importedAt:String(row.imported_at),activatedAt:row.activated_at?String(row.activated_at):"",total:Number(row.total_rows),valid:Number(row.valid_rows),invalid:Number(row.invalid_rows),duplicate:Number(row.duplicate_rows),new:Number(row.new_rows),changed:Number(row.changed_rows),headers:Array.isArray(row.detected_headers)?row.detected_headers:[],mapping:row.column_mapping||{}}));}

export async function previewCourierRateCard(id:string,page=1){const safePage=Math.max(1,Math.floor(page)),pageSize=50,[card,rows]=await Promise.all([query<Record<string,unknown>>("SELECT * FROM courier_rate_cards WHERE id=$1",[id]),query<Record<string,unknown>>("SELECT row_number,validation_status,validation_errors,from_branch,destination_district,destination_city,first_kg_charge,additional_kg_charge,change_kind,raw_data FROM courier_rate_import_rows WHERE rate_card_id=$1 ORDER BY CASE validation_status WHEN 'duplicate' THEN 0 WHEN 'invalid' THEN 1 ELSE 2 END,row_number LIMIT $2 OFFSET $3",[id,pageSize,(safePage-1)*pageSize])]);if(!card.rowCount)throw new Error("Rate card not found.");return {page:safePage,pageSize,rows:rows.rows};}
