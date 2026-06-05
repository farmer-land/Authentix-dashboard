"use client";

/**
 * Domain / sender reputation. Resend exposes no reputation API, so the score is derived
 * from our own bounce / complaint / delivery signals over the last 90 days against industry
 * thresholds. Below ~20 sends there isn't enough data to score.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { api, type DomainReputation } from "@/lib/api/client";

const GRADE_META: Record<string, { label: string; color: string; ring: string }> = {
  excellent: { label: "Excellent", color: "#3ECF8E", ring: "#3ECF8E" },
  good:      { label: "Good",      color: "#3ECF8E", ring: "#3ECF8E" },
  fair:      { label: "Fair",      color: "#f59e0b", ring: "#f59e0b" },
  poor:      { label: "Poor",      color: "#ef4444", ring: "#ef4444" },
  unknown:   { label: "Not enough data", color: "#9aa3af", ring: "#e5e7eb" },
};

const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.001 ? 3 : 2)}%`;

export function ReputationCard() {
  const [rep, setRep] = useState<DomainReputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRep(await api.delivery.getReputation());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reputation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const meta = GRADE_META[rep?.grade ?? "unknown"]!;
  const isUnknown = !rep || rep.grade === "unknown";
  const circumference = 2 * Math.PI * 26;
  const dash = isUnknown ? 0 : (rep!.score / 100) * circumference;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted shrink-0"><ShieldCheck className="w-4 h-4 text-muted-foreground" /></div>
            <div className="min-w-0">
              <CardTitle className="text-base">Domain Reputation</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                Sender health from your last 90 days of delivery, bounces and complaints.
              </CardDescription>
            </div>
          </div>
          <button onClick={load} disabled={loading} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        ) : (
          <div className="flex items-center gap-5">
            {/* Score ring */}
            <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
              <svg width="64" height="64" className="-rotate-90">
                <circle cx="32" cy="32" r="26" fill="none" stroke="var(--muted)" strokeWidth="6" />
                <circle
                  cx="32" cy="32" r="26" fill="none" stroke={meta.ring} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold tabular-nums" style={{ color: isUnknown ? undefined : meta.color }}>
                  {isUnknown ? "—" : rep!.score}
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: isUnknown ? undefined : meta.color }}>{meta.label}</p>
              {isUnknown ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send a few more certificates ({rep?.sampleSize ?? 0} so far) to get a reliable score.
                </p>
              ) : (
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Delivered</p>
                    <p className="font-medium tabular-nums">{pct(rep!.deliveryRate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bounces</p>
                    <p className={`font-medium tabular-nums ${rep!.bounceRate >= 0.05 ? "text-red-600" : rep!.bounceRate >= 0.02 ? "text-amber-600" : ""}`}>{pct(rep!.bounceRate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Complaints</p>
                    <p className={`font-medium tabular-nums ${rep!.complaintRate >= 0.005 ? "text-red-600" : rep!.complaintRate >= 0.001 ? "text-amber-600" : ""}`}>{pct(rep!.complaintRate)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground/60">
          Keep bounces under 2% and complaints under 0.1% to protect deliverability. Based on {rep?.attempted ?? 0} sends in the last 90 days.
        </p>
      </CardContent>
    </Card>
  );
}
