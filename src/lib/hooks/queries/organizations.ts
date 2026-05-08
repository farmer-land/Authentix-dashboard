'use client';

/**
 * ORGANIZATIONS QUERY HOOKS
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useOrgSlug } from '@/lib/org';

export const organizationKeys = {
  all: (slug: string) => ['org', slug, 'organizations'] as const,
  me: (slug: string) => [...organizationKeys.all(slug), 'me'] as const,
  apiSettings: (slug: string) => [...organizationKeys.all(slug), 'api-settings'] as const,
};

export function useOrganization() {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: organizationKeys.me(slug),
    queryFn: () => api.organizations.get(),
    staleTime: 60 * 1000,
  });
  return {
    organization: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useOrganizationAPISettings() {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: organizationKeys.apiSettings(slug),
    queryFn: () => api.organizations.getAPISettings(),
    staleTime: 60 * 1000,
  });
  return {
    settings: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
  };
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ data, logoFile }: {
      data: Parameters<typeof api.organizations.update>[0];
      logoFile?: File;
    }) => api.organizations.update(data, logoFile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.me(slug) });
    },
  });
}

export function useRotateAPIKey() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: () => api.organizations.rotateAPIKey(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.apiSettings(slug) });
    },
  });
}

export function useBootstrapIdentity() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: () => api.organizations.bootstrapIdentity(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.apiSettings(slug) });
    },
  });
}

export function useUpdateAPIEnabled() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (enabled: boolean) => api.organizations.updateAPIEnabled(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.apiSettings(slug) });
    },
  });
}
