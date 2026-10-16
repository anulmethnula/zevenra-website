from pathlib import Path

p=Path('server/api-implementation/_data/order-cancellation.ts')
text=p.read_text()
old='JSON.stringify({reason,from:status,restockedUnits,paymentStatus})'
new='JSON.stringify({reason,from:status,restoredUnits,paymentStatus})'
assert text.count(old)==1, 'customer cancellation audit typo block missing'
p.write_text(text.replace(old,new,1))

p=Path('tests/order-workflow.test.ts')
text=p.read_text()
old='''  assert.match(backend,/cancellingPrepaidBank/);\n  assert.match(backend,/cancellingPrepaidBank \\? "refund pending"/);'''
new='''  assert.match(backend,/cancellingPaidOrder/);\n  assert.match(backend,/cancellingPaidOrder \\? "refund pending"/);'''
assert text.count(old)==1, 'old cancellation payment assertions missing'
p.write_text(text.replace(old,new,1))
