export const preorderCustomerStatus:Record<string,string>={
  new:"Request received",awaiting_payment:"Awaiting payment",payment_submitted:"Payment submitted — awaiting verification",
  paid:"Payment verified",contacted:"Under review",confirmed:"Pre-order confirmed",batched:"Pre-order confirmed",
  ordered:"Pre-order confirmed",in_transit:"On the way",arrived:"Arrived",ready:"Ready for delivery",
  notified:"Ready for delivery",converted:"Delivery order created",cancelled:"Cancelled",expired:"Expired",
};
export const preorderCustomerStatusLabel=(status:string)=>preorderCustomerStatus[status]||"Pre-order in progress";
