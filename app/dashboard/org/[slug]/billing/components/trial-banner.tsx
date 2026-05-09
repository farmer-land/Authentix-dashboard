'use client';

import type { OrgBilling, BillingProfile } from '@/lib/billing-ui/types';

interface TrialBannerProps {
  orgBilling: OrgBilling;
  billingProfile: BillingProfile;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TrialBanner({ orgBilling, billingProfile }: TrialBannerProps) {
  const { billing_status, trial_ends_at, trial_free_certificates_limit, trial_free_certificates_used } = orgBilling;

  if (billing_status !== 'trialing') return null;

  const used = trial_free_certificates_used;
  const limit = trial_free_certificates_limit;
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const trialEndsLabel = trial_ends_at ? formatDate(trial_ends_at) : null;

  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              Free Trial
            </span>
            {trialEndsLabel && (
              <span className="text-xs text-muted-foreground">Ends {trialEndsLabel}</span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            You&apos;re on a free trial.{' '}
            <span className="font-medium text-foreground">{remaining} free certificate{remaining !== 1 ? 's' : ''} remaining</span>
            {' '}out of your {limit}-certificate trial allowance.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          <p className="font-semibold text-foreground text-sm">
            ₹{billingProfile.platform_fee_amount.toLocaleString('en-IN')}<span className="font-normal text-muted-foreground">/mo</span>
          </p>
          <p>+ ₹{billingProfile.certificate_unit_price}/cert after trial</p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{used} used</span>
          <span>{limit} total</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
