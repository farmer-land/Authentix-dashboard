"use client";

/**
 * Owner-managed list of named "From" identities (purpose senders), e.g.
 *   Certificates → certificates@yourdomain.com
 *   Support      → support@yourdomain.com
 *   No-Reply     → noreply@yourdomain.com
 *
 * These are not separate integrations — every sender reuses the org's existing
 * transport (platform Resend for the owner, or the org's own integration). They are
 * simply alternative From addresses on an already-verified domain, picked at send time.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AtSign, Loader2, Plus, Trash2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { api, type DeliverySender } from "@/lib/api/client";

export function SendersCard() {
  const [senders, setSenders] = useState<DeliverySender[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSenders(await api.delivery.listSenders());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load senders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setLabel(""); setEmail(""); setName(""); setIsDefault(false); setShowForm(false); };

  const handleCreate = async () => {
    if (!label.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await api.delivery.createSender({
        label: label.trim(),
        from_email: email.trim(),
        from_name: name.trim() || null,
        is_default: isDefault,
      });
      toast.success("Sender added");
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add sender");
    } finally {
      setSaving(false);
    }
  };

  const handleMakeDefault = async (s: DeliverySender) => {
    try {
      await api.delivery.updateSender(s.id, { is_default: true });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delivery.deleteSender(id);
      toast.success("Sender removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted shrink-0"><AtSign className="w-4 h-4 text-muted-foreground" /></div>
            <div className="min-w-0">
              <CardTitle className="text-base">Sender Addresses</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                Different From addresses for different purposes — pick one when you send.
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm(v => !v)}
            className={`gap-1.5 ${showForm ? "" : "bg-[#3ECF8E] hover:bg-[#34b87a] text-white"}`}
          >
            {showForm ? <><X className="w-4 h-4" /> Cancel</> : <><Plus className="w-4 h-4" /> Add sender</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {showForm && (
          <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s_label">Purpose / Label <span className="text-destructive">*</span></Label>
                <Input id="s_label" placeholder="Certificates" value={label} onChange={e => setLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s_email">From Email <span className="text-destructive">*</span></Label>
                <Input id="s_email" type="email" placeholder="certificates@yourdomain.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s_name">Sender Name</Label>
                <Input id="s_name" placeholder="Your Organization" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch id="s_default" checked={isDefault} onCheckedChange={setIsDefault} />
                <Label htmlFor="s_default" className="cursor-pointer">Use as default sender</Label>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The address must be on a domain you&apos;ve already verified for sending.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={saving || !label.trim() || !email.trim()} onClick={handleCreate}
                className="bg-[#3ECF8E] hover:bg-[#34b87a] text-white">
                {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : "Add sender"}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : senders.length === 0 && !showForm ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
            <p className="text-sm font-medium">No sender addresses yet</p>
            <p className="mx-auto mt-0.5 max-w-sm text-xs text-muted-foreground">
              Add addresses like <span className="font-mono">certificates@</span> or <span className="font-mono">support@</span> so
              you can choose the right one for each send.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {senders.map(s => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{s.label}</span>
                    {s.is_default && (
                      <Badge className="text-[10px] bg-[#3ECF8E]/10 border-[#3ECF8E]/30 text-[#3ECF8E] hover:bg-[#3ECF8E]/10">
                        <Star className="w-3 h-3 mr-1" /> Default
                      </Badge>
                    )}
                    {s.managed && (
                      <Badge variant="secondary" className="text-[10px]">Managed</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {s.from_name ? `${s.from_name} ‹${s.from_email}›` : s.from_email}
                  </p>
                </div>
                {/* Managed senders (from an integration / the Authentix default) are read-only —
                    they already exist as sending identities, so no edit/delete here. */}
                {s.managed ? (
                  <span className="text-[11px] text-muted-foreground/60 shrink-0">From integration</span>
                ) : (
                  <>
                    {!s.is_default && (
                      <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={() => handleMakeDefault(s)}>
                        <Star className="w-3.5 h-3.5" /> Make default
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={deletingId === s.id} onClick={() => handleDelete(s.id)}>
                      {deletingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-destructive" />}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
