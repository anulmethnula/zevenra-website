import type {Category,Product} from '../types';

export type NavigationCategory=Category&{children:Category[];publishedProductCount:number};

export function getDescendantCategoryIds(categoryId:string,categories:Category[]):string[]{
 const children=categories.filter(category=>category.parentId===categoryId);
 return[categoryId,...children.flatMap(child=>getDescendantCategoryIds(child.id,categories))]
}

export function getNavigationCategories(categories:Category[],products:Product[],allowEmpty=true):NavigationCategory[]{
 const publishedProducts=products.filter(product=>product.status==='published');
 const countProducts=(categoryId:string)=>{
  const ids=getDescendantCategoryIds(categoryId,categories);
  return publishedProducts.filter(product=>ids.includes(product.categoryId)).length
 };
 return categories
  .filter(category=>!category.parentId&&category.active)
  .map(category=>({...category,children:[],publishedProductCount:countProducts(category.id)}))
  .filter(category=>allowEmpty||category.publishedProductCount>0)
  .sort((a,b)=>a.sortOrder-b.sortOrder)
}
