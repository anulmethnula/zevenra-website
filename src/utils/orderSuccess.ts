import type { PaymentMethod } from "../types";

export function orderSuccessCopy(paymentMethod:PaymentMethod,formattedTotal:string){
  return paymentMethod==="bank"
    ?{title:"Payment verification pending",detail:"Your receipt was submitted successfully. We will verify the payment before confirming fulfilment."}
    :{title:"Order confirmed for Cash on Delivery",detail:`Pay ${formattedTotal} when your order arrives.`};
}
