from pathlib import Path

p = Path("server/api-implementation/order-track.ts")
text = p.read_text()
old = "    preorderDelivery: bool(row.source_preorder_request_id ?? row.preorderDelivery),"
new = "    preorderDelivery: row.source_preorder_request_id != null ? Boolean(String(row.source_preorder_request_id).trim()) : bool(row.preorderDelivery),"
assert text.count(old) == 1, "generated preorder delivery flag mapping missing"
p.write_text(text.replace(old, new, 1))
