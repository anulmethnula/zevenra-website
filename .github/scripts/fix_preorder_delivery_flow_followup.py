from pathlib import Path

p = Path("server/api-implementation/_data/preorders.ts")
text = p.read_text()
old = '    const paymentMethod: "bank" = "bank";'
new = '    const paymentMethod = "bank" as const;'
assert text.count(old) == 1, "generated payment method declaration missing"
p.write_text(text.replace(old, new, 1))

p = Path("tests/preorder-lifecycle.test.ts")
text = p.read_text()
old = '  assert.match(conversion,/const paymentMethod: "bank" = "bank"/);'
new = '  assert.match(conversion,/const paymentMethod = "bank" as const/);'
assert text.count(old) == 1, "generated payment method test assertion missing"
p.write_text(text.replace(old, new, 1))
