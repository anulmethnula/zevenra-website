import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {CheckCircle2,FileText,Upload,X} from 'lucide-react';
import {Navigate,useNavigate} from 'react-router-dom';
import {z} from 'zod';
import {Seo} from '../components/Seo';
import {money} from '../config/site';
import {useCustomerAuth} from '../features/account/CustomerAuthContext';
import {useCart} from '../features/cart/CartContext';
import {useStore} from '../features/store/StoreContext';
import {api} from '../services/api';
import {uploadPaymentReceipt} from '../services/paymentReceiptUpload';
import type {PaymentMethod} from '../types';

const schema=z.object({customerName:z.string().min(2),phone:z.string().regex(/^[+\d][\d\s-]{8,14}$/),whatsapp:z.string().optional(),email:z.string().email().or(z.literal('')).optional(),address1:z.string().min(5),address2:z.string().optional(),city:z.string().min(2),district:z.string().min(2),postalCode:z.string().optional(),deliveryNotes:z.string().max(300).optional(),paymentMethod:z.enum(['cod','bank']),paymentReference:z.string().max(100).optional(),paymentReceiptUrl:z.string().url().optional()});
const districts=['Ampara','Anuradhapura','Badulla','Batticaloa','Colombo','Galle','Gampaha','Hambantota','Jaffna','Kalutara','Kandy','Kegalle','Kilinochchi','Kurunegala','Mannar','Matale','Matara','Monaragala','Mullaitivu','Nuwara Eliya','Polonnaruwa','Puttalam','Ratnapura','Trincomalee','Vavuniya'];

export default function CheckoutPage(){
 const cart=useCart(),navigate=useNavigate(),{data}=useStore(),settings=data.settings,{user}=useCustomerAuth();
 const savedName=[user?.firstName,user?.lastName].filter(Boolean).join(' '),savedMobile=user?.mobile||'',savedAddress1=user?.address1||'',savedAddress2=user?.address2||'',savedCity=user?.city||'',savedDistrict=user?.district||'',savedPostalCode=user?.postalCode||'';
 const bankConfigured=Boolean(settings.bankEnabled&&settings.bankName.trim()&&settings.accountName.trim()&&settings.accountNumber.trim());
 const availablePayments=useMemo<PaymentMethod[]>(()=>[...(settings.codEnabled?['cod' as const]:[]),...(bankConfigured?['bank' as const]:[])],[settings.codEnabled,bankConfigured]);
 const[payment,setPayment]=useState<PaymentMethod>(availablePayments[0]||'cod'),[district,setDistrict]=useState(savedDistrict),[error,setError]=useState(''),[busy,setBusy]=useState(false),[receiptBusy,setReceiptBusy]=useState(false),[receiptUrl,setReceiptUrl]=useState(''),[receiptName,setReceiptName]=useState('');
 useEffect(()=>{if(!availablePayments.includes(payment)&&availablePayments[0])setPayment(availablePayments[0])},[availablePayments,payment]);
 if(!cart.items.length)return <Navigate to="/cart" replace/>;
 const currentPrice=(item:typeof cart.items[number])=>data.products.find(p=>p.id===item.productId&&p.status==='published')?.price??item.unitPrice;
 const displaySubtotal=cart.items.reduce((sum,item)=>sum+currentPrice(item)*item.quantity,0);
 const districtRate=data.deliveryRates.find(rate=>rate.active&&rate.district.trim().toLowerCase()===district.trim().toLowerCase());
 const baseDeliveryFee=settings.deliveryEnabled?(districtRate?.fee??settings.deliveryFee):0;
 const fee=settings.freeDeliveryThreshold>0&&displaySubtotal>=settings.freeDeliveryThreshold?0:baseDeliveryFee;

 async function uploadReceipt(file?:File){
  if(!file)return;
  setReceiptBusy(true);setError('');
  try{setReceiptUrl(await uploadPaymentReceipt(file));setReceiptName(file.name)}
  catch(reason){setReceiptUrl('');setReceiptName('');setError(reason instanceof Error?reason.message:'Could not upload the payment receipt.')}
  finally{setReceiptBusy(false)}
 }

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');
  if(!settings.storeOpen||!settings.ordersEnabled){setError('Online ordering is temporarily unavailable. Please contact us for assistance.');return}
  if(!availablePayments.length){setError('No payment method is currently available. Please contact us for assistance.');return}
  if(payment==='bank'&&!receiptUrl){setError('Please upload your bank transfer receipt before placing the order.');return}
  const raw=Object.fromEntries(new FormData(event.currentTarget));
  const parsed=schema.safeParse({...raw,paymentMethod:payment,paymentReceiptUrl:payment==='bank'?receiptUrl:undefined,paymentReference:payment==='bank'?String(raw.paymentReference||''):undefined});
  if(!parsed.success){setError('Please review the required information and try again.');return}
  setBusy(true);
  try{const order=await api.createOrder({...parsed.data,items:cart.items});sessionStorage.setItem(`order:${order.orderId}`,JSON.stringify(order));cart.clear();navigate(`/order/${order.orderId}`)}
  catch(reason){setError(reason instanceof Error?reason.message:'We could not submit your order. Your bag is safe—please try again.')}
  finally{setBusy(false)}
 }

 return <main className="container py-10 lg:py-16"><Seo title="Checkout"/>{user?<p className="mb-7 border-l-2 border-bronze bg-white/30 px-4 py-3 text-xs text-ink/60">Signed in as <b className="text-ink">{user.email}</b>. This order will be saved to <b className="text-ink">My Orders</b>.</p>:<p className="mb-7 border-l-2 border-black/15 bg-white/20 px-4 py-3 text-xs text-ink/55">Checking out as a guest. <a href="/account/login" className="underline underline-offset-4">Sign in first</a> if you want this order saved to My Orders.</p>}<form onSubmit={submit} className="grid gap-12 lg:grid-cols-[1fr_420px]"><div className="space-y-12">
  <section><p className="eyebrow mb-5">01 · Contact</p><div className="grid gap-4 sm:grid-cols-2"><Field name="customerName" label="Full Name *" required autoComplete="name" wide defaultValue={savedName}/><Field name="phone" label="Mobile Number *" required type="tel" autoComplete="tel" defaultValue={savedMobile}/><Field name="whatsapp" label="WhatsApp Number" type="tel"/><Field name="email" label={user?'Email (account email)':'Email (optional)'} type="email" autoComplete="email" wide defaultValue={user?.email||''} readOnly={Boolean(user)}/></div></section>
  <section><p className="eyebrow mb-5">02 · Delivery</p><div className="grid gap-4 sm:grid-cols-2"><Field name="address1" label="Address Line 1 *" required autoComplete="address-line1" wide defaultValue={savedAddress1}/><Field name="address2" label="Address Line 2" autoComplete="address-line2" wide defaultValue={savedAddress2}/><Field name="city" label="City *" required autoComplete="address-level2" defaultValue={savedCity}/><label className="text-xs">District *<select name="district" required className="field mt-2" value={district} onChange={e=>setDistrict(e.target.value)}><option value="" disabled>Select district</option>{districts.map(d=><option key={d}>{d}</option>)}</select></label><Field name="postalCode" label="Postal Code" autoComplete="postal-code" defaultValue={savedPostalCode}/><label className="sm:col-span-2 text-xs">Delivery Instructions<textarea name="deliveryNotes" rows={3} className="field mt-2 resize-none"/></label></div></section>
  <section><p className="eyebrow mb-5">03 · Payment</p>{availablePayments.length?<div className="grid gap-3">{availablePayments.map(value=><label key={value} className={`flex min-h-16 cursor-pointer items-center gap-4 border p-4 ${payment===value?'border-ink':'border-line'}`}><input type="radio" checked={payment===value} onChange={()=>setPayment(value)} name="pay" className="accent-black"/><span className="text-sm uppercase tracking-widest">{value==='cod'?'Cash on delivery':'Bank transfer'}</span></label>)}</div>:<p className="border border-line p-4 text-sm">Payment methods are temporarily unavailable.</p>}
   {payment==='bank'&&bankConfigured&&<div className="mt-4 space-y-5 border border-line bg-white/30 p-5">
    <div className="text-sm leading-7"><p><b>Bank:</b> {settings.bankName}</p><p><b>Account Name:</b> {settings.accountName}</p><p><b>Account Number:</b> {settings.accountNumber}</p>{settings.branch&&<p><b>Branch:</b> {settings.branch}</p>}{settings.bankInstructions&&<p className="mt-3 text-xs text-ink/60">{settings.bankInstructions}</p>}</div>
    <p className="border-l-2 border-bronze pl-3 text-xs leading-5 text-ink/60">Transfer the full order amount, then upload the receipt below. We will verify it before confirming the order.</p>
    <Field name="paymentReference" label="Bank transfer reference (optional)" wide/>
    <div><p className="mb-2 text-xs">Payment receipt *</p>{receiptUrl?<div className="flex items-center justify-between gap-3 border border-emerald-900/20 bg-emerald-950/[.05] p-4"><div className="flex min-w-0 items-center gap-3"><CheckCircle2 size={18}/><div className="min-w-0"><p className="truncate text-sm">{receiptName||'Receipt uploaded'}</p><a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs underline">View uploaded receipt</a></div></div><button type="button" className="grid h-10 w-10 shrink-0 place-items-center" onClick={()=>{setReceiptUrl('');setReceiptName('')}} aria-label="Remove receipt"><X size={16}/></button></div>:<label className="flex min-h-28 cursor-pointer flex-col items-center justify-center border border-dashed border-black/25 bg-white/25 px-4 text-center"><Upload size={20}/><span className="mt-2 text-sm">{receiptBusy?'Uploading receipt…':'Upload bank receipt'}</span><span className="mt-1 text-[10px] text-ink/45">JPG, PNG, WebP or PDF · max 8 MB</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={receiptBusy} onChange={e=>{void uploadReceipt(e.target.files?.[0]);e.currentTarget.value=''}}/></label>}</div>
   </div>}
  </section>
 </div><aside className="h-fit bg-[#e7e1d7] p-6 lg:sticky lg:top-6"><p className="eyebrow">Order summary</p><div className="mt-6 space-y-4">{cart.items.map(item=><div key={item.variantId} className="flex gap-3"><div className="relative">{item.image?<img src={item.image} alt={item.name} className="h-20 w-14 object-cover"/>:<div className="h-20 w-14 bg-black/5"/>}<span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-white">{item.quantity}</span></div><div className="flex-1 text-sm"><p>{item.name}</p><p className="mt-1 text-xs text-ink/50">{item.color} / {item.size}{item.isPreorder?' · PRE-ORDER':''}</p></div><span className="text-sm">{money(currentPrice(item)*item.quantity)}</span></div>)}</div><div className="my-6 border-t hairline"/><div className="space-y-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{money(displaySubtotal)}</span></div><div className="flex justify-between"><span>Delivery</span><span>{fee?money(fee):'Complimentary'}</span></div><div className="flex justify-between border-t hairline pt-4 text-base"><span>Total</span><span>{money(displaySubtotal+fee)}</span></div></div>{payment==='bank'&&<div className="mt-5 flex items-start gap-2 bg-white/35 p-3 text-xs leading-5 text-ink/60"><FileText size={16} className="mt-0.5 shrink-0"/><span>Your bank receipt must finish uploading before the order can be placed. After the order is created, you can also send the same receipt link to ZEVENRA on WhatsApp as a free backup.</span></div>}{error&&<p role="alert" className="mt-5 bg-red-950 p-3 text-xs leading-5 text-white">{error}</p>}<button disabled={busy||receiptBusy||!availablePayments.length||!settings.storeOpen||!settings.ordersEnabled||(payment==='bank'&&!receiptUrl)} className="btn btn-dark mt-6 w-full disabled:opacity-50">{busy?'Placing order…':receiptBusy?'Uploading receipt…':'Place order'}</button><p className="mt-4 text-center text-[10px] leading-5 text-ink/50">By placing an order, you agree to the store terms. This is an order request, not automatic confirmation.</p></aside></form></main>
}
function Field({name,label,required,type='text',autoComplete,wide=false,defaultValue,readOnly=false}:{name:string;label:string;required?:boolean;type?:string;autoComplete?:string;wide?:boolean;defaultValue?:string;readOnly?:boolean}){return <label className={`${wide?'sm:col-span-2 ':''}text-xs`}>{label}<input name={name} required={required} type={type} inputMode={type==='tel'?'tel':undefined} className={`field mt-2 ${readOnly?'opacity-65':''}`} autoComplete={autoComplete} defaultValue={defaultValue} readOnly={readOnly}/></label>}
