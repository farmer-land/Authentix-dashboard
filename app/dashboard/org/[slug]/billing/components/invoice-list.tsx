'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useInvoiceList } from '@/lib/billing-ui/hooks/use-invoice-list';
import { paiseToRupees } from '@/lib/billing-ui/types';
import { getPaymentStatusInfo } from '@/lib/billing-ui/utils/invoice-helpers';
import type { InvoiceEntity } from '@/lib/billing-ui/types';
import { PayNowButton } from './pay-now-button';
import { preloadRazorpay } from '@/lib/razorpay';
import { FileText, Download, ExternalLink } from 'lucide-react';

function formatINR(rupees: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(rupees);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_STYLES: Record<string, string> = {
  gray:   'bg-muted text-muted-foreground',
  green:  'bg-emerald-500/10 text-emerald-600',
  yellow: 'bg-yellow-500/10 text-yellow-600',
  red:    'bg-red-500/10 text-red-500',
  blue:   'bg-blue-500/10 text-blue-600',
};

export function InvoiceList({
  organizationId,
  orgName,
  orgEmail,
}: {
  organizationId: string;
  orgName?: string;
  orgEmail?: string;
}) {
  const { invoices, loading, error, refresh: refetch } = useInvoiceList(organizationId);
  const params = useParams();
  const slug = params.slug as string;

  useEffect(() => { preloadRazorpay(); }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border overflow-hidden divide-y divide-border/50 animate-pulse">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-muted/30" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
        <FileText className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No invoices yet</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Generated automatically on the 1st of each month</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-muted/30 border-b border-border/50">
            <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 w-[40%]">Invoice</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">Issued</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Status</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 text-right">Amount</th>
            <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {invoices.map((inv: InvoiceEntity) => {
            const statusInfo = getPaymentStatusInfo(inv.status);
            const total = paiseToRupees(inv.total_paise);
            const amountDue = paiseToRupees(inv.amount_due_paise);
            const razorpayUrl = inv.razorpay_payment_link_url;
            const detailHref = `/dashboard/org/${slug}/billing/invoices/${inv.id}`;

            return (
              <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                {/* Invoice number — links to detail page */}
                <td className="px-5 py-3.5">
                  <Link href={detailHref} className="group">
                    <p className="text-sm font-medium group-hover:text-brand-500 transition-colors">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDate(inv.due_date)}</p>
                  </Link>
                </td>

                {/* Issued date */}
                <td className="px-4 py-3.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(inv.issue_date)}</span>
                </td>

                {/* Status badge */}
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${STATUS_STYLES[statusInfo.color] ?? STATUS_STYLES.gray}`}>
                    {statusInfo.label}
                  </span>
                </td>

                {/* Amount */}
                <td className="px-4 py-3.5 text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatINR(total, inv.currency)}</p>
                  {inv.payable && amountDue > 0 && (
                    <p className="text-[10px] text-red-500 tabular-nums">Due: {formatINR(amountDue, inv.currency)}</p>
                  )}
                </td>

                {/* Actions */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 justify-end">
                    {razorpayUrl ? (
                      <a
                        href={razorpayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={inv.status === 'paid' ? 'Download receipt (PDF)' : 'View invoice on Razorpay'}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {inv.status === 'paid'
                          ? <Download className="w-3.5 h-3.5" />
                          : <ExternalLink className="w-3.5 h-3.5" />
                        }
                      </a>
                    ) : (
                      <Link
                        href={detailHref}
                        title="View invoice details"
                        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {inv.payable && amountDue > 0 && (
                      <PayNowButton
                        amount={amountDue}
                        invoiceId={inv.id}
                        invoiceNumber={inv.invoice_number}
                        orgName={orgName}
                        orgEmail={orgEmail}
                        onSuccess={refetch}
                      />
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
