/**
 * PAYMENT COMPLETE PAGE
 *
 * Landing page after Razorpay Payment Link checkout.
 * Razorpay redirects here with query params:
 *   ?razorpay_payment_link_id=plink_XXXX
 *   &razorpay_payment_link_status=paid|failed|cancelled
 *   &razorpay_payment_id=pay_XXXX
 *   &razorpay_payment_link_reference_id=...
 *   &razorpay_signature=...
 *   &invoice_id=...   (our own param added to callback_url)
 *
 * NOTE: Do NOT verify the Razorpay signature here — that would expose the
 * key_secret to the browser. The webhook is the authoritative payment event.
 * This page is purely UX — show the outcome and guide the customer.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { PaymentCompleteContent } from './payment-complete-content';

export default function PaymentCompletePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Suspense fallback={<LoadingSpinner />}>
        <PaymentCompleteContent />
      </Suspense>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="text-center space-y-3">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-muted-foreground text-sm">Confirming payment…</p>
    </div>
  );
}
