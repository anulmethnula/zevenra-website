export type Media={url:string;alt:string;type:'image'|'video';publicId?:string};
export type Variant={id:string;sku:string;color:string;size:string;stock:number;lowStockThreshold:number;active:boolean};
export type Product={id:string;slug:string;name:string;shortDescription:string;description:string;price:number;compareAtPrice?:number;categoryId:string;collectionId?:string;media:Media[];material:string;fit:string;care:string;tags:string[];featured:boolean;newArrival:boolean;status:'published'|'draft'|'archived';sortOrder:number;variants:Variant[];sizeChartId?:string};
export type Category={id:string;name:string;slug:string;description:string;imageUrl:string;active:boolean;sortOrder:number};
export type CartItem={productId:string;variantId:string;slug:string;name:string;image:string;color:string;size:string;quantity:number;unitPrice:number;sku:string};
export type PaymentMethod='cod'|'bank';
export type CheckoutData={customerName:string;phone:string;whatsapp?:string;email?:string;address1:string;address2?:string;city:string;district:string;postalCode?:string;deliveryNotes?:string;paymentMethod:PaymentMethod;items:CartItem[]};
export type Order={orderId:string;createdAt:string;customerName:string;phone:string;city:string;district:string;paymentMethod:PaymentMethod;subtotal:number;deliveryFee:number;total:number;orderStatus:string;paymentStatus:string;items:CartItem[]};
