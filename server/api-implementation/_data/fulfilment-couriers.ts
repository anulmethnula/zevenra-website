import { randomUUID } from "node:crypto";
import { query } from "../_db.js";

const mapCourier=(row:Record<string,unknown>)=>({
  id:String(row.id||""),name:String(row.name||""),phone:String(row.phone||""),
  trackingUrlTemplate:String(row.tracking_url_template||""),notes:String(row.notes||""),
  active:row.active===true,sortOrder:Number(row.sort_order)||0,
  createdAt:row.created_at?new Date(String(row.created_at)).toISOString():"",
  updatedAt:row.updated_at?new Date(String(row.updated_at)).toISOString():"",
});

export async function listFulfilmentCouriers(activeOnly=false){
  const result=await query<Record<string,unknown>>(`SELECT * FROM fulfilment_couriers${activeOnly?" WHERE active=true":""} ORDER BY sort_order,name,id`);
  return result.rows.map(mapCourier);
}

export async function saveFulfilmentCourier(input:Record<string,unknown>){
  const id=String(input.id||"").trim()||randomUUID(),name=String(input.name||"").trim();
  if(!name)throw new Error("Courier name is required.");
  const trackingUrlTemplate=String(input.trackingUrlTemplate||"").trim();
  if(trackingUrlTemplate&&!/^https:\/\//i.test(trackingUrlTemplate))throw new Error("Tracking URL template must start with https://.");
  const result=await query<Record<string,unknown>>(`INSERT INTO fulfilment_couriers(id,name,phone,tracking_url_template,notes,active,sort_order,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,
    tracking_url_template=EXCLUDED.tracking_url_template,notes=EXCLUDED.notes,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,updated_at=now() RETURNING *`,
    [id,name,String(input.phone||"").trim(),trackingUrlTemplate,String(input.notes||"").trim(),input.active!==false,Number(input.sortOrder)||0]);
  return mapCourier(result.rows[0]);
}
