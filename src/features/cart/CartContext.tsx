import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartItem,CartProduct,ProductSummary } from "../../types";

type CartState = {
  items: CartItem[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (i: CartItem) => void;
  remove: (id: string) => void;
  quantity: (id: string, n: number, maxStock?: number) => void;
  clear: () => void;
  live:Record<string,CartProduct>;
  hydrationLoading:boolean;
  hydrationError:string;
  retryHydration:()=>void;
  recommendations:ProductSummary[];
};
const Context = createContext<CartState | null>(null),
  key = "zevenra-cart-v1";
const clamp = (item: CartItem, n: number, liveMaxStock?: number) =>
  Math.max(1, Math.min(liveMaxStock ?? item.maxStock ?? 99, n));

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }),
    [open, setOpen] = useState(false),[live,setLive]=useState<Record<string,CartProduct>>({}),[hydrationLoading,setHydrationLoading]=useState(false),[hydrationError,setHydrationError]=useState(""),[recommendations,setRecommendations]=useState<ProductSummary[]>([]),controller=useRef<AbortController>();
  useEffect(() => localStorage.setItem(key, JSON.stringify(items)), [items]);
  const hydrate=useCallback(async()=>{controller.current?.abort();if(!items.length){setLive({});setRecommendations([]);setHydrationError("");return;}const request=new AbortController();controller.current=request;setHydrationLoading(true);setHydrationError("");try{const response=await fetch(`${import.meta.env.VITE_API_BASE||"/api"}/cart-products`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({variantIds:[...new Set(items.map(item=>item.variantId))]}),signal:request.signal}),payload=await response.json() as {items?:CartProduct[];error?:string};if(!response.ok)throw new Error(payload.error||"Cart availability temporarily unavailable");const map=Object.fromEntries((payload.items||[]).map(item=>[item.variantId,item]));setLive(map);const categories=[...new Set(Object.values(map).map(item=>item.categoryId).filter(Boolean))],exclude=[...new Set(items.map(item=>item.productId))],recommendationResponse=await fetch(`${import.meta.env.VITE_API_BASE||"/api"}/recommendations?category=${encodeURIComponent(categories.join(","))}&exclude=${encodeURIComponent(exclude.join(","))}`,{signal:request.signal});if(recommendationResponse.ok)setRecommendations(await recommendationResponse.json() as ProductSummary[]);}catch(reason){if(!(reason instanceof DOMException&&reason.name==="AbortError"))setHydrationError(reason instanceof Error?reason.message:"Cart availability temporarily unavailable");}finally{if(!request.signal.aborted)setHydrationLoading(false);}},[items]);
  useEffect(()=>{void hydrate();return()=>controller.current?.abort();},[hydrate]);
  const value = useMemo<CartState>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      subtotal: items.reduce((n, i) => n + i.unitPrice * i.quantity, 0),
      open,
      setOpen,
      add: (i) => {
        setItems((old) => {
          const found = old.find((x) => x.variantId === i.variantId);
          return found
            ? old.map((x) => {
                if (x.variantId !== i.variantId) return x;
                const next = { ...x, ...i };
                return {
                  ...next,
                  quantity: clamp(next, x.quantity + i.quantity),
                };
              })
            : [...old, { ...i, quantity: clamp(i, i.quantity) }];
        });
        setOpen(true);
      },
      remove: (id) => setItems((old) => old.filter((i) => i.variantId !== id)),
      quantity: (id, n, maxStock) =>
        setItems((old) =>
          old.map((i) =>
            i.variantId === id
              ? {
                  ...i,
                  maxStock: maxStock ?? i.maxStock,
                  quantity: clamp(
                    i,
                    n,
                    maxStock ?? Math.max(i.maxStock ?? 0, n),
                  ),
                }
              : i,
          ),
        ),
      clear: () => setItems([]),
      live,hydrationLoading,hydrationError,retryHydration:()=>{void hydrate();},recommendations,
    }),
    [hydrate,hydrationError,hydrationLoading,items,live,open,recommendations],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useCart = () => {
  const v = useContext(Context);
  if (!v) throw new Error("CartProvider required");
  return v;
};
