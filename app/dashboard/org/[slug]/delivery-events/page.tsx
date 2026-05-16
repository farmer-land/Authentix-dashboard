"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, Mail, MousePointerClick, AlertTriangle,
  Clock, Send, Eye,
} from "lucide-react";
import { useEmailEvents } from "@/lib/hooks/queries/delivery";
import type { DeliveryEmailEvent, EmailEventType } from "@/lib/api/client";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

// ── Event type config ──────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<EmailEventType, { label: string; icon: React.ReactNode; className: string }> = {
  sent:      { label: "Sent",      icon: <Send className="h-3.5 w-3.5" />,             className: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/20" },
  delivered: { label: "Delivered", icon: <CheckCircle2 className="h-3.5 w-3.5" />,     className: "text-green-700 bg-green-50 border-green-200 dark:bg-green-950/20" },
  opened:    { label: "Opened",    icon: <Eye className="h-3.5 w-3.5" />,              className: "text-purple-700 bg-purple-50 border-purple-200 dark:bg-purple-950/20" },
  clicked:   { label: "Clicked",   icon: <MousePointerClick className="h-3.5 w-3.5" />, className: "text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/20" },
  bounced:   { label: "Bounced",   icon: <XCircle className="h-3.5 w-3.5" />,          className: "text-red-700 bg-red-50 border-red-200 dark:bg-red-950/20" },
  complained:{ label: "Complaint", icon: <AlertTriangle className="h-3.5 w-3.5" />,    className: "text-orange-700 bg-orange-50 border-orange-200 dark:bg-orange-950/20" },
  failed:    { label: "Failed",    icon: <XCircle className="h-3.5 w-3.5" />,          className: "text-red-700 bg-red-50 border-red-200 dark:bg-red-950/20" },
  scheduled: { label: "Scheduled", icon: <Clock className="h-3.5 w-3.5" />,            className: "text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-900/30" },
  unknown:   { label: "Unknown",   icon: <Mail className="h-3.5 w-3.5" />,             className: "text-gray-500 bg-gray-50 border-gray-200 dark:bg-gray-900/30" },
};

const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "__all__", label: "All events" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicked" },
  { value: "bounced", label: "Bounced" },
  { value: "complained", label: "Complaint" },
  { value: "failed", label: "Failed" },
];

const PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: "__all__", label: "All providers" },
  { value: "resend", label: "Resend" },
  { value: "ses", label: "AWS SES" },
  { value: "smtp", label: "SMTP" },
  { value: "google_workspace", label: "Google Workspace" },
  { value: "microsoft_365", label: "Microsoft 365" },
];

// ── Event row ──────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: DeliveryEmailEvent }) {
  const cfg = EVENT_CONFIG[event.event_type as EmailEventType] ?? EVENT_CONFIG.unknown;
  const date = new Date(event.received_at);

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3">
        <Badge variant="outline" className={cn("text-xs flex items-center gap-1.5 w-fit", cfg!.className)}>
          {cfg!.icon} {cfg!.label}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-medium capitalize text-muted-foreground">{event.provider}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-muted-foreground truncate max-w-xs block">
          {event.provider_message_id ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-xs text-muted-foreground" title={format(date, "dd MMM yyyy, HH:mm:ss")}>
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
      </td>
    </tr>
  );
}

// ── Summary stats ──────────────────────────────────────────────────────────────

function StatBadge({ label, count, className }: { label: string; count: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-center", className)}>
      <p className="text-2xl font-semibold">{count.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DeliveryEventsPage() {
  const [page, setPage] = useState(0);
  const [eventType, setEventType] = useState<string>("__all__");
  const [provider, setProvider] = useState<string>("__all__");

  const { data, isLoading, refetch, isFetching } = useEmailEvents({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    event_type: eventType === "__all__" ? undefined : eventType,
    provider: provider === "__all__" ? undefined : provider,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Derive quick stats from current page events
  const stats = events.reduce(
    (acc, e) => {
      acc[e.event_type] = (acc[e.event_type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Delivery Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live feed of email delivery events — refreshes every 15 seconds
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats strip */}
      {total > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatBadge label="Delivered" count={stats.delivered ?? 0} className="border-green-200 bg-green-50/50 dark:bg-green-950/10" />
          <StatBadge label="Opened"    count={stats.opened ?? 0}    className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/10" />
          <StatBadge label="Bounced"   count={stats.bounced ?? 0}   className="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
          <StatBadge label="Failed"    count={stats.failed ?? 0}    className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/10" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={eventType} onValueChange={v => { setEventType(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={provider} onValueChange={v => { setProvider(v); setPage(0); }}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">
          {total.toLocaleString()} events
        </span>
      </div>

      {/* Table */}
      {isLoading && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
            ))}
          </CardContent>
        </Card>
      )}

      {!isLoading && events.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No events yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Events appear here as emails are sent, delivered, opened, and clicked
            </p>
          </CardContent>
        </Card>
      )}

      {events.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Message ID</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(event => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
