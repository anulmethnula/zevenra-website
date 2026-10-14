import type { CustomerPreorder, GuestTrackedPreorder, PreorderRequest } from "../types";
import { preorderCustomerStatusLabel } from "../../shared/preorder-customer-status";
import { siteConfig } from "../config/site";

type PreorderSummarySource=CustomerPreorder|PreorderRequest|GuestTrackedPreorder;
export async function downloadPreorderSummaryPdf(input:PreorderSummarySource,storeContact=siteConfig.whatsapp){
  const {jsPDF}=await import("jspdf"),doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"}),guest="kind" in input,
    id=guest?input.requestId:input.requestId,total=guest?input.productTotal:input.requestedPrice*input.quantity,
    payment=guest?input.paymentState:input.paymentVerifiedAt?"Payment verified":input.paymentSubmittedAt?"Payment pending verification":"Awaiting payment",
    linked=guest?input.convertedOrderId:input.convertedOrderId;
  doc.setFont("helvetica","bold");doc.setFontSize(22);doc.text("ZEVENRA",17,22);doc.setFontSize(12);doc.text("PRE-ORDER SUMMARY",17,31);doc.setDrawColor(205);doc.line(17,39,193,39);
  const rows:Array<[string,string]>=[["PRE-ORDER ID",id],["DATE",new Date(input.createdAt).toLocaleString("en-LK")],["CUSTOMER",input.customerName],["PRODUCT",input.productName],["COLOR / SIZE",`${input.color} / ${input.size}`],["QUANTITY",String(input.quantity)],["LOCKED PRODUCT AMOUNT",`LKR ${total.toLocaleString("en-LK")}`],["PAYMENT STATUS",payment],["CURRENT STATUS",preorderCustomerStatusLabel(input.status)],["ESTIMATED ARRIVAL","3–4 weeks"]];if(linked)rows.push(["LINKED DELIVERY ORDER",linked]);
  let y=51;for(const [label,value] of rows){doc.setFontSize(8);doc.setTextColor(105);doc.text(label,17,y);doc.setFontSize(10);doc.setTextColor(25);doc.text(value||"—",67,y,{maxWidth:126});y+=9;}
  doc.setDrawColor(220);doc.line(17,y+3,193,y+3);doc.setFontSize(9);doc.setTextColor(55);doc.text("Courier fee is separate and is paid on delivery.",17,y+12);doc.text("This pre-order summary is not a final invoice or tax invoice.",17,y+19);
  doc.text(`Need help? Phone / WhatsApp: ${storeContact}`,17,y+28);doc.text("For order changes, cancellations or support, please contact ZEVENRA.",17,y+35);
  doc.save(`ZEVENRA-Preorder-Summary-${id}.pdf`);
}
