from pathlib import Path

page = Path("src/pages/admin/AdminPage.tsx")
text = page.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"Expected AdminPage pattern not found: {label}")
    text = text.replace(old, new, 1)


replace_once(
    '[sourceFilter, setSourceFilter] = useState("all"),',
    '[sourceFilter, setSourceFilter] = useState(()=>initialParams.get("source")||"all"),',
    "source filter URL state",
)

replace_once(
    '<div className="admin-help-card mt-5">\n        <b>Paid pre-order flow:</b> Payment submitted → Verify payment → Confirmed → In transit → Arrived → Ready → Delivery order. <span>Estimated arrival: 3–4 weeks.</span>\n      </div>',
    '<div className="admin-help-card mt-5">\n        <b>Paid pre-order flow:</b> Payment submitted → Verify payment → Confirmed → In transit → Arrived → Ready → Create delivery order → Orders. <span>Estimated arrival: 3–4 weeks.</span>\n      </div>',
    "preorder flow help",
)

replace_once(
    '["Ready for delivery", readyCount, "Create linked delivery orders"],',
    '["Ready for delivery", readyCount, "Complete delivery details and create order"],',
    "ready stat help",
)

replace_once(
    '<div className="flex flex-wrap gap-2"><a href={wa} target="_blank" rel="noreferrer" className="btn" aria-label={`WhatsApp ${item.customerName}`}><MessageCircle size={14} /> WhatsApp</a>{nextStatus&&item.status!=="payment_submitted"&&<button type="button" disabled={busy===item.requestId} onClick={()=>void change(item,nextStatus)} className="btn btn-dark">{nextText[item.status]}</button>}<button type="button" className="btn" onClick={()=>setOpen(item.requestId)}>View</button></div>',
    '<div className="flex flex-wrap gap-2"><a href={wa} target="_blank" rel="noreferrer" className="btn" aria-label={`WhatsApp ${item.customerName}`}><MessageCircle size={14} /> WhatsApp</a>{nextStatus&&item.status!=="payment_submitted"&&<button type="button" disabled={busy===item.requestId} onClick={()=>void change(item,nextStatus)} className="btn btn-dark">{nextText[item.status]}</button>}<button type="button" className={"btn "+(item.status==="ready"?"btn-dark":"")} onClick={()=>setOpen(item.requestId)}>{item.status==="ready"?"Create delivery order":"View"}</button></div>',
    "preorder row primary action",
)

replace_once(
    '<section className="preorder-next-box">\n                    <small>Payment</small>',
    '<section className="preorder-next-box">\n                    <small>{item.status==="ready"?"Next step":"Payment"}</small>',
    "ready drawer next-step label",
)

replace_once(
    '{item.status==="ready"&&<details className="mt-4 rounded-xl border border-black/10 bg-white/35 p-4">',
    '{item.status==="ready"&&<details open className="mt-4 rounded-xl border border-black/10 bg-white/35 p-4">',
    "open ready delivery details",
)

replace_once(
    '"Convert " +\n          item.requestId +\n        " to a delivery order? The courier will collect only the delivery fee.",',
    '"Convert " +\n          preorderDisplayId(item) +\n        " to a delivery order? The courier will collect only the delivery fee.",',
    "public preorder id in conversion confirmation",
)

replace_once(
    'item.requestId +\n          " converted to " +\n          order.orderId +\n          ". Customer can now see the normal order in My Orders if they were signed in.",',
    'preorderDisplayId(item) +\n          " converted to order #" +\n          (order.orderNumber || order.orderId) +\n          ". It now appears under Orders → Pre-order deliveries.",',
    "conversion success message",
)

replace_once(
    '    dispatched = orders.filter((order) => order.orderStatus === "dispatched").length,\n    returns = orders.filter((order) => Number(order.returnCount) > 0).length;',
    '    dispatched = orders.filter((order) => order.orderStatus === "dispatched").length,\n    returns = orders.filter((order) => Number(order.returnCount) > 0).length,\n    preorderOrders = orders.filter((order) => Boolean(order.sourcePreorderRequestId)).length,\n    normalOrders = orders.length - preorderOrders,\n    readyPreorders = admin.preorders.filter((preorder) => preorder.status === "ready").length;',
    "order source counts",
)

replace_once(
    '''      <div className="mt-3 flex flex-wrap gap-2" aria-label="Order source filter">
        {[["All","all"],["Normal Orders","normal"],["Pre-orders","preorder"]].map(([label,value])=><button type="button" key={value} onClick={()=>setSourceFilter(value)} className={`btn ${sourceFilter===value?"btn-dark":""}`}>{label}</button>)}
      </div>''',
    '''      <div className="admin-source-tabs mt-3" aria-label="Order source filter">
        {[
          {label:"All orders",value:"all",count:orders.length},
          {label:"Normal orders",value:"normal",count:normalOrders},
          {label:"Pre-order deliveries",value:"preorder",count:preorderOrders},
        ].map(({label,value,count})=><button type="button" key={value} onClick={()=>setSourceFilter(value)} className={`admin-source-tab ${sourceFilter===value?"is-active":""}`}><span>{label}</span><b>{count}</b></button>)}
      </div>
      {sourceFilter==="preorder"&&<div className="admin-help-card admin-help-card--compact mt-3"><b>Pre-order delivery orders only.</b> A Ready pre-order stays in <Link to="/admin/preorders?status=ready">Pre-orders</Link> until you create its delivery order. {readyPreorders?<span>{readyPreorders} ready now.</span>:null}</div>}''',
    "order source tabs",
)

replace_once(
    '''          <Empty
            text={
              admin.orders.length
                ? "No orders match these filters."
                : "No orders yet."
            }
          />''',
    '''          <Empty
            text={
              sourceFilter === "preorder"
                ? readyPreorders
                  ? `${readyPreorders} pre-order${readyPreorders === 1 ? " is" : "s are"} Ready. Create the delivery order from Pre-orders and it will appear here.`
                  : "No pre-order delivery orders yet. Converted pre-orders will appear here."
                : admin.orders.length
                  ? "No orders match these filters."
                  : "No orders yet."
            }
          />''',
    "preorder delivery empty state",
)

page.write_text(text)

css = Path("src/styles/index.css")
css_text = css.read_text()
marker = "/* Admin preorder/order workflow polish */"
if marker not in css_text:
    css_text += r'''

/* Admin preorder/order workflow polish */
.admin-source-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.admin-source-tab{display:inline-flex;min-height:44px;align-items:center;justify-content:center;gap:10px;border:1px solid var(--admin-border);border-radius:10px;background:var(--admin-surface);padding:0 15px;color:#5f574f;font-size:11px;font-weight:700;transition:border-color .18s,background .18s,color .18s,transform .18s}
.admin-source-tab:hover{border-color:rgba(95,87,79,.35);background:var(--admin-surface-soft)}
.admin-source-tab:active{transform:translateY(1px)}
.admin-source-tab b{display:grid;min-width:23px;height:23px;place-items:center;border-radius:999px;background:rgba(138,127,115,.1);font-size:9px}
.admin-source-tab.is-active{border-color:#2a2521;background:#2a2521;color:#fff}
.admin-source-tab.is-active b{background:rgba(255,255,255,.14);color:#fff}
.admin-help-card--compact{min-height:0;padding:11px 14px;font-size:11px;line-height:1.55}
.admin-help-card--compact a{font-weight:750;text-decoration:underline;text-underline-offset:3px}
.preorder-admin-card__top>div:first-child{min-width:0;flex:1}
.preorder-admin-card__top>div:last-child{min-width:300px;justify-content:flex-end}
.preorder-admin-card__top>div:last-child .btn{min-height:42px;padding:.65rem .95rem;letter-spacing:.1em}
.preorder-drawer-overview{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0!important;padding:0!important}
.preorder-drawer-overview>div{min-width:0;padding:15px 17px!important;border:0!important}
.preorder-drawer-overview>div:nth-child(even){border-left:1px solid var(--admin-border)!important}
.preorder-drawer-overview>div:nth-child(n+3){border-top:1px solid var(--admin-border)!important}
.preorder-drawer-overview>div:not(:first-child){display:grid;align-content:start;gap:5px}
.preorder-drawer-overview b{overflow-wrap:anywhere}
.preorder-admin-drawer details[open]>summary{margin-bottom:2px;color:#4f453d}
@media(max-width:900px){.preorder-admin-card__top>div:last-child{min-width:0}}
@media(max-width:640px){.admin-source-tabs{display:grid;grid-template-columns:1fr}.admin-source-tab{width:100%;justify-content:space-between}.preorder-drawer-overview>div{padding:14px!important}}
'''
css.write_text(css_text)
