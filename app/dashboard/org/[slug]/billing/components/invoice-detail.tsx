'use client';

import type { ReactNode } from 'react';
import { useInvoice } from '@/lib/hooks/queries/billing';
import { useQueryClient } from '@tanstack/react-query';
import { billingKeys } from '@/lib/hooks/queries/billing';
import { paiseToRupees } from '@/lib/billing-ui/types';
import type { InvoiceEntity, InvoiceStatus } from '@/lib/billing-ui/types';
import { api } from '@/lib/api/client';

interface InvoiceDetailProps {
  invoiceId: string;
}

function formatINR(rupees: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(rupees);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

const STATUS_META: Record<InvoiceStatus, { label: string; classes: string; icon?: ReactNode }> = {
  draft:     { label: 'Draft',     classes: 'bg-gray-100 text-gray-700' },
  pending:   { label: 'Pending',   classes: 'bg-yellow-100 text-yellow-800' },
  paid:      { label: 'Paid',      classes: 'bg-green-100 text-green-800' },
  overdue:   { label: 'Overdue',   classes: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', classes: 'bg-gray-100 text-gray-500' },
  refunded:  { label: 'Refunded',  classes: 'bg-blue-100 text-blue-800' },
  failed:    { label: 'Failed',    classes: 'bg-red-100 text-red-700' },
};

export function InvoiceDetail({ invoiceId }: InvoiceDetailProps) {
  const { data: invoice, isLoading, error } = useInvoice(invoiceId);

  if (isLoading) {
    return (
      <div className="rounded-lg border p-8 animate-pulse space-y-4">
        <div className="h-7 bg-muted rounded w-1/3" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-4 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Invoice not found.'}
        </p>
      </div>
    );
  }

  const inv = invoice as InvoiceEntity;
  const meta = STATUS_META[inv.status] ?? STATUS_META.pending;
  const subtotal = paiseToRupees(inv.subtotal_paise);
  const tax     = paiseToRupees(inv.tax_paise);
  const total   = paiseToRupees(inv.total_paise);
  const amountDue = paiseToRupees(inv.amount_due_paise);
  const billTo = inv.bill_to as Record<string, unknown> | null;

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      {/* Header */}
      <div className="bg-muted/40 px-8 py-6 border-b flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{inv.invoice_number}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Issued {formatDate(inv.issue_date)} · Due {formatDate(inv.due_date)}
          </p>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${meta.classes}`}>
          {meta.label}
        </span>
      </div>

      <div className="p-8 space-y-8">
        {/* Bill To */}
        {billTo && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Bill To</p>
            <p className="font-semibold">{String(billTo.name ?? '')}</p>
            {!!billTo.email && <p className="text-sm text-muted-foreground">{String(billTo.email)}</p>}
            {!!billTo.address && <p className="text-sm text-muted-foreground">{String(billTo.address)}</p>}
            {!!billTo.cin && <p className="text-sm text-muted-foreground">CIN: {String(billTo.cin)}</p>}
          </div>
        )}

        {/* Totals */}
        <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatINR(subtotal, inv.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GST</span>
            <span className="font-medium">{formatINR(tax, inv.currency)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <span>Total</span>
            <span className="text-primary">{formatINR(total, inv.currency)}</span>
          </div>
          {inv.status === 'paid' && (
            <div className="flex justify-between text-green-700">
              <span>Amount Paid</span>
              <span className="font-medium">{formatINR(paiseToRupees(inv.amount_paid_paise), inv.currency)}</span>
            </div>
          )}
        </div>

        {/* Pay Now — Payment Link flow (from invoice email or dashboard) */}
        {inv.payable && inv.payment_cta_url && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-yellow-900">Payment Required</p>
              <p className="text-sm text-yellow-700 mt-0.5">{inv.payable_reason ?? 'This invoice is awaiting payment.'}</p>
            </div>
            <a
              href={inv.payment_cta_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-yellow-600 text-white text-sm font-semibold hover:bg-yellow-700 transition-colors"
            >
              Pay {formatINR(amountDue, inv.currency)}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {/* Payable but no payment link yet (order flow) */}
        {inv.payable && !inv.payment_cta_url && (
          <OrderPayButton invoice={inv} />
        )}

        <p className="text-center text-xs text-muted-foreground">
          Powered by{' '}
          <a href="https://razorpay.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            Razorpay
          </a>
          {' '}· Secured with 256-bit encryption
        </p>
      </div>
    </div>
  );
}

function OrderPayButton({ invoice }: { invoice: InvoiceEntity }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 flex items-center justify-between gap-4">
      <div>
        <p className="font-semibold text-blue-900">Pay via Dashboard</p>
        <p className="text-sm text-blue-700 mt-0.5">Complete payment securely via card or UPI.</p>
      </div>
      <RazorpayOrderButton invoice={invoice} />
    </div>
  );
}

function RazorpayOrderButton({ invoice }: { invoice: InvoiceEntity }) {
  const queryClient = useQueryClient();

  async function handlePay() {
    try {
      const order = await api.billing.createOrder(invoice.id);

      const Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        alert('Razorpay SDK not loaded. Please refresh and try again.');
        return;
      }

      const rzp = new Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: 'DigiCertificates',
        description: `Invoice ${order.invoice_number}`,
        order_id: order.razorpay_order_id,
        theme: { color: '#0f172a' },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          await api.billing.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            invoice_id: invoice.id,
          });
          // Invalidate both the specific invoice and the overview (outstanding total)
          queryClient.invalidateQueries({ queryKey: billingKeys.invoice(invoice.id) });
          queryClient.invalidateQueries({ queryKey: billingKeys.overview() });
        },
      });
      rzp.open();
    } catch {
      alert('Failed to initiate payment. Please try again.');
    }
  }

  return (
    <button
      onClick={handlePay}
      className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
    >
      Pay Now
    </button>
  );
}
