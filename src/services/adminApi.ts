const base=import.meta.env.VITE_API_BASE||'/api';

async function request<T>(action:string,init?:RequestInit):Promise<T>{const response=await fetch(`${base}/admin/${action}`,{...init,headers:{'Content-Type':'application/json',...init?.headers}});const result=await response.json().catch(()=>({error:'The server returned an invalid response.'})) as T&{error?:string};if(!response.ok)throw new Error(result.error||'The operation could not be completed.');return result}

export const adminApi={get:<T>(action:string,query:Record<string,string>={})=>{const search=new URLSearchParams(query).toString();return request<T>(`${action}${search?`?${search}`:''}`)},post:<T>(action:string,payload:unknown)=>request<T>(action,{method:'POST',body:JSON.stringify(payload)})};
