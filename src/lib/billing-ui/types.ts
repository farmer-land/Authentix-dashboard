/**
 * BILLING UI TYPES
 *
 * Matches the actual backend InvoiceEntity and BillingOverview response shapes.
 * Monetary values in rupees (backend converts from paise).
 */

export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded' | 'failed';

export interface InvoiceEntity {
  id: string;
  organization_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  currency: string;
  issue_date: string;   // ISO date
  due_date: string;     // ISO date
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  amount_paid_paise: number;
  amount_due_paise: number;
  period_id: string | null;
  bill_to: Record<string, unknown> | null;
  seller_snapshot: Record<string, unknown> | null;
  pdf_file_id: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_payment_link_id: string | null;
  razorpay_payment_link_url: string | null;
  created_at: string;
  updated_at: string;
  // Computed by backend
  payable: boolean;
  payable_reason: string | null;
  payment_cta_url: string | null;  // Use this for the "Pay Now" button URL
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  item_type: 'platform_fee' | 'certificate_usage' | 'adjustment';
  description: string;
  quantity: number;
  unit_price_paise: number;
  amount_paise: number;
  tax_paise: number;
  created_at: string;
}

export interface BillingProfile {
  plan_name: string;                    // e.g. "Flex"
  platform_fee_amount: number;          // rupees/month
  certificate_unit_price: number;       // rupees per cert (inclusive of GST when gst_inclusive=true)
  broadcast_email_unit_price: number;   // rupees per campaign email via Authentix Resend
  broadcast_email_quota: number;        // free campaign emails/month included in platform fee
  gst_rate: number;                     // percent, e.g. 18
  gst_inclusive: boolean;               // when true, all prices already include GST
  currency: string;
}

export interface CurrentUsage {
  certificate_count: number;
  platform_fee: number;
  usage_cost: number;
  broadcast_email_count: number;        // billable campaign emails (above free quota)
  broadcast_email_cost: number;
  subtotal: number;
  gst_amount: number;
  estimated_total: number;
  currency: string;
  gst_rate: number;
}

export interface OrgBilling {
  billing_status: 'trialing' | 'active' | 'overdue' | 'locked' | string;
  trial_ends_at: string | null;
  trial_free_certificates_limit: number;
  trial_free_certificates_used: number;
  dashboard_locked_at: string | null;
  billing_grace_ends_at: string | null;
}

export interface BillingOverview {
  billing_profile: BillingProfile;
  current_period: {
    certificate_count: number;
    estimated_amount: number;
  };
  current_usage: CurrentUsage;
  org_billing: OrgBilling;
  recent_invoices: InvoiceEntity[];
  total_outstanding: number;  // rupees
}

export interface PaymentStatusInfo {
  label: string;
  color: 'gray' | 'green' | 'yellow' | 'red' | 'blue';
}

// Convenience: rupees from paise
export function paiseToRupees(paise: number): number {
  return paise / 100;
}
