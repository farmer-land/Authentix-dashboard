'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { billingApi } from '@/lib/api/billing';
import type { InvoiceEntity, InvoiceLineItem } from '@/lib/billing-ui/types';
import { PayNowButton } from '../../components/pay-now-button';
import { preloadRazorpay } from '@/lib/razorpay';
import { ArrowLeft, Download, ExternalLink, Loader2, FileText } from 'lucide-react';

function formatINR(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const slug = params.slug as string;

  const [invoice, setInvoice] = useState<InvoiceEntity | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { preloadRazorpay(); }, []);

  const loadInvoice = useCallback(() => {
    setLoading(true);
    billingApi.getInvoiceWithLineItems(invoiceId)
      .then(({ invoice, line_items }) => {
        setInvoice(invoice);
        setLineItems(line_items ?? []);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load invoice'))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  const backHref = `/dashboard/org/${slug}/billing`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-lg mx-auto mt-12 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <p className="font-semibold text-destructive">Failed to load invoice</p>
        <p className="text-sm text-muted-foreground mt-1">{error ?? 'Invoice not found.'}</p>
        <Link href={backHref} className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Billing
        </Link>
      </div>
    );
  }

  const isPaid = invoice.status === 'paid';
  const isPayable = invoice.payable && invoice.amount_due_paise > 0;
  const razorpayUrl = invoice.razorpay_payment_link_url;
  const billTo = invoice.bill_to as { name?: string; email?: string; address?: string } | null;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-12">

      {/* Back */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Billing
      </Link>

      {/* Invoice card */}
      <div className="rounded-2xl border bg-card overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-border/60 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <div>
              <h1 className="font-semibold text-lg">{invoice.invoice_number}</h1>
              <p className="text-xs text-muted-foreground">Issued {formatDate(invoice.issue_date)}</p>
            </div>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        {/* Bill to / Bill from row */}
        <div className="px-6 py-4 border-b border-border/40 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Billed to</p>
            {billTo?.name && <p className="text-sm font-medium">{billTo.name}</p>}
            {billTo?.email && <p className="text-xs text-muted-foreground">{billTo.email}</p>}
            {billTo?.address && <p className="text-xs text-muted-foreground mt-0.5">{billTo.address}</p>}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Due date</p>
            <p className="text-sm font-medium">{formatDate(invoice.due_date)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isPaid ? 'Paid in full' : invoice.amount_due_paise > 0 ? 'Payment pending' : ''}
            </p>
          </div>
        </div>

        {/* Line items */}
        {lineItems.length > 0 && (
          <div className="px-6 py-4 border-b border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Description</th>
                  <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 w-16">Qty</th>
                  <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 w-24">Unit price</th>
                  <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 w-24">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-4 text-sm">{item.description}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{item.quantity}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatINR(item.unit_price)}</td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{formatINR(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="px-6 py-4 border-b border-border/40 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatINR(invoice.subtotal_paise)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax (GST 18%)</span>
            <span className="tabular-nums">{formatINR(invoice.tax_paise)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-border/40 mt-1.5">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(invoice.total_paise)}</span>
          </div>
          {invoice.amount_paid_paise > 0 && (
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Paid</span>
              <span className="tabular-nums">{formatINR(invoice.amount_paid_paise)}</span>
            </div>
          )}
          {invoice.amount_due_paise > 0 && (
            <div className="flex justify-between text-sm font-bold text-red-500 pt-1">
              <span>Amount due</span>
              <span className="tabular-nums">{formatINR(invoice.amount_due_paise)}</span>
            </div>
          )}
        </div>

        {/* Action area */}
        <div className="px-6 py-5">
          {isPaid ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Payment received. Your receipt is available on Razorpay.</p>
              {razorpayUrl && (
                <a
                  href={razorpayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" /> Download Receipt (PDF)
                </a>
              )}
            </div>
          ) : isPayable ? (
            <div className="space-y-3">
              <PayNowButton
                amount={invoice.amount_due_paise / 100}
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoice_number}
                orgName={billTo?.name}
                orgEmail={billTo?.email}
                onSuccess={loadInvoice}
              />
              {razorpayUrl && (
                <a
                  href={razorpayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Or pay via Razorpay hosted page
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This invoice is {invoice.status} and requires no action.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Pending',   cls: 'bg-yellow-500/10 text-yellow-600' },
    paid:      { label: 'Paid',      cls: 'bg-emerald-500/10 text-emerald-600' },
    overdue:   { label: 'Overdue',   cls: 'bg-red-500/10 text-red-500' },
    draft:     { label: 'Draft',     cls: 'bg-muted text-muted-foreground' },
    cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground' },
    refunded:  { label: 'Refunded',  cls: 'bg-blue-500/10 text-blue-600' },
    failed:    { label: 'Failed',    cls: 'bg-red-500/10 text-red-500' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}
