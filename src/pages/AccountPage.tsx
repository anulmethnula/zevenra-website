import {Link,Navigate,useNavigate} from 'react-router-dom';
import {ArrowRight,LogOut,Package,UserRound} from 'lucide-react';
import {Seo} from '../components/Seo';
import {useCustomerAuth} from '../features/account/CustomerAuthContext';

export default function AccountPage(){
 const{user,loading,signOut}=useCustomerAuth(),navigate=useNavigate();
 if(loading)return <AccountLoading/>;if(!user)return <Navigate to="/account/login" replace/>;
 const firstName=user.firstName||user.email.split('@')[0]||'there';
 async function logout(){await signOut();navigate('/')}
 return <main className="account-page"><Seo title="My Account"/><div className="container account-page__inner"><p className="eyebrow text-bronze">Private account</p><h1 className="display">Welcome, <em>{firstName}</em></h1><p className="account-page__lead">Your ZEVENRA orders and account details, quietly gathered in one place.</p><div className="account-grid"><Link to="/account/orders" className="account-card"><Package/><span><small>Order history</small><b>My orders</b></span><ArrowRight/></Link><section className="account-card account-card--details"><UserRound/><span><small>Account details</small><b>{user.firstName} {user.lastName}</b><p>{user.email}</p>{user.mobile&&<p>{user.mobile}</p>}</span></section><button className="account-card account-card--signout" onClick={()=>void logout()}><LogOut/><span><small>Securely end session</small><b>Sign out</b></span><ArrowRight/></button></div></div></main>
}
export function AccountLoading(){return <main className="account-page"><div className="container account-page__inner"><div className="account-skeleton account-skeleton--short"/><div className="account-skeleton account-skeleton--title"/><div className="account-skeleton account-skeleton--copy"/><div className="account-grid"><div className="account-skeleton account-skeleton--card"/><div className="account-skeleton account-skeleton--card"/><div className="account-skeleton account-skeleton--card"/></div></div></main>}
