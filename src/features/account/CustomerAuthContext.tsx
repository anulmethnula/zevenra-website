import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import type {Session,User} from '@supabase/supabase-js';
import {customerAuthConfigured,supabase} from '../../services/supabase';

type Registration={firstName:string;lastName:string;email:string;password:string;mobile?:string};
type CustomerAuth={session:Session|null;user:User|null;loading:boolean;configured:boolean;passwordRecovery:boolean;signIn:(email:string,password:string)=>Promise<void>;register:(data:Registration)=>Promise<boolean>;sendReset:(email:string)=>Promise<void>;updatePassword:(password:string)=>Promise<void>;signOut:()=>Promise<void>};
const Context=createContext<CustomerAuth|null>(null);

export function CustomerAuthProvider({children}:{children:ReactNode}){
 const[session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(customerAuthConfigured),[passwordRecovery,setPasswordRecovery]=useState(false);
 useEffect(()=>{if(!supabase){setLoading(false);return}let active=true;void supabase.auth.getSession().then(({data})=>{if(active){setSession(data.session);setLoading(false)}});const{data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{setSession(next);setPasswordRecovery(event==='PASSWORD_RECOVERY');setLoading(false)});return()=>{active=false;subscription.unsubscribe()}},[]);
 const signIn=useCallback(async(email:string,password:string)=>{if(!supabase)throw new Error('Customer accounts are not configured yet.');const{error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error},[]);
 const register=useCallback(async(data:Registration)=>{if(!supabase)throw new Error('Customer accounts are not configured yet.');const{data:result,error}=await supabase.auth.signUp({email:data.email,password:data.password,options:{data:{first_name:data.firstName,last_name:data.lastName,mobile:data.mobile||''},emailRedirectTo:`${location.origin}/account`}});if(error)throw error;return !result.session},[]);
 const sendReset=useCallback(async(email:string)=>{if(!supabase)throw new Error('Customer accounts are not configured yet.');const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/account/login`});if(error)throw error},[]);
 const updatePassword=useCallback(async(password:string)=>{if(!supabase)throw new Error('Customer accounts are not configured yet.');const{error}=await supabase.auth.updateUser({password});if(error)throw error;setPasswordRecovery(false)},[]);
 const signOut=useCallback(async()=>{if(supabase){const{error}=await supabase.auth.signOut();if(error)throw error}},[]);
 const value=useMemo(()=>({session,user:session?.user||null,loading,configured:customerAuthConfigured,passwordRecovery,signIn,register,sendReset,updatePassword,signOut}),[session,loading,passwordRecovery,signIn,register,sendReset,updatePassword,signOut]);
 return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useCustomerAuth(){const value=useContext(Context);if(!value)throw new Error('useCustomerAuth must be used within CustomerAuthProvider');return value}
