"use client";

/**
 * Email usage vs Resend plan limits. Resend has no public quota API, so we count
 * the org's actual sends (from delivery_messages) and compare against the plan the
 * user selects — working for any tier (Free → Enterprise). Warns near/over the cap
 * so users can plan and avoid limit breaches.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Gauge, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api/client";
import { useOrg } from "@/lib/org";

// Resend plan presets (monthly / daily caps). Daily 0 = no separate daily cap.
const PLANS: Record<string, { label: string; month: number; day: number }> = {
  free:       { label: "Free",       month: 3_000,    day: 100 },
  pro:        { label: "Pro",        month: 50_000,   day: 0 },
  scale:      { label: "Scale",      month: 100_000,  day: 0 },
  enterprise: { label: "Enterprise", month: 1_000_000, day: 0 },
  custom:     { label: "Custom",     month: 0,        day: 0 },
};

const fmt = (n: number) => n.toLocaleString();

function Bar({ used, limit, label, sub }: { used: number; limit: number; label: string; sub?: string }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const over = limit > 0 && used >= limit;
  const near = limit > 0 && !over && pct >= 80;
  const color = over ? "#ef4444" : near ? "#f59e0b" : "#3ECF8E";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {fmt(used)} {limit > 0 ? `/ ${fmt(limit)}` : ""}
          {limit > 0 && <span className="ml-1 text-muted-foreground/60">({Math.round(pct)}%)</span>}
        </span>
      </div>
      {limit > 0 && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
      {over && <p className="text-[11px] text-red-600">Limit reached — further sends may be rejected by Resend until your plan resets or is upgraded.</p>}
      {near && <p className="text-[11px] text-amber-600">Approaching your limit — plan upgrades or pacing recommended.</p>}
      {sub && !over && !near && <p className="text-[11px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

export function UsageCard() {
  const { slug } = useOrg();
  const planKey = `email_plan:${slug}`;
  const customKey = `email_plan_custom:${slug}`;

  const [usage, setUsage] = useState<{ month: number; today: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [customMonth, setCustomMonth] = useState<number>(0);

  useEffect(() => {
    try {
      setPlan(localStorage.getItem(planKey) ?? "free");
      setCustomMonth(Number(localStorage.getItem(customKey) ?? 0));
    } catch { /* ignore */ }
  }, [planKey, customKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await api.delivery.getUsage();
      setUsage({ month: u.month, today: u.today });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setPlanPersist = (p: string) => {
    setPlan(p);
    try { localStorage.setItem(planKey, p); } catch { /* ignore */ }
  };
  const setCustomPersist = (n: number) => {
    setCustomMonth(n);
    try { localStorage.setItem(customKey, String(n)); } catch { /* ignore */ }
  };

  const cfg = PLANS[plan] ?? PLANS.free!;
  const monthLimit = plan === "custom" ? customMonth : cfg.month;
  const dayLimit = plan === "custom" ? 0 : cfg.day;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted shrink-0"><Gauge className="w-4 h-4 text-muted-foreground" /></div>
            <div className="min-w-0">
              <CardTitle className="text-base">Email Usage</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                Track sends against your Resend plan so you never hit a limit unexpectedly.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={load} disabled={loading} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Select value={plan} onValueChange={setPlanPersist}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PLANS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {plan === "custom" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Monthly limit</span>
            <Input
              type="number"
              value={customMonth || ""}
              onChange={e => setCustomPersist(Number(e.target.value))}
              placeholder="e.g. 250000"
              className="h-8 w-40 text-sm"
            />
          </div>
        )}

        {error ? (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        ) : loading || !usage ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading usage…
          </div>
        ) : (
          <div className="space-y-4">
            <Bar
              used={usage.month}
              limit={monthLimit}
              label="This month"
              sub={monthLimit === 0 ? "Set a monthly limit to track headroom." : undefined}
            />
            {dayLimit > 0 && <Bar used={usage.today} limit={dayLimit} label="Today" />}
            {dayLimit === 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Today</span>
                <span className="text-muted-foreground tabular-nums">{fmt(usage.today)} sent</span>
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground/60">
          Counts emails sent through Authentix this period. Resend doesn&apos;t expose a live quota API, so pick the plan
          you&apos;re on (or set a custom limit) to see headroom. Your real plan limits are managed in your Resend dashboard.
        </p>
      </CardContent>
    </Card>
  );
}
