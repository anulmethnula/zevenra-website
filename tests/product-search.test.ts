import assert from "node:assert/strict";
import test from "node:test";
import { addProductSearchConditions, normalizeSearchTokens } from "../api/_data/product-search.ts";

test("normalizes exact, partial, case-insensitive and repeated-space searches", () => {
  assert.deepEqual(normalizeSearchTokens("The Classic Fit"), ["the", "classic", "fit"]);
  assert.deepEqual(normalizeSearchTokens("  CLASS   "), ["class"]);
  assert.deepEqual(normalizeSearchTokens("  tHe   CLASSIC    fit  "), ["the", "classic", "fit"]);
});

test("builds one parameterized all-fields predicate per term, including categories", () => {
  const conditions = ["p.status='published'"], values: unknown[] = [];
  addProductSearchConditions(conditions, values, normalizeSearchTokens("classic women"));
  assert.deepEqual(values, ["%classic%", "%women%"]);
  assert.equal(conditions.length, 3);
  for (const field of ["p.name", "p.short_description", "p.tags", "search_category.name", "search_parent.name"])
    assert.ok(conditions.join(" ").includes(field));
  assert.match(conditions[1], /\$1/);
  assert.match(conditions[2], /\$2/);
});

test("bounds abusive and no-result input", () => {
  const tokens = normalizeSearchTokens("one two three four five six seven eight nine " + "x".repeat(80));
  assert.equal(tokens.length, 8);
  assert.ok(tokens.every((token) => token.length <= 32));
  assert.deepEqual(normalizeSearchTokens("no-such-product"), ["no-such-product"]);
});
