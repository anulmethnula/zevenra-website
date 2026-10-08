export function checkoutAmounts(subtotal:number,deliveryFee:number,ready:boolean,discountAmount=0){
  const discount=Math.max(0,Math.min(subtotal,discountAmount));
  return{ready,subtotal,discountAmount:discount,deliveryFee,total:ready?Math.max(0,subtotal-discount+deliveryFee):undefined};
}
