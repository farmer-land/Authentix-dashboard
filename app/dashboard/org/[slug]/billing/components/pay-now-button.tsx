'use client';

import { useState, useCallback } from 'react';
import { billingApi } from '@/lib/api/billing';
import { waitForRazorpay, RAZORPAY_BRAND } from '@/lib/razorpay';
import { Loader2 } from 'lucide-react';

type RazorpayConstructor = new (options: Record<string, unknown>) => {
  open(): void;
  on(event: string, handler: () => void): void;
};
type RazorpayWindow = Window & { Razorpay?: RazorpayConstructor };

function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export function PayNowButton({
  amount,
  certCount,
  emailCount,
  orgName,
  orgEmail,
  invoiceId,
  invoiceNumber,
  onSuccess,
}: {
  amount: number;
  certCount?: number;
  emailCount?: number;
  orgName?: string;
  orgEmail?: string;
  /** If provided, creates an order for this specific invoice. Otherwise calls pay-now (current period). */
  invoiceId?: string;
  invoiceNumber?: string;
  onSuccess?: () => void;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handlePay = useCallback(async () => {
    setState('loading');
    setErrorMsg('');
    try {
      await waitForRazorpay();

      const order = invoiceId
        ? await billingApi.createOrder(invoiceId)
        : await billingApi.payNow();

      const RzpClass = (window as RazorpayWindow).Razorpay;
      if (!RzpClass) throw new Error('Razorpay not available');

      // Build a detailed description customers can read in the checkout modal
      const descParts: string[] = [];
      if (invoiceNumber) descParts.push(`Invoice ${invoiceNumber}`);
      descParts.push('Flex Plan');
      if (certCount !== undefined && certCount > 0) descParts.push(`${certCount} certificate${certCount !== 1 ? 's' : ''}`);
      if (emailCount !== undefined && emailCount > 0) descParts.push(`${emailCount} email${emailCount !== 1 ? 's' : ''}`);
      descParts.push('18% GST included');

      const notes: Record<string, string> = {
        Plan: 'Flex',
      };
      if (invoiceNumber) notes['Invoice'] = invoiceNumber;
      if (certCount !== undefined && certCount > 0) notes['Certificates'] = String(certCount);
      if (emailCount !== undefined && emailCount > 0) notes['Emails sent'] = String(emailCount);
      notes['Amount'] = formatINR(amount);
      notes['Tax'] = '18% GST included';

      const rzp = new RzpClass({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: RAZORPAY_BRAND.name,
        image: RAZORPAY_BRAND.image,
        description: descParts.join(' · '),
        order_id: order.razorpay_order_id,
        theme: RAZORPAY_BRAND.theme,
        prefill: {
          name: orgName ?? '',
          email: orgEmail ?? '',
        },
        notes,
        config: {
          display: {
            hide: [{ method: 'paylater' }],
            preferences: { show_default_blocks: true },
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const effectiveInvoiceId = (invoiceId ?? (order as { invoice_id?: string }).invoice_id) ?? '';
            await billingApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              invoice_id: effectiveInvoiceId,
            });
            setState('idle');
            onSuccess?.();
          } catch {
            setErrorMsg('Payment captured but verification failed — contact billing@digicertificates.in');
            setState('error');
          }
        },
        modal: { ondismiss: () => setState('idle') },
      });
      rzp.on('payment.failed', () => {
        setErrorMsg('Payment failed. Please try a different method.');
        setState('error');
      });
      rzp.open();
    } catch (err: unknown) {
      setErrorMsg((err as { message?: string })?.message ?? 'Failed to open payment — please refresh and try again.');
      setState('error');
    }
  }, [invoiceId, invoiceNumber, certCount, emailCount, amount, orgName, orgEmail, onSuccess]);

  // Compact inline button for invoice table rows
  if (invoiceNumber) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={handlePay}
          disabled={state === 'loading'}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {state === 'loading'
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : `Pay ${formatINR(amount)}`
          }
        </button>
        {state === 'error' && errorMsg && (
          <p className="text-[10px] text-destructive max-w-35 text-right">{errorMsg}</p>
        )}
      </div>
    );
  }

  // Full-width button for usage breakdown
  return (
    <div className="space-y-2">
      <button
        onClick={handlePay}
        disabled={state === 'loading'}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === 'loading'
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing checkout…</>
          : `Pay ${formatINR(amount)} now`
        }
      </button>
      {state === 'error' && errorMsg && (
        <p className="text-xs text-destructive text-center">{errorMsg}</p>
      )}
      <p className="text-[10px] text-muted-foreground text-center">
        Resets billing period to today · Secured by Razorpay · 18% GST included
      </p>
    </div>
  );
}
