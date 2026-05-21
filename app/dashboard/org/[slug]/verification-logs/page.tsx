"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  ChevronDown,
  ChevronUp,
  Smartphone,
  Monitor,
  Tablet,
  Bot,
  Globe,
  Link2,
  MapPin,
} from "lucide-react";
import { api, type CertificateVerificationSummary, type VerificationEvent } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

// ── Result config ─────────────────────────────────────────────────────────────

const RESULT_CONFIG = {
  valid:     { label: "Valid",     Icon: CheckCircle2, badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  invalid:   { label: "Invalid",   Icon: XCircle,      badge: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  expired:   { label: "Expired",   Icon: Clock,        badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  revoked:   { label: "Revoked",   Icon: AlertTriangle, badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  not_found: { label: "Not Found", Icon: XCircle,      badge: "bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20" },
} as const;

function ResultBadge({ result }: { result: VerificationEvent["result"] }) {
  const cfg = RESULT_CONFIG[result];
  const Icon = cfg.Icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border", cfg.badge)}
      title={cfg.label}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {cfg.label}
    </span>
  );
}

// ── UA / referrer parsers (client-side) ───────────────────────────────────────

function parseUserAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: "Unknown", os: "Unknown" };
  let browser = "Unknown";
  let os = "Unknown";

  // OS
  if (/Windows NT/i.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/);
    const map: Record<string, string> = { "10.0": "Win 10/11", "6.3": "Win 8.1", "6.2": "Win 8", "6.1": "Win 7" };
    os = map[m?.[1] ?? ""] ?? `Windows`;
  } else if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/);
    os = `macOS ${(m?.[1] ?? "").replace(/_/g, ".")}`;
  } else if (/Android/i.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    os = `Android ${m?.[1] ?? ""}`;
  } else if (/iPhone OS|CPU OS/i.test(ua)) {
    const m = ua.match(/(?:iPhone OS|CPU OS) ([\d_]+)/);
    os = `iOS ${(m?.[1] ?? "").replace(/_/g, ".")}`;
  } else if (/CrOS/i.test(ua)) {
    os = "Chrome OS";
  } else if (/Linux/i.test(ua)) {
    os = "Linux";
  }

  // Browser (order matters — Edge/Chrome/Safari share substrings)
  if (/Edg\//i.test(ua)) {
    const m = ua.match(/Edg\/([\d]+)/);
    browser = `Edge ${m?.[1] ?? ""}`;
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = "Opera";
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = "Samsung";
  } else if (/Chrome\/([\d]+)/i.test(ua)) {
    const m = ua.match(/Chrome\/([\d]+)/);
    browser = `Chrome ${m?.[1] ?? ""}`;
  } else if (/Firefox\/([\d]+)/i.test(ua)) {
    const m = ua.match(/Firefox\/([\d]+)/);
    browser = `Firefox ${m?.[1] ?? ""}`;
  } else if (/Version\/([\d]+).*Safari/i.test(ua)) {
    const m = ua.match(/Version\/([\d]+)/);
    browser = `Safari ${m?.[1] ?? ""}`;
  } else if (/MSIE|Trident/i.test(ua)) {
    browser = "IE";
  }

  return { browser, os };
}

function parseReferrer(referrer: string | null): string {
  if (!referrer) return "Direct / QR code";
  try {
    const url = new URL(referrer);
    const h = url.hostname.replace(/^www\./, "");
    if (h.includes("linkedin.com")) return "LinkedIn";
    if (h.includes("google.") || h === "google.com") return "Google";
    if (h.includes("t.co") || h.includes("twitter.com") || h.includes("x.com")) return "Twitter / X";
    if (h.includes("facebook.com") || h.includes("fb.com")) return "Facebook";
    if (h.includes("instagram.com")) return "Instagram";
    if (h.includes("youtube.com")) return "YouTube";
    if (h.includes("whatsapp.com")) return "WhatsApp";
    if (h.includes("telegram.org") || h.includes("t.me")) return "Telegram";
    if (h.includes("naukri.com")) return "Naukri";
    if (h.includes("shine.com")) return "Shine";
    if (h.includes("indeed.com")) return "Indeed";
    return h;
  } catch {
    return referrer.slice(0, 40);
  }
}

function countryName(code: string | null): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(
    ...code.toUpperCase().split("").map(c => 0x1f1e0 + c.charCodeAt(0) - 65)
  );
}

function DeviceIcon({ type }: { type: VerificationEvent["device_type"] }) {
  if (type === "mobile")  return <Smartphone className="w-3.5 h-3.5 shrink-0" />;
  if (type === "tablet")  return <Tablet className="w-3.5 h-3.5 shrink-0" />;
  if (type === "bot")     return <Bot className="w-3.5 h-3.5 shrink-0" />;
  return <Monitor className="w-3.5 h-3.5 shrink-0" />;
}

// ── Inner events table (lazy-loaded per certificate) ──────────────────────────

const INNER_PAGE_SIZE = 10;

function CertificateEventsTable({ certificateId }: { certificateId: string }) {
  const [events, setEvents]     = useState<VerificationEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });
  const initialized = useRef(false);

  const fetchEvents = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const res = await api.verification.listEvents({
        certificate_id: certificateId,
        page: pg,
        limit: INNER_PAGE_SIZE,
      });
      setEvents(res.events);
      setPagination({ total: res.pagination.total, total_pages: res.pagination.total_pages });
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [certificateId]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchEvents(1);
  }, [fetchEvents]);

  const handlePage = (pg: number) => {
    setPage(pg);
    fetchEvents(pg);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-9 rounded bg-muted/60 animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-5 py-6 text-center text-sm text-muted-foreground">
        No verification events found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Column headers */}
      <div className="grid grid-cols-[140px_90px_180px_140px_1fr] gap-2 px-5 py-2 bg-muted/20 border-t border-b border-border/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-160">
        <span>Time</span>
        <span>Result</span>
        <span>Device / Browser</span>
        <span>Location</span>
        <span>Source</span>
      </div>

      <div className="divide-y divide-border/40">
        {events.filter(ev => ev.result !== "not_found").map((ev, idx) => {
          const { browser, os } = parseUserAgent(ev.user_agent);
          const referrerLabel   = parseReferrer(ev.referrer);
          const flag            = countryFlag(ev.geo_country);
          const country         = countryName(ev.geo_country);

          return (
            <div
              key={ev.id}
              className={cn(
                "grid grid-cols-[140px_90px_180px_140px_1fr] gap-2 px-5 py-3 text-xs items-center hover:bg-muted/10 transition-colors min-w-160",
                idx % 2 === 0 ? "" : "bg-muted/5",
              )}
            >
              {/* Time */}
              <div>
                <p className="font-mono text-foreground/80 tabular-nums">
                  {format(new Date(ev.scanned_at), "dd MMM, HH:mm")}
                </p>
                <p className="text-muted-foreground/60 text-[10px] mt-0.5 tabular-nums">
                  {formatDistanceToNow(new Date(ev.scanned_at), { addSuffix: true })}
                </p>
              </div>

              {/* Result */}
              <div>
                <ResultBadge result={ev.result} />
              </div>

              {/* Device / Browser */}
              <div className="flex items-start gap-1.5">
                <DeviceIcon type={ev.device_type} />
                <div className="min-w-0">
                  <p className="text-foreground/80">
                    {ev.device_type
                      ? ev.device_type.charAt(0).toUpperCase() + ev.device_type.slice(1)
                      : "Desktop"}
                    {browser !== "Unknown" && (
                      <span className="text-muted-foreground"> · {browser}</span>
                    )}
                  </p>
                  {os !== "Unknown" && (
                    <p className="text-muted-foreground/60 text-[10px]">{os}</p>
                  )}
                  {ev.ip_partial && (
                    <p className="text-muted-foreground/50 font-mono text-[10px] mt-0.5">{ev.ip_partial}</p>
                  )}
                </div>
              </div>

              {/* Location */}
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground mt-0.5" />
                <div>
                  {ev.geo_country ? (
                    <>
                      <p className="text-foreground/80">
                        {flag} {country}
                      </p>
                      {ev.geo_city && (
                        <p className="text-muted-foreground/60 text-[10px]">{ev.geo_city}</p>
                      )}
                    </>
                  ) : ev.ip_partial ? (
                    <>
                      <p className="text-muted-foreground/70">Unknown</p>
                      <p className="text-muted-foreground/50 font-mono text-[10px] mt-0.5">{ev.ip_partial}.*</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground/40">—</p>
                  )}
                </div>
              </div>

              {/* Referrer / Source */}
              <div className="flex items-center gap-1.5 min-w-0">
                <Link2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span
                  className="truncate text-foreground/80"
                  title={ev.referrer ?? "Direct / QR code"}
                >
                  {referrerLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inner pagination */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 bg-muted/10">
        <p className="text-xs text-muted-foreground">
          {pagination.total.toLocaleString()} request{pagination.total !== 1 ? "s" : ""} total
        </p>
        {pagination.total_pages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0"
              disabled={page === 1}
              onClick={() => handlePage(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums min-w-16 text-center">
              {page} / {pagination.total_pages}
            </span>
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= pagination.total_pages}
              onClick={() => handlePage(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Certificate accordion row ─────────────────────────────────────────────────

function CertificateAccordionRow({ item }: { item: CertificateVerificationSummary }) {
  const [open, setOpen] = useState(false);

  const invalid = item.invalid_count + item.expired_count + item.revoked_count;

  return (
    <div className="border-b border-border/60 last:border-0">
      {/* Summary row — clickable header */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {/* Toggle icon — matches the w-4 placeholder in the column header */}
        <div className="w-4 text-muted-foreground shrink-0 flex items-center justify-center">
          {open
            ? <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />}
        </div>

        {/* Recipient */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <User className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{item.recipient_name}</p>
            {item.recipient_email && (
              <p className="text-xs text-muted-foreground truncate">{item.recipient_email}</p>
            )}
          </div>
        </div>

        {/* Certificate # — matches w-36 in header */}
        <div className="flex items-center gap-1.5 w-36 shrink-0 max-md:hidden overflow-hidden">
          <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate">{item.certificate_number}</span>
        </div>

        {/* Count badges — matches w-40 in header */}
        <div className="flex items-center gap-2 w-40 shrink-0">
          {item.valid_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              {item.valid_count}
            </span>
          )}
          {invalid > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
              <XCircle className="w-3 h-3" />
              {invalid}
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums font-medium">
            {item.total_count.toLocaleString()} total
          </span>
        </div>

        {/* Last verified — matches w-28 in header */}
        <div className="text-xs text-muted-foreground w-28 shrink-0 hidden md:block">
          {formatDistanceToNow(new Date(item.last_verified_at), { addSuffix: true })}
        </div>
      </button>

      {/* Expanded inner table */}
      {open && <CertificateEventsTable certificateId={item.certificate_id} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const OUTER_PAGE_SIZE = 20;

export default function VerificationRequestsPage() {
  const [items, setItems]       = useState<CertificateVerificationSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [page, setPage]         = useState(1);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

  const fetchSummary = useCallback(async (pg: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.verification.getCertificateSummary({
        page: pg,
        limit: OUTER_PAGE_SIZE,
        search: q || undefined,
      });
      setItems(res.items);
      setPagination({ total: res.pagination.total, total_pages: res.pagination.total_pages });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load verification requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary(page, debouncedSearch);
  }, [fetchSummary, page, debouncedSearch]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  const handleRefresh = () => fetchSummary(page, debouncedSearch);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Verification Requests</h1>
          <p className="text-muted-foreground mt-1.5 text-base">
            Certificate-grouped view of all verification attempts · captures IP, device, location &amp; source for compliance
          </p>
        </div>
        <Button variant="outline" className="h-9 px-4 gap-2 w-fit" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search recipient or certificate #…"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {!loading && !error && (
          <p className="text-sm text-muted-foreground">
            {pagination.total.toLocaleString()} certificate{pagination.total !== 1 ? "s" : ""} verified
          </p>
        )}
      </div>

      {/* Accordion card */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="w-4 h-4 rounded bg-muted animate-pulse shrink-0" />
                <div className="w-4 h-4 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 h-4 rounded-full bg-muted animate-pulse" />
                <div className="w-24 h-5 rounded-full bg-muted animate-pulse" />
                <div className="w-20 h-4 rounded-full bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>Retry</Button>
          </CardContent>
        ) : items.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
              <Shield className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">
                {search ? "No matching certificates" : "No verification requests yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search
                  ? "Try a different search term"
                  : "Requests appear when recipients verify their certificates via QR or link."}
              </p>
            </div>
          </CardContent>
        ) : (
          <>
            {/* Column headers */}
            <div className="max-sm:hidden flex items-center gap-4 px-5 py-2.5 border-b border-border bg-muted/30">
              <div className="w-4 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipient / Certificate</p>
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-36 shrink-0 hidden md:block">Certificate #</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40 shrink-0">Verifications</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28 shrink-0 hidden md:block">Last verified</p>
            </div>

            <div>
              {items.map(item => (
                <CertificateAccordionRow key={item.certificate_id} item={item} />
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Outer pagination */}
      {!loading && !error && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {pagination.total_pages} · {pagination.total.toLocaleString()} certificates
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
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
              variant="outline" size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= pagination.total_pages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Legal compliance note */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/50">
          <span className="flex items-center gap-1 font-medium text-muted-foreground/70">
            <Shield className="w-3 h-3" />
            IT Act 2000 · DPDP Act 2023
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> Timestamp
          </span>
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" /> Geo-country
          </span>
          <span className="flex items-center gap-1">
            <Monitor className="w-3 h-3" /> Device &amp; browser
          </span>
          <span className="flex items-center gap-1">
            <Hash className="w-3 h-3" /> Partial IP (first 2 octets)
          </span>
          <span className="flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Referrer source
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/40">Full IP is stored as a one-way hash only · not_found lookups excluded from display</p>
      </div>
    </div>
  );
}
