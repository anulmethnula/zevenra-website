export type OrderPdfData = {
  orderId: string;
  createdAt: string;
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  city: string;
  district: string;
  deliveryZoneName?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  fulfilmentCourierName?: string;
  trackingNumber?: string;
  items: Array<{ name: string; color: string; size: string; quantity: number; unitPrice: number }>;
};

const lkr = (value: number) => `LKR ${Number(value || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function createOrderPdf(order: OrderPdfData) {
  const { jsPDF } = await import("jspdf"),
    doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }),
    left = 18,
    right = 192,
    pageBottom = 278;
  let y = 20;
  const addPageIfNeeded = (height: number) => {
    if (y + height <= pageBottom) return;
    doc.addPage();
    y = 18;
  };
  const line = (label: string, value: string) => {
    addPageIfNeeded(7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(label, left, y);
    doc.setTextColor(20);
    doc.text(value || "-", right, y, { align: "right" });
    y += 6;
  };
  doc.setTextColor(25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("ZEVENRA", left, y);
  y += 10;
  doc.setFontSize(13);
  doc.text("ORDER CONFIRMATION", left, y);
  y += 10;
  line("Order ID", order.orderId);
  line("Placed", new Date(order.createdAt).toLocaleString("en-LK"));
  line("Order status", order.orderStatus);
  line("Payment", `${order.paymentMethod} / ${order.paymentStatus}`);
  line("Customer", order.customerName);
  line("Area", [order.city, order.district].filter(Boolean).join(", "));
  line("Delivery area", order.deliveryZoneName || "-");
  if (order.fulfilmentCourierName) line("Courier", order.fulfilmentCourierName);
  if (order.trackingNumber) line("Tracking number", order.trackingNumber);
  y += 4;
  doc.setDrawColor(210);
  doc.line(left, y, right, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ITEMS", left, y);
  y += 7;
  for (const item of order.items) {
    const nameLines = doc.splitTextToSize(item.name || "Item", 95) as string[],
      height = Math.max(14, nameLines.length * 5 + 8);
    addPageIfNeeded(height);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(nameLines, left, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(95);
    doc.text([item.color, item.size].filter(Boolean).join(" / ") || "-", 120, y);
    doc.text(String(item.quantity), 151, y, { align: "right" });
    doc.setTextColor(20);
    doc.text(lkr(item.unitPrice), 174, y, { align: "right" });
    doc.text(lkr(item.unitPrice * item.quantity), right, y, { align: "right" });
    y += height;
  }
  addPageIfNeeded(34);
  doc.line(112, y, right, y);
  y += 7;
  line("Subtotal", lkr(order.subtotal));
  line("Delivery fee", lkr(order.deliveryFee));
  doc.setFont("helvetica", "bold");
  line("GRAND TOTAL", lkr(order.total));
  addPageIfNeeded(18);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("Keep your Order ID to track your order at ZEVENRA.", left, y);
  return doc;
}

export async function downloadOrderPdf(order: OrderPdfData) {
  const doc = await createOrderPdf(order);
  doc.save(`ZEVENRA-${order.orderId}.pdf`);
}
