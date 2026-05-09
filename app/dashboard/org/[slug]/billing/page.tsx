'use client';

import { useBillingOverview } from '@/lib/hooks/queries/billing';
import { useOrganization } from '@/lib/hooks/queries/organizations';
import { TrialBanner } from './components/trial-banner';
import { UsageCard } from './components/usage-card';
import { InvoiceList } from './components/invoice-list';

export default function BillingPage() {
  const { organization } = useOrganization();
  const { overview, loading, error } = useBillingOverview();

  const org = organization as unknown as { id: string; name: string; slug: string } | undefined;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 rounded-xl bg-muted" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-xl bg-muted" />)}
        </div>
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <p className="font-semibold text-destructive">Failed to load billing</p>
        <p className="text-sm text-muted-foreground mt-1">{error ?? 'Please refresh the page.'}</p>
      </div>
    );
  }

  const { org_billing, current_usage, billing_profile, recent_invoices, total_outstanding } = overview;
  const isTrialing = org_billing.billing_status === 'trialing';
  const isOverdue  = org_billing.billing_status === 'overdue';
  const isLocked   = org_billing.billing_status === 'locked';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        {org && (
          <p className="text-sm text-muted-foreground mt-1">
            Manage usage and invoices for <span className="font-medium text-foreground">{org.name}</span>
          </p>
        )}
      </div>

      {/* Trial / overdue / locked banner */}
      <TrialBanner orgBilling={org_billing} billingProfile={billing_profile} />

      {/* Overdue warning */}
      {isOverdue && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3.5">
          <span className="text-red-400 mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-red-400">Payment overdue</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You have an unpaid invoice. Please pay to avoid service interruption.
            </p>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3.5">
          <span className="text-red-400 mt-0.5">🔒</span>
          <div>
            <p className="text-sm font-semibold text-red-400">Account locked</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your account is locked due to non-payment. Contact{' '}
              <a href="mailto:billing@digicertificates.in" className="underline">billing@digicertificates.in</a>.
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Certificates this month"
          value={String(current_usage.certificate_count)}
          sub={isTrialing
            ? `${org_billing.trial_free_certificates_used} / ${org_billing.trial_free_certificates_limit} free trial certs used`
            : `@ ${formatINR(billing_profile.certificate_unit_price)} each`}
          accent={false}
        />
        <StatCard
          label="Estimated bill"
          value={isTrialing && current_usage.certificate_count <= org_billing.trial_free_certificates_limit
            ? '₹0'
            : formatINR(current_usage.estimated_total)}
          sub={isTrialing ? 'Covered by free trial' : `Incl. ${current_usage.gst_rate}% GST`}
          accent={!isTrialing && current_usage.estimated_total > 0}
        />
        <StatCard
          label="Outstanding balance"
          value={total_outstanding > 0 ? formatINR(total_outstanding) : '₹0'}
          sub={total_outstanding > 0 ? 'Payment due — see invoices below' : 'All invoices paid'}
          accent={total_outstanding > 0}
          accentColor="red"
        />
      </div>

      {/* Current month usage breakdown */}
      <UsageCard usage={current_usage} billingProfile={billing_profile} isTrialing={isTrialing} orgBilling={org_billing} />

      {/* Invoice history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base">Invoice History</h2>
          {recent_invoices.length > 0 && (
            <span className="text-xs text-muted-foreground">{recent_invoices.length} invoice{recent_invoices.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <InvoiceList organizationId={org?.id ?? ''} />
      </div>
    </div>
  );
}

function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

function StatCard({ label, value, sub, accent = false, accentColor = 'primary' }: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  accentColor?: 'primary' | 'red';
}) {
  const valueClass = accent
    ? accentColor === 'red' ? 'text-red-400' : 'text-primary'
    : 'text-foreground';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
