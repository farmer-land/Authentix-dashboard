'use client';

import { useEffect } from 'react';
import { useBillingOverview } from '@/lib/hooks/queries/billing';
import { useOrganization } from '@/lib/hooks/queries/organizations';
import { InvoiceList } from './components/invoice-list';
import { preloadRazorpay } from '@/lib/razorpay';
import { PayNowButton } from './components/pay-now-button';
import { AlertTriangle, Lock, TrendingUp, Receipt, Sparkles, Zap } from 'lucide-react';

// Plan name — single pay-as-you-go plan
const PLAN_NAME = 'Authentix Flex';

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

  const org = organization as unknown as {
    id: string; name: string; slug: string; email?: string; phone?: string;
  } | undefined;

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-pulse">
        <div className="h-10 w-48 rounded-lg bg-muted" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-muted" />)}
        </div>
        <div className="h-80 rounded-2xl bg-muted" />
        <div className="h-64 rounded-2xl bg-muted" />
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
    <div className="space-y-6 max-w-5xl mx-auto pb-12">

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
          icon={<Sparkles className="w-4 h-4" />}
          label="Plan"
          value={isTrialing ? 'Free Trial' : PLAN_NAME}
          sub={isTrialing ? 'Pay-as-you-go after trial' : 'Pay only for what you use'}
          color="default"
        />
      </div>

      {/* ── Usage breakdown ─────────────────────────────────────────────────── */}
      <UsageBreakdown
        usage={current_usage}
        billingProfile={billing_profile}
        isTrialing={isTrialing}
        orgBilling={org_billing}
        billFree={billFree}
        orgName={org?.name}
        orgEmail={org?.email}
        onPaySuccess={refresh}
      />

      {/* ── Invoice history ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Invoice History</h2>
          <span className="text-xs text-muted-foreground">
            {recent_invoices.length} invoice{recent_invoices.length !== 1 ? 's' : ''}
          </span>
        </div>
        <InvoiceList organizationId={org?.id ?? ''} orgName={org?.name} orgEmail={org?.email} />
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

function UsageBreakdown({ usage, billingProfile, isTrialing, orgBilling, billFree, orgName, orgEmail, onPaySuccess }: {
  usage: any; billingProfile: any; isTrialing: boolean; orgBilling: any; billFree: boolean;
  orgName?: string; orgEmail?: string; onPaySuccess?: () => void;
}) {
  const certsAboveTrial = isTrialing
    ? Math.max(0, usage.certificate_count - orgBilling.trial_free_certificates_limit)
    : usage.certificate_count;

  const canPayNow = !billFree && usage.estimated_total > 0;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Current Billing Period</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{PLAN_NAME} · Pay only for what you use</p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">Auto-invoiced monthly</span>
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
        <BillingLine
          label="Platform fee"
          value={isTrialing ? '₹0' : formatINR(usage.platform_fee)}
          sub={isTrialing ? `Waived during trial (₹${billingProfile.platform_fee_amount.toLocaleString('en-IN')}/mo normally)` : 'Monthly base fee'}
          muted={isTrialing}
        />
        <BillingLine
          label="Certificates issued"
          value={String(usage.certificate_count)}
          sub={isTrialing
            ? `${Math.min(usage.certificate_count, orgBilling.trial_free_certificates_limit)} free · ${certsAboveTrial} billable @ ₹${billingProfile.certificate_unit_price} each`
            : `${formatINR(billingProfile.certificate_unit_price)} per certificate`}
        />
        <BillingLine
          label="Certificate charges"
          value={isTrialing && certsAboveTrial === 0 ? '₹0' : formatINR(usage.usage_cost)}
          sub={isTrialing && certsAboveTrial === 0 ? 'Covered by trial allowance' : undefined}
          muted={isTrialing && certsAboveTrial === 0}
        />
        {usage.email_count > 0 && (
          <BillingLine label="Email delivery" value={formatINR(usage.email_cost)} sub={`${usage.email_count} emails sent`} />
        )}

        <div className="pt-3 space-y-1.5">
          <BillingLine label="Subtotal (excl. GST)" value={billFree ? '₹0' : formatINR(usage.subtotal)} muted />
          <BillingLine label={`GST @ ${usage.gst_rate}%`} value={billFree ? '₹0' : formatINR(usage.gst_amount)} muted />
        </div>

        <div className="flex items-center justify-between pt-4 mt-1">
          <div>
            <span className="font-semibold">Estimated total</span>
            <p className="text-xs text-muted-foreground mt-0.5">For current period · subject to change</p>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${billFree ? 'text-brand-500' : 'text-foreground'}`}>
            {billFree ? '₹0' : formatINR(usage.estimated_total)}
            {billFree && <span className="text-xs font-normal text-muted-foreground ml-1.5 block text-right">trial covers this</span>}
          </span>
        </div>

        {canPayNow && (
          <div className="pt-4">
            <PayNowButton
              amount={usage.estimated_total}
              certCount={usage.certificate_count}
              orgName={orgName}
              orgEmail={orgEmail}
              onSuccess={onPaySuccess}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BillingLine({ label, value, sub, muted }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between py-2.5 gap-4">
      <div>
        <span className={`text-sm ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</span>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-medium tabular-nums shrink-0 ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
