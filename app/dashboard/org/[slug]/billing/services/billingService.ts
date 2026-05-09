/**
 * BILLING — SERVICE LAYER
 *
 * Wraps all API calls for the billing domain.
 * Normalises responses into ApiResult<T> for consistent error handling.
 */

import { api } from "@/lib/api/client";
import { ok, fromThrown, type ApiResult } from "@/lib/api/result";
import { logger } from "@/lib/logger";
import type { CurrentUsage, BillingProfile, InvoiceEntity } from "@/lib/billing-ui/types";

const svcLogger = logger.child({ service: "billing" });

// ── Overview ──────────────────────────────────────────────────────────────────

export async function loadBillingOverview(): Promise<
  ApiResult<{ usage: CurrentUsage; profile: BillingProfile }>
> {
  try {
    const result = await api.billing.getOverview();
    return ok({ usage: result.current_usage, profile: result.billing_profile });
  } catch (e) {
    svcLogger.error("Failed to load billing overview", { error: e instanceof Error ? e.message : String(e) });
    return fromThrown(e, "Failed to load billing overview");
  }
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function listInvoices(
  params?: { page?: number; limit?: number; status?: string },
): Promise<ApiResult<{ items: InvoiceEntity[] }>> {
  try {
    const result = await api.billing.listInvoices(params);
    return ok({ items: (result as { items?: InvoiceEntity[] }).items ?? [] });
  } catch (e) {
    return fromThrown(e, "Failed to load invoices");
  }
}
