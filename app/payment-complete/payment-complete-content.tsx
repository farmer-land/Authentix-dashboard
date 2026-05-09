'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type PaymentStatus = 'paid' | 'failed' | 'cancelled' | 'unknown';

const STATUS_CONFIG = {
  paid: {
    icon: (
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    ),
    heading: 'Payment Successful',
    body: 'Your payment has been received. Your invoice will be marked as paid within a few minutes. A receipt has been sent to your billing email.',
    ctaText: 'Back to Billing',
    ctaClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  failed: {
    icon: (
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    ),
    heading: 'Payment Failed',
    body: 'Your payment could not be processed. No amount has been charged. Please try again or use a different payment method.',
    ctaText: 'Try Again',
    ctaClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
  cancelled: {
    icon: (
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    ),
    heading: 'Payment Cancelled',
    body: 'You cancelled the payment. No amount has been charged. You can pay at any time from your billing dashboard.',
    ctaText: 'Back to Billing',
    ctaClass: 'bg-gray-700 hover:bg-gray-800 text-white',
  },
  unknown: {
    icon: (
      <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
        </svg>
      </div>
    ),
    heading: 'Checking Payment Status',
    body: 'We are confirming your payment. This can take a moment. Please check your billing dashboard — if payment was successful, your invoice will be updated automatically.',
    ctaText: 'View Billing',
    ctaClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  },
};

export function PaymentCompleteContent() {
  const params = useSearchParams();

  const status = (params.get('razorpay_payment_link_status') ?? 'unknown') as PaymentStatus;
  const plinkId = params.get('razorpay_payment_link_id');
  const paymentId = params.get('razorpay_payment_id');

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;

  // Build back-to-billing link — we don't know the slug from this page,
  // so we link to the generic dashboard and let the app redirect.
  const billingPath = '/dashboard';

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-border p-8 space-y-6 text-center">
      {/* Branding */}
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        DigiCertificates · Billing
      </div>

      {/* Status icon */}
      {config.icon}

      {/* Heading + body */}
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-foreground">{config.heading}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{config.body}</p>
      </div>

      {/* Reference IDs */}
      {(plinkId || paymentId) && (
        <div className="bg-muted/50 rounded-lg px-4 py-3 text-xs text-left space-y-1 font-mono">
          {plinkId && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Link ID</span>
              <span className="text-foreground truncate">{plinkId}</span>
            </div>
          )}
          {paymentId && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Payment ID</span>
              <span className="text-foreground truncate">{paymentId}</span>
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <Link
        href={billingPath}
        className={`block w-full py-3 rounded-lg text-sm font-semibold transition-colors ${config.ctaClass}`}
      >
        {config.ctaText}
      </Link>

      {/* Support */}
      <p className="text-xs text-muted-foreground">
        Questions?{' '}
        <a href="mailto:billing@digicertificates.in" className="underline hover:text-foreground">
          billing@digicertificates.in
        </a>
      </p>

      <div className="text-xs text-muted-foreground/60">
        Secured by{' '}
        <a href="https://razorpay.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
          Razorpay
        </a>
        {' '}· 256-bit TLS
      </div>
    </div>
  );
}
