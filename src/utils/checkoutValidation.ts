export function postalCodeError(value:string){
  const postal=value.trim();
  if(!postal)return "Enter your postal code.";
  if(!/^\d+$/.test(postal))return "Postal code must contain numbers only.";
  if(postal.length!==5)return "Postal code must be exactly 5 digits.";
  return "";
}

export function paymentReadinessMessage(input:{city:string;district:string;postalError:string;deliveryEnabled:boolean;quoteReady:boolean}){
  if(!input.city.trim()||!input.district)return "Complete your delivery details to continue.";
  if(input.postalError)return input.postalError==="Enter your postal code."?"Enter your postal code to continue.":"Fix the postal code above to continue.";
  if(input.deliveryEnabled&&!input.quoteReady)return "Check your delivery address above to continue.";
  return "";
}
