'use client';

/**
 * TEMPLATES QUERY HOOKS
 *
 * Covers: template list, single template, recent usage, preview URLs.
 * Mutations: create, update, delete, save fields, generate preview.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useOrgSlug } from '@/lib/org';

export const templateKeys = {
  all: (slug: string) => ['org', slug, 'templates'] as const,
  list: (slug: string, params?: Record<string, unknown>) => [...templateKeys.all(slug), 'list', params ?? {}] as const,
  detail: (slug: string, id: string) => [...templateKeys.all(slug), 'detail', id] as const,
  recentUsage: (slug: string) => [...templateKeys.all(slug), 'recent-usage'] as const,
  previewUrl: (slug: string, id: string) => [...templateKeys.all(slug), 'preview-url', id] as const,
  categories: (slug: string) => [...templateKeys.all(slug), 'categories'] as const,
};

export function useTemplates(params?: {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}) {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: templateKeys.list(slug, params),
    queryFn: () => api.templates.list(params),
    staleTime: 2 * 60 * 1000,
  });

  return {
    templates: (query.data as { items?: unknown[] } | undefined)?.items ?? [],
    pagination: (query.data as { pagination?: unknown } | undefined)?.pagination,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useTemplate(id: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: templateKeys.detail(slug, id ?? ''),
    queryFn: () => api.templates.get(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useTemplateRecentUsage(limit?: number) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: templateKeys.recentUsage(slug),
    queryFn: () => api.templates.getRecentUsage(limit),
    staleTime: 60 * 1000,
  });
}

export function useTemplatePreviewUrl(id: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: templateKeys.previewUrl(slug, id ?? ''),
    queryFn: () => api.templates.getPreviewUrl(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useTemplateCategories() {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: templateKeys.categories(slug),
    queryFn: () => api.templates.getCategories(),
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all(slug) });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, updates }: {
      id: string;
      updates: { name?: string; description?: string; width?: number; height?: number };
    }) => api.templates.update(id, updates),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(slug, id) });
      queryClient.invalidateQueries({ queryKey: templateKeys.all(slug) });
    },
  });
}

export function useGenerateTemplatePreview() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ templateId, versionId }: { templateId: string; versionId: string }) =>
      api.templates.generatePreview(templateId, versionId),
    onSuccess: (_data, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.previewUrl(slug, templateId) });
    },
  });
}
