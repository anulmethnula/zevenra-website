import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import type {CartItem} from '../../types';

type CartState={items:CartItem[];count:number;subtotal:number;open:boolean;setOpen:(v:boolean)=>void;add:(i:CartItem)=>void;remove:(id:string)=>void;quantity:(id:string,n:number)=>void;clear:()=>void};
const Context=createContext<CartState|null>(null),key='zevenra-cart-v1';
const clamp=(item:CartItem,n:number)=>Math.max(1,Math.min(item.maxStock??99,n));

export function CartProvider({children}:{children:ReactNode}){
 const[items,setItems]=useState<CartItem[]>(()=>{try{const parsed=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(parsed)?parsed:[]}catch{return[]}}),[open,setOpen]=useState(false);
 useEffect(()=>localStorage.setItem(key,JSON.stringify(items)),[items]);
 const value=useMemo<CartState>(()=>({items,count:items.reduce((n,i)=>n+i.quantity,0),subtotal:items.reduce((n,i)=>n+i.unitPrice*i.quantity,0),open,setOpen,
  add:i=>{setItems(old=>{const found=old.find(x=>x.variantId===i.variantId);return found?old.map(x=>{if(x.variantId!==i.variantId)return x;const next={...x,...i};return{...next,quantity:clamp(next,x.quantity+i.quantity)}}):[...old,{...i,quantity:clamp(i,i.quantity)}]});setOpen(true)},
  remove:id=>setItems(old=>old.filter(i=>i.variantId!==id)),
  quantity:(id,n)=>setItems(old=>old.map(i=>i.variantId===id?{...i,quantity:clamp(i,n)}:i)),
  clear:()=>setItems([])
 }),[items,open]);
 return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useCart=()=>{const v=useContext(Context);if(!v)throw new Error('CartProvider required');return v};
