'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useBillingOverview } from '@/lib/hooks/queries/billing';
import { useOrganization } from '@/lib/hooks/queries/organizations';
import { getOrganizationLogoUrl } from '@/lib/utils/organization-logo';
import { InvoiceList } from './components/invoice-list';
import { preloadRazorpay } from '@/lib/razorpay';
import { PayNowButton } from './components/pay-now-button';
import {
  Zap, TrendingUp, Receipt, Info, Mail, Users,
  HardDrive, CheckCircle2, AlertTriangle, Lock,
  Building2, X, Check, Minus, ChevronRight, Moon, Sliders,
  Trash2, ShieldAlert,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useUserProfile } from '@/lib/hooks/queries/users';
import type { CurrentUsage, BillingProfile, OrgBilling, BillingCaps, InvoiceEntity } from '@/lib/billing-ui/types';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ── Product-owner detection (client-side, mirrors DashboardShell) ─────────────
const PRODUCT_OWNER_DOMAINS = ['xencus.com', 'yhills.com'] as const;
function isProductOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return (PRODUCT_OWNER_DOMAINS as readonly string[]).includes(domain);
}

// ── Feature flag ─────────────────────────────────────────────────────────────
// Set NEXT_PUBLIC_ENABLE_RAZORPAY_BILLING=true in env when Razorpay is ready.
const RAZORPAY_ENABLED = process.env.NEXT_PUBLIC_ENABLE_RAZORPAY_BILLING === 'true';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Plan config ───────────────────────────────────────────────────────────────
const PLAN_CONFIG: Record<string, {
  gradient: string; badge: string; badgeText: string; tagline: string;
} | undefined> = {
  Seed:  {
    gradient: 'from-slate-500/10 via-slate-400/5 to-transparent',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    badgeText: 'Seed',
    tagline: 'Partner account — complimentary access',
  },
  Farm:  {
    gradient: 'from-emerald-500/12 via-emerald-400/5 to-transparent',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    badgeText: 'Farm',
    tagline: '200 certs/month · email campaigns · automations',
  },
  Aura:  {
    gradient: 'from-violet-500/12 via-violet-400/5 to-transparent',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    badgeText: 'Aura',
    tagline: '2,000 certs/month · full segmentation · AI generation',
  },
  Flex:  {
    gradient: 'from-brand-500/12 via-brand-400/5 to-transparent',
    badge: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    badgeText: 'Flex',
    tagline: 'Unlimited certs · all channels · multi-team',
  },
};

// ── Plan features data ────────────────────────────────────────────────────────
type PlanKey = 'Seed' | 'Farm' | 'Aura' | 'Flex';

interface FeatureRow {
  category: string;
  feature: string;
  seed: string | boolean;
  farm: string | boolean;
  aura: string | boolean;
  flex: string | boolean;
  highlight?: boolean;
}

const PLAN_FEATURES: FeatureRow[] = [
  // Certificates
  { category: 'Certificates', feature: 'Monthly certificates included', seed: '25', farm: '200', aura: '2,000', flex: 'Unlimited', highlight: true },
  { category: 'Certificates', feature: 'Extra certs (pay-as-you-go)', seed: false, farm: '₹10/cert', aura: '₹8/cert', flex: '₹5/cert' },
  { category: 'Certificates', feature: 'Bulk generation', seed: false, farm: true, aura: true, flex: true },
  { category: 'Certificates', feature: 'QR code on certificate', seed: true, farm: true, aura: true, flex: true },
  { category: 'Certificates', feature: 'Certificate number format', seed: 'Default', farm: 'Custom', aura: 'Custom', flex: 'Custom' },
  // Data Retention & Archive
  { category: 'Data & Retention', feature: 'Certificate QR verification', seed: 'Forever', farm: 'Forever', aura: 'Forever', flex: 'Forever', highlight: true },
  { category: 'Data & Retention', feature: 'Permanent cert archive fee', seed: '₹1/cert (one-time)', farm: '₹1/cert (one-time)', aura: '₹1/cert (one-time)', flex: '₹1/cert (one-time)' },
  { category: 'Data & Retention', feature: 'Recipient data retention', seed: '90 days', farm: '3 years', aura: '7 years', flex: '7 years' },
  { category: 'Data & Retention', feature: 'Legal / govt doc hold (challan)', seed: false, farm: '7 years', aura: '7 years', flex: '7 years' },
  { category: 'Data & Retention', feature: 'Certificate valid after org closes', seed: true, farm: true, aura: true, flex: true },
  { category: 'Data & Retention', feature: 'Export your data anytime', seed: true, farm: true, aura: true, flex: true },
  { category: 'Data & Retention', feature: 'Auto-purge personal data on schedule', seed: true, farm: true, aura: true, flex: true },
  // Contacts & Segments
  { category: 'Contacts', feature: 'Contacts included', seed: '500', farm: '3,000', aura: '25,000', flex: 'Unlimited' },
  { category: 'Contacts', feature: 'Extra contacts (per 1,000)', seed: false, farm: '₹20/1k', aura: '₹15/1k', flex: '₹10/1k' },
  { category: 'Contacts', feature: 'CSV import', seed: true, farm: true, aura: true, flex: true },
  { category: 'Contacts', feature: 'Segments & filters', seed: false, farm: true, aura: true, flex: true },
  // Campaigns & Email
  { category: 'Email Campaigns', feature: 'Email campaigns', seed: false, farm: true, aura: true, flex: true },
  { category: 'Email Campaigns', feature: 'Free campaign emails/month', seed: false, farm: '2,000', aura: '2,000', flex: '2,000' },
  { category: 'Email Campaigns', feature: 'Extra campaign emails', seed: false, farm: '₹0.20/email', aura: '₹0.20/email', flex: '₹0.20/email' },
  { category: 'Email Campaigns', feature: 'Custom sender domain', seed: false, farm: true, aura: true, flex: true },
  // Automations
  { category: 'Automations', feature: 'Automation workflows', seed: false, farm: true, aura: true, flex: true },
  { category: 'Automations', feature: 'Trigger-based rules', seed: false, farm: true, aura: true, flex: true },
  // Storage & Team
  { category: 'Storage & Team', feature: 'Storage included', seed: '1 GB', farm: '10 GB', aura: '100 GB', flex: '500 GB' },
  { category: 'Storage & Team', feature: 'Extra storage (per 10 GB)', seed: false, farm: '₹50/10GB', aura: '₹40/10GB', flex: '₹30/10GB' },
  { category: 'Storage & Team', feature: 'Team members', seed: '1', farm: '5', aura: '20', flex: 'Unlimited' },
  // Branding
  { category: 'Branding', feature: 'White-label certificates', seed: false, farm: true, aura: true, flex: true },
  { category: 'Branding', feature: 'Remove Authentix branding', seed: false, farm: true, aura: true, flex: true },
  { category: 'Branding', feature: 'Custom verification domain', seed: false, farm: '₹499/mo add-on', aura: '₹499/mo add-on', flex: '₹499/mo add-on' },
  // Billing
  { category: 'Billing', feature: 'Monthly platform fee', seed: '₹0', farm: '₹499', aura: '₹1,999', flex: '₹7,999', highlight: true },
  { category: 'Billing', feature: 'Per-certificate fee', seed: '₹10', farm: '₹10', aura: '₹8', flex: '₹5' },
  { category: 'Billing', feature: 'GST (mandatory, Govt. of India)', seed: '18% extra', farm: '18% extra', aura: '18% extra', flex: '18% extra', highlight: true },
  { category: 'Billing', feature: 'Certificate credits (one-time packs)', seed: false, farm: true, aura: true, flex: true },
];

const PLAN_KEYS: PlanKey[] = ['Seed', 'Farm', 'Aura', 'Flex'];

const PLAN_COLORS: Record<PlanKey, { header: string; active: string; dot: string }> = {
  Seed: { header: 'text-slate-600 dark:text-slate-300', active: 'bg-slate-100 dark:bg-slate-800/60', dot: 'bg-slate-400' },
  Farm: { header: 'text-emerald-700 dark:text-emerald-400', active: 'bg-emerald-50 dark:bg-emerald-900/20', dot: 'bg-emerald-500' },
  Aura: { header: 'text-violet-700 dark:text-violet-400', active: 'bg-violet-50 dark:bg-violet-900/20', dot: 'bg-violet-500' },
  Flex: { header: 'text-brand-600 dark:text-brand-400', active: 'bg-brand-500/8 dark:bg-brand-500/10', dot: 'bg-brand-500' },
};

function CellValue({ val, planKey, activePlan }: { val: string | boolean; planKey: PlanKey; activePlan: string }) {
  const isActive = planKey === activePlan;
  if (val === true) return <Check className={`w-4 h-4 mx-auto ${isActive ? PLAN_COLORS[planKey].header : 'text-emerald-500'}`} />;
  if (val === false) return <Minus className="w-4 h-4 mx-auto text-muted-foreground/30" />;
  return (
    <span className={`text-xs font-medium tabular-nums ${isActive ? PLAN_COLORS[planKey].header : 'text-foreground/80'}`}>
      {val}
    </span>
  );
}

function PlanFeaturesModal({ open, onClose, activePlan }: { open: boolean; onClose: () => void; activePlan: string }) {
  const categories = [...new Set(PLAN_FEATURES.map(f => f.category))];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-4xl max-h-[88vh] p-0 gap-0 flex flex-col rounded-3xl bg-card overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-7 pt-6 pb-5 border-b border-border/60 shrink-0">
          <div>
            <DialogTitle className="text-xl font-bold tracking-tight">Plan comparison</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-0.5">
              Your current plan is highlighted —{' '}
              <span className={`font-semibold ${PLAN_COLORS[activePlan as PlanKey]?.header ?? ''}`}>{activePlan}</span>
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              className="rounded-xl p-2 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </DialogClose>
        </div>

        {/* Scrollable table area */}
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[560px] text-sm">
            {/* Sticky plan header row */}
            <thead className="sticky top-0 z-10 bg-card border-b border-border/60">
              <tr>
                <th className="text-left py-4 px-6 font-medium text-muted-foreground w-[200px]">Feature</th>
                {PLAN_KEYS.map(pk => {
                  const isActive = pk === activePlan;
                  const col = PLAN_COLORS[pk];
                  return (
                    <th key={pk} className={`text-center py-4 px-3 font-bold ${col.header} ${isActive ? col.active : ''} transition-colors`}>
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                          <span>{pk}</span>
                        </div>
                        {isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                            Your plan
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {categories.map((category, _ci) => {
                const rows = PLAN_FEATURES.filter(f => f.category === category);
                return rows.map((row, ri) => {
                  const isFirstInCat = ri === 0;
                  return (
                    <tr
                      key={`${category}-${row.feature}`}
                      className={`border-b border-border/30 last:border-0 transition-colors ${row.highlight ? 'bg-muted/30' : 'hover:bg-muted/20'}`}
                    >
                      <td className="py-3 pl-6 pr-3 align-middle">
                        {isFirstInCat && (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1 -mt-0.5">
                            {category}
                          </p>
                        )}
                        <span className={`text-sm ${row.highlight ? 'font-semibold' : 'text-foreground/80'}`}>
                          {row.feature}
                        </span>
                      </td>
                      {PLAN_KEYS.map(pk => {
                        const isActive = pk === activePlan;
                        const col = PLAN_COLORS[pk];
                        return (
                          <td
                            key={pk}
                            className={`py-3 px-3 text-center align-middle ${isActive ? col.active : ''}`}
                          >
                            <CellValue val={row[pk.toLowerCase() as 'seed' | 'farm' | 'aura' | 'flex']} planKey={pk} activePlan={activePlan} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-7 py-4 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            All prices excl. GST (18% GST added as per Govt. of India mandate) · Overage billed monthly · Prices auto-update from DB
          </p>
          <DialogClose asChild>
            <button className="shrink-0 text-xs font-medium px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Got it
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { organization } = useOrganization();
  const { overview, loading, error, refresh } = useBillingOverview();
  const { profile } = useUserProfile();
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [capsOpen, setCapsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => { if (RAZORPAY_ENABLED) preloadRazorpay(); }, []);

  const org = organization as unknown as {
    id: string; name: string; slug: string; email?: string; phone?: string;
    logo_url?: string | null;
  } | undefined;

  const logoUrl = getOrganizationLogoUrl(org);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-16 animate-pulse">
        <div className="h-44 rounded-3xl bg-muted" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-muted" />)}
        </div>
        <div className="h-72 rounded-3xl bg-muted" />
        <div className="h-48 rounded-3xl bg-muted" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <p className="font-semibold text-destructive">Failed to load billing</p>
        <p className="text-sm text-muted-foreground mt-1">{error ?? 'Please refresh the page.'}</p>
      </div>
    );
  }

  const { org_billing, current_usage, billing_profile, recent_invoices, total_outstanding } = overview;
  // Defensive defaults — old backend may not return these fields yet
  const billing_caps: BillingCaps = overview.billing_caps ?? { cert_cap_monthly: 200, contact_cap: 3000, auto_topup_certs: false, topup_block_size: 100 };

  const isTrialing    = org_billing.billing_status === 'trialing';
  const isOverdue     = org_billing.billing_status === 'overdue';
  const isLocked      = org_billing.billing_status === 'locked';
  const isHibernating = org_billing.billing_status === 'hibernating';

  // Product-owner detection: client-side email domain check (primary, same as DashboardShell).
  // Does NOT rely on API is_product_owner flag — avoids DB/RLS fragility.
  const isProductOwner  = isProductOwnerEmail((profile as { email?: string } | null)?.email) || overview.is_product_owner;
  const isSeedFree      = !isProductOwner && billing_profile.plan_name === 'Seed' && !isTrialing;
  const isComplimentary = isProductOwner || isSeedFree;

  const planName   = billing_profile.plan_name ?? 'Flex';
  const planConfig = PLAN_CONFIG[planName] ?? PLAN_CONFIG['Flex']!;

  const billFree       = (isTrialing && current_usage.certificate_count <= org_billing.trial_free_certificates_limit) || isHibernating;
  const trialCertsLeft = Math.max(0, org_billing.trial_free_certificates_limit - org_billing.trial_free_certificates_used);
  const pendingInvoice = recent_invoices.find(inv => inv.payable && inv.amount_due_paise > 0);

  // ── Product-owner: clean monitoring view, no billing UI ──────────────────
  if (isProductOwner) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-16">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border bg-card bg-linear-to-br from-violet-500/8 via-violet-400/4 to-transparent p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {logoUrl ? (
                  <div className="w-14 h-14 rounded-2xl border bg-background shadow-sm overflow-hidden flex items-center justify-center">
                    <Image src={logoUrl} alt={org?.name ?? ''} width={56} height={56} className="object-contain" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl border bg-muted flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    Internal
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight">{org?.name ?? 'Monitoring'}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Product account — usage monitoring only</p>
              </div>
            </div>
            <div className="shrink-0 opacity-60">
              <Image src="/brand/authentix-24-24.svg" alt="Authentix" width={28} height={28} />
            </div>
          </div>
        </div>

        {/* Usage stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric
            icon={<Zap className="w-4 h-4" />}
            label="Certificates"
            value={String(current_usage.certificate_count)}
            sub="issued this month"
            color="default"
          />
          <Metric
            icon={<Mail className="w-4 h-4" />}
            label="Campaign emails"
            value={String(current_usage.broadcast_email_count ?? 0)}
            sub="sent this month"
            color="default"
          />
          <Metric
            icon={<HardDrive className="w-4 h-4" />}
            label="Account status"
            value={org_billing.billing_status === 'trialing' ? 'Trial' : 'Active'}
            sub="No charges apply"
            color="default"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-16">
      <PlanFeaturesModal open={planModalOpen} onClose={() => setPlanModalOpen(false)} activePlan={planName} />

      {/* ── Plan hero card ────────────────────────────────────────────────── */}
      <div className={`relative overflow-hidden rounded-3xl border bg-card bg-linear-to-br ${planConfig.gradient} p-7`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Org logo */}
            <div className="relative shrink-0">
              {logoUrl ? (
                <div className="w-14 h-14 rounded-2xl border bg-background shadow-sm overflow-hidden flex items-center justify-center">
                  <Image src={logoUrl} alt={org?.name ?? ''} width={56} height={56} className="object-contain" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-2xl border bg-muted flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-muted-foreground/40" />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${planConfig.badge}`}>
                  {planConfig.badgeText}
                </span>
                <StatusDot status={isComplimentary ? 'active' : org_billing.billing_status} />
              </div>
              <h1 className="text-xl font-bold tracking-tight">{org?.name ?? 'Billing'}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs text-muted-foreground">{planConfig.tagline}</p>
                <button
                  onClick={() => setPlanModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-colors group"
                >
                  <Info className="w-3 h-3" />
                  <span className="group-hover:underline underline-offset-2">What's included</span>
                  <ChevronRight className="w-3 h-3 opacity-50" />
                </button>
              </div>
            </div>
          </div>

          {/* Authentix logo — top right */}
          <div className="shrink-0 opacity-60">
            <Image src="/brand/authentix-24-24.svg" alt="Authentix" width={28} height={28} />
          </div>
        </div>

        {/* Banners inside hero */}
        {isTrialing && (
          <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-brand-600">Free Trial</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {trialCertsLeft} of {org_billing.trial_free_certificates_limit} free certs remaining
                {org_billing.trial_ends_at && ` · Expires ${fmtDate(org_billing.trial_ends_at)}`}
              </p>
            </div>
            <div className="shrink-0">
              <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.min(100, Math.round((org_billing.trial_free_certificates_used / org_billing.trial_free_certificates_limit) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {isHibernating && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 px-4 py-3">
            <Moon className="w-4 h-4 text-sky-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">Account hibernating — no charges</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inactive since {org_billing.hibernated_since ? fmtDate(org_billing.hibernated_since) : '—'}.
                Billing resumes when you next generate a certificate or send a campaign.
              </p>
            </div>
          </div>
        )}
        {isOverdue && (
          <AlertBar icon={<AlertTriangle className="w-4 h-4 shrink-0" />} color="red">
            Payment overdue — pay now to avoid service interruption.
          </AlertBar>
        )}
        {isLocked && (
          <AlertBar icon={<Lock className="w-4 h-4 shrink-0" />} color="red">
            Account locked. Contact{' '}
            <a href="mailto:billing@digicertificates.in" className="underline font-medium">
              billing@digicertificates.in
            </a>
          </AlertBar>
        )}
        {isSeedFree && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              Complimentary access — no billing applies to this account.
            </p>
          </div>
        )}
      </div>

      {/* ── Metric cards ────────────────────────────────────────────────────── */}
      <div className={`grid gap-3 ${isComplimentary ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
        <Metric
          icon={<Zap className="w-4 h-4" />}
          label="Certificates"
          value={String(current_usage.certificate_count)}
          sub={isComplimentary ? 'issued this month' : isTrialing ? `${trialCertsLeft} free left` : `× ${fmt(billing_profile.certificate_unit_price)}`}
          color="default"
        />
        {!isComplimentary && (
          <Metric
            icon={<TrendingUp className="w-4 h-4" />}
            label="Est. this period"
            value={billFree ? '₹0' : fmt(current_usage.estimated_total)}
            sub={billFree ? 'Trial covers this' : `Incl. ${current_usage.gst_rate}% GST`}
            color={!billFree && current_usage.estimated_total > 0 ? 'brand' : 'default'}
          />
        )}
        {!isComplimentary && (
          <Metric
            icon={<Receipt className="w-4 h-4" />}
            label="Outstanding"
            value={total_outstanding > 0 ? fmt(total_outstanding) : '₹0'}
            sub={total_outstanding > 0 ? 'Pending payment' : 'All clear'}
            color={total_outstanding > 0 ? 'red' : 'default'}
          />
        )}
        <Metric
          icon={<Users className="w-4 h-4" />}
          label="Plan"
          value={planName}
          sub={isSeedFree ? 'Partner access' : isTrialing ? 'Pay-as-you-go' : 'Active'}
          color="default"
        />
      </div>

      {/* ── Usage/billing breakdown ──────────────────────────────────────────── */}
      <UsageBreakdown
        usage={current_usage}
        billingProfile={billing_profile}
        isTrialing={isTrialing}
        orgBilling={org_billing}
        billFree={billFree}
        isComplimentary={isComplimentary}
      />

      {/* ── Payment section (hidden for complimentary) ─────────────────────── */}
      {!isComplimentary && !billFree && (pendingInvoice || current_usage.estimated_total > 0) && (
        RAZORPAY_ENABLED
          ? (
            <PayCard
              pendingInvoice={pendingInvoice}
              estimatedTotal={current_usage.estimated_total}
              certCount={current_usage.certificate_count}
              emailCount={current_usage.broadcast_email_count ?? 0}
              orgName={org?.name}
              orgEmail={org?.email}
              onSuccess={refresh}
            />
          )
          : (
            <ManualPayCard
              pendingInvoice={pendingInvoice}
              estimatedTotal={current_usage.estimated_total}
            />
          )
      )}

      {/* ── Invoice history (visible for product owners + paying clients) ─────── */}
      {!isComplimentary && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Invoice History</h2>
            <span className="text-xs text-muted-foreground">
              {recent_invoices.length} invoice{recent_invoices.length !== 1 ? 's' : ''}
            </span>
          </div>
          <InvoiceList
            organizationId={org?.id ?? ''}
            orgName={org?.name}
            orgEmail={org?.email}
          />
        </div>
      )}

      {/* ── Billing caps (cert generation limit) ─────────────────────────────── */}
      {!isComplimentary && (
        <>
          <BillingCapsPanel
            caps={billing_caps}
            certUsed={current_usage.certificate_count}
            open={capsOpen}
            onToggle={() => setCapsOpen(v => !v)}
            onSave={async (c) => { await api.billing.updateCaps(c); refresh(); }}
          />
        </>
      )}

      {/* ── Account deletion ─────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-destructive/20 bg-card overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-destructive">Delete Account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Data retained per legal schedule. Certificate QR links remain active forever.
            </p>
          </div>
          <button
            onClick={() => setDeleteOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-destructive border border-destructive/30 hover:bg-destructive/5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Request deletion
          </button>
        </div>
      </div>

      {deleteOpen && (
        <DeleteAccountDialog
          orgName={org?.name ?? 'this organisation'}
          totalOutstanding={total_outstanding}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await api.billing.requestAccountDeletion();
            setDeleteOpen(false);
          }}
        />
      )}

    </div>
  );
}

// ── StatusDot ────────────────────────────────────────────────────────────────
const STATUS_DOT: Record<string, { dot: string; label: string; text: string }> = {
  trialing: { dot: 'bg-brand-500',   label: 'Trial',    text: 'text-brand-600' },
  active:   { dot: 'bg-emerald-500', label: 'Active',   text: 'text-emerald-600' },
  overdue:  { dot: 'bg-red-500',     label: 'Overdue',  text: 'text-red-500' },
  locked:   { dot: 'bg-red-600',     label: 'Locked',   text: 'text-red-600' },
  past_due: { dot: 'bg-orange-500',  label: 'Past due', text: 'text-orange-500' },
};
const FALLBACK_DOT = { dot: 'bg-emerald-500', label: 'Active', text: 'text-emerald-600' };

function StatusDot({ status }: { status: string }) {
  const s = STATUS_DOT[status] ?? FALLBACK_DOT;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </span>
  );
}

// ── AlertBar ─────────────────────────────────────────────────────────────────
function AlertBar({ icon, color, children }: { icon: React.ReactNode; color: 'red' | 'yellow'; children: React.ReactNode }) {
  const cls = color === 'red'
    ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
    : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400';
  return (
    <div className={`mt-4 flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

// ── Metric ───────────────────────────────────────────────────────────────────
function Metric({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  color: 'default' | 'brand' | 'red';
}) {
  const val = { default: 'text-foreground',      brand: 'text-brand-500',  red: 'text-red-500' };
  const ico = { default: 'text-muted-foreground', brand: 'text-brand-500',  red: 'text-red-500' };
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-2.5">
      <div className={`flex items-center gap-1.5 ${ico[color]}`}>
        {icon}
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${val[color]}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── UsageBreakdown ────────────────────────────────────────────────────────────
function UsageBreakdown({ usage, billingProfile, isTrialing, orgBilling, billFree, isComplimentary }: {
  usage: CurrentUsage; billingProfile: BillingProfile;
  isTrialing: boolean; orgBilling: OrgBilling; billFree: boolean;
  isComplimentary: boolean;
}) {
  const certsAboveTrial = isTrialing
    ? Math.max(0, usage.certificate_count - orgBilling.trial_free_certificates_limit)
    : usage.certificate_count;
  const gstInclusive = billingProfile.gst_inclusive ?? true;

  // Product-owner / complimentary view — show counts only, no pricing
  if (isComplimentary) {
    return (
      <div className="rounded-3xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Usage this month</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tracking only — no charges apply to this account
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-brand-500">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            Live
          </span>
        </div>
        <div className="px-6 py-5 divide-y divide-border/40">
          <Row label="Certificates issued" value={String(usage.certificate_count)} sub="This calendar month" />
          {(usage.broadcast_email_count ?? 0) > 0 && (
            <Row label="Campaign emails sent" value={String(usage.broadcast_email_count)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Current Period</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {billingProfile.plan_name} · Pay only for what you use
            {gstInclusive && <span className="opacity-60"> · All prices incl. GST</span>}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-brand-500">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
          Live
        </span>
      </div>

      <div className="px-6 py-5 divide-y divide-border/40 space-y-0">
        {billingProfile.platform_fee_amount > 0 && (
          <Row
            label="Platform fee"
            value={isTrialing ? '₹0' : usage.certificate_count === 0 ? '₹0' : fmt(usage.platform_fee)}
            sub={isTrialing
              ? `Waived during trial (${fmt(billingProfile.platform_fee_amount)}/mo)`
              : usage.certificate_count === 0
                ? `${fmt(billingProfile.platform_fee_amount)}/month — charged on first cert`
                : `1 × ${fmt(billingProfile.platform_fee_amount)}`}
            muted={isTrialing || usage.certificate_count === 0}
          />
        )}

        <Row
          label="Certificates issued"
          value={isTrialing && certsAboveTrial === 0 ? '₹0' : fmt(usage.usage_cost)}
          sub={isTrialing && certsAboveTrial === 0
            ? `${usage.certificate_count} cert${usage.certificate_count !== 1 ? 's' : ''} — covered by trial`
            : `${isTrialing ? certsAboveTrial : usage.certificate_count} × ${fmt(billingProfile.certificate_unit_price)}`}
          muted={isTrialing && certsAboveTrial === 0}
        />

        {(usage.broadcast_email_count ?? 0) > 0 && (
          <Row
            label="Campaign emails"
            value={fmt(usage.broadcast_email_cost)}
            sub={`${usage.broadcast_email_count?.toLocaleString('en-IN')} × ${fmt(billingProfile.broadcast_email_unit_price)}`}
          />
        )}

        <div className="pt-4 space-y-1.5">
          <Row label="Subtotal (excl. GST)" value={billFree ? '₹0' : fmt(usage.subtotal)} muted />
          <Row
            label={gstInclusive ? `GST ${usage.gst_rate}% (included in prices)` : `GST @ ${usage.gst_rate}%`}
            value={billFree ? '₹0' : fmt(usage.gst_amount)}
            muted
          />
        </div>

        <div className="flex items-center justify-between pt-5">
          <div>
            <p className="font-semibold">Total estimate</p>
            <p className="text-xs text-muted-foreground mt-0.5">Updates live as you use the platform</p>
          </div>
          <p className={`text-3xl font-bold tabular-nums ${billFree ? 'text-brand-500' : 'text-foreground'}`}>
            {billFree ? '₹0' : fmt(usage.estimated_total)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub, muted }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between py-3 gap-4">
      <div className="min-w-0">
        <p className={`text-sm ${muted ? 'text-muted-foreground' : ''}`}>{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-medium tabular-nums shrink-0 ${muted ? 'text-muted-foreground' : ''}`}>{value}</span>
    </div>
  );
}

// ── ManualPayCard ─────────────────────────────────────────────────────────────
// Shown when RAZORPAY_ENABLED = false. Replace bank details as needed.
function ManualPayCard({ pendingInvoice, estimatedTotal }: {
  pendingInvoice?: InvoiceEntity; estimatedTotal: number;
}) {
  const amount = pendingInvoice ? pendingInvoice.amount_due_paise / 100 : estimatedTotal;
  const hasInvoice = !!pendingInvoice;

  return (
    <div className="rounded-3xl border bg-card overflow-hidden">
      <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">
            {hasInvoice ? `Invoice ${pendingInvoice!.invoice_number}` : 'Amount due this period'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pay via bank transfer or UPI — confirmed within 24 hours
          </p>
        </div>
        <p className="text-3xl font-bold tabular-nums shrink-0">{fmt(amount)}</p>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <PayDetail label="UPI ID" value="billing@digicertificates" />
          <PayDetail label="Account" value="XXXX XXXX XXXX" />
          <PayDetail label="IFSC" value="XXXX0000000" />
        </div>

        <div className="flex items-center gap-2.5 rounded-2xl bg-muted/50 border border-border/60 px-4 py-3">
          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            After paying, email your receipt to{' '}
            <a href="mailto:billing@digicertificates.in" className="font-medium text-foreground hover:text-brand-500 transition-colors">
              billing@digicertificates.in
            </a>
            {' '}and we'll mark your invoice paid within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}

function PayDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 border border-border/60 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ── PayCard (Razorpay — shown only when RAZORPAY_ENABLED=true) ───────────────
function PayCard({ pendingInvoice, estimatedTotal, certCount, emailCount, orgName, orgEmail, onSuccess }: {
  pendingInvoice?: InvoiceEntity; estimatedTotal: number;
  certCount: number; emailCount: number;
  orgName?: string; orgEmail?: string; onSuccess?: () => void;
}) {
  const hasOutstanding = !!pendingInvoice;
  const amount = hasOutstanding ? pendingInvoice!.amount_due_paise / 100 : estimatedTotal;

  return (
    <div className="rounded-3xl border bg-card overflow-hidden">
      <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">
            {hasOutstanding ? 'Amount outstanding' : 'Pay current period'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasOutstanding
              ? `Invoice ${pendingInvoice!.invoice_number} · Resets billing period on payment`
              : 'Invoice generated immediately on payment'}
          </p>
        </div>
        <p className="text-3xl font-bold tabular-nums shrink-0">{fmt(amount)}</p>
      </div>
      <div className="px-6 py-5">
        <PayNowButton
          amount={amount}
          invoiceId={pendingInvoice?.id}
          invoiceNumber={pendingInvoice?.invoice_number}
          certCount={certCount}
          emailCount={emailCount}
          orgName={orgName}
          orgEmail={orgEmail}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}

// ── BillingCapsPanel ─────────────────────────────────────────────────────────
function BillingCapsPanel({
  caps, certUsed, open, onToggle, onSave,
}: {
  caps: BillingCaps;
  certUsed: number;
  open: boolean;
  onToggle: () => void;
  onSave: (c: Partial<BillingCaps>) => Promise<void>;
}) {
  const [cap, setCap] = useState(caps.cert_cap_monthly);
  const [autoTopup, setAutoTopup] = useState(caps.auto_topup_certs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const unlimited = cap === 0;
  const pct = Math.min(100, !unlimited && cap > 0 ? Math.round((certUsed / cap) * 100) : certUsed > 0 ? 5 : 0);
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-brand-500';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ cert_cap_monthly: cap, auto_topup_certs: autoTopup });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-3xl border bg-card overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full px-6 py-5 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-muted/60">
            <Sliders className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-sm">Usage Limits</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unlimited ? 'Unlimited certs' : `Cap: ${cap.toLocaleString()} certs/month`}
              {' · '}{certUsed.toLocaleString()} used this month
            </p>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-6 pb-6 pt-1 border-t border-border/40 space-y-6">

          {/* Usage bar */}
          <div className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Certificates this month</span>
              <span className="text-xs font-mono tabular-nums">
                <span className="text-foreground font-semibold">{certUsed.toLocaleString()}</span>
                <span className="text-muted-foreground">
                  {unlimited ? ' issued' : ` / ${cap.toLocaleString()}`}
                </span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${Math.max(pct, certUsed > 0 ? 2 : 0)}%` }}
              />
            </div>
            {!unlimited && pct >= 80 && (
              <p className="text-[11px] text-amber-500 mt-1.5">
                {pct >= 100 ? 'Cap reached — generation paused.' : `${100 - pct}% of cap remaining.`}
              </p>
            )}
          </div>

          {/* Cap control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Monthly certificate cap</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Unlimited</span>
                <button
                  onClick={() => setCap(v => v === 0 ? 200 : 0)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${unlimited ? 'bg-brand-500' : 'bg-border'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${unlimited ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {!unlimited && (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={5000}
                  step={10}
                  value={cap}
                  onChange={e => setCap(Number(e.target.value))}
                  className="flex-1 h-1.5 rounded-full appearance-none bg-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:cursor-pointer accent-brand-500"
                />
                <input
                  type="number"
                  min={1}
                  max={99999}
                  value={cap}
                  onChange={e => setCap(Math.max(1, Number(e.target.value)))}
                  className="w-20 rounded-xl border border-border/60 bg-muted/40 px-3 py-1.5 text-sm text-right tabular-nums font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {unlimited ? 'No limit — generate as many certs as your plan allows.' : 'Generation pauses when this limit is reached.'}
            </p>
          </div>

          {/* Auto top-up */}
          {!unlimited && (
            <div
              onClick={() => setAutoTopup(v => !v)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 cursor-pointer transition-colors ${autoTopup ? 'border-brand-500/30 bg-brand-500/5' : 'border-border/60 bg-muted/20'}`}
            >
              <div>
                <p className="text-sm font-medium">Auto top-up</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Buy {caps.topup_block_size} extra certs automatically when cap is hit
                </p>
              </div>
              <div className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${autoTopup ? 'bg-brand-500' : 'bg-border'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${autoTopup ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-2.5 rounded-2xl text-sm font-semibold transition-all ${
              saved
                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                : 'bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50'
            }`}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save limits'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── DeleteAccountDialog ──────────────────────────────────────────────────────
function DeleteAccountDialog({
  orgName, totalOutstanding, onCancel, onConfirm,
}: {
  orgName: string;
  totalOutstanding: number;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');
  const hasPendingBill = totalOutstanding > 0;
  const confirmed = typed.trim().toLowerCase() === 'delete';

  const handleConfirm = async () => {
    if (!confirmed) return;
    setConfirming(true);
    try { await onConfirm(); }
    finally { setConfirming(false); }
  };

  return (
    <AlertDialog open onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent className="max-w-md p-0 gap-0 rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-3 border-b border-border/40">
          <div className="p-2 rounded-xl bg-destructive/10 shrink-0">
            <ShieldAlert className="w-5 h-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <AlertDialogTitle className="text-base font-semibold">Delete account</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">{orgName}</AlertDialogDescription>
          </div>
          <AlertDialogCancel asChild>
            <button
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
              aria-label="Close delete account dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </AlertDialogCancel>
        </div>

        {/* Blocked — pending balance */}
        {hasPendingBill ? (
          <div className="px-6 py-6 space-y-4">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Outstanding balance — {fmt(totalOutstanding)}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Please clear your outstanding balance before deleting your account.
                Once paid, you can return to request deletion.
              </p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>After deletion:</p>
              <ul className="space-y-0.5 pl-3">
                <li>• All certificate QR links remain active forever</li>
                <li>• Invoice records are retained 7 years (GST Act)</li>
                <li>• Personal data purged after 1 year (DPDPA)</li>
              </ul>
            </div>
            <AlertDialogCancel asChild>
              <button className="w-full py-2.5 rounded-2xl text-sm font-medium border border-border/60 hover:bg-muted/40 transition-colors">
                Close
              </button>
            </AlertDialogCancel>
          </div>

        ) : step === 'warning' ? (
          <div className="px-6 py-5 space-y-4">
            <div className="rounded-2xl bg-muted/40 border border-border/50 p-4 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">What happens when you delete</p>
              <div className="space-y-2 text-xs">
                <div className="flex gap-2.5 items-start">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Certificate QR links stay active <span className="font-semibold text-foreground">forever</span> — students can always verify</span>
                </div>
                <div className="flex gap-2.5 items-start">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">No further charges after deletion</span>
                </div>
                <div className="flex gap-2.5 items-start">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Personal data (names, emails) purged after 1 year — DPDPA 2023</span>
                </div>
                <div className="flex gap-2.5 items-start">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Invoice & payment records kept 7 years — IT Act / GST Act</span>
                </div>
                <div className="flex gap-2.5 items-start">
                  <X className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Dashboard access lost immediately — this cannot be undone</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <AlertDialogCancel asChild>
                <button className="flex-1 py-2.5 rounded-2xl text-sm border border-border/60 hover:bg-muted/40 transition-colors">
                  Cancel
                </button>
              </AlertDialogCancel>
              <button
                onClick={() => setStep('confirm')}
                className="flex-1 py-2.5 rounded-2xl text-sm font-medium bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/15 transition-colors"
              >
                I understand, continue
              </button>
            </div>
          </div>

        ) : (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">delete</span> to confirm.
            </p>
            <input
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && confirmed) void handleConfirm(); }}
              placeholder="delete"
              className="w-full rounded-2xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
            <div className="flex gap-2.5">
              <button onClick={() => setStep('warning')} className="flex-1 py-2.5 rounded-2xl text-sm border border-border/60 hover:bg-muted/40 transition-colors">
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={!confirmed || confirming}
                className="flex-1 py-2.5 rounded-2xl text-sm font-semibold bg-destructive text-white hover:bg-destructive/90 disabled:opacity-40 transition-all"
              >
                {confirming ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
