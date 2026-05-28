/**
 * TEMPLATES FEATURE - HOOKS
 *
 * React hooks for template state management.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listTemplatesWithPreviews,
  deleteTemplate,
  getTemplateCategories,
} from "../api";
import type { Template, TemplateListParams } from "../types";

/**
 * Hook for managing templates list
 */
export function useTemplates(initialParams?: TemplateListParams) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<TemplateListParams>(
    initialParams ?? { sort_by: "created_at", sort_order: "desc" }
  );

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listTemplatesWithPreviews(params);
      setTemplates(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load templates";
      setError(message);
      console.error("[useTemplates] Error:", err);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTemplate(id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete template";
        console.error("[useTemplates] Delete error:", err);
        throw new Error(message);
      }
    },
    []
  );

  const updateParams = useCallback((newParams: Partial<TemplateListParams>) => {
    setParams((prev) => ({ ...prev, ...newParams }));
  }, []);

  return {
    templates,
    loading,
    error,
    params,
    reload: loadTemplates,
    deleteTemplate: handleDelete,
    updateParams,
  };
}

/**
 * Hook for managing template categories
 */
export function useTemplateCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string[]>>({});
  const [industry, setIndustry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getTemplateCategories();
      setCategories(data.categories);
      setCategoryMap(data.categoryMap);
      setIndustry(data.industry);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load categories";
      setError(message);
      console.error("[useTemplateCategories] Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const getSubcategories = useCallback(
    (category: string): string[] => {
      return categoryMap[category] ?? [];
    },
    [categoryMap]
  );

  const requiresSubcategory = useCallback(
    (category: string): boolean => {
      const subcategories = categoryMap[category];
      return Array.isArray(subcategories) && subcategories.length > 0;
    },
    [categoryMap]
  );

  return {
    categories,
    categoryMap,
    industry,
    loading,
    error,
    reload: loadCategories,
    getSubcategories,
    requiresSubcategory,
  };
}
