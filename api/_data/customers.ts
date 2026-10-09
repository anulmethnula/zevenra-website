import { query } from "../_db.js";
import { mapCustomer, mapOrder, mapPreorder } from "./mappers.js";

export async function createCustomer(input: Record<string, unknown>) {
  try {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO customers(id,first_name,last_name,email,mobile,password_hash,password_salt,status,created_at,updated_at,last_login_at) VALUES($1,$2,$3,lower($4),$5,$6,$7,'active',$8,$8,$8) RETURNING *`,
      [
        input.id,
        input.firstName,
        input.lastName,
        input.email,
        input.mobile || "",
        input.passwordHash,
        input.passwordSalt,
        input.createdAt,
      ],
    );
    return mapCustomer(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new Error("CUSTOMER_EXISTS");
    throw error;
  }
}

export async function getCustomerByEmail(email: string) {
  const result = await query<Record<string, unknown>>(
    "SELECT * FROM customers WHERE lower(email)=lower($1) LIMIT 1",
    [email],
  );
  return result.rows[0] ? mapCustomer(result.rows[0]) : null;
}
export async function getCustomerById(id: string) {
  const result = await query<Record<string, unknown>>(
    "SELECT * FROM customers WHERE id=$1 LIMIT 1",
    [id],
  );
  return result.rows[0] ? mapCustomer(result.rows[0]) : null;
}
export async function updateCustomerLastLogin(id: string) {
  await query(
    "UPDATE customers SET last_login_at=now(),updated_at=now() WHERE id=$1",
    [id],
  );
}
export async function updateCustomerProfile(
  id: string,
  input: Record<string, unknown>,
) {
  const result = await query<Record<string, unknown>>(
    `UPDATE customers SET first_name=$2,last_name=$3,mobile=$4,address1=$5,address2=$6,city=$7,district=$8,postal_code=$9,updated_at=now() WHERE id=$1 RETURNING *`,
    [
      id,
      input.firstName,
      input.lastName,
      input.mobile || "",
      input.address1 || "",
      input.address2 || "",
      input.city || "",
      input.district || "",
      input.postalCode || "",
    ],
  );
  if (!result.rows[0]) throw new Error("CUSTOMER_NOT_FOUND");
  return mapCustomer(result.rows[0]);
}

const orderWithItems = `SELECT o.*,COALESCE((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.order_id),'[]') AS items FROM orders o`;
export async function listCustomerOrders(customerId: string, _email?: string) {
  const result = await query<Record<string, unknown>>(
    `${orderWithItems} WHERE o.customer_id=$1 ORDER BY o.created_at DESC`,
    [customerId],
  );
  return result.rows.map(mapOrder);
}
export async function listCustomerPreorders(customerId: string, _email?: string) {
  const result = await query<Record<string, unknown>>(
    "SELECT * FROM preorders WHERE customer_id=$1 ORDER BY created_at DESC",
    [customerId],
  );
  return result.rows.map(mapPreorder);
}
