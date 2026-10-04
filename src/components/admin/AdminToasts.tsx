import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

export type AdminToastDetail = { message: string; type?: "success" | "error" | "info" };
export const adminToast = (message: string, type: AdminToastDetail["type"] = "success") =>
  window.dispatchEvent(new CustomEvent<AdminToastDetail>("zevenra-admin-toast", { detail: { message, type } }));

type Toast = AdminToastDetail & { id: number };
export function AdminToasts() {
  const [items,setItems]=useState<Toast[]>([]);
  useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent<AdminToastDetail>).detail,id=Date.now()+Math.random();setItems(current=>[...current.slice(-2),{...detail,id}]);setTimeout(()=>setItems(current=>current.filter(item=>item.id!==id)),detail.type==="error"?6500:3200);};window.addEventListener("zevenra-admin-toast",receive);return()=>window.removeEventListener("zevenra-admin-toast",receive);},[]);
  return <div className="pointer-events-none fixed inset-x-3 top-20 z-[300] flex flex-col items-end gap-2 sm:left-auto sm:right-5 sm:w-[360px]"><AnimatePresence>{items.map(item=>{const Icon=item.type==="error"?CircleAlert:item.type==="info"?Info:CheckCircle2;return <motion.div key={item.id} role={item.type==="error"?"alert":"status"} initial={{opacity:0,y:-10,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,x:20}} className={`pointer-events-auto flex w-full items-start gap-3 border p-4 shadow-xl ${item.type==="error"?"border-red-900/20 bg-[#fff8f5] text-red-950":"border-black/10 bg-[#171713] text-white"}`}><Icon size={18} className="mt-0.5 shrink-0"/><p className="min-w-0 flex-1 text-xs leading-5">{item.message}</p><button aria-label="Dismiss notification" onClick={()=>setItems(current=>current.filter(value=>value.id!==item.id))}><X size={15}/></button></motion.div>;})}</AnimatePresence></div>;
}
