"use client";

import { useState } from "react";
import { Plus, Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/lib/hooks/queries/delivery";
import type { ApiKeyScope } from "@/lib/api/client";
import { formatDistanceToNow } from "date-fns";

const ALL_SCOPES: { key: ApiKeyScope; label: string; description: string }[] = [
  { key: "certificates:read",  label: "Certificates (read)",  description: "List and verify certificates" },
  { key: "certificates:write", label: "Certificates (write)", description: "Generate certificates" },
  { key: "campaigns:read",     label: "Campaigns (read)",     description: "List campaigns and runs" },
  { key: "campaigns:write",    label: "Campaigns (write)",    description: "Create and send campaigns" },
  { key: "contacts:read",      label: "Contacts (read)",      description: "List and search contacts" },
  { key: "contacts:write",     label: "Contacts (write)",     description: "Create and update contacts" },
  { key: "templates:read",     label: "Templates (read)",     description: "List certificate templates" },
  { key: "automation:write",   label: "Automation (write)",   description: "Trigger automation workflows" },
  { key: "analytics:read",     label: "Analytics (read)",     description: "Read aggregate stats" },
];

function NewKeyDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [isSandbox, setIsSandbox] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const createMutation = useCreateApiKey();

  function toggleScope(scope: ApiKeyScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleCreate() {
    if (!name.trim() || !scopes.length) return;
    const result = await createMutation.mutateAsync({
      connection_name: name.trim(),
      scopes,
      is_sandbox: isSandbox,
    });
    setCreatedKey(result.api_key);
  }

  async function handleCopy() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setName("");
    setScopes([]);
    setIsSandbox(false);
    setCreatedKey(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{createdKey ? "API Key Created" : "Create API Key"}</DialogTitle>
          <DialogDescription>
            {createdKey
              ? "Copy your API key now — it will not be shown again."
              : "Name your key and select the scopes it needs."}
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                {createdKey}
              </code>
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Store this key securely — once you close this dialog it cannot be retrieved.
            </p>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. Production MCP Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="space-y-2 rounded-md border p-3">
                {ALL_SCOPES.map((scope) => (
                  <label
                    key={scope.key}
                    className="flex cursor-pointer items-start gap-3 py-0.5"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-input accent-primary"
                      checked={scopes.includes(scope.key)}
                      onChange={() => toggleScope(scope.key)}
                    />
                    <div>
                      <div className="text-sm font-medium">{scope.label}</div>
                      <div className="text-xs text-muted-foreground">{scope.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={isSandbox}
                onChange={(e) => setIsSandbox(e.target.checked)}
              />
              <div>
                <div className="text-sm font-medium">Sandbox key</div>
                <div className="text-xs text-muted-foreground">
                  Prefixed with <code>auth_test_</code> — use for testing
                </div>
              </div>
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || !scopes.length || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating…" : "Create Key"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ApiKeysPage() {
  const { apiKeys, loading } = useApiKeys();
  const revokeKey = useRevokeApiKey();
  const [showCreate, setShowCreate] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await revokeKey.mutateAsync(id);
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Keys for external integrations and the MCP server. Each key is scoped to specific actions.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Key
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : apiKeys.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">
              No API keys yet. Create one to start integrating.
            </p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <Card key={key.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{key.connection_name}</CardTitle>
                      {key.is_sandbox && (
                        <Badge variant="outline" className="text-xs">sandbox</Badge>
                      )}
                    </div>
                    <CardDescription className="mt-0.5 text-xs">
                      Created {formatDistanceToNow(new Date(key.created_at), { addSuffix: true })}
                      {key.last_used_at && (
                        <> · Last used {formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })}</>
                      )}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive shrink-0"
                    disabled={revokingId === key.id}
                    onClick={() => handleRevoke(key.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {key.scopes.map((scope) => (
                    <Badge key={scope} variant="secondary" className="text-xs font-mono">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewKeyDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
