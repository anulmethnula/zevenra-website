import {useState,type FormEvent} from 'react';
import {Link,Navigate,useNavigate} from 'react-router-dom';
import {ArrowRight,LogOut,MapPin,Package,UserRound} from 'lucide-react';
import {Seo} from '../components/Seo';
import {useCustomerAuth} from '../features/account/CustomerAuthContext';

const districts=['Ampara','Anuradhapura','Badulla','Batticaloa','Colombo','Galle','Gampaha','Hambantota','Jaffna','Kalutara','Kandy','Kegalle','Kilinochchi','Kurunegala','Mannar','Matale','Matara','Monaragala','Mullaitivu','Nuwara Eliya','Polonnaruwa','Puttalam','Ratnapura','Trincomalee','Vavuniya'];

export default function AccountPage(){
 const{user,loading,signOut,updateProfile}=useCustomerAuth(),navigate=useNavigate(),[saving,setSaving]=useState(false),[status,setStatus]=useState('');
 if(loading)return <AccountLoading/>;if(!user)return <Navigate to="/account/login" replace/>;
 const firstName=user.firstName||user.email.split('@')[0]||'there';
 async function logout(){await signOut();navigate('/')}
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setSaving(true);setStatus('');
  const data=new FormData(event.currentTarget);
  try{
   await updateProfile({
    firstName:String(data.get('firstName')||'').trim(),
    lastName:String(data.get('lastName')||'').trim(),
    mobile:String(data.get('mobile')||'').trim(),
    address1:String(data.get('address1')||'').trim(),
    address2:String(data.get('address2')||'').trim(),
    city:String(data.get('city')||'').trim(),
    district:String(data.get('district')||'').trim(),
    postalCode:String(data.get('postalCode')||'').trim()
   });
   setStatus('Saved. These details will be ready at checkout.');
  }catch(reason){setStatus(reason instanceof Error?reason.message:'Could not save your details.')}
  finally{setSaving(false)}
 }
 return <main className="account-page"><Seo title="My Account"/><div className="container account-page__inner">
  <p className="eyebrow text-bronze">Private account</p>
  <h1 className="display">Welcome, <em>{firstName}</em></h1>
  <p className="account-page__lead">Your ZEVENRA orders and account details, quietly gathered in one place.</p>
  <div className="account-grid">
   <Link to="/account/orders" className="account-card"><Package/><span><small>Order history</small><b>My orders</b></span><ArrowRight/></Link>
   <section className="account-card account-card--details"><UserRound/><span><small>Account details</small><b>{user.firstName} {user.lastName}</b><p>{user.email}</p>{user.mobile&&<p>{user.mobile}</p>}</span></section>
   <button className="account-card account-card--signout" onClick={()=>void logout()}><LogOut/><span><small>Securely end session</small><b>Sign out</b></span><ArrowRight/></button>
  </div>

  <section className="mt-10 border border-black/10 bg-[#f6f3ed] p-6 md:p-8">
   <div className="flex items-start gap-4"><MapPin className="mt-1 text-bronze"/><div><p className="eyebrow text-bronze">Saved checkout details</p><h2 className="display mt-2 text-3xl md:text-4xl">Delivery address</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">Save your usual details once. You can still change them during checkout for any order.</p></div></div>
   <form onSubmit={save} className="mt-7 grid gap-4 sm:grid-cols-2">
    <label className="text-xs">First Name *<input className="field mt-2" name="firstName" required defaultValue={user.firstName}/></label>
    <label className="text-xs">Last Name *<input className="field mt-2" name="lastName" required defaultValue={user.lastName}/></label>
    <label className="text-xs sm:col-span-2">Email<input className="field mt-2 opacity-65" value={user.email} readOnly/></label>
    <label className="text-xs sm:col-span-2">Mobile Number<input className="field mt-2" name="mobile" type="tel" autoComplete="tel" defaultValue={user.mobile}/></label>
    <label className="text-xs sm:col-span-2">Address Line 1<input className="field mt-2" name="address1" autoComplete="address-line1" defaultValue={user.address1}/></label>
    <label className="text-xs sm:col-span-2">Address Line 2<input className="field mt-2" name="address2" autoComplete="address-line2" defaultValue={user.address2}/></label>
    <label className="text-xs">City<input className="field mt-2" name="city" autoComplete="address-level2" defaultValue={user.city}/></label>
    <label className="text-xs">District<select className="field mt-2" name="district" defaultValue={user.district}><option value="">Select district</option>{districts.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
    <label className="text-xs">Postal Code<input className="field mt-2" name="postalCode" autoComplete="postal-code" defaultValue={user.postalCode}/></label>
    <div className="flex items-end sm:justify-end"><button className="btn btn-dark w-full sm:w-auto" disabled={saving}>{saving?'Saving…':'Save details'}</button></div>
    {status&&<p role="status" className="sm:col-span-2 text-xs text-black/60">{status}</p>}
   </form>
  </section>
 </div></main>
}
export function AccountLoading(){return <main className="account-page"><div className="container account-page__inner"><div className="account-skeleton account-skeleton--short"/><div className="account-skeleton account-skeleton--title"/><div className="account-skeleton account-skeleton--copy"/><div className="account-grid"><div className="account-skeleton account-skeleton--card"/><div className="account-skeleton account-skeleton--card"/><div className="account-skeleton account-skeleton--card"/></div></div></main>}
