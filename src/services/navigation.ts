import type { Category } from "../types";
export type NavigationCategory = Category & {
  children: Category[];
  publishedProductCount: number;
};
export function getDescendantCategoryIds(
  categoryId: string,
  categories: Category[],
): string[] {
  const children = categories.filter(
    (category) => category.parentId === categoryId,
  );
  return [
    categoryId,
    ...children.flatMap((child) =>
      getDescendantCategoryIds(child.id, categories),
    ),
  ];
}
export function getNavigationCategories(
  categories: Category[],
): NavigationCategory[] {
  const hasNavigationConfig = categories.some(
      (category) => category.showInNavigation,
    ),
    rootVisible = (category: Category) =>
      category.active && (!hasNavigationConfig || category.showInNavigation);
  return categories
    .filter((category) => !category.parentId && rootVisible(category))
    .map((category) => {
      const children = categories
        .filter(
          (child) =>
            child.parentId === category.id &&
            child.active,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return { ...category, children, publishedProductCount:0 };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
