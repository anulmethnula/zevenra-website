export function normalizeWhatsappDigits(value:unknown){
 let digits=String(value??'').replace(/\D/g,'');
 if(digits.startsWith('0094'))digits=digits.slice(2);
 if(digits.startsWith('0')&&digits.length===10)digits='94'+digits.slice(1);
 else if(digits.length===9&&digits.startsWith('7'))digits='94'+digits;
 return digits.length>=8?digits:'';
}
export function whatsappUrl(value:unknown){const digits=normalizeWhatsappDigits(value);return digits?`https://wa.me/${digits}`:''}
