'use client';

import Link from 'next/link';
import { useInvoiceList } from '@/lib/billing-ui/hooks/use-invoice-list';
import { paiseToRupees } from '@/lib/billing-ui/types';
import { getPaymentStatusInfo } from '@/lib/billing-ui/utils/invoice-helpers';
import type { InvoiceEntity } from '@/lib/billing-ui/types';

interface InvoiceListProps {
  organizationId: string;
}

function formatINR(rupees: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(rupees);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const COLOR_CLASSES: Record<string, string> = {
  gray:   'bg-gray-100 text-gray-700',
  green:  'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  red:    'bg-red-100 text-red-800',
  blue:   'bg-blue-100 text-blue-800',
};

export function InvoiceList({ organizationId }: InvoiceListProps) {
  const { invoices, loading, error } = useInvoiceList(organizationId);

  if (loading) {
    return (
      <div className="rounded-lg border p-6 space-y-3 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted rounded" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground">
        <p className="text-sm">No invoices yet. Invoices are generated at the end of each billing month.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted/40">
          <tr>
            {['Invoice', 'Issued', 'Due', 'Status', 'Amount', 'Actions'].map(h => (
              <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {invoices.map((inv: InvoiceEntity) => {
            const statusInfo = getPaymentStatusInfo(inv.status);
            const total = paiseToRupees(inv.total_paise);
            const amountDue = paiseToRupees(inv.amount_due_paise);

            return (
              <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-5 py-3 whitespace-nowrap">
                  <p className="text-sm font-medium">{inv.invoice_number}</p>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(inv.issue_date)}
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(inv.due_date)}
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${COLOR_CLASSES[statusInfo.color] ?? COLOR_CLASSES.gray}`}>
                    {statusInfo.label}
                  </span>
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  <p className="text-sm font-semibold">{formatINR(total, inv.currency)}</p>
                  {inv.payable && amountDue > 0 && (
                    <p className="text-xs text-red-600">Due: {formatINR(amountDue, inv.currency)}</p>
                  )}
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`billing/invoices/${inv.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View
                    </Link>
                    {inv.payable && inv.payment_cta_url && (
                      <a
                        href={inv.payment_cta_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1 rounded text-xs font-semibold bg-yellow-600 text-white hover:bg-yellow-700 transition-colors"
                      >
                        Pay Now
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
