"use client";

/**
 * Resend Domain Management — add a sending domain, view its DNS records
 * (SPF / DKIM / DMARC), verify/re-verify, monitor status, and remove it.
 * Surfaces the backend Resend domain lifecycle in-app so users don't need
 * to leave for resend.com.
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Globe, Plus, Loader2, RefreshCw, Trash2, CheckCircle2, AlertCircle, Clock, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";
import { api, type ResendDomain, type ResendDomainRecord } from "@/lib/api/client";

function statusMeta(status?: string): { label: string; cls: string; icon: React.ReactNode } {
  const s = (status ?? "").toLowerCase();
  if (s === "verified") return { label: "Verified", cls: "bg-[#3ECF8E]/10 text-[#3ECF8E] border-[#3ECF8E]/30", icon: <CheckCircle2 className="w-3 h-3" /> };
  if (s === "failed" || s === "temporary_failure") return { label: "Failed", cls: "bg-red-500/10 text-red-600 border-red-500/30", icon: <AlertCircle className="w-3 h-3" /> };
  if (s === "pending" || s === "not_started" || s === "") return { label: s === "not_started" || s === "" ? "Not started" : "Pending", cls: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: <Clock className="w-3 h-3" /> };
  return { label: status ?? "Unknown", cls: "bg-muted text-muted-foreground border-border", icon: <Clock className="w-3 h-3" /> };
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-[#3ECF8E]" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function DnsRecords({ records }: { records: ResendDomainRecord[] }) {
  if (!records.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 border-b border-border">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">DNS records to add at your registrar</p>
      </div>
      <div className="divide-y divide-border">
        {records.map((r, i) => {
          const m = statusMeta(r.status);
          return (
            <div key={i} className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.type || "TXT"}</span>
                {r.record && <span className="text-[10px] font-medium text-muted-foreground">{r.record}</span>}
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${m.cls}`}>{m.icon}{m.label}</span>
              </div>
              <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
                <span className="text-[10px] text-muted-foreground/70">Name</span>
                <code className="text-[11px] font-mono break-all">{r.name || "@"}</code>
                <CopyBtn value={r.name || "@"} />
              </div>
              <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
                <span className="text-[10px] text-muted-foreground/70">Value</span>
                <code className="text-[11px] font-mono break-all">{r.value}</code>
                <CopyBtn value={r.value ?? ""} />
              </div>
              {r.priority !== undefined && (
                <div className="grid grid-cols-[64px_1fr] items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/70">Priority</span>
                  <code className="text-[11px] font-mono">{r.priority}</code>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DomainManager({ integrationId }: { integrationId: string }) {
  const [domains, setDomains] = useState<ResendDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDomains(await api.delivery.listDomains(integrationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = newDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!name) return;
    setAdding(true);
    try {
      await api.delivery.createDomain(integrationId, name);
      toast.success(`${name} added — add the DNS records below, then verify.`);
      setNewDomain("");
      setShowAdd(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await api.delivery.verifyDomain(integrationId, id);
      toast.success("Verification requested — status will update once DNS propagates.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}? You won't be able to send from it until re-added and verified.`)) return;
    setDeletingId(id);
    try {
      await api.delivery.deleteDomain(integrationId, id);
      toast.success(`${name} removed`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove domain");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted shrink-0"><Globe className="w-4 h-4 text-muted-foreground" /></div>
            <div className="min-w-0">
              <CardTitle className="text-base">Sending Domains</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                Add and verify your domain (SPF, DKIM, DMARC) so certificates send from your own address.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Refresh" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(v => !v)}>
              <Plus className="w-3.5 h-3.5" /> Add Domain
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {showAdd && (
          <div className="flex gap-2 p-3 rounded-lg border bg-muted/20">
            <Input
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              placeholder="mail.yourcompany.com"
              className="h-9 text-sm"
            />
            <Button onClick={handleAdd} disabled={adding || !newDomain.trim()} className="gap-1.5 shrink-0">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading domains…
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Globe className="w-7 h-7 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No domains added yet.</p>
            <p className="text-xs mt-0.5">Add your domain to send from your own address and improve deliverability.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map(d => {
              const m = statusMeta(d.status);
              const records = d.records ?? [];
              const broken = records.filter(r => (r.status ?? "").toLowerCase() !== "verified");
              const isVerified = (d.status ?? "").toLowerCase() === "verified";
              return (
                <div key={d.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold truncate">{d.name}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.icon}{m.label}</span>
                      {d.region && <span className="text-[10px] text-muted-foreground/60">{d.region}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isVerified && (
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => handleVerify(d.id)} disabled={verifyingId === d.id}>
                          {verifyingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {isVerified ? "Re-check" : "Verify"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => handleDelete(d.id, d.name)} disabled={deletingId === d.id} title="Remove domain">
                        {deletingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Health summary */}
                  {!isVerified && broken.length > 0 && (
                    <p className="text-[11px] text-amber-600 mt-2">
                      {broken.length} of {records.length} DNS record{records.length !== 1 ? "s" : ""} not yet verified — add the records below at your DNS provider, then click Verify.
                    </p>
                  )}
                  {isVerified && (
                    <p className="text-[11px] text-[#3ECF8E] mt-2">All DNS records verified — you can send from this domain.</p>
                  )}

                  {/* DNS records (hidden once fully verified to reduce clutter) */}
                  {!isVerified && <DnsRecords records={records} />}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground/70">
          DMARC tip: once SPF &amp; DKIM verify, add a DMARC record —
          <code className="font-mono bg-muted px-1 rounded mx-1">v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com</code>
          — then tighten <code className="font-mono bg-muted px-1 rounded">p=none</code> to <code className="font-mono bg-muted px-1 rounded">quarantine</code> once you confirm delivery.
        </p>
      </CardContent>
    </Card>
  );
}
