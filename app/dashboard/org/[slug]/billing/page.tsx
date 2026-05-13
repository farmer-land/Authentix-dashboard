'use client';

import { useState, useCallback, useEffect } from 'react';
import { useBillingOverview } from '@/lib/hooks/queries/billing';
import { useOrganization } from '@/lib/hooks/queries/organizations';
import { InvoiceList } from './components/invoice-list';
import { PaymentMethodsCard } from './components/payment-methods-card';
import { billingApi } from '@/lib/api/billing';
import { AlertTriangle, Lock, TrendingUp, Receipt, CreditCard, Zap, Loader2 } from 'lucide-react';

function preloadRazorpay() {
  if (typeof window === 'undefined' || (window as any).Razorpay) return;
  if (document.getElementById('rzp-checkout-js')) return;
  const s = document.createElement('script');
  s.id = 'rzp-checkout-js';
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  document.head.appendChild(s);
}

function waitForRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) { resolve(); return; }
    const el = document.getElementById('rzp-checkout-js');
    if (!el) { reject(new Error('Razorpay script not injected')); return; }
    const tid = setTimeout(() => reject(new Error('Razorpay load timed out')), 10_000);
    el.addEventListener('load', () => { clearTimeout(tid); resolve(); });
    el.addEventListener('error', () => { clearTimeout(tid); reject(new Error('Razorpay script failed to load')); });
  });
}

function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BillingPage() {
  const { organization } = useOrganization();
  const { overview, loading, error, refresh } = useBillingOverview();

  useEffect(() => { preloadRazorpay(); }, []);
  const org = organization as unknown as { id: string; name: string; slug: string } | undefined;

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="h-10 w-48 rounded-lg bg-muted" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-muted" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 rounded-2xl bg-muted" />
          <div className="h-80 rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 max-w-lg">
        <p className="font-semibold text-destructive">Failed to load billing</p>
        <p className="text-sm text-muted-foreground mt-1">{error ?? 'Please refresh the page.'}</p>
      </div>
    );
  }

  const { org_billing, current_usage, billing_profile, recent_invoices, total_outstanding } = overview;
  const isTrialing = org_billing.billing_status === 'trialing';
  const isOverdue  = org_billing.billing_status === 'overdue';
  const isLocked   = org_billing.billing_status === 'locked';

  const trialCertsLeft = Math.max(0, org_billing.trial_free_certificates_limit - org_billing.trial_free_certificates_used);
  const trialPct = org_billing.trial_free_certificates_limit > 0
    ? Math.min(100, Math.round((org_billing.trial_free_certificates_used / org_billing.trial_free_certificates_limit) * 100))
    : 0;

  const billFree = isTrialing && current_usage.certificate_count <= org_billing.trial_free_certificates_limit;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          {org && <p className="text-sm text-muted-foreground mt-0.5">{org.name}</p>}
        </div>
        <StatusBadge status={org_billing.billing_status} />
      </div>

      {/* ── Alert banners ───────────────────────────────────────────────────── */}
      {isTrialing && (
        <TrialBanner
          used={org_billing.trial_free_certificates_used}
          limit={org_billing.trial_free_certificates_limit}
          trialEndsAt={org_billing.trial_ends_at}
          remaining={trialCertsLeft}
          pct={trialPct}
          pricePerCert={billing_profile.certificate_unit_price}
          platformFee={billing_profile.platform_fee_amount}
        />
      )}
      {isOverdue && (
        <Alert icon={<AlertTriangle className="w-4 h-4" />} color="red" title="Payment overdue">
          You have an unpaid invoice. Pay now to avoid service interruption.
        </Alert>
      )}
      {isLocked && (
        <Alert icon={<Lock className="w-4 h-4" />} color="red" title="Account locked">
          Your account is locked due to non-payment. Contact{' '}
          <a href="mailto:billing@digicertificates.in" className="underline">billing@digicertificates.in</a>.
        </Alert>
      )}

      {/* ── Metric cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Zap className="w-4 h-4" />}
          label="Certificates"
          value={String(current_usage.certificate_count)}
          sub={isTrialing ? `${trialCertsLeft} free remaining` : `× ${formatINR(billing_profile.certificate_unit_price)} each`}
          color="default"
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Estimated bill"
          value={billFree ? '₹0' : formatINR(current_usage.estimated_total)}
          sub={billFree ? 'Covered by trial' : `Incl. ${current_usage.gst_rate}% GST`}
          color={!billFree && current_usage.estimated_total > 0 ? 'brand' : 'default'}
        />
        <MetricCard
          icon={<Receipt className="w-4 h-4" />}
          label="Outstanding"
          value={total_outstanding > 0 ? formatINR(total_outstanding) : '₹0'}
          sub={total_outstanding > 0 ? 'Payment due' : 'All clear'}
          color={total_outstanding > 0 ? 'red' : 'default'}
        />
        <MetricCard
          icon={<CreditCard className="w-4 h-4" />}
          label="Plan"
          value={isTrialing ? 'Free Trial' : 'Active'}
          sub={`₹${billing_profile.platform_fee_amount.toLocaleString('en-IN')}/mo + usage`}
          color="default"
        />
      </div>

      {/* ── Body: breakdown + invoices | payment methods ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — usage + invoices */}
        <div className="lg:col-span-2 space-y-6">
          {/* Usage breakdown */}
          <UsageBreakdown
            usage={current_usage}
            billingProfile={billing_profile}
            isTrialing={isTrialing}
            orgBilling={org_billing}
            billFree={billFree}
            onPaySuccess={refresh}
          />

          {/* Invoice history */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Invoice History</h2>
              <span className="text-xs text-muted-foreground">{recent_invoices.length} invoice{recent_invoices.length !== 1 ? 's' : ''}</span>
            </div>
            <InvoiceList organizationId={org?.id ?? ''} />
          </div>
        </div>

        {/* Right — payment methods */}
        <div className="lg:col-span-1">
          {org && <PaymentMethodsCard organizationId={org.id} />}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map = {
    trialing: { label: 'Free Trial',  dot: 'bg-brand-500',   bg: 'bg-brand-500/10',   text: 'text-brand-500' },
    active:   { label: 'Active',      dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
    overdue:  { label: 'Overdue',     dot: 'bg-red-500',     bg: 'bg-red-500/10',     text: 'text-red-500' },
    locked:   { label: 'Locked',      dot: 'bg-red-600',     bg: 'bg-red-600/10',     text: 'text-red-600' },
  } as const;
  const s = map[status as keyof typeof map] ?? map.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Alert({ icon, color, title, children }: { icon: React.ReactNode; color: 'red' | 'yellow'; title: string; children: React.ReactNode }) {
  const colors = { red: 'border-red-500/30 bg-red-500/8 text-red-400', yellow: 'border-yellow-500/30 bg-yellow-500/8 text-yellow-400' };
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${colors[color]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="text-sm">
        <span className="font-semibold">{title} — </span>
        <span className="text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  color: 'default' | 'brand' | 'red';
}) {
  const valueColor = { default: 'text-foreground', brand: 'text-brand-500', red: 'text-red-400' };
  const iconColor  = { default: 'text-muted-foreground', brand: 'text-brand-500', red: 'text-red-400' };
  const ring       = { default: '', brand: 'ring-1 ring-brand-500/20', red: 'ring-1 ring-red-500/20' };
  return (
    <div className={`rounded-2xl border bg-card p-4 space-y-2 ${ring[color]}`}>
      <div className={`flex items-center gap-2 ${iconColor[color]}`}>
        {icon}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueColor[color]}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TrialBanner({ used, limit, trialEndsAt, remaining, pct, pricePerCert, platformFee }: {
  used: number; limit: number; trialEndsAt: string | null; remaining: number;
  pct: number; pricePerCert: number; platformFee: number;
}) {
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 65 ? 'bg-yellow-500' : 'bg-brand-500';
  return (
    <div className="rounded-2xl border border-brand-500/25 bg-brand-500/5 px-5 py-4">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs font-semibold text-brand-600">Free Trial</span>
            {trialEndsAt && <span className="text-xs text-muted-foreground">Expires {formatDate(trialEndsAt)}</span>}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{remaining} free certificate{remaining !== 1 ? 's' : ''} remaining</span>{' '}
            of your {limit}-certificate allowance
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          <p className="text-sm font-bold text-foreground">₹{platformFee.toLocaleString('en-IN')}<span className="font-normal text-muted-foreground">/mo</span></p>
          <p>+ ₹{pricePerCert}/cert after trial</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{used} used</span><span>{limit} total</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function UsageBreakdown({ usage, billingProfile, isTrialing, orgBilling, billFree, onPaySuccess }: {
  usage: any; billingProfile: any; isTrialing: boolean; orgBilling: any; billFree: boolean;
  onPaySuccess?: () => void;
}) {
  const certsAboveTrial = isTrialing
    ? Math.max(0, usage.certificate_count - orgBilling.trial_free_certificates_limit)
    : usage.certificate_count;

  const canPayNow = !billFree && usage.estimated_total > 0;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
        <h2 className="font-semibold">Current Month Breakdown</h2>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">Invoiced on the 1st</span>
      </div>

      {isTrialing && (
        <div className="mx-5 mt-4 rounded-xl bg-brand-500/8 border border-brand-500/15 px-4 py-2.5">
          <p className="text-sm font-medium text-brand-600">
            Trial active — {Math.max(0, orgBilling.trial_free_certificates_limit - orgBilling.trial_free_certificates_used)} free cert{Math.max(0, orgBilling.trial_free_certificates_limit - orgBilling.trial_free_certificates_used) !== 1 ? 's' : ''} remaining
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Certificates within your {orgBilling.trial_free_certificates_limit}-cert limit are free. Charges apply beyond that.</p>
        </div>
      )}

      <div className="px-5 py-4 space-y-0 divide-y divide-border/40">
        <BillingLine label="Platform fee" value={isTrialing ? '₹0' : formatINR(usage.platform_fee)}
          sub={isTrialing ? `Waived — ₹${billingProfile.platform_fee_amount.toLocaleString('en-IN')}/mo normally` : undefined} muted={isTrialing} />
        <BillingLine label="Certificates issued" value={String(usage.certificate_count)}
          sub={isTrialing ? `${Math.min(usage.certificate_count, orgBilling.trial_free_certificates_limit)} free · ${certsAboveTrial} billable` : `× ${formatINR(billingProfile.certificate_unit_price)} each`} />
        <BillingLine label="Certificate charges"
          value={isTrialing && certsAboveTrial === 0 ? '₹0' : formatINR(usage.usage_cost)}
          sub={isTrialing && certsAboveTrial === 0 ? 'Covered by trial' : undefined} muted={isTrialing && certsAboveTrial === 0} />
        {usage.email_count > 0 && <BillingLine label="Emails sent" value={formatINR(usage.email_cost)} sub={`${usage.email_count} emails`} />}
        {usage.broadcast_platform_fee > 0 && <BillingLine label="Platform broadcast fee" value={formatINR(usage.broadcast_platform_fee)} />}

        <div className="pt-3 space-y-1.5">
          <BillingLine label="Subtotal" value={billFree ? '₹0' : formatINR(usage.subtotal)} muted />
          <BillingLine label={`GST (${usage.gst_rate}%)`} value={billFree ? '₹0' : formatINR(usage.gst_amount)} muted />
        </div>

        <div className="flex items-center justify-between pt-4 mt-1">
          <span className="font-semibold">Estimated total</span>
          <span className={`text-lg font-bold tabular-nums ${billFree ? 'text-brand-500' : 'text-foreground'}`}>
            {billFree ? '₹0' : formatINR(usage.estimated_total)}
            {billFree && <span className="text-xs font-normal text-muted-foreground ml-1.5">trial covers this</span>}
          </span>
        </div>

        {canPayNow && (
          <div className="pt-4">
            <PayNowButton amount={usage.estimated_total} onSuccess={onPaySuccess} />
          </div>
        )}
      </div>
    </div>
  );
}

function PayNowButton({ amount, onSuccess }: { amount: number; onSuccess?: () => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handlePayNow = useCallback(async () => {
    setState('loading');
    setErrorMsg('');
    try {
      await waitForRazorpay();
      const order = await billingApi.payNow();
      const RzpClass = (window as any).Razorpay;
      if (!RzpClass) throw new Error('Razorpay not available');

      const rzp = new RzpClass({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: 'Authentix',
        description: `Invoice ${order.invoice_number}`,
        order_id: order.razorpay_order_id,
        theme: { color: '#3ECF8E' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await billingApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              invoice_id: order.invoice_id,
            });
            setState('idle');
            onSuccess?.();
          } catch {
            setErrorMsg('Payment received but verification failed — contact support.');
            setState('error');
          }
        },
        modal: { ondismiss: () => setState('idle') },
      });
      rzp.on('payment.failed', () => {
        setErrorMsg('Payment failed. Please try again.');
        setState('error');
      });
      rzp.open();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to open payment — please try again.');
      setState('error');
    }
  }, [onSuccess]);

  return (
    <div className="space-y-2">
      <button
        onClick={handlePayNow}
        disabled={state === 'loading'}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === 'loading'
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing payment…</>
          : <>Pay {formatINR(amount)} now — reset billing period</>
        }
      </button>
      {state === 'error' && errorMsg && (
        <p className="text-xs text-destructive text-center">{errorMsg}</p>
      )}
      <p className="text-[10px] text-muted-foreground text-center">
        Clears current usage · Next cycle starts from today · Secured by Razorpay
      </p>
    </div>
  );
}

function BillingLine({ label, value, sub, muted }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <div>
        <span className={`text-sm ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</span>
        {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
      </div>
      <span className={`text-sm font-medium tabular-nums ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
