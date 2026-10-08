export type OrderPdfData = {
  orderId: string;
  createdAt: string;
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  address1?: string;
  address2?: string;
  city: string;
  district: string;
  postalCode?: string;
  deliveryZoneName?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  fulfilmentCourierName?: string;
  trackingNumber?: string;
  items: Array<{ name: string; color: string; size: string; quantity: number; unitPrice: number }>;
};

const lkr = (value: number) =>
  `LKR ${Number(value || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;

export function deliveryAddressLines(order: Pick<OrderPdfData, "address1" | "address2" | "city" | "district" | "postalCode">) {
  const locality = [order.address2, order.city].map((value) => value?.trim()).filter(Boolean).join(", "),
    district = [order.district?.trim(), order.postalCode?.trim()].filter(Boolean).join(" ");
  return [order.address1?.trim(), locality, district].filter((value): value is string => Boolean(value));
}

export async function createOrderPdf(order: OrderPdfData) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]),
    doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }),
    left = 17,
    right = 193,
    pageBottom = 270;

  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.text("ZEVENRA", left, 20);
  doc.setFontSize(12);
  doc.text("ORDER CONFIRMATION", left, 29);

  const summary = [
    ["Order ID", order.orderId],
    ["Placed date", new Date(order.createdAt).toLocaleString("en-LK")],
    ["Status", order.orderStatus || "Pending"],
  ];
  let summaryY = 20;
  for (const [label, value] of summary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(105);
    doc.text(label.toUpperCase(), 132, summaryY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(25);
    doc.text(value || "-", right, summaryY, { align: "right", maxWidth: 42 });
    summaryY += 6;
  }

  doc.setDrawColor(210);
  doc.line(left, 37, right, 37);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CUSTOMER & DELIVERY", left, 47);

  const address = deliveryAddressLines(order),
    details: Array<[string, string | string[]]> = [
      ["Customer", order.customerName || "-"],
      ["Delivery address", address.length ? address : ["-"]],
      ["Delivery area", order.deliveryZoneName || [order.city, order.district].filter(Boolean).join(", ") || "-"],
      ["Payment", order.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"],
      ["Payment status", order.paymentStatus || "-"],
    ];
  if (order.fulfilmentCourierName) details.push(["Courier", order.fulfilmentCourierName]);
  if (order.trackingNumber) details.push(["Tracking number", order.trackingNumber]);

  let y = 55;
  for (const [label, value] of details) {
    const lines = Array.isArray(value) ? value : (doc.splitTextToSize(value, 118) as string[]),
      height = Math.max(6, lines.length * 4.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(105);
    doc.text(label, left, y);
    doc.setTextColor(25);
    doc.setFontSize(9);
    doc.text(lines, 54, y);
    y += height;
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PRODUCTS", left, y);

  autoTable(doc, {
    startY: y + 5,
    margin: { top: 17, right: 17, bottom: 27, left: 17 },
    head: [["Product", "Variant", "Qty", "Unit price", "Total"]],
    body: order.items.map((item) => [
      item.name || "Item",
      [item.color, item.size].filter(Boolean).join(" / ") || "-",
      String(item.quantity),
      lkr(item.unitPrice),
      lkr(item.unitPrice * item.quantity),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3, overflow: "linebreak", lineColor: [218, 218, 218], lineWidth: 0.15, textColor: [30, 30, 30], valign: "middle" },
    headStyles: { fillColor: [35, 35, 35], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 38 },
      2: { cellWidth: 13, halign: "center" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 33, halign: "right" },
    },
    showHead: "everyPage",
  });

  const tableEnd = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY,
    totalsHeight = 31;
  y = tableEnd + 8;
  if (y + totalsHeight > pageBottom) {
    doc.addPage();
    y = 20;
  }
  const totalsLeft = 112;
  doc.setDrawColor(180);
  doc.line(totalsLeft, y, right, y);
  y += 7;
  const totalLine = (label: string, value: number, strong = false) => {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 10 : 9);
    doc.setTextColor(strong ? 20 : 80);
    doc.text(label, totalsLeft, y);
    doc.setTextColor(20);
    doc.text(lkr(value), right, y, { align: "right" });
    y += strong ? 8 : 6;
  };
  totalLine("Subtotal", order.subtotal);
  totalLine("Delivery", order.deliveryFee);
  doc.line(totalsLeft, y - 2, right, y - 2);
  y += 3;
  totalLine("TOTAL", order.total, true);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220);
    doc.line(left, 278, right, 278);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(75);
    doc.text("ZEVENRA", left, 284);
    doc.setFont("helvetica", "normal");
    doc.text("Keep your Order ID to track your order anytime.", left, 289);
    doc.text(`Order ID: ${order.orderId}`, right, 284, { align: "right" });
    doc.text(`Page ${page} of ${pages}`, right, 289, { align: "right" });
  }
  return doc;
}

export async function downloadOrderPdf(order: OrderPdfData) {
  const doc = await createOrderPdf(order);
  doc.save(`ZEVENRA-${order.orderId}.pdf`);
}
