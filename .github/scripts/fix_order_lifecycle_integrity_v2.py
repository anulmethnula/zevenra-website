from pathlib import Path


def replace_exact(path, old, new, expected=1):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} match(es), found {count}\n--- OLD ---\n{old[:500]}")
    p.write_text(text.replace(old, new))


path = "src/features/store/StoreContext.tsx"
replace_exact(
    path,
    '''  updateOrder: (patch: Partial<Order> & { orderId: string }) => Promise<Order>;
  updatePreorder: (
''',
    '''  updateOrder: (patch: Partial<Order> & { orderId: string }) => Promise<Order>;
  refreshOrder: (orderId: string) => Promise<Order>;
  refreshProducts: () => Promise<void>;
  updatePreorder: (
''',
)
replace_exact(
    path,
    '''  const refreshPreorders = useCallback(async () => {
''',
    '''  const refreshOrder = useCallback(async (orderId: string) => {
    if (demo) throw new Error("Order refresh is unavailable in demo mode.");
    const updated = await adminApi.get<Order>("getOrder", { orderId });
    setAdmin((current) => ({
      ...current,
      orders: current.orders.some((order) => order.orderId === updated.orderId)
        ? current.orders.map((order) =>
            order.orderId === updated.orderId ? { ...order, ...updated } : order,
          )
        : [updated, ...current.orders],
    }));
    return updated;
  }, []);
  const refreshProducts = useCallback(async () => {
    if (demo) return;
    await refreshEntity("products");
  }, [refreshEntity]);
  const refreshPreorders = useCallback(async () => {
''',
)
replace_exact(
    path,
    '''      updateOrder,
      updatePreorder,
''',
    '''      updateOrder,
      refreshOrder,
      refreshProducts,
      updatePreorder,
''',
    expected=2,
)

path = "server/api-implementation/_data/orders-legacy.ts"
replace_exact(
    path,
    '''    const automaticCodPaid = !preorderOrder && current.payment_method === "cod" && nextStatus === "delivered",
      paymentStatus = automaticCodPaid ? "paid" : nextPayment;
''',
    '''    const automaticCodPaid = !preorderOrder && current.payment_method === "cod" && nextStatus === "delivered",
      cancellingPrepaidBank = nextStatus === "cancelled" && currentStatus !== "cancelled" && current.payment_method === "bank" && ["paid", "verified"].includes(nextPayment.toLowerCase()),
      paymentStatus = automaticCodPaid ? "paid" : cancellingPrepaidBank ? "refund pending" : nextPayment;
''',
)

path = "src/pages/admin/AdminPage.tsx"
replace_exact(
    path,
    '''function Orders() {
  const { admin, updateOrder, data, loadAdmin } = useStore(),
''',
    '''function Orders() {
  const { admin, updateOrder, refreshOrder, refreshProducts, data, loadAdmin } = useStore(),
''',
)
replace_exact(
    path,
    '''      setStatus("Order updated.");
      return true;
''',
    '''      setStatus("Order updated.");
      if (patch.orderStatus === "cancelled" && updated.stockState === "restored")
        void refreshProducts().catch(() => undefined);
      return true;
''',
)
replace_exact(
    path,
    '''                    {normalizedOrderStatus === "dispatched" && (
                      <button type="button" className="btn btn-dark w-full justify-center" disabled={savingId === order.orderId} onClick={() => { if(window.confirm("Mark this order as delivered?")) void change(order.orderId,{orderStatus:"delivered"}); }}>
''',
    '''                    {["pending", "confirmed"].includes(normalizedOrderStatus) && (
                      <button type="button" className="btn w-full justify-center text-red-800" disabled={savingId === order.orderId} onClick={async () => {
                        const answer = window.prompt("Reason for cancelling this order?");
                        if (answer === null) return;
                        const reason = answer.trim();
                        if (!reason) { setStatus("Add a cancellation reason."); return; }
                        const saved = await change(order.orderId,{orderStatus:"cancelled",cancellationReason:reason,cancelledBy:"owner"});
                        if (saved) setStatus(detail.paymentMethod === "bank" && ["verified","paid"].includes(String(detail.paymentStatus||"").toLowerCase()) ? "Order cancelled. Stock restored and bank payment moved to refund pending." : "Order cancelled. Reserved stock restored.");
                      }}>
                        Cancel order
                      </button>
                    )}
                    {normalizedOrderStatus === "dispatched" && (
                      <button type="button" className="btn btn-dark w-full justify-center" disabled={savingId === order.orderId} onClick={() => { if(window.confirm("Mark this order as delivered?")) void change(order.orderId,{orderStatus:"delivered"}); }}>
''',
)
replace_exact(
    path,
    '''                          <ReturnsPanel order={detail} onMessage={setStatus} />
''',
    '''                          <ReturnsPanel
                            order={detail}
                            onMessage={setStatus}
                            onChanged={async (inventoryChanged) => {
                              const updated = await refreshOrder(order.orderId);
                              setDetails((current) => ({
                                ...current,
                                [order.orderId]: {
                                  ...(current[order.orderId] || {}),
                                  ...updated,
                                } as AdminOrderDetail,
                              }));
                              if (inventoryChanged) void refreshProducts().catch(() => undefined);
                            }}
                          />
''',
)
replace_exact(
    path,
    '''function ReturnsPanel({ order, onMessage }: { order: AdminOrderDetail; onMessage: (value: string) => void }) {
''',
    '''function ReturnsPanel({ order, onMessage, onChanged }: { order: AdminOrderDetail; onMessage: (value: string) => void; onChanged: (inventoryChanged: boolean) => Promise<void> }) {
''',
)
replace_exact(
    path,
    '''  async function create(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const raw = new FormData(event.currentTarget), items = order.items.map((item) => ({ orderItemId: item.orderItemId, quantity: Number(raw.get(`qty-${item.orderItemId}`) || 0) })).filter((item) => item.orderItemId && item.quantity > 0); try { await adminApi.post("createReturn", { orderId: order.orderId, type: raw.get("type"), reason: raw.get("reason"), notes: raw.get("notes"), refundRequired: raw.get("refundRequired") === "on", items }); setCreating(false); onMessage("Return created. Stock has not been changed."); await load(); } catch (reason) { onMessage(reason instanceof Error ? reason.message : "Could not create return."); } }
  async function advance(item: AdminReturn, status: string) { try { const payload: Record<string, unknown> = { returnId: item.id, status }; if (status === "received") payload.items = item.items?.map((line) => ({ id: line.id, restockable: (document.querySelector<HTMLInputElement>(`#restock-${line.id}`)?.checked ?? false) })); const result = await adminApi.post<{ restoredUnits: number }>("updateReturn", payload); onMessage(status === "received" ? `Return received. ${result.restoredUnits} unit${result.restoredUnits === 1 ? "" : "s"} restored to stock.` : `Return marked ${status.replace("_", " ")}.`); await load(); } catch (reason) { onMessage(reason instanceof Error ? reason.message : "Could not update return."); } }
''',
    '''  async function create(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const raw = new FormData(event.currentTarget), items = order.items.map((item) => ({ orderItemId: item.orderItemId, quantity: Number(raw.get(`qty-${item.orderItemId}`) || 0) })).filter((item) => item.orderItemId && item.quantity > 0); try { await adminApi.post("createReturn", { orderId: order.orderId, type: raw.get("type"), reason: raw.get("reason"), notes: raw.get("notes"), refundRequired: raw.get("refundRequired") === "on", items }); setCreating(false); await load(); await onChanged(false); onMessage("Return created. It is now visible in the Returns filter. Stock changes only when the return is received."); } catch (reason) { onMessage(reason instanceof Error ? reason.message : "Could not create return."); } }
  async function advance(item: AdminReturn, status: string) { try { const payload: Record<string, unknown> = { returnId: item.id, status }; if (status === "received") payload.items = item.items?.map((line) => ({ id: line.id, restockable: (document.querySelector<HTMLInputElement>(`#restock-${line.id}`)?.checked ?? false) })); const result = await adminApi.post<{ restoredUnits: number }>("updateReturn", payload); await load(); await onChanged(status === "received"); onMessage(status === "received" ? `Return received. ${result.restoredUnits} unit${result.restoredUnits === 1 ? "" : "s"} restored to stock.` : `Return marked ${status.replace("_", " ")}.`); } catch (reason) { onMessage(reason instanceof Error ? reason.message : "Could not update return."); } }
''',
)

path = "tests/order-workflow.test.ts"
p = Path(path)
text = p.read_text()
marker = '''test("delivery cleanup creates an empty actual-courier registry and drops the legacy model",async()=>{'''
if marker not in text:
    raise SystemExit("order-workflow test insertion marker missing")
addition = r'''test("admin return and cancellation mutations keep filters and inventory in sync",async()=>{
  const ui=await readFile(new URL("../src/pages/admin/AdminPage.tsx",import.meta.url),"utf8");
  const store=await readFile(new URL("../src/features/store/StoreContext.tsx",import.meta.url),"utf8");
  const backend=await readFile(new URL("../server/api-implementation/_data/orders-legacy.ts",import.meta.url),"utf8");
  assert.match(ui,/onChanged=\{async \(inventoryChanged\)/);
  assert.match(ui,/await refreshOrder\(order\.orderId\)/);
  assert.match(ui,/if \(inventoryChanged\) void refreshProducts\(\)/);
  assert.match(ui,/Return created\. It is now visible in the Returns filter/);
  assert.match(store,/const refreshOrder = useCallback/);
  assert.match(store,/const refreshProducts = useCallback/);
  assert.match(ui,/Reason for cancelling this order\?/);
  assert.match(ui,/orderStatus:"cancelled",cancellationReason:reason,cancelledBy:"owner"/);
  assert.match(backend,/cancellingPrepaidBank/);
  assert.match(backend,/cancellingPrepaidBank \? "refund pending"/);
  assert.match(backend,/stock=stock\+\$2/);
});

'''
p.write_text(text.replace(marker, addition + marker, 1))
