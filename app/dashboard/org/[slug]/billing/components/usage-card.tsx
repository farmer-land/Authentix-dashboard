'use client';

import type { CurrentUsage, BillingProfile, OrgBilling } from '@/lib/billing-ui/types';

interface UsageCardProps {
  usage: CurrentUsage;
  billingProfile: BillingProfile;
  isTrialing: boolean;
  orgBilling: OrgBilling;
}

function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

interface LineProps {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
  accent?: boolean;
}

function Line({ label, value, sub, muted, accent }: LineProps) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border/60 last:border-0">
      <div>
        <span className={`text-sm ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</span>
        {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
      </div>
      <span className={`text-sm font-medium tabular-nums ${accent ? 'text-primary' : muted ? 'text-muted-foreground' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

export function UsageCard({ usage, billingProfile, isTrialing, orgBilling }: UsageCardProps) {
  const trialCertsLeft = Math.max(0, orgBilling.trial_free_certificates_limit - orgBilling.trial_free_certificates_used);
  const certsAboveTrial = isTrialing
    ? Math.max(0, usage.certificate_count - orgBilling.trial_free_certificates_limit)
    : usage.certificate_count;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-1">
      <h2 className="font-semibold text-base mb-3">Current Month Breakdown</h2>

      {isTrialing && (
        <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-4 py-2.5 mb-3">
          <p className="text-sm text-emerald-700 font-medium">
            Trial active — {trialCertsLeft} free cert{trialCertsLeft !== 1 ? 's' : ''} remaining
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Certificates within your {orgBilling.trial_free_certificates_limit}-cert limit are free. Charges apply beyond that.
          </p>
        </div>
      )}

      <div>
        <Line
          label="Platform fee"
          value={isTrialing ? '₹0' : formatINR(usage.platform_fee)}
          sub={isTrialing ? `Waived during trial (₹${billingProfile.platform_fee_amount.toLocaleString('en-IN')}/mo)` : '/month'}
          muted={isTrialing}
        />
        <Line
          label="Certificates issued"
          value={String(usage.certificate_count)}
          sub={isTrialing
            ? `${Math.min(usage.certificate_count, orgBilling.trial_free_certificates_limit)} free · ${certsAboveTrial} billable`
            : `× ${formatINR(billingProfile.certificate_unit_price)} each`}
          muted={false}
        />
        <Line
          label="Certificate charges"
          value={isTrialing && certsAboveTrial === 0 ? '₹0' : formatINR(usage.usage_cost)}
          sub={isTrialing && certsAboveTrial === 0 ? 'Covered by trial' : undefined}
          muted={isTrialing && certsAboveTrial === 0}
        />

        {usage.email_count > 0 && (
          <Line
            label="Emails sent"
            value={formatINR(usage.email_cost)}
            sub={`${usage.email_count} emails`}
          />
        )}
        {usage.broadcast_own_smtp_count > 0 && (
          <Line
            label="Broadcasts (own SMTP)"
            value={formatINR(usage.broadcast_own_smtp_cost)}
            sub={`${usage.broadcast_own_smtp_count} sent`}
          />
        )}

        <div className="pt-1">
          <Line
            label="Subtotal"
            value={isTrialing && usage.certificate_count <= orgBilling.trial_free_certificates_limit
              ? '₹0'
              : formatINR(usage.subtotal)}
          />
          <Line
            label={`GST (${usage.gst_rate}%)`}
            value={isTrialing && usage.certificate_count <= orgBilling.trial_free_certificates_limit
              ? '₹0'
              : formatINR(usage.gst_amount)}
            muted
          />
          <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-border">
            <span className="font-semibold text-sm">Estimated total</span>
            <span className={`font-bold tabular-nums ${isTrialing && usage.certificate_count <= orgBilling.trial_free_certificates_limit ? 'text-emerald-600' : 'text-foreground'}`}>
              {isTrialing && usage.certificate_count <= orgBilling.trial_free_certificates_limit
                ? '₹0 — covered by trial'
                : formatINR(usage.estimated_total)}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground pt-2">
        Invoices are generated on the 1st of each month. Final amounts may vary.
      </p>
    </div>
  );
}
