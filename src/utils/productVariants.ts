type ProductVariantOption={active:boolean;stock:number;color:string;size:string};

export function preferredProductVariant<T extends ProductVariantOption>(variants:T[],preorderEnabled:boolean){
  const active=variants.filter(variant=>variant.active);
  return active.find(variant=>variant.stock>0)||(preorderEnabled?active.find(variant=>variant.stock<1):undefined);
}

export function productSizeGroups<T extends ProductVariantOption>(variants:T[],preorderEnabled:boolean){
  return{
    available:variants.filter(variant=>variant.active&&variant.stock>0),
    preorder:preorderEnabled?variants.filter(variant=>variant.active&&variant.stock<1):[],
  };
}
