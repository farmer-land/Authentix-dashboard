'use client';

/**
 * IMPORTS QUERY HOOKS
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useOrgSlug } from '@/lib/org';

export const importKeys = {
  all: (slug: string) => ['org', slug, 'imports'] as const,
  list: (slug: string, params?: Record<string, unknown>) => [...importKeys.all(slug), 'list', params ?? {}] as const,
  detail: (slug: string, id: string) => [...importKeys.all(slug), 'detail', id] as const,
  data: (slug: string, id: string, params?: Record<string, unknown>) => [...importKeys.all(slug), 'data', id, params ?? {}] as const,
};

export function useImports(params?: {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}) {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: importKeys.list(slug, params as Record<string, unknown>),
    queryFn: () => api.imports.list(params),
    staleTime: 0,
    refetchOnMount: true,
  });

  return {
    imports: query.data?.items ?? [],
    pagination: query.data?.pagination,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useImportJob(id: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: importKeys.detail(slug, id ?? ''),
    queryFn: () => api.imports.get(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useImportData(id: string | null | undefined, params?: { page?: number; limit?: number }) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: importKeys.data(slug, id ?? '', params as Record<string, unknown>),
    queryFn: () => api.imports.getData(id!, params),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateImport() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ file, metadata }: {
      file: File;
      metadata: {
        file_name: string;
        certificate_category?: string;
        certificate_subcategory?: string;
        certificate_template_id?: string;
        reusable?: boolean;
      };
    }) => api.imports.create(file, metadata),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: importKeys.all(slug) });
    },
  });
}
