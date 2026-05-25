'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { billingApi } from '@/lib/api/billing';
import { useOrganization } from '@/lib/hooks/queries/organizations';
import { getOrganizationLogoUrl } from '@/lib/utils/organization-logo';
import type { InvoiceEntity, InvoiceLineItem } from '@/lib/billing-ui/types';
import { PayNowButton } from '../../components/pay-now-button';
import { preloadRazorpay } from '@/lib/razorpay';
import { ArrowLeft, Loader2, Mail, CheckCircle2, Clock, AlertTriangle, Building2 } from 'lucide-react';

// ── Feature flag ─────────────────────────────────────────────────────────────
const RAZORPAY_ENABLED = process.env.NEXT_PUBLIC_ENABLE_RAZORPAY_BILLING === 'true';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPaise(paise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2,
  }).format(paise / 100);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Status config ─────────────────────────────────────────────────────────────
type StatusConf = { label: string; icon: React.ReactNode; bg: string; text: string; border: string };
const STATUS_CONFIG: Record<string, StatusConf> = {
  paid: {
    label: 'Paid',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/20',
  },
  pending: {
    label: 'Payment due',
    icon: <Clock className="w-3.5 h-3.5" />,
    bg: 'bg-yellow-500/10', text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/20',
  },
  overdue: {
    label: 'Overdue',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    bg: 'bg-red-500/10', text: 'text-red-500',
    border: 'border-red-500/20',
  },
  draft: {
    label: 'Draft',
    icon: <Clock className="w-3.5 h-3.5" />,
    bg: 'bg-muted', text: 'text-muted-foreground',
    border: 'border-border',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <Clock className="w-3.5 h-3.5" />,
    bg: 'bg-muted', text: 'text-muted-foreground',
    border: 'border-border',
  },
  refunded: {
    label: 'Refunded',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    bg: 'bg-blue-500/10', text: 'text-blue-600',
    border: 'border-blue-500/20',
  },
  failed: {
    label: 'Failed',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    bg: 'bg-red-500/10', text: 'text-red-500',
    border: 'border-red-500/20',
  },
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InvoiceDetailPage() {
  const params    = useParams();
  const invoiceId = params.id as string;
  const slug      = params.slug as string;

  const [invoice,   setInvoice]   = useState<InvoiceEntity | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const { organization } = useOrganization();
  const org = organization as unknown as {
    name: string; email?: string; city?: string;
    state_province?: string; logo_url?: string | null; gstin?: string;
  } | undefined;
  const logoUrl = getOrganizationLogoUrl(org);

  useEffect(() => { if (RAZORPAY_ENABLED) preloadRazorpay(); }, []);

  const load = useCallback(() => {
    setLoading(true);
    billingApi.getInvoiceWithLineItems(invoiceId)
      .then(({ invoice, line_items }) => {
        setInvoice(invoice);
        setLineItems(line_items ?? []);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load invoice'))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

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

  const isPaid     = invoice.status === 'paid';
  const isPayable  = invoice.payable && invoice.amount_due_paise > 0;
  const billTo     = invoice.bill_to as { name?: string; email?: string; address?: string; gstin?: string } | null;
  const statusConf = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG['pending']!;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-16">

      {/* Back */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Billing
      </Link>

      {/* Invoice document */}
      <div className="rounded-3xl border bg-card overflow-hidden shadow-sm">

        {/* ── Top bar: logos + invoice number + status ────────────────────── */}
        <div className="px-8 pt-8 pb-6 border-b border-border/60">
          <div className="flex items-start justify-between gap-6">

            {/* Authentix logo (issuer) */}
            <div className="flex flex-col gap-1">
              <Image
                src="/brand/authentix-24-24.svg"
                alt="Authentix"
                width={32}
                height={32}
                className="mb-1"
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Issued by</p>
              <p className="text-sm font-semibold">Authentix</p>
              <p className="text-xs text-muted-foreground">billing@digicertificates.in</p>
              <p className="text-xs text-muted-foreground">Bhilai, Chhattisgarh, India</p>
            </div>

            {/* Customer (org) logo — right side */}
            <div className="flex flex-col items-end gap-1 text-right">
              {logoUrl ? (
                <div className="w-12 h-12 rounded-xl border bg-background shadow-sm overflow-hidden flex items-center justify-center mb-1">
                  <Image src={logoUrl} alt={org?.name ?? ''} width={48} height={48} className="object-contain" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl border bg-muted flex items-center justify-center mb-1">
                  <Building2 className="w-5 h-5 text-muted-foreground/30" />
                </div>
              )}
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Billed to</p>
              <p className="text-sm font-semibold">{billTo?.name ?? org?.name}</p>
              {(billTo?.email ?? org?.email) && (
                <p className="text-xs text-muted-foreground">{billTo?.email ?? org?.email}</p>
              )}
              {(billTo?.address) && (
                <p className="text-xs text-muted-foreground">{billTo.address}</p>
              )}
            </div>
          </div>

          {/* Invoice number + status row */}
          <div className="mt-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Invoice</p>
              <h1 className="text-2xl font-bold tracking-tight">{invoice.invoice_number}</h1>
            </div>
            <div className="text-right space-y-0.5">
              <StatusBadge conf={statusConf} />
              <p className="text-xs text-muted-foreground mt-1.5">Issued {fmtDateShort(invoice.issue_date)}</p>
              <p className="text-xs text-muted-foreground">Due {fmtDateShort(invoice.due_date)}</p>
            </div>
          </div>
        </div>

        {/* ── Line items table ────────────────────────────────────────────── */}
        {lineItems.length > 0 && (
          <div className="px-8 py-6 border-b border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="pb-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Description</th>
                  <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 w-14">Qty</th>
                  <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 w-24">Rate</th>
                  <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 w-24">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={item.id} className={i > 0 ? 'border-t border-border/30' : ''}>
                    <td className="py-3 pr-4 text-sm">{item.description}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{item.quantity}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{fmtPaise(item.unit_price_paise)}</td>
                    <td className="py-3 text-right tabular-nums font-medium">{fmtPaise(item.amount_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Totals ──────────────────────────────────────────────────────── */}
        <div className="px-8 py-6 border-b border-border/60">
          <div className="ml-auto max-w-xs space-y-2">
            <TotalRow label="Subtotal" value={fmtPaise(invoice.subtotal_paise)} />
            <TotalRow label="GST (18%)" value={fmtPaise(invoice.tax_paise)} />
            <div className="border-t border-border/60 pt-3 mt-1">
              <TotalRow label="Total" value={fmtPaise(invoice.total_paise)} bold />
            </div>
            {invoice.amount_paid_paise > 0 && (
              <TotalRow label="Paid" value={fmtPaise(invoice.amount_paid_paise)} green />
            )}
            {invoice.amount_due_paise > 0 && !isPaid && (
              <TotalRow label="Amount due" value={fmtPaise(invoice.amount_due_paise)} red />
            )}
          </div>
        </div>

        {/* ── Payment action ───────────────────────────────────────────────── */}
        <div className="px-8 py-6">
          {isPaid ? (
            <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-500/8 border border-emerald-500/15 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Payment received</p>
                {invoice.marked_paid_at && (
                  <p className="text-xs text-muted-foreground mt-0.5">Confirmed {fmtDate(invoice.marked_paid_at as string)}</p>
                )}
              </div>
            </div>
          ) : isPayable ? (
            RAZORPAY_ENABLED ? (
              <div className="space-y-3">
                <PayNowButton
                  amount={invoice.amount_due_paise / 100}
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoice_number}
                  orgName={billTo?.name ?? org?.name}
                  orgEmail={billTo?.email ?? org?.email}
                  onSuccess={load}
                />
              </div>
            ) : (
              <ManualPaySection amount={invoice.amount_due_paise / 100} invoiceNumber={invoice.invoice_number} />
            )
          ) : (
            <p className="text-sm text-muted-foreground text-center py-1">
              This invoice is <span className="capitalize">{invoice.status}</span> and requires no action.
            </p>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-8 py-4 bg-muted/30 border-t border-border/40 flex items-center justify-between gap-4">
          <p className="text-[11px] text-muted-foreground/60">
            Authentix · digicertificates.in · billing@digicertificates.in
          </p>
          <Image src="/brand/authentix-24-24.svg" alt="Authentix" width={16} height={16} className="opacity-30" />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ conf }: { conf: typeof STATUS_CONFIG[string] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${conf.bg} ${conf.text} ${conf.border}`}>
      {conf.icon}
      {conf.label}
    </span>
  );
}

function TotalRow({ label, value, bold, green, red }: {
  label: string; value: string; bold?: boolean; green?: boolean; red?: boolean;
}) {
  const textCls = green ? 'text-emerald-600' : red ? 'text-red-500' : bold ? 'text-foreground' : 'text-muted-foreground';
  return (
    <div className="flex items-center justify-between gap-8">
      <span className={`text-sm ${textCls}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold text-lg' : 'font-medium'} ${textCls}`}>{value}</span>
    </div>
  );
}

function ManualPaySection({ amount, invoiceNumber }: { amount: number; invoiceNumber: string }) {
  const fmt = (n: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-muted/50 border border-border/60 px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Pay via bank transfer or UPI</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'UPI ID', value: 'billing@digicertificates' },
            { label: 'Account', value: 'XXXX XXXX XXXX' },
            { label: 'IFSC', value: 'XXXX0000000' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-card border border-border/60 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-0.5">{label}</p>
              <p className="text-xs font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2.5 rounded-xl bg-background border border-border/50 px-3 py-2.5">
          <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            After paying {fmt(amount)}, email your screenshot or receipt to{' '}
            <a href={`mailto:billing@digicertificates.in?subject=Payment for ${invoiceNumber}`}
              className="font-medium text-foreground hover:text-brand-500 transition-colors">
              billing@digicertificates.in
            </a>
            {' '}with subject <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{invoiceNumber}</span>.
            We confirm within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
