const MAX_SEARCH_TOKENS = 8;
const MAX_TOKEN_LENGTH = 32;

export function normalizeSearchTokens(input: unknown) {
  return String(input || "").normalize("NFKC").trim().toLocaleLowerCase("en")
    .split(/\s+/u).filter(Boolean).slice(0, MAX_SEARCH_TOKENS)
    .map((token) => token.slice(0, MAX_TOKEN_LENGTH));
}

export function addProductSearchConditions(conditions: string[], values: unknown[], tokens: string[]) {
  for (const token of tokens) {
    values.push(`%${token}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(lower(p.name) LIKE ${parameter} OR lower(COALESCE(p.short_description,'')) LIKE ${parameter} OR EXISTS(SELECT 1 FROM unnest(COALESCE(p.tags,'{}'::text[])) tag WHERE lower(tag) LIKE ${parameter}) OR EXISTS(SELECT 1 FROM categories search_category LEFT JOIN categories search_parent ON search_parent.id=search_category.parent_id WHERE search_category.id=p.category_id AND (lower(search_category.name) LIKE ${parameter} OR lower(COALESCE(search_parent.name,'')) LIKE ${parameter})))`);
  }
}
