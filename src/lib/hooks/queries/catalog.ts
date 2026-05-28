'use client';

/**
 * CATALOG QUERY HOOKS
 *
 * Replaces use-catalog-categories.ts and use-catalog-subcategories.ts.
 * TanStack Query handles caching, deduplication, and stale-while-revalidate.
 * The manual CatalogCacheManager is no longer needed.
 *
 * staleTime: 5 minutes — catalog data changes rarely
 */

import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';

export const catalogKeys = {
  all: ['catalog'] as const,
  categories: () => [...catalogKeys.all, 'categories'] as const,
  subcategories: (categoryId: string) => [...catalogKeys.all, 'subcategories', categoryId] as const,
};

export interface CatalogCategory {
  id: string;
  name: string;
  key: string;
  color?: string | null;
}

export interface CatalogSubcategory {
  id: string;
  key: string;
  name: string;
  sort_order: number | null;
  is_org_custom: boolean;
  color?: string | null;
}

export interface CatalogCategoryGroup {
  group_key: string;
  label: string;
  items: CatalogCategory[];
}

/**
 * Fetch grouped certificate categories.
 * Returns `requiresIndustry: true` when the org hasn't set its industry (409 error).
 */
export function useCatalogCategories() {
  const query = useQuery({
    queryKey: catalogKeys.categories(),
    queryFn: () => api.catalog.getCategories(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry 409 ORG_INDUSTRY_REQUIRED — it won't resolve on its own
      if (error instanceof ApiError && (error as ApiError & { status?: number }).status === 409) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const requiresIndustry =
    query.error instanceof ApiError &&
    (query.error as ApiError & { status?: number }).status === 409;

  const groups: CatalogCategoryGroup[] = (() => {
    if (!query.data) return [];
    if (Array.isArray(query.data)) return query.data as CatalogCategoryGroup[];
    if (Array.isArray(query.data.groups)) return query.data.groups;
    return [];
  })();

  return {
    groups,
    loading: query.isLoading,
    error: requiresIndustry
      ? 'Organization industry is required to view categories.'
      : query.error instanceof Error
        ? query.error.message
        : null,
    requiresIndustry,
    reload: () => query.refetch(),
  };
}

/**
 * Fetch subcategories for a specific category.
 * Only runs when categoryId is provided.
 */
export function useCatalogSubcategories(categoryId: string | null | undefined) {
  const query = useQuery({
    queryKey: catalogKeys.subcategories(categoryId ?? ''),
    queryFn: () => api.catalog.getSubcategories(categoryId!),
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    subcategories: (query.data?.items ?? []) as CatalogSubcategory[],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    reload: () => query.refetch(),
  };
}
