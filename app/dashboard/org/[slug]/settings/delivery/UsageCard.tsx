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
import { Gauge, Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api/client";
import { useOrg } from "@/lib/org";

// A sent-email row as returned by Resend's List Sent Emails API (loosely typed).
interface ResendEmailRow {
  id?: string;
  to?: string[] | string;
  subject?: string;
  last_event?: string;
  created_at?: string;
}

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

  const [usage, setUsage] = useState<{ month: number; today: number; last30: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [customMonth, setCustomMonth] = useState<number>(0);

  // Resend's own recent sends — the real source of truth, lazy-loaded on expand.
  const [showResend, setShowResend] = useState(false);
  const [resendRows, setResendRows] = useState<ResendEmailRow[] | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  // Per-row expansion: detail + attachments + cancel for scheduled sends.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rowAttachments, setRowAttachments] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [rowLoading, setRowLoading] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const toggleRow = async (id?: string) => {
    if (!id) return;
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!rowAttachments[id]) {
      setRowLoading(id);
      try {
        const res = await api.delivery.listResendEmailAttachments(id);
        setRowAttachments(prev => ({ ...prev, [id]: Array.isArray(res.data) ? res.data : [] }));
      } catch {
        setRowAttachments(prev => ({ ...prev, [id]: [] }));
      } finally {
        setRowLoading(null);
      }
    }
  };

  const cancelSend = async (id?: string) => {
    if (!id) return;
    setCancellingId(id);
    try {
      await api.delivery.cancelResendEmail(id);
      setResendRows(prev => (prev ?? []).map(r => (r.id === id ? { ...r, last_event: "canceled" } : r)));
    } catch (e) {
      setResendError(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setCancellingId(null);
    }
  };

  const toggleResend = async () => {
    const next = !showResend;
    setShowResend(next);
    if (next && resendRows === null && !resendLoading) {
      setResendLoading(true);
      setResendError(null);
      try {
        const res = await api.delivery.listResendEmails({ limit: 10 });
        const rows = Array.isArray(res.data) ? (res.data as ResendEmailRow[]) : [];
        setResendRows(rows);
      } catch (e) {
        setResendError(e instanceof Error ? e.message : "Couldn't load Resend history");
      } finally {
        setResendLoading(false);
      }
    }
  };

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
      setUsage({ month: u.month, today: u.today, last30: u.last30, total: u.total });
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
            {/* Exact counts — always visible, so the card is never misleadingly empty
                just because the monthly quota window reset at the 1st. */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Total sent (all time)</p>
                <p className="text-lg font-semibold tabular-nums">{fmt(usage.total)}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Last 30 days</p>
                <p className="text-lg font-semibold tabular-nums">{fmt(usage.last30)}</p>
              </div>
            </div>

            <Bar
              used={usage.month}
              limit={monthLimit}
              label="This billing month"
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

        {/* Resend's own recent send history — exact source of truth */}
        <div className="border-t pt-3">
          <button
            onClick={toggleResend}
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Recent sends (from Resend)</span>
            {showResend ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showResend && (
            <div className="mt-2.5">
              {resendLoading ? (
                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading from Resend…
                </div>
              ) : resendError ? (
                <p className="text-[11px] text-amber-600">{resendError}</p>
              ) : resendRows && resendRows.length > 0 ? (
                <div className="space-y-1.5">
                  {resendRows.map((r, i) => {
                    const to = Array.isArray(r.to) ? r.to.join(", ") : (r.to ?? "—");
                    const when = r.created_at ? new Date(r.created_at).toLocaleString() : "";
                    const isOpen = expandedId === r.id;
                    const isScheduled = r.last_event === "scheduled";
                    const atts = r.id ? rowAttachments[r.id] : undefined;
                    return (
                      <div key={r.id ?? i} className="rounded-md border bg-muted/20">
                        <button
                          onClick={() => toggleRow(r.id)}
                          className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{r.subject || "(no subject)"}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{to}{when ? ` · ${when}` : ""}</p>
                          </div>
                          {r.last_event && (
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                              {r.last_event}
                            </span>
                          )}
                        </button>
                        {isOpen && (
                          <div className="border-t px-2.5 py-2 space-y-2">
                            {rowLoading === r.id ? (
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" /> Loading details…
                              </div>
                            ) : (
                              <>
                                <div>
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Attachments</p>
                                  {atts && atts.length > 0 ? (
                                    <ul className="mt-1 space-y-0.5">
                                      {atts.map((a, j) => (
                                        <li key={j} className="truncate text-[11px]">{(a.filename as string) ?? (a.name as string) ?? `attachment ${j + 1}`}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">No attachments.</p>
                                  )}
                                </div>
                                {isScheduled && (
                                  <button
                                    onClick={() => cancelSend(r.id)}
                                    disabled={cancellingId === r.id}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 px-2 py-1 text-[11px] text-red-600 hover:bg-red-500/5"
                                  >
                                    {cancellingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                    Cancel scheduled send
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground/60">No sends found on the connected Resend account yet.</p>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/60">
          Counts emails sent through Authentix this period. Resend doesn&apos;t expose a live quota API, so pick the plan
          you&apos;re on (or set a custom limit) to see headroom. Your real plan limits are managed in your Resend dashboard.
        </p>
      </CardContent>
    </Card>
  );
}
