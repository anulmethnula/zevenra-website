export type CheckoutFulfillmentType="flat"|"area_group"|"pickup";
export type CheckoutToastSource="delivery"|"submit"|"receipt"|"discount";
export type CheckoutToast={source:CheckoutToastSource;message:string};
type QuoteItem={productId:string;variantId:string;quantity:number};
export type CheckoutDeliveryQuoteInput={fulfillmentMethod:CheckoutFulfillmentType;items:QuoteItem[];pickupLocationId?:string;city?:string;district?:string;postalCode?:string};

const sriLankaDistricts=new Set(["Ampara","Anuradhapura","Badulla","Batticaloa","Colombo","Galle","Gampaha","Hambantota","Jaffna","Kalutara","Kandy","Kegalle","Kilinochchi","Kurunegala","Mannar","Matale","Matara","Monaragala","Mullaitivu","Nuwara Eliya","Polonnaruwa","Puttalam","Ratnapura","Trincomalee","Vavuniya"]);

export function checkoutDeliveryQuoteInput(input:{fulfillmentMethod:CheckoutFulfillmentType;items:QuoteItem[];pickupLocationId:string;city:string;district:string;postalCode:string}):CheckoutDeliveryQuoteInput|null{
  const {fulfillmentMethod,items}=input;
  if(!items.length)return null;
  if(fulfillmentMethod==="flat")return {fulfillmentMethod,items};
  if(fulfillmentMethod==="pickup")return input.pickupLocationId?{fulfillmentMethod,items,pickupLocationId:input.pickupLocationId}:null;
  const city=input.city.trim(),postalCode=input.postalCode.trim();
  if(!sriLankaDistricts.has(input.district)||city.length<2||!/^\d{5}$/.test(postalCode))return null;
  return {fulfillmentMethod,items,city,district:input.district,postalCode};
}

export const clearCheckoutToastSource=(toast:CheckoutToast|null,source:CheckoutToastSource)=>(toast?.source===source?null:toast);

export function selectActiveFulfillment(
  methods:Array<{type:CheckoutFulfillmentType}>,
  current:CheckoutFulfillmentType|null,
):CheckoutFulfillmentType|null{
  return methods.some(method=>method.type===current)?current:methods[0]?.type??null;
}
