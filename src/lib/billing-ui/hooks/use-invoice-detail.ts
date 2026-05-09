'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { InvoiceEntity } from '../types';
import { billingKeys } from '@/lib/hooks/queries/billing';

export function useInvoiceDetail(invoiceId: string) {
  const query = useQuery({
    queryKey: billingKeys.invoice(invoiceId),
    queryFn: () => api.billing.getInvoice(invoiceId) as Promise<InvoiceEntity>,
    enabled: !!invoiceId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    invoice: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: () => query.refetch(),
  };
}
