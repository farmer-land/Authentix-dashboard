/**
 * CATALOG DOMAIN API
 *
 * Certificate category and subcategory retrieval + management.
 */

import { apiRequest } from "./core";

// ── Management types ──────────────────────────────────────────────────────────

export interface ManagementCategory {
  category_id: string;
  key: string;
  name: string;
  original_name: string;
  group_key: string | null;
  sort_order: number | null;
  is_org_custom: boolean;
  is_hidden: boolean;
  has_name_override: boolean;
  color: string | null;
}

export interface ManagementSubcategory {
  subcategory_id: string;
  category_id: string;
  key: string;
  name: string;
  original_name: string;
  sort_order: number | null;
  is_org_custom: boolean;
  is_hidden: boolean;
  has_name_override: boolean;
  color: string | null;
}

export const catalogApi = {
  /**
   * Get grouped certificate categories.
   * May return 409 with ORG_INDUSTRY_REQUIRED if organization industry is not set.
   */
  getCategories: async () => {
    const response = await apiRequest<{
      groups: Array<{
        group_key: string;
        label: string;
        items: Array<{ id: string; name: string; key: string }>;
      }>;
      flat?: Array<{ id: string; name: string; key: string }>;
    }>("/catalog/categories");
    return response.data!;
  },

  /**
   * Get subcategories for a specific category.
   */
  getSubcategories: async (categoryId: string) => {
    const response = await apiRequest<{
      category_id: string;
      items: Array<{
        id: string;
        key: string;
        name: string;
        sort_order: number | null;
        is_org_custom: boolean;
      }>;
    }>(`/catalog/categories/${categoryId}/subcategories`);
    return response.data!;
  },

  // ── Management methods (include hidden) ─────────────────────────────────────

  manage: {
    listCategories: async (): Promise<ManagementCategory[]> => {
      const r = await apiRequest<{ categories: ManagementCategory[] }>("/catalog/manage/categories");
      return r.data!.categories;
    },

    createCategory: async (data: { name: string; group_key?: string | null }): Promise<{ category_id: string }> => {
      const r = await apiRequest<{ category_id: string }>("/catalog/manage/categories", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return r.data!;
    },

    updateCategory: async (categoryId: string, data: { name?: string; is_hidden?: boolean; sort_order?: number | null; color?: string | null }): Promise<void> => {
      await apiRequest(`/catalog/manage/categories/${categoryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    deleteCategory: async (categoryId: string): Promise<void> => {
      await apiRequest(`/catalog/manage/categories/${categoryId}`, { method: "DELETE" });
    },

    listSubcategories: async (categoryId: string): Promise<ManagementSubcategory[]> => {
      const r = await apiRequest<{ subcategories: ManagementSubcategory[] }>(
        `/catalog/manage/categories/${categoryId}/subcategories`
      );
      return r.data!.subcategories;
    },

    createSubcategory: async (categoryId: string, data: { name: string }): Promise<{ subcategory_id: string }> => {
      const r = await apiRequest<{ subcategory_id: string }>(
        `/catalog/manage/categories/${categoryId}/subcategories`,
        { method: "POST", body: JSON.stringify(data) }
      );
      return r.data!;
    },

    updateSubcategory: async (categoryId: string, subcategoryId: string, data: { name?: string; is_hidden?: boolean; sort_order?: number | null; color?: string | null }): Promise<void> => {
      await apiRequest(`/catalog/manage/categories/${categoryId}/subcategories/${subcategoryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    deleteSubcategory: async (categoryId: string, subcategoryId: string): Promise<void> => {
      await apiRequest(
        `/catalog/manage/categories/${categoryId}/subcategories/${subcategoryId}`,
        { method: "DELETE" }
      );
    },
  },
};
