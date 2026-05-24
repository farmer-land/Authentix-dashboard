'use client';

import { useBillingOverview } from '@/lib/billing-ui/hooks/use-billing-overview';
import { formatCurrency, formatGSTRate } from '@/lib/billing-ui/utils/currency-formatter';
import { getCurrentBillingPeriod } from '@/lib/billing-ui/utils/invoice-helpers';

interface BillingOverviewProps {
  organizationId: string;
}

export function BillingOverview({ organizationId }: BillingOverviewProps) {
  const { usage, billingProfile, loading, error } = useBillingOverview(organizationId);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold">Error Loading Billing</h3>
        <p className="text-red-600 text-sm mt-2">{error}</p>
      </div>
    );
  }

  if (!usage || !billingProfile) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h3 className="text-yellow-800 font-semibold">No Billing Profile</h3>
        <p className="text-yellow-700 text-sm mt-2">Please contact support to set up billing.</p>
      </div>
    );
  }

  const period = getCurrentBillingPeriod();
  const currency = usage.currency;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-2xl font-bold text-gray-900">Current Billing Period</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {billingProfile.plan_name}
            </span>
          </div>
          <p className="text-gray-600 text-sm">{period.label}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          Live
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-600 mb-1">Certificates Issued</div>
          <div className="text-3xl font-bold text-gray-900">{usage.certificate_count.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">
            @ {formatCurrency(billingProfile.certificate_unit_price, currency)} per certificate
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-sm font-medium text-blue-700 mb-1">Estimated Total</div>
          <div className="text-3xl font-bold text-blue-900">
            {formatCurrency(usage.estimated_total, currency)}
          </div>
          <div className="text-xs text-blue-600 mt-1">
            {billingProfile.gst_inclusive
              ? `GST incl. (${formatGSTRate(usage.gst_rate)} embedded)`
              : `Including GST (${formatGSTRate(usage.gst_rate)})`}
          </div>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="border-t border-gray-200 pt-4 space-y-2.5">
        {billingProfile.platform_fee_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              Platform fee — 1 × {formatCurrency(billingProfile.platform_fee_amount, currency)}
            </span>
            <span className="font-medium text-gray-900">
              = {formatCurrency(usage.platform_fee, currency)}
            </span>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            Certificates — {usage.certificate_count.toLocaleString()} × {formatCurrency(billingProfile.certificate_unit_price, currency)}
          </span>
          <span className="font-medium text-gray-900">
            = {formatCurrency(usage.usage_cost, currency)}
          </span>
        </div>

        {usage.broadcast_email_count > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              Campaign emails — {usage.broadcast_email_count.toLocaleString()} × {formatCurrency(billingProfile.broadcast_email_unit_price, currency)}
            </span>
            <span className="font-medium text-gray-900">
              = {formatCurrency(usage.broadcast_email_cost, currency)}
            </span>
          </div>
        )}

        {billingProfile.broadcast_email_quota > 0 && (
          <div className="text-xs text-gray-400 pl-0.5">
            {billingProfile.broadcast_email_quota.toLocaleString()} campaign emails/month included free
          </div>
        )}

        <div className="flex justify-between text-sm border-t border-gray-100 pt-2.5">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-medium text-gray-900">{formatCurrency(usage.subtotal, currency)}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            {billingProfile.gst_inclusive
              ? `GST (${formatGSTRate(usage.gst_rate)}, included)`
              : `GST (${formatGSTRate(usage.gst_rate)})`}
          </span>
          <span className="font-medium text-gray-900">{formatCurrency(usage.gst_amount, currency)}</span>
        </div>

        <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-3">
          <span className="text-gray-900">Estimated Total</span>
          <span className="text-blue-600">{formatCurrency(usage.estimated_total, currency)}</span>
        </div>
      </div>

      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-xs text-yellow-800">
          <strong>Note:</strong> Estimated amount based on current usage. Final invoice generated at month end.
        </p>
      </div>
    </div>
  );
}
