"use client";

import { AlertCircle, Clock, Lock, CreditCard, X } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOrg } from "@/lib/org";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
}

function daysAgo(isoDate: string): number {
  return Math.ceil((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

/**
 * Sticky billing status banner — shown above main content when action is needed.
 * Covers four states: trialing, overdue (within grace), locked, and approaching-trial-end.
 */
export function BillingStatusBanner() {
  const { orgPath } = useOrg();
  const pathname = usePathname();
  const router = useRouter();
  const { data: overview } = useQuery({
    queryKey: ["billing", "overview", "banner"],
    queryFn: () => api.billing.getOverview(),
    staleTime: 2 * 60 * 1000,
  });
  const [dismissed, setDismissed] = useState(false);

  const billingPath = orgPath("/billing");
  const isOnBillingPage = pathname.startsWith(billingPath);

  // Redirect locked orgs to billing (except when already there)
  useEffect(() => {
    if (overview?.org_billing?.billing_status === "locked" && !isOnBillingPage) {
      router.replace(billingPath);
    }
  }, [overview?.org_billing?.billing_status, isOnBillingPage, billingPath, router]);

  if (!overview?.org_billing || dismissed) return null;

  const { billing_status, trial_ends_at, trial_free_certificates_limit, trial_free_certificates_used, billing_grace_ends_at } = overview.org_billing;

  // ── Locked ──────────────────────────────────────────────────────────────────
  if (billing_status === "locked") {
    return (
      <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            Your dashboard is locked due to an unpaid invoice. Certificate generation and email delivery are paused.
          </span>
        </div>
        <Link
          href={orgPath("/billing")}
          className="text-sm font-semibold underline underline-offset-2 hover:no-underline shrink-0"
        >
          Pay now →
        </Link>
      </div>
    );
  }

  // ── Overdue (within grace period) ────────────────────────────────────────────
  if (billing_status === "overdue") {
    const graceDaysLeft = billing_grace_ends_at ? daysUntil(billing_grace_ends_at) : 0;
    const urgent = graceDaysLeft <= 2;
    return (
      <div className={cn(
        "px-4 py-3 flex items-center justify-between gap-4",
        urgent ? "bg-destructive text-destructive-foreground" : "bg-orange-500/90 text-white dark:bg-orange-600/90"
      )}>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            Invoice overdue.{" "}
            {graceDaysLeft > 0
              ? `Dashboard locks in ${graceDaysLeft} day${graceDaysLeft !== 1 ? "s" : ""}.`
              : "Dashboard will be locked shortly."}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={orgPath("/billing")}
            className="text-sm font-semibold underline underline-offset-2 hover:no-underline"
          >
            Pay invoice →
          </Link>
          {!urgent && (
            <button onClick={() => setDismissed(true)} aria-label="Dismiss">
              <X className="h-4 w-4 opacity-70 hover:opacity-100" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Trialing ─────────────────────────────────────────────────────────────────
  if (billing_status === "trialing" && trial_ends_at) {
    const daysLeft = daysUntil(trial_ends_at);
    const certsLeft = trial_free_certificates_limit - trial_free_certificates_used;
    const trialAlmostOver = daysLeft <= 2 || certsLeft <= 2;

    if (!trialAlmostOver && !dismissed) {
      // Only show trial banner if almost over — skip to avoid noisy UX
      return null;
    }

    if (dismissed) return null;

    return (
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm text-foreground">
            <span className="font-medium">Trial ending soon —</span>{" "}
            {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""}` : "today"},{" "}
            {certsLeft} free certificate{certsLeft !== 1 ? "s" : ""} remaining.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link href={orgPath("/billing")} className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
            <CreditCard className="h-3.5 w-3.5" />
            Set up billing
          </Link>
          <button onClick={() => setDismissed(true)} aria-label="Dismiss">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
