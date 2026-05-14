'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { billingApi } from '@/lib/api/billing';
import type { InvoiceEntity } from '@/lib/billing-ui/types';
import { ArrowLeft, Download, ExternalLink, Loader2, FileText } from 'lucide-react';

function formatINR(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const slug = params.slug as string;

  const [invoice, setInvoice] = useState<InvoiceEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    billingApi.getInvoiceWithLineItems(invoiceId)
      .then(({ invoice }) => setInvoice(invoice))
      .catch((err) => setError(err?.message ?? 'Failed to load invoice'))
      .finally(() => setLoading(false));
  }, [invoiceId]);

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
  const razorpayUrl = invoice.razorpay_payment_link_url;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">

      {/* ── Back ─────────────────────────────────────────────────────────── */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Billing
      </Link>

      {/* ── Invoice card ─────────────────────────────────────────────────── */}
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

        {/* Amounts */}
        <div className="px-6 py-5 grid grid-cols-3 gap-4 border-b border-border/40">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total</p>
            <p className="text-2xl font-bold tabular-nums">{formatINR(invoice.total_paise)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Paid</p>
            <p className="text-xl font-semibold tabular-nums text-emerald-600">{formatINR(invoice.amount_paid_paise)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Due</p>
            <p className={`text-xl font-semibold tabular-nums ${invoice.amount_due_paise > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
              {formatINR(invoice.amount_due_paise)}
            </p>
          </div>
        </div>

        {/* Razorpay action area */}
        <div className="px-6 py-5 space-y-3">
          {razorpayUrl ? (
            <>
              <p className="text-sm text-muted-foreground">
                {isPaid
                  ? 'Your receipt and PDF download are available on Razorpay.'
                  : 'View and pay this invoice on the Razorpay hosted page.'}
              </p>
              <a
                href={razorpayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
              >
                {isPaid
                  ? <><Download className="w-4 h-4" /> Download Receipt (PDF)</>
                  : <><ExternalLink className="w-4 h-4" /> View &amp; Pay Invoice</>
                }
              </a>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Razorpay payment link has been generated for this invoice yet.
              {!isPaid && ' A link will be created when you initiate payment.'}
            </p>
          )}
        </div>

        {/* Bill to */}
        {invoice.bill_to && (() => {
          const billTo = invoice.bill_to as { name?: string; email?: string; address?: string };
          return (
            <div className="px-6 py-4 border-t border-border/40 bg-muted/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Billed to</p>
              <p className="text-sm font-medium">{billTo.name}</p>
              {billTo.email && <p className="text-xs text-muted-foreground">{billTo.email}</p>}
              {billTo.address && <p className="text-xs text-muted-foreground mt-0.5">{billTo.address}</p>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:  { label: 'Pending',   cls: 'bg-yellow-500/10 text-yellow-600' },
    paid:     { label: 'Paid',      cls: 'bg-emerald-500/10 text-emerald-600' },
    overdue:  { label: 'Overdue',   cls: 'bg-red-500/10 text-red-500' },
    draft:    { label: 'Draft',     cls: 'bg-muted text-muted-foreground' },
    cancelled:{ label: 'Cancelled', cls: 'bg-muted text-muted-foreground' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}
