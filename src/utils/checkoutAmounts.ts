export function checkoutAmounts(subtotal:number,deliveryFee:number,ready:boolean){
  return{ready,subtotal,deliveryFee,total:ready?subtotal+deliveryFee:undefined};
}
