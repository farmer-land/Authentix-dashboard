'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ALL_FEATURES, FEATURE_LABELS } from '@/lib/feature-flags';
import type { OrgFeature } from '@/lib/feature-flags';
import type { AdminOrg } from '@/lib/api/admin';
import { ShieldCheck, Search, ChevronDown, ChevronUp, Check, Loader2, Building2 } from 'lucide-react';
import { useUserProfile } from '@/lib/hooks/queries/users';

// ── Product-owner guard ───────────────────────────────────────────────────────
const PRODUCT_OWNER_DOMAINS = ['xencus.com', 'yhills.com'] as const;
function isProductOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return (PRODUCT_OWNER_DOMAINS as readonly string[]).includes(domain);
}

// ── Feature toggle row ────────────────────────────────────────────────────────
function FeatureToggle({
  feature,
  enabled,
  onChange,
  disabled,
}: {
  feature: OrgFeature;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled: boolean;
}) {
  const meta = FEATURE_LABELS[feature];
  return (
    <div className="flex items-center justify-between py-2.5 gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{meta.label}</span>
          {meta.future && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 border border-border rounded px-1">
              soon
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-40 ${
          enabled ? 'bg-primary' : 'bg-muted-foreground/20'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ── Org feature panel ─────────────────────────────────────────────────────────
function OrgFeaturePanel({ org }: { org: AdminOrg }) {
  const [open, setOpen] = useState(false);
  const [features, setFeatures] = useState<string[]>(org.features);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (flag: OrgFeature, on: boolean) => {
    setFeatures(prev => on ? [...prev, flag] : prev.filter(f => f !== flag));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.admin.updateOrgFeatures(org.id, features);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const statusColor: Record<string, string> = {
    trialing: 'bg-brand-500',
    active: 'bg-emerald-500',
    overdue: 'bg-red-500',
    locked: 'bg-red-600',
    hibernating: 'bg-sky-400',
  };

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{org.name}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor[org.billing_status] ?? 'bg-emerald-500'}`} />
            </div>
            <p className="text-xs text-muted-foreground truncate">{org.email ?? org.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex flex-wrap gap-1 justify-end max-w-48">
            {features.slice(0, 4).map(f => (
              <span key={f} className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">
                {FEATURE_LABELS[f as OrgFeature]?.label ?? f}
              </span>
            ))}
            {features.length > 4 && (
              <span className="text-[10px] text-muted-foreground">+{features.length - 4}</span>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Feature toggles */}
      {open && (
        <div className="border-t px-5 py-4">
          <div className="divide-y divide-border/50">
            {ALL_FEATURES.map(flag => (
              <FeatureToggle
                key={flag}
                feature={flag}
                enabled={features.includes(flag)}
                onChange={(on) => toggle(flag, on)}
                disabled={saving}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                saved
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
              ) : saved ? (
                <><Check className="w-3.5 h-3.5" />Saved</>
              ) : (
                'Save flags'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { profile } = useUserProfile();
  const [search, setSearch] = useState('');

  const isOwner = isProductOwnerEmail((profile as { email?: string } | null)?.email);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: () => api.admin.listOrganizations(),
    enabled: isOwner,
    staleTime: 30_000,
  });

  const filtered = orgs.filter(o =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) || (o.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (!isOwner) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-semibold text-destructive">Access restricted</p>
        <p className="text-sm text-muted-foreground mt-1">Product-owner accounts only.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Organisations</h1>
          <p className="text-xs text-muted-foreground">Manage feature flags per organisation</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search organisations…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Org list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12 text-sm">
          {search ? 'No organisations match your search.' : 'No organisations found.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(org => (
            <OrgFeaturePanel key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}
