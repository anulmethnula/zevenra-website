import test from "node:test";
import assert from "node:assert/strict";
import { cloudinaryImage,cloudinarySrcSet } from "../src/utils/cloudinary.ts";

test("adds bounded automatic delivery transforms to Cloudinary upload images",()=>{
  const result=cloudinaryImage("https://res.cloudinary.com/demo/image/upload/v1/catalog/item.jpg",900);
  assert.equal(result,"https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_900/v1/catalog/item.jpg");
});

test("does not transform non-Cloudinary or authenticated resources",()=>{
  const external="https://images.example.com/item.jpg",authenticated="https://res.cloudinary.com/demo/image/authenticated/v1/private.jpg";
  assert.equal(cloudinaryImage(external,900),external);
  assert.equal(cloudinaryImage(authenticated,900),authenticated);
});

test("builds sorted responsive source sets without duplicate widths",()=>{
  const result=cloudinarySrcSet("https://res.cloudinary.com/demo/image/upload/item.jpg",[900,320,900]);
  assert.match(result,/w_320\/item\.jpg 320w/);assert.match(result,/w_900\/item\.jpg 900w/);assert.equal(result.split(", ").length,2);
});
