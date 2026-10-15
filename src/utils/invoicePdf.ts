import type { CustomerOrder, GuestTrackedOrder, Order } from "../types";
import { siteConfig } from "../config/site";

export type InvoiceOrder={orderId:string;orderNumber?:number;createdAt:string;customerName:string;phone?:string;email?:string;address1?:string;address2?:string;city?:string;district?:string;postalCode?:string;deliveryMethodName?:string;fulfillmentMethod?:string;pickupBranchName?:string;pickupBranchAddress?:string;fulfilmentCourierName?:string;courierName?:string;paymentMethod:string;paymentStatus?:string;subtotal:number;discountAmount?:number;deliveryFee:number;total:number;items:Array<{name:string;color?:string;size?:string;quantity:number;unitPrice:number}>};
export type InvoiceOrderSource=Order|GuestTrackedOrder|CustomerOrder|InvoiceOrder;

const lkr = (value: number) =>
  `LKR ${Number(value || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;

const clean = (value: unknown) => String(value ?? "").trim();

export function normalizeInvoiceOrder(order:InvoiceOrderSource):InvoiceOrder{return{orderId:order.orderId,orderNumber:"orderNumber" in order?order.orderNumber:undefined,createdAt:order.createdAt,customerName:order.customerName||"",phone:"phone" in order?order.phone:"",email:"email" in order?order.email:"",address1:order.address1,address2:order.address2,city:order.city,district:order.district,postalCode:order.postalCode,deliveryMethodName:"deliveryMethodName" in order?order.deliveryMethodName:"",fulfillmentMethod:"fulfillmentMethod" in order?order.fulfillmentMethod:"",pickupBranchName:"pickupBranchName" in order?order.pickupBranchName:"",pickupBranchAddress:"pickupBranchAddress" in order?order.pickupBranchAddress:"",fulfilmentCourierName:order.fulfilmentCourierName,courierName:"courierName" in order?order.courierName:"",paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,subtotal:order.subtotal,discountAmount:order.discountAmount,deliveryFee:order.deliveryFee,total:order.total,items:order.items.map(item=>({name:item.name,color:item.color,size:item.size,quantity:item.quantity,unitPrice:item.unitPrice}))};}

export function invoicePaymentStatus(order: Pick<InvoiceOrder, "paymentMethod" | "paymentStatus" | "fulfillmentMethod">) {
  if (order.paymentMethod === "cod") return order.fulfillmentMethod === "pickup" ? "Pay at pickup" : "Pay on delivery";
  return ["paid", "verified"].includes(clean(order.paymentStatus).toLowerCase()) ? "Paid" : "Pending verification";
}

export async function createInvoicePdf(input: InvoiceOrderSource,storeContact=siteConfig.whatsapp) {
  const order=normalizeInvoiceOrder(input);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]),
    doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }),
    left = 17,
    right = 193,
    pageBottom = 270,
    paymentStatus = invoicePaymentStatus(order),
    pendingBankPayment = order.paymentMethod === "bank" && paymentStatus === "Pending verification";

  doc.setTextColor(18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("ZEVENRA", left, 20);
  doc.setFontSize(11);
  doc.text("ORDER INVOICE", left, 29);

  const summary = [
    ["ORDER ID", clean(order.orderNumber || order.orderId)],
    ["ORDER DATE", new Date(order.createdAt).toLocaleString("en-LK")],
  ];
  let summaryY = 20;
  for (const [label, value] of summary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(105);
    doc.text(label, 130, summaryY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text(value || "—", right, summaryY, { align: "right", maxWidth: 49 });
    summaryY += 7;
  }

  doc.setDrawColor(205);
  doc.line(left, 38, right, 38);

  const section = (title: string, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(25);
    doc.text(title, left, y);
  };
  const details = (rows: Array<[string, string]>, y: number) => {
    for (const [label, value] of rows.filter(([, value]) => Boolean(value))) {
      const lines = doc.splitTextToSize(value, 118) as string[];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(105);
      doc.text(label, left, y);
      doc.setFontSize(9);
      doc.setTextColor(25);
      doc.text(lines, 54, y);
      y += Math.max(6, lines.length * 4.5);
    }
    return y;
  };

  let y = 48;
  section("CUSTOMER", y);
  y = details([
    ["Name", clean(order.customerName)],
    ["Phone", clean(order.phone)],
    ["Email", clean(order.email)],
  ], y + 8);

  y += 3;
  section("DELIVERY", y);
  const method = clean(order.deliveryMethodName) ||
    (order.fulfillmentMethod === "pickup" ? ["Pickup", clean(order.pickupBranchName)].filter(Boolean).join(" — ") : clean(order.fulfilmentCourierName || order.courierName));
  y = details([
    ["Address", [clean(order.address1), clean(order.address2)].filter(Boolean).join(", ") || clean(order.pickupBranchAddress)],
    ["City", clean(order.city)],
    ["District", clean(order.district)],
    ["Postal code", clean(order.postalCode)],
    ["Method", method],
  ], y + 8);

  y += 3;
  section("ITEMS", y);
  autoTable(doc, {
    startY: y + 5,
    margin: { top: 17, right: 17, bottom: 29, left: 17 },
    head: [["Product", "Color / Size", "Qty", "Unit price", "Line total"]],
    body: order.items.map((item) => [
      clean(item.name) || "Item",
      [clean(item.color), clean(item.size)].filter(Boolean).join(" / ") || "—",
      String(item.quantity),
      lkr(item.unitPrice),
      lkr(item.unitPrice * item.quantity),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3, overflow: "linebreak", lineColor: [218, 218, 218], lineWidth: 0.15, textColor: [30, 30, 30], valign: "middle" },
    headStyles: { fillColor: [24, 24, 24], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 61 },
      1: { cellWidth: 37 },
      2: { cellWidth: 13, halign: "center" },
      3: { cellWidth: 31, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
    },
    showHead: "everyPage",
  });

  const tableEnd = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY,
    totalsHeight = Number(order.discountAmount || 0) > 0 ? 42 : 35;
  y = tableEnd + 8;
  if (y + totalsHeight > pageBottom) {
    doc.addPage();
    y = 20;
  }
  const totalsLeft = 110;
  doc.setDrawColor(185);
  doc.line(totalsLeft, y, right, y);
  y += 7;
  const totalLine = (label: string, value: number, strong = false) => {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 10 : 9);
    doc.setTextColor(strong ? 20 : 75);
    doc.text(label, totalsLeft, y);
    doc.setTextColor(20);
    doc.text(`${value < 0 ? "-" : ""}${lkr(Math.abs(value))}`, right, y, { align: "right" });
    y += strong ? 8 : 6;
  };
  totalLine("Subtotal", order.subtotal);
  if (Number(order.discountAmount || 0) > 0) totalLine("Discount", -Number(order.discountAmount));
  totalLine("Delivery fee", order.deliveryFee);
  doc.line(totalsLeft, y - 2, right, y - 2);
  y += 3;
  totalLine("GRAND TOTAL", order.total, true);

  y += 2;
  if (y + (pendingBankPayment ? 30 : 18) > pageBottom) {
    doc.addPage();
    y = 20;
  }
  section("PAYMENT", y);
  y = details([
    ["Method", order.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"],
    ["Status", paymentStatus],
  ], y + 8);
  if (pendingBankPayment) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(65);
    const note = doc.splitTextToSize("This invoice confirms your order submission. Payment is confirmed only after ZEVENRA verifies your payment receipt.", right - left) as string[];
    doc.text(note, left, y + 2);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220);
    doc.line(left, 278, right, 278);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text("Thank you for shopping with ZEVENRA.", left, 284);
    doc.setFont("helvetica", "normal");
    doc.text(`NEED HELP? Contact ZEVENRA · Phone / WhatsApp: ${clean(storeContact)}`, left, 289);
    doc.setFontSize(7);
    doc.text("For order changes, cancellations or support, please contact ZEVENRA.", left, 293);
    doc.text(`Page ${page} of ${pages}`, right, 289, { align: "right" });
  }
  return doc;
}

export async function downloadInvoicePdf(input: InvoiceOrderSource,storeContact=siteConfig.whatsapp) {
  const order=normalizeInvoiceOrder(input),doc = await createInvoicePdf(order,storeContact);
  doc.save(`ZEVENRA-Invoice-${order.orderNumber || order.orderId}.pdf`);
}
