'use client';

/**
 * DASHBOARD QUERY HOOKS
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: (orgId: string) => [...dashboardKeys.all, 'stats', orgId] as const,
};

export function useDashboardStats(orgId: string) {
  const query = useQuery({
    queryKey: dashboardKeys.stats(orgId),
    queryFn: () => api.dashboard.getStats(orgId),
    staleTime: 60 * 1000,
    enabled: !!orgId,
  });
  return {
    stats: query.data?.stats ?? null,
    recentImports: query.data?.recentImports ?? [],
    recentVerifications: query.data?.recentVerifications ?? [],
    certificatesDaily: query.data?.certificatesDaily ?? [],
    certificateCategoryMix: query.data?.certificateCategoryMix ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
