import { money } from "../config/site";

export const paymentRejectionReasons = [
  "Payment not found",
  "Amount does not match",
  "Receipt is unclear / unreadable",
  "Wrong receipt uploaded",
  "Duplicate / previously used receipt",
  "Receipt appears altered or cannot be verified",
  "Other",
] as const;

export function paymentRetryMessage(input:{customerName:string;requestId:string;reason:string;retryUrl:string;productName:string;productTotal:number}){
  return `Hi ${input.customerName},\n\nWe could not verify the payment receipt submitted for your ZEVENRA pre-order ${input.requestId}.\n\nReason:\n${input.reason}\n\nPlease use the secure link below to upload a new payment receipt:\n${input.retryUrl}\n\nProduct: ${input.productName}\nProduct payment: ${money(input.productTotal)}\n\nYour pre-order will remain awaiting payment verification until the new receipt is checked.\n\nThank you,\nZEVENRA`;
}
