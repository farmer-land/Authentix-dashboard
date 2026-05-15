"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Hash,
} from "lucide-react";
import { api, type VerificationEvent } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

type ResultFilter = "all" | "valid" | "invalid" | "expired" | "revoked" | "not_found";

const RESULT_TABS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "valid", label: "Valid" },
  { value: "invalid", label: "Invalid" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
  { value: "not_found", label: "Not Found" },
];

const RESULT_CONFIG = {
  valid: {
    label: "Valid",
    Icon: CheckCircle2,
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  invalid: {
    label: "Invalid",
    Icon: XCircle,
    badge: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
  expired: {
    label: "Expired",
    Icon: Clock,
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  revoked: {
    label: "Revoked",
    Icon: AlertTriangle,
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  not_found: {
    label: "Not Found",
    Icon: XCircle,
    badge: "bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20",
  },
};

function ResultBadge({ result }: { result: VerificationEvent["result"] }) {
  const cfg = RESULT_CONFIG[result];
  const Icon = cfg.Icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
      cfg.badge,
    )}>
      <Icon className="w-3 h-3 shrink-0" />
      {cfg.label}
    </span>
  );
}

const PAGE_SIZE = 50;

export default function VerificationLogsPage() {
  const [events, setEvents] = useState<VerificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

  const fetchEvents = useCallback(async (pg: number, filter: ResultFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.verification.listEvents({
        page: pg,
        limit: PAGE_SIZE,
        result: filter === "all" ? undefined : filter,
      });
      setEvents(res.events);
      setPagination({ total: res.pagination.total, total_pages: res.pagination.total_pages });
    } catch {
      setError("Failed to load verification logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(page, resultFilter);
  }, [fetchEvents, page, resultFilter]);

  const handleFilterChange = (f: ResultFilter) => {
    setResultFilter(f);
    setPage(1);
    setSearch("");
  };

  const handleRefresh = () => fetchEvents(page, resultFilter);

  // Client-side search over the current page
  const filtered = search.trim()
    ? events.filter(e => {
        const q = search.toLowerCase();
        return (
          e.certificates?.recipient_name?.toLowerCase().includes(q) ||
          e.certificates?.certificate_number?.toLowerCase().includes(q) ||
          e.certificates?.recipient_email?.toLowerCase().includes(q)
        );
      })
    : events;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Verification Logs</h1>
          <p className="text-muted-foreground mt-1.5 text-base">
            Track all certificate verification attempts
          </p>
        </div>
        <Button variant="outline" className="h-9 px-4 gap-2 w-fit" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Result type tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 w-fit flex-wrap">
          {RESULT_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => handleFilterChange(tab.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                resultFilter === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search recipient or certificate…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Table card */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-24 h-4 rounded-full bg-muted animate-pulse" />
                <div className="w-20 h-5 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 h-4 rounded-full bg-muted animate-pulse" />
                <div className="w-32 h-4 rounded-full bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>Retry</Button>
          </CardContent>
        ) : filtered.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
              <Shield className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">
                {search ? "No matching results" : "No verification events yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search
                  ? "Try a different search term"
                  : "Logs appear when recipients verify their certificates."}
              </p>
            </div>
          </CardContent>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[160px_120px_1fr_160px_120px] gap-4 px-5 py-2.5 border-b border-border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Result</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipient</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Certificate #</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Age</p>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {filtered.map(event => (
                <div
                  key={event.id}
                  className="flex flex-col sm:grid sm:grid-cols-[160px_120px_1fr_160px_120px] gap-1 sm:gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors"
                >
                  {/* Time */}
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm tabular-nums text-foreground/80">
                      {format(new Date(event.scanned_at), "MMM d, HH:mm")}
                    </p>
                  </div>

                  {/* Result */}
                  <div className="flex items-center">
                    <ResultBadge result={event.result} />
                  </div>

                  {/* Recipient */}
                  <div className="flex items-center gap-2 min-w-0">
                    {event.certificates ? (
                      <>
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {event.certificates.recipient_name}
                          </p>
                          {event.certificates.recipient_email && (
                            <p className="text-xs text-muted-foreground truncate">
                              {event.certificates.recipient_email}
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>

                  {/* Certificate # */}
                  <div className="flex items-center gap-1.5">
                    {event.certificates?.certificate_number ? (
                      <>
                        <Hash className="w-3 h-3 text-muted-foreground shrink-0" />
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {event.certificates.certificate_number}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>

                  {/* Age */}
                  <div className="flex items-center">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.scanned_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Pagination */}
      {!loading && !error && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {pagination.total.toLocaleString()} total event{pagination.total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {page} / {pagination.total_pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= pagination.total_pages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
