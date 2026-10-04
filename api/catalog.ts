import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "./_db.js";
import { mapProduct } from "./_data/mappers.js";
import { json, methodNotAllowed } from "./_shared.js";

export default async function handler(req: VercelRequest,res: VercelResponse){
  if(req.method!=="GET")return methodNotAllowed(res,["GET"]);
  const page=Math.max(1,Math.floor(Number(req.query.page)||1)),pageSize=Math.min(48,Math.max(12,Math.floor(Number(req.query.pageSize)||24))),q=String(req.query.q||"").trim().slice(0,100),category=String(req.query.category||"");
  const values:unknown[]=[],conditions=["p.status='published'"];
  if(q){values.push(`%${q.toLowerCase()}%`);conditions.push(`(lower(p.name) LIKE $${values.length} OR lower(p.slug) LIKE $${values.length} OR EXISTS(SELECT 1 FROM unnest(p.tags) tag WHERE lower(tag) LIKE $${values.length}))`);}
  if(category){values.push(category);conditions.push(`p.category_id=$${values.length}`);}
  const where=`WHERE ${conditions.join(" AND ")}`,total=Number((await query<{count:number}>(`SELECT count(*)::int count FROM products p ${where}`,values)).rows[0]?.count||0);values.push(pageSize,(page-1)*pageSize);
  const select=`SELECT p.*,COALESCE((SELECT array_agg(pc.collection_id ORDER BY pc.collection_id) FROM product_collections pc WHERE pc.product_id=p.id),'{}') collection_ids,COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.color,v.size) FROM variants v WHERE v.product_id=p.id),'[]') variants FROM products p`;
  const rows=(await query<Record<string,unknown>>(`${select} ${where} ORDER BY p.sort_order DESC,p.updated_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values)).rows.map(mapProduct);
  return json(res,{items:rows,page,pageSize,total,pageCount:Math.max(1,Math.ceil(total/pageSize))},200,{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"});
}
