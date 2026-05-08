'use client';

/**
 * CERTIFICATES QUERY HOOKS
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useOrgSlug } from '@/lib/org';

export const certificateKeys = {
  all: (slug: string) => ['org', slug, 'certificates'] as const,
  list: (slug: string, params?: Record<string, unknown>) => [...certificateKeys.all(slug), 'list', params ?? {}] as const,
  detail: (slug: string, id: string) => [...certificateKeys.all(slug), 'detail', id] as const,
  downloadUrl: (slug: string, id: string) => [...certificateKeys.all(slug), 'download-url', id] as const,
};

export function useCertificates(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'revoked' | 'expired';
  category_id?: string;
  subcategory_id?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}) {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: certificateKeys.list(slug, params as Record<string, unknown>),
    queryFn: () => api.certificates.list(params),
    staleTime: 30 * 1000,
  });

  return {
    certificates: query.data?.items ?? [],
    pagination: query.data?.pagination,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCertificate(id: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: certificateKeys.detail(slug, id ?? ''),
    queryFn: () => api.certificates.get(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCertificateDownloadUrl(id: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: certificateKeys.downloadUrl(slug, id ?? ''),
    queryFn: () => api.certificates.getDownloadUrl(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
