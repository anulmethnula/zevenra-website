export type CheckoutFulfillmentType="flat"|"area_group"|"pickup";
export type CheckoutToastSource="delivery"|"submit"|"receipt"|"discount";
export type CheckoutToast={source:CheckoutToastSource;message:string};

export const clearCheckoutToastSource=(toast:CheckoutToast|null,source:CheckoutToastSource)=>(toast?.source===source?null:toast);

export function selectActiveFulfillment(
  methods:Array<{type:CheckoutFulfillmentType}>,
  current:CheckoutFulfillmentType|null,
):CheckoutFulfillmentType|null{
  return methods.some(method=>method.type===current)?current:methods[0]?.type??null;
}
