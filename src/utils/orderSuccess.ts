import type { PaymentMethod } from "../types";

export function orderSuccessCopy(paymentMethod:PaymentMethod,formattedTotal:string,fulfillmentMethod?:string){
  if(paymentMethod==="bank")return{title:"Payment verification pending",detail:"Your receipt was submitted successfully. We will verify the payment before confirming fulfilment."};
  return fulfillmentMethod==="pickup"
    ?{title:"Order confirmed for pickup",detail:`Pay ${formattedTotal} when you collect your order.`}
    :{title:"Order confirmed for Cash on Delivery",detail:`Pay ${formattedTotal} when your order arrives.`};
}
