import {Check} from 'lucide-react';
import {Link,useParams} from 'react-router-dom';
import {Seo} from '../components/Seo';
import {money} from '../config/site';
import {useStore} from '../features/store/StoreContext';
import type {Order} from '../types';

export default function OrderPage(){
 const{orderId}=useParams(),{data}=useStore();let order:Order|undefined;
 try{order=JSON.parse(sessionStorage.getItem(`order:${orderId}`)||'') as Order}catch{order=undefined}
 if(!order)return <div className="container grid min-h-[70vh] place-content-center text-center"><h1 className="display text-4xl">Order details unavailable.</h1><p className="mt-3 text-sm text-ink/55">Open the original confirmation link or contact ZEVENRA.</p><Link to="/contact" className="btn mt-6">Contact us</Link></div>;
 const whatsapp=(data.settings.whatsapp||'').replace(/\D/g,''),lines=order.items.map(item=>`${item.name} — ${item.color}/${item.size} × ${item.quantity}`).join('\n'),message=`Hello ZEVENRA, I have submitted order ${order.orderId}.\n\n${lines}\nSubtotal: ${money(order.subtotal)}\nDelivery: ${money(order.deliveryFee)}\nTotal: ${money(order.total)}\nName: ${order.customerName}\nCity: ${order.city}\nPayment: ${order.paymentMethod==='cod'?'Cash on delivery':'Bank transfer'}${order.paymentMethod==='bank'?'\nI will send my payment receipt here.':''}`;
 return <main className="container py-16 text-center"><Seo title={`Order ${order.orderId}`}/><span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-bronze text-bronze"><Check size={28}/></span><p className="eyebrow mt-7 text-bronze">Order request received</p><h1 className="display mt-3 text-4xl sm:text-6xl">#{order.orderId}</h1><p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-ink/60">Your order is awaiting confirmation from ZEVENRA. We’ll verify availability and payment details before confirming it.</p><div className="mx-auto mt-9 max-w-xl border-y hairline py-6 text-left">{order.items.map(item=><div key={item.variantId} className="flex justify-between gap-5 py-2 text-sm"><span>{item.name} · {item.color}/{item.size} × {item.quantity}</span><span>{money(item.unitPrice*item.quantity)}</span></div>)}<div className="mt-4 flex justify-between border-t hairline pt-4"><span>Total</span><b>{money(order.total)}</b></div></div>{whatsapp.length>=8&&<a className="btn btn-dark mt-8" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Continue on WhatsApp</a>}<p className="mt-5 text-xs text-ink/45">Keep your order ID for reference.</p></main>
}
