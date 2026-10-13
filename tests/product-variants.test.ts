import assert from "node:assert/strict";
import test from "node:test";
import { preferredProductVariant,productSizeGroups } from "../src/utils/productVariants.ts";

const variants=[
  {id:"xs",active:true,stock:2,color:"Black",size:"XS"},
  {id:"s",active:true,stock:0,color:"Black",size:"S"},
  {id:"m",active:true,stock:0,color:"Black",size:"M"},
  {id:"l",active:true,stock:0,color:"Black",size:"L"},
];

test("size groups preserve configured order and separate preorder options",()=>{
  const groups=productSizeGroups(variants,true);
  assert.deepEqual(groups.available.map(item=>item.size),["XS"]);
  assert.deepEqual(groups.preorder.map(item=>item.size),["S","M","L"]);
});

test("initial selection prefers stock and falls back to preorder",()=>{
  assert.equal(preferredProductVariant(variants,true)?.id,"xs");
  assert.equal(preferredProductVariant(variants.slice(1),true)?.id,"s");
  assert.equal(preferredProductVariant(variants.slice(1),false),undefined);
});
