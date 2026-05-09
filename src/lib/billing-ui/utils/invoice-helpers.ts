/**
 * INVOICE HELPERS
 *
 * Utility functions for invoice display and status handling.
 */

import type { InvoiceStatus, PaymentStatusInfo } from '../types';

export interface BillingPeriodInfo {
  start: Date;
  end: Date;
  label: string;
}

export function getPaymentStatusInfo(status: InvoiceStatus): PaymentStatusInfo {
  const statusMap: Record<InvoiceStatus, PaymentStatusInfo> = {
    draft:     { label: 'Draft',     color: 'gray' },
    pending:   { label: 'Pending',   color: 'yellow' },
    paid:      { label: 'Paid',      color: 'green' },
    overdue:   { label: 'Overdue',   color: 'red' },
    cancelled: { label: 'Cancelled', color: 'gray' },
    refunded:  { label: 'Refunded',  color: 'blue' },
    failed:    { label: 'Failed',    color: 'red' },
  };
  return statusMap[status] ?? statusMap.pending;
}

export function formatBillingPeriod(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
}

export function getCurrentBillingPeriod(): BillingPeriodInfo {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end, label: formatBillingPeriod(start.toISOString(), end.toISOString()) };
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
