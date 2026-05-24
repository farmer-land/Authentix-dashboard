"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useWebhookEndpoints,
  useCreateWebhookEndpoint,
  useUpdateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useWebhookDeliveryLogs,
} from "@/lib/hooks/queries/delivery";
import type { WebhookEndpoint, WebhookEventType } from "@/lib/api/client";
import { formatDistanceToNow } from "date-fns";

const ALL_EVENT_TYPES: { key: WebhookEventType; label: string }[] = [
  { key: "certificate.generated",   label: "Certificate generated" },
  { key: "contact.created",         label: "Contact created" },
  { key: "contact.updated",         label: "Contact updated" },
  { key: "contact.unsubscribed",    label: "Contact unsubscribed" },
  { key: "campaign.sent",           label: "Campaign sent" },
  { key: "campaign.failed",         label: "Campaign failed" },
  { key: "email.delivered",         label: "Email delivered" },
  { key: "email.bounced",           label: "Email bounced" },
  { key: "email.complained",        label: "Email complained (spam)" },
];

function NewEndpointDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [eventTypes, setEventTypes] = useState<WebhookEventType[]>([]);
  const createMutation = useCreateWebhookEndpoint();

  function toggleEvent(type: WebhookEventType) {
    setEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  async function handleCreate() {
    if (!url.trim()) return;
    await createMutation.mutateAsync({
      url: url.trim(),
      description: description.trim() || undefined,
      event_types: eventTypes.length ? eventTypes : undefined,
    });
    handleClose();
  }

  function handleClose() {
    setUrl("");
    setDescription("");
    setEventTypes([]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Webhook Endpoint</DialogTitle>
          <DialogDescription>
            We&apos;ll send HMAC-signed POST requests to your URL when events occur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://your-server.com/webhooks/authentix"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="webhook-desc">Description (optional)</Label>
            <Input
              id="webhook-desc"
              placeholder="e.g. Production event receiver"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Events to receive</Label>
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to receive every event type.
            </p>
            <div className="space-y-2 rounded-md border p-3">
              {ALL_EVENT_TYPES.map((et) => (
                <label key={et.key} className="flex cursor-pointer items-center gap-3 py-0.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={eventTypes.includes(et.key)}
                    onChange={() => toggleEvent(et.key)}
                  />
                  <span className="text-sm font-mono">{et.key}</span>
                  <span className="text-xs text-muted-foreground">{et.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!url.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Adding…" : "Add Endpoint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryLogsPanel({ endpointId }: { endpointId: string }) {
  const { data: logs, isLoading } = useWebhookDeliveryLogs(endpointId);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (!logs?.length) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        No delivery attempts yet.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
          {log.status === "delivered" ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : log.status === "failed" ? (
            <XCircle className="h-4 w-4 text-destructive shrink-0" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-xs font-mono text-muted-foreground">{log.event_type}</span>
            {log.response_status && (
              <Badge
                variant={log.response_status < 300 ? "secondary" : "destructive"}
                className="ml-2 text-xs"
              >
                {log.response_status}
              </Badge>
            )}
            {log.error_message && (
              <span className="ml-2 text-xs text-destructive truncate">{log.error_message}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: WebhookEndpoint }) {
  const [expanded, setExpanded] = useState(false);
  const updateMutation = useUpdateWebhookEndpoint();
  const deleteMutation = useDeleteWebhookEndpoint();

  async function handleToggleActive() {
    await updateMutation.mutateAsync({
      id: endpoint.id,
      dto: { is_active: !endpoint.is_active },
    });
  }

  async function handleDelete() {
    await deleteMutation.mutateAsync(endpoint.id);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <button
            className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((p) => !p)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-mono truncate">{endpoint.url}</CardTitle>
              <Badge
                variant={endpoint.is_active ? "secondary" : "outline"}
                className="text-xs"
              >
                {endpoint.is_active ? "active" : "paused"}
              </Badge>
              {endpoint.failure_count > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {endpoint.failure_count} failure{endpoint.failure_count !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            {endpoint.description && (
              <CardDescription className="mt-0.5 text-xs">{endpoint.description}</CardDescription>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              Added {formatDistanceToNow(new Date(endpoint.created_at), { addSuffix: true })}
              {endpoint.last_triggered_at && (
                <> · Last triggered {formatDistanceToNow(new Date(endpoint.last_triggered_at), { addSuffix: true })}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={endpoint.is_active}
              onCheckedChange={handleToggleActive}
              disabled={updateMutation.isPending}
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {endpoint.event_types.length > 0 && (
        <CardContent className="pt-0 pb-2 pl-10">
          <div className="flex flex-wrap gap-1">
            {endpoint.event_types.map((et) => (
              <Badge key={et} variant="outline" className="text-xs font-mono">
                {et}
              </Badge>
            ))}
          </div>
        </CardContent>
      )}

      {expanded && (
        <CardContent className="pt-0 pb-0 pl-10 pr-0">
          <div className="border rounded-md mb-4 overflow-hidden">
            <div className="bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              Recent delivery attempts
            </div>
            <DeliveryLogsPanel endpointId={endpoint.id} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function WebhooksPage() {
  const { endpoints, loading } = useWebhookEndpoints();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Outbound webhooks are HMAC-SHA256 signed. Deliveries are retried up to 5 times with
            exponential backoff.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Endpoint
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 w-full animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : endpoints.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">
              No webhook endpoints yet. Add one to start receiving events.
            </p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Endpoint
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <EndpointCard key={ep.id} endpoint={ep} />
          ))}
        </div>
      )}

      <NewEndpointDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
