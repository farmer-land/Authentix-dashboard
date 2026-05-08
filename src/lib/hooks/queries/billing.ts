'use client';

/**
 * BILLING QUERY HOOKS
 *
 * Replaces use-billing-overview.ts and use-invoice-list.ts.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export const billingKeys = {
  all: ['billing'] as const,
  overview: () => [...billingKeys.all, 'overview'] as const,
  invoices: (params?: Record<string, unknown>) => [...billingKeys.all, 'invoices', params ?? {}] as const,
  invoice: (id: string) => [...billingKeys.all, 'invoice', id] as const,
};

export function useBillingOverview() {
  const query = useQuery({
    queryKey: billingKeys.overview(),
    queryFn: () => api.billing.getOverview(),
    staleTime: 60 * 1000,
  });

  return {
    overview: query.data,
    data: query.data,
    usage: query.data?.current_usage ?? null,
    billingProfile: query.data?.billing_profile ?? null,
    orgBilling: query.data?.org_billing ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: () => query.refetch(),
  };
}

export function useInvoiceList(params?: {
  page?: number;
  limit?: number;
  status?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}) {
  const query = useQuery({
    queryKey: billingKeys.invoices(params as Record<string, unknown>),
    queryFn: () => api.billing.listInvoices(params),
    staleTime: 60 * 1000,
  });

  return {
    invoices: (query.data as { items?: unknown[] } | undefined)?.items ?? [],
    pagination: (query.data as { pagination?: unknown } | undefined)?.pagination,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
  };
}

export function useInvoice(id: string | null | undefined) {
  return useQuery({
    queryKey: billingKeys.invoice(id ?? ''),
    queryFn: () => api.billing.getInvoice(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
