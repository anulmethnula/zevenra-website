import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';

export type CustomerUser={id:string;firstName:string;lastName:string;email:string;mobile:string};
type Registration={firstName:string;lastName:string;email:string;password:string;mobile?:string};
type CustomerAuth={user:CustomerUser|null;loading:boolean;signIn:(email:string,password:string)=>Promise<void>;register:(data:Registration)=>Promise<void>;signOut:()=>Promise<void>;refresh:()=>Promise<void>};
const Context=createContext<CustomerAuth|null>(null);

async function accountRequest<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(`/api/account/${path}`,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init?.headers}}),payload=await response.json().catch(()=>({error:'Service temporarily unavailable.'})) as T&{error?:string};if(!response.ok)throw new Error(payload.error||'Service temporarily unavailable.');return payload}

export function CustomerAuthProvider({children}:{children:ReactNode}){
 const[user,setUser]=useState<CustomerUser|null>(null),[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{try{const result=await accountRequest<{user:CustomerUser|null}>('session');setUser(result.user)}catch{setUser(null)}finally{setLoading(false)}},[]);
 useEffect(()=>{void refresh()},[refresh]);
 const signIn=useCallback(async(email:string,password:string)=>{const result=await accountRequest<{user:CustomerUser}>('login',{method:'POST',body:JSON.stringify({email,password})});setUser(result.user)},[]);
 const register=useCallback(async(data:Registration)=>{const result=await accountRequest<{user:CustomerUser}>('register',{method:'POST',body:JSON.stringify(data)});setUser(result.user)},[]);
 const signOut=useCallback(async()=>{await accountRequest<{ok:boolean}>('logout',{method:'POST'});setUser(null)},[]);
 const value=useMemo(()=>({user,loading,signIn,register,signOut,refresh}),[user,loading,signIn,register,signOut,refresh]);
 return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useCustomerAuth(){const value=useContext(Context);if(!value)throw new Error('useCustomerAuth must be used within CustomerAuthProvider');return value}
