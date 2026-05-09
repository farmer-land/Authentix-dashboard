/**
 * BILLING DOMAIN API
 *
 * Billing overview, invoice listing, and invoice retrieval.
 * All types match the actual backend BillingOverview / InvoiceEntity shapes.
 */

import { apiRequest, buildQueryString, PaginatedResponse } from "./core";
import type { BillingOverview, InvoiceEntity, InvoiceLineItem } from "@/lib/billing-ui/types";

export const billingApi = {
  getOverview: async (): Promise<BillingOverview> => {
    const response = await apiRequest<BillingOverview>("/billing/overview");
    return response.data!;
  },

  listInvoices: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }): Promise<PaginatedResponse<InvoiceEntity>> => {
    const response = await apiRequest<PaginatedResponse<InvoiceEntity>>(
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

  getInvoice: async (id: string): Promise<InvoiceEntity> => {
    const response = await apiRequest<InvoiceEntity>(`/billing/invoices/${id}`);
    return response.data!;
  },

  getInvoiceWithLineItems: async (id: string): Promise<{ invoice: InvoiceEntity; line_items: InvoiceLineItem[] }> => {
    const response = await apiRequest<{ invoice: InvoiceEntity; line_items: InvoiceLineItem[] }>(
      `/billing/invoices/${id}/line-items`,
    );
    return response.data!;
  },

  createOrder: async (invoiceId: string): Promise<{
    razorpay_order_id: string;
    razorpay_key_id: string;
    amount_paise: number;
    currency: string;
    invoice_number: string;
  }> => {
    const response = await apiRequest<{
      razorpay_order_id: string;
      razorpay_key_id: string;
      amount_paise: number;
      currency: string;
      invoice_number: string;
    }>(`/billing/invoices/${invoiceId}/create-order`, { method: "POST" });
    return response.data!;
  },

  verifyPayment: async (params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    invoice_id: string;
  }): Promise<InvoiceEntity> => {
    const response = await apiRequest<InvoiceEntity>("/billing/payments/verify", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return response.data!;
  },

  resendNotification: async (invoiceId: string): Promise<void> => {
    await apiRequest(`/billing/invoices/${invoiceId}/resend-notification`, { method: "POST" });
  },
};
