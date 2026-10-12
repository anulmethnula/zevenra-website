export function postalCodeError(value:string){
  const postal=value.trim();
  if(!postal)return "Enter your postal code.";
  if(!/^\d+$/.test(postal))return "Postal code must contain numbers only.";
  if(postal.length!==5)return "Postal code must be exactly 5 digits.";
  return "";
}

const sriLankaDistricts=new Set(["Ampara","Anuradhapura","Badulla","Batticaloa","Colombo","Galle","Gampaha","Hambantota","Jaffna","Kalutara","Kandy","Kegalle","Kilinochchi","Kurunegala","Mannar","Matale","Matara","Monaragala","Mullaitivu","Nuwara Eliya","Polonnaruwa","Puttalam","Ratnapura","Trincomalee","Vavuniya"]);
export type DeliveryAddress={address1:string;city:string;district:string;postalCode:string};
export function deliveryAddressReady(address:DeliveryAddress){return address.address1.trim().length>=5&&address.city.trim().length>=2&&sriLankaDistricts.has(address.district)&&!postalCodeError(address.postalCode);}

export function hydrateUntouchedDeliveryAddress(current:DeliveryAddress,profile:Partial<DeliveryAddress>,touched:Record<keyof DeliveryAddress,boolean>):DeliveryAddress{
  return Object.fromEntries((Object.keys(current) as Array<keyof DeliveryAddress>).map(key=>[key,touched[key]?current[key]:current[key]||profile[key]||""])) as unknown as DeliveryAddress;
}

export function paymentReadinessMessage(input:{address1:string;city:string;district:string;postalError:string;deliveryEnabled:boolean;quoteReady:boolean}){
  if(!input.deliveryEnabled)return input.quoteReady?"":"Select a pickup branch to continue.";
  if(input.address1.trim().length<5||!input.city.trim()||!input.district)return "Complete your delivery details to continue.";
  if(input.postalError)return input.postalError==="Enter your postal code."?"Enter your postal code to continue.":"Fix the postal code above to continue.";
  if(input.deliveryEnabled&&!input.quoteReady)return "Check your delivery address above to continue.";
  return "";
}
