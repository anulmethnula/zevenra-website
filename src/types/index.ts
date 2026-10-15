import type { OrderStatus } from "../../shared/order-status";

export type Media = {
  url: string;
  alt: string;
  type: "image" | "video";
  publicId?: string;
};
export type Variant = {
  id: string;
  sku: string;
  color: string;
  size: string;
  stock: number;
  lowStockThreshold: number;
  active: boolean;
};
export type Product = {
  id: string;
  productNumber?: number;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  categoryId: string;
  subcategory?: string;
  collectionIds: string[];
  media: Media[];
  material: string;
  fit: string;
  care: string;
  tags: string[];
  featured: boolean;
  newArrival: boolean;
  preorderEnabled?: boolean;
  preorderMessage?: string;
  status: "published" | "draft" | "archived";
  sortOrder: number;
  variants: Variant[];
  sizeChartId?: string;
};
export type ProductSummary = Pick<Product,"id"|"productNumber"|"slug"|"name"|"price"|"compareAtPrice"|"categoryId"|"subcategory"|"collectionIds"|"media"|"featured"|"newArrival"|"preorderEnabled"|"status"|"sortOrder"> & { variants: Array<Pick<Variant,"id"|"color"|"size"|"stock"|"lowStockThreshold"|"active">> };
export type ShopResponse = {items:ProductSummary[];page:number;pageSize:number;total:number;pageCount:number;filters:{sizes:string[];colors:string[];minPrice:number;maxPrice:number}};
export type HomepageData = {sections:HomepageSection[];products:ProductSummary[];categories:Category[];collections:Collection[]};
export type CartProduct = {productId:string;slug:string;name:string;thumbnail:string;categoryId:string;variantId:string;sku:string;color:string;size:string;currentPrice:number;stock:number;active:boolean;published:boolean;preorderEnabled:boolean};
export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  mobileImageUrl?: string;
  videoUrl?: string;
  active: boolean;
  featured: boolean;
  showInNavigation: boolean;
  showOnHomepage: boolean;
  parentId?: string;
  sortOrder: number;
};
export type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string;
  heroImage: string;
  mobileImage?: string;
  videoUrl?: string;
  ctaLabel?: string;
  active: boolean;
  showInNavigation: boolean;
  showOnHomepage: boolean;
  sortOrder: number;
};
export type NavigationItem = {
  id: string;
  label: string;
  linkType: "category" | "collection" | "page" | "url";
  target: string;
  visible: boolean;
  sortOrder: number;
};
export type HomepageSectionType =
  | "product-grid"
  | "collection-feature"
  | "category-grid"
  | "editorial-image"
  | "full-width-campaign"
  | "split-story"
  | "text-statement"
  | "new-arrivals"
  | "featured-products"
  | "social"
  | "service-strip";
export type HomepageSection = {
  id: string;
  type: HomepageSectionType;
  enabled: boolean;
  title: string;
  subtitle?: string;
  desktopMedia?: string;
  mobileMedia?: string;
  ctaLabel?: string;
  ctaLink?: string;
  referenceId?: string;
  textPosition: "left" | "center" | "right";
  overlay: number;
  spacing: "compact" | "normal" | "generous";
  sortOrder: number;
};
export type SizeChart = {
  id: string;
  name: string;
  unit: string;
  columns: string[];
  rows: string[][];
  notes?: string;
  imageUrl?: string;
};
export type SiteSettings = {
  brandName: string;
  tagline: string;
  logoLight: string;
  logoDark: string;
  favicon: string;
  announcement: string;
  whatsapp: string;
  email: string;
  phone: string;
  instagram: string;
  tiktok: string;
  codEnabled: boolean;
  bankEnabled: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  bankInstructions: string;
  freeDeliveryThreshold: number;
  currency: string;
  storeOpen: boolean;
  ordersEnabled: boolean;
  defaultTitle: string;
  defaultDescription: string;
  ogImage: string;
  hero: {
    videoEnabled: boolean;
    desktopVideo: string;
    mobileVideo: string;
    poster: string;
    fallbackImage: string;
    heading: string;
    tagline: string;
    ctaLabel: string;
    ctaLink: string;
    textPosition: "left" | "center" | "right";
    overlay: number;
  };
};
export type ContentPage = {
  id: string;
  slug: string;
  eyebrow: string;
  title: string;
  body: string[];
};
export type StoreData = {
  products: Product[];
  categories: Category[];
  collections: Collection[];
  navigation: NavigationItem[];
  homepageSections: HomepageSection[];
  sizeCharts: SizeChart[];
  settings: SiteSettings;
  pages: ContentPage[];
};
export type CartItem = {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  image: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  sku: string;
  maxStock?: number;
  isPreorder?: boolean;
};
export type PaymentMethod = "cod" | "bank";
export type GuestTrackedOrder = {
  kind: "order";
  orderId: string;
  orderNumber?: number;
  createdAt: string;
  customerName: string;
  address1: string;
  address2: string;
  city: string;
  district: string;
  postalCode: string;
  orderStatus: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  fulfillmentMethod?: "flat" | "area_group" | "pickup";
  deliveryMethodName?: string;
  deliveryAreaGroupName?: string;
  pickupBranchName?: string;
  pickupBranchAddress?: string;
  pickupInstructions?: string;
  fulfilmentCourierName: string;
  trackingNumber: string;
  trackingUrl: string;
  courierSentDate: string;
  subtotal: number;
  discountCode: string;
  discountAmount: number;
  deliveryFee: number;
  minimumDeliveryDays?: number;
  maximumDeliveryDays?: number;
  total: number;
  items: Array<{
    name: string;
    color: string;
    size: string;
    quantity: number;
    unitPrice: number;
    isPreorder: boolean;
    productSlug?: string;
    imageUrl?: string;
  }>;
};
export type GuestTrackedPreorder={kind:"preorder";requestId:string;preorderNumber?:number;createdAt:string;customerName:string;productName:string;color:string;size:string;quantity:number;productTotal:number;status:string;statusLabel:string;paymentState:string;convertedOrderId?:string};
export type GuestTrackingResult=GuestTrackedOrder|GuestTrackedPreorder;
export type CheckoutData = {
  fulfillmentMethod: "flat" | "area_group" | "pickup";
  pickupLocationId?: string;
  customerName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address1: string;
  address2?: string;
  city: string;
  district: string;
  postalCode: string;
  deliveryNotes?: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paymentReceiptUrl?: string;
  discountCode?: string;
  items: CartItem[];
};
export type Order = {
  orderId: string;
  orderNumber?: number;
  fulfillmentMethod?: "flat" | "area_group" | "pickup";
  deliveryMethodName?: string;
  deliveryAreaGroupId?: string;
  deliveryAreaGroupName?: string;
  pickupLocationId?: string;
  pickupBranchName?: string;
  pickupBranchAddress?: string;
  pickupInstructions?: string;
  createdAt: string;
  customerName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address1?: string;
  address2?: string;
  city: string;
  district: string;
  postalCode?: string;
  deliveryNotes?: string;
  fulfilmentCourierId?: string;
  fulfilmentCourierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  courierSentDate?: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paymentReceiptUrl?: string;
  source?: string;
  hasPreorder?: boolean;
  sourcePreorderRequestId?: string;
  sourcePreorderCreatedAt?: string;
  sourcePreorderNotifiedAt?: string;
  sourcePreorderConfirmedPrice?: number;
  amountPaid?: number;
  amountToCollect?: number;
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  deliveryFee: number;
  minimumDeliveryDays?: number;
  maximumDeliveryDays?: number;
  total: number;
  orderStatus: OrderStatus;
  paymentStatus: string;
  stockState?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  cancelledFromStatus?: string;
  returnCount?: number;
  items: CartItem[];
};
export type CustomerOrderItem = {
  variantId: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  isPreorder?: boolean;
};
export type CustomerOrder = {
  orderId: string;
  orderNumber?: number;
  createdAt: string;
  customerName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address1?: string;
  address2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  deliveryNotes?: string;
  fulfillmentMethod?: "flat" | "area_group" | "pickup";
  deliveryMethodName?: string;
  deliveryAreaGroupId?: string;
  deliveryAreaGroupName?: string;
  pickupLocationId?: string;
  pickupBranchName?: string;
  pickupBranchAddress?: string;
  pickupInstructions?: string;
  fulfilmentCourierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  courierSentDate?: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paymentReceiptUrl?: string;
  paymentStatus?: string;
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  deliveryFee: number;
  total: number;
  orderStatus: OrderStatus;
  cancellationReason?: string;
  items: CustomerOrderItem[];
};
export type FulfilmentCourier = {
  id: string;
  name: string;
  phone: string;
  trackingUrlTemplate: string;
  notes: string;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};
export type DeliveryMethod={type:"flat"|"area_group"|"pickup";displayName:string;active:boolean;fee:number|null;minimumDeliveryDays:number|null;maximumDeliveryDays:number|null;sortOrder:number};
export type DeliveryAreaGroup={id:string;name:string;fee:number|null;active:boolean;fallback:boolean;sortOrder:number};
export type DeliveryAreaLocation={id:string;groupId:string;district:string;town:string;postcode?:string;aliases:string[];active:boolean};
export type PickupLocation={id:string;name:string;address:string;instructions:string;active:boolean;sortOrder:number};
export type FulfillmentConfig={methods:DeliveryMethod[];groups:DeliveryAreaGroup[];locations:DeliveryAreaLocation[];districtDefaults:Array<{district:string;groupId:string}>;pickupLocations:PickupLocation[]};
export type DashboardTopProduct = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};
export type PreorderStatus =
  | "new"
  | "awaiting_payment"
  | "payment_submitted"
  | "paid"
  | "contacted"
  | "confirmed"
  | "batched"
  | "ordered"
  | "in_transit"
  | "arrived"
  | "ready"
  | "notified"
  | "converted"
  | "cancelled"
  | "expired";
export type PreorderRequest = {
  requestId: string;
  preorderNumber?: number;
  createdAt: string;
  customerId?: string;
  customerName: string;
  phone: string;
  whatsapp: string;
  email?: string;
  address1?: string;
  address2?: string;
  city: string;
  district?: string;
  postalCode?: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  requestedPrice: number;
  confirmedPrice?: number;
  status: PreorderStatus;
  batchId?: string;
  notifiedAt?: string;
  reservationExpiresAt?: string;
  releasedAt?: string;
  convertedOrderId?: string;
  convertedOrderStatus?: OrderStatus;
  convertedOrderDeliveryFee?: number;
  paymentReceiptUrl?: string;
  paymentSubmittedAt?: string;
  paymentVerifiedAt?: string;
  paymentRejectionReason?: string;
  paymentRejectedAt?: string;
  paymentToken?: string;
  notes?: string;
  updatedAt: string;
};
export type CustomerPreorder = Omit<
  PreorderRequest,
  "customerId" | "phone" | "email" | "notes"
>;
export type PreorderClaim={
  requestId:string;preorderNumber?:number;status?:string;customerName:string;phone:string;whatsapp:string;email:string;
  address1:string;address2:string;city:string;district:string;postalCode:string;
  productId:string;variantId:string;productName:string;color:string;size:string;
  quantity:number;confirmedPrice:number;reservationExpiresAt:string;imageUrl:string;paymentIssueReason?:string;
};
export type DashboardData = {
  publishedProducts: number;
  lowStockProducts: number;
  stockAttention: Array<{ id: string; name: string; slug: string; thumbnail: string; totalStock: number; lowVariantCount: number; preorderEnabled: boolean }>;
  ordersToday: number;
  pending: number;
  confirmed: number;
  dispatched: number;
  delivered: number;
  cancelled: number;
  revenue: number;
  productRevenue: number;
  cogs: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  profitDataComplete: boolean;
  deliveryCollected: number;
  itemsSold: number;
  preorderNew?: number;
  topProducts: DashboardTopProduct[];
  recent: Order[];
};
export type FinanceData = {
  period: "today" | "7" | "30" | "all";
  productRevenue: number;
  deliveryCollected: number;
  deliveredOrders: number;
  itemsSold: number;
  topProducts: Array<{productId:string;name:string;imageUrl:string;quantity:number;revenue:number}>;
  recentSales: Array<{orderId:string;createdAt:string;customerName:string;productRevenue:number;delivery:number;total:number}>;
};
