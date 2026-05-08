/**
 * BILLING DOMAIN API
 *
 * Billing overview, invoice listing, and invoice retrieval.
 */

import { apiRequest, buildQueryString, PaginatedResponse } from "./core";

export const billingApi = {
  getOverview: async () => {
    const response = await apiRequest<{
      current_period: {
        certificate_count: number;
        estimated_amount: number;
      };
      recent_invoices: Array<{
        id: string;
        organization_id: string;
        invoice_number: string;
        period_start: string;
        period_end: string;
        subtotal: number;
        tax_amount: number;
        total_amount: number;
        currency: string;
        status: string;
        razorpay_invoice_id: string | null;
        razorpay_payment_link: string | null;
        razorpay_status: string | null;
        due_date: string;
        paid_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      total_outstanding: number;
      billing_profile: {
        id: string;
        organization_id: string;
        platform_fee_amount: number;
        certificate_unit_price: number;
        gst_rate: number;
        currency: string;
        razorpay_customer_id: string | null;
        created_at: string;
        updated_at: string;
      };
      current_usage: {
        certificate_count: number;
        platform_fee: number;
        usage_cost: number;
        email_count: number;
        email_cost: number;
        broadcast_own_smtp_count: number;
        broadcast_own_smtp_cost: number;
        broadcast_platform_fee: number;
        subtotal: number;
        gst_amount: number;
        estimated_total: number;
        currency: string;
        gst_rate: number;
      };
      org_billing: {
        billing_status: 'trialing' | 'active' | 'overdue' | 'locked' | string;
        trial_ends_at: string | null;
        trial_free_certificates_limit: number;
        trial_free_certificates_used: number;
        dashboard_locked_at: string | null;
        billing_grace_ends_at: string | null;
      };
    }>("/billing/overview");
    return response.data!;
  },

  listInvoices: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }) => {
    const response = await apiRequest<PaginatedResponse<unknown>>(
      `/billing/invoices${buildQueryString({
        page: params?.page,
        limit: params?.limit,
        status: params?.status,
        sort_by: params?.sort_by,
        sort_order: params?.sort_order,
      })}`,
    );
    return response.data!;
  },

  getInvoice: async (id: string) => {
    const response = await apiRequest(`/billing/invoices/${id}`);
    return response.data!;
  },
};
