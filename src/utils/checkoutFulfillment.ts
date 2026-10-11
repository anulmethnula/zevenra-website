export type CheckoutFulfillmentType="flat"|"area_group"|"pickup";

export function selectActiveFulfillment(
  methods:Array<{type:CheckoutFulfillmentType}>,
  current:CheckoutFulfillmentType|null,
):CheckoutFulfillmentType|null{
  return methods.some(method=>method.type===current)?current:methods[0]?.type??null;
}
