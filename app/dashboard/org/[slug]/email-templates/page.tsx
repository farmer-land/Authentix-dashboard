"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Mail, Plus, Edit2, Trash2, Loader2, AlertCircle,
  Copy, Sparkles, ChevronLeft, ChevronRight, Clock, CheckCircle2, PenLine, Megaphone,
  Award, CalendarDays, Users, Newspaper, FileText, MoreHorizontal, Send, Download,
} from "lucide-react";

// ── Template purpose inference ─────────────────────────────────────────────────
const CERT_PURPOSE_VARS = new Set(["certificate_number", "cert_number", "certificate_id", "certificate_image_url", "course_name", "issue_date", "expiry_date"]);
function inferPurpose(variables: string[]): "certificate" | "broadcast" {
  return variables.some(v => CERT_PURPOSE_VARS.has(v)) ? "certificate" : "broadcast";
}
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { type DeliveryTemplate } from "@/lib/api/client";
import {
  useDeliveryTemplates,
  useDeliveryIntegrations,
  useCreateDeliveryTemplate,
  useDeleteDeliveryTemplate,
  useDuplicateDeliveryTemplate,
} from "@/lib/hooks/queries/delivery";
import { api } from "@/lib/api/client";
import { useOrg } from "@/lib/org";
import { useOrganization } from "@/lib/hooks/queries/organizations";
import { useRouter, useSearchParams } from "next/navigation";
import { PREDEFINED_TEMPLATES, type PredefinedTemplate } from "./PREDEFINED_TEMPLATES";
import { cn } from "@/lib/utils";

// ── localStorage helpers ───────────────────────────────────────────────────────

function getSavedIds(slug: string): Set<string> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(`et_saved_ids:${slug}`) : null;
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function isTemplateSaved(t: DeliveryTemplate, savedIds: Set<string>): boolean {
  if (savedIds.has(t.id)) return true;
  // Heuristic for pre-existing data: if updated_at is >2 min after created_at, user saved it
  const created = new Date(t.created_at).getTime();
  const updated = new Date(t.updated_at).getTime();
  return (updated - created) > 2 * 60 * 1000;
}

// ── Category filter bar ───────────────────────────────────────────────────────

const CATEGORY_FILTERS = ["All", "Education", "Awards", "Events", "Corporate", "Membership", "General"] as const;
type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

// ── Certificate image options (used in sample chooser preview) ───────────────

const CERT_IMAGES = [
  "/email-templates/certificate-modern.avif",
  "/email-templates/certificate-classic.avif",
  "/email-templates/certificate-elegant.avif",
  "/email-templates/certificate-premium.avif",
];


const BASE_MOCK: Record<string, string> = {
  recipient_name: "Alex Johnson",
  organization_name: "Authentix Academy",
  issue_date: "March 22, 2026",
  course_name: "Advanced React Development",
  event_name: "Annual Tech Summit 2026",
  event_date: "March 22, 2026",
  award_name: "Employee of the Year",
  training_name: "Leadership Excellence Program",
  membership_type: "Gold Member",
  valid_until: "December 31, 2026",
  completion_date: "March 22, 2026",
  // Must be a real URL — a bare "#" truncates the QR API's ?data=# as a URL
  // fragment, leaving the QR empty/broken in previews.
  verification_url: "https://verify.digicertificates.in/sample",
  unsubscribe_url: "#",
};

/**
 * Preview variables — overlay real organization info (name, logo) on top of the
 * mock data so previews reflect the actual org instead of the placeholder academy.
 */
function buildPreviewMock(org?: { name?: string | null; logo_url?: string | null } | null): Record<string, string> {
  return {
    ...BASE_MOCK,
    certificate_image_url: CERT_IMAGES[0]!,
    ...(org?.name ? { organization_name: org.name } : {}),
    ...(org?.logo_url ? { organization_logo: org.logo_url } : {}),
  };
}

// ── SampleChooser ─────────────────────────────────────────────────────────────

function SampleChooser({
  templates,
  purpose,
  onUse,
}: {
  templates: PredefinedTemplate[];
  purpose: "certificate" | "broadcast";
  onUse: (t: PredefinedTemplate) => void;
}) {
  const { organization } = useOrganization();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [activeIdx, setActiveIdx] = useState(0);
  const [certImg, setCertImg] = useState(CERT_IMAGES[0]);
  const [iframeH, setIframeH] = useState(700);

  const purposeFiltered = templates.filter(t => inferPurpose(t.variables) === purpose);
  const filteredTemplates =
    categoryFilter === "All" ? purposeFiltered : purposeFiltered.filter(t => t.category === categoryFilter);

  useEffect(() => { setActiveIdx(0); }, [categoryFilter]);

  const safeIdx = activeIdx < filteredTemplates.length ? activeIdx : 0;
  const activeTemplate = filteredTemplates[safeIdx] ?? filteredTemplates[0];

  const prev = () => setActiveIdx(i => (i - 1 + filteredTemplates.length) % filteredTemplates.length);
  const next = () => setActiveIdx(i => (i + 1) % filteredTemplates.length);

  const mockVars = { ...buildPreviewMock(organization), certificate_image_url: certImg };
  const renderedHtml = activeTemplate
    ? activeTemplate.body.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, key: string) => (mockVars as Record<string, string>)[key.trim()] ?? "")
    : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${origin}/"><style>*{box-sizing:border-box}body{margin:0;padding:0;background:#ffffff}</style></head><body>${renderedHtml}</body></html>`;

  if (purposeFiltered.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-bold tracking-tight">Sample Email Templates</DialogTitle>
          <p className="text-muted-foreground text-sm mt-1">
            {purpose === "broadcast" ? "Broadcast & newsletter templates" : "Certificate delivery templates"}
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="p-4 rounded-full bg-muted">
            <Megaphone className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-semibold">No {purpose} templates yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {purpose === "broadcast"
              ? `No predefined broadcast templates exist yet. Use "Design from Scratch" to create your broadcast email.`
              : "No certificate templates found."}
          </p>
        </div>
      </div>
    );
  }

  if (!activeTemplate) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <p className="text-sm text-muted-foreground">No templates in this category.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b shrink-0">
        <DialogTitle className="text-xl font-bold tracking-tight">
          {purpose === "broadcast" ? "Broadcast Templates" : "Certificate Delivery Templates"}
        </DialogTitle>
        <p className="text-muted-foreground text-sm mt-1">Pick a design, customise it, then send.</p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {CATEGORY_FILTERS.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                categoryFilter === cat
                  ? "bg-[#3ECF8E] text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: preview */}
        <div className="flex flex-col border-r border-border/40" style={{ width: "62%" }}>
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border-b border-border/30">
            <div className="flex gap-1.5 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            </div>
            <div className="flex-1 min-w-0 ml-2">
              <span className="text-xs font-medium">Authentix Academy</span>
              <span className="text-[10px] text-muted-foreground mx-2 opacity-40">·</span>
              <span className="text-[10px] text-muted-foreground truncate">{activeTemplate.email_subject}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-100 flex justify-center py-8 px-6">
            <div style={{ width: 600, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              <iframe
                key={activeTemplate.id + certImg}
                srcDoc={srcDoc}
                style={{ width: 600, height: iframeH, border: "none", display: "block" }}
                onLoad={(e) => {
                  const h = (e.target as HTMLIFrameElement).contentDocument?.body?.scrollHeight;
                  if (h) setIframeH(h + 40);
                }}
                title={`Preview: ${activeTemplate.name}`}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
          <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t bg-background">
            <Button variant="ghost" size="sm" onClick={prev} disabled={filteredTemplates.length <= 1} className="gap-1.5">
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                {filteredTemplates.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveIdx(i)}
                    className={`rounded-full transition-all ${i === safeIdx ? "w-4 h-2 bg-[#3ECF8E]" : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"}`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-1">{safeIdx + 1} / {filteredTemplates.length}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={next} disabled={filteredTemplates.length <= 1} className="gap-1.5">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Right: info + CTA */}
        <div className="flex flex-col overflow-y-auto px-6 py-5 gap-5" style={{ width: "38%" }}>
          <div>
            <Badge
              className="text-[10px] font-semibold text-white border-0 mb-3"
              style={{ backgroundColor: activeTemplate.accentColor }}
            >
              {activeTemplate.category}
            </Badge>
            <h2 className="text-xl font-bold leading-tight mt-1">{activeTemplate.name}</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{activeTemplate.description}</p>
            <p className="text-xs text-muted-foreground/60 mt-1.5 italic">{activeTemplate.layout}</p>
          </div>

          <div className="border-t border-border" />

          {/* Cert image selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Certificate Preview Style</Label>
            <div className="grid grid-cols-2 gap-2">
              {CERT_IMAGES.map((img) => (
                <button
                  key={img}
                  onClick={() => setCertImg(img)}
                  className={`rounded-lg overflow-hidden border-2 transition-all ${certImg === img ? "border-[#3ECF8E] shadow-md" : "border-transparent hover:border-border"}`}
                >
                  <img src={img} alt="Certificate style" className="w-full h-16 object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Variables */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Template Variables</Label>
            <div className="flex flex-wrap gap-1.5">
              {activeTemplate.variables
                .filter(v => v !== "certificate_image_url" && v !== "verification_url")
                .map(v => (
                  <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono bg-muted text-muted-foreground border border-border/50">
                    {`{{${v}}}`}
                  </span>
                ))}
            </div>
          </div>

          <div className="mt-auto pt-2">
            <Button
              className="w-full h-10 gap-2 bg-[#3ECF8E] hover:bg-[#34b87a] text-white font-semibold"
              onClick={() => onUse(activeTemplate)}
            >
              <Copy className="w-4 h-4" />
              Use this template
            </Button>
            <p className="text-[11px] text-muted-foreground text-center mt-2">You&apos;ll name it on the next step</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Name dialog ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function NameDialog({
  open,
  title,
  placeholder,
  description,
  creating,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  description: string;
  creating: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  // Reset when dialog opens
  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="p-6 space-y-5">
          <div>
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Template Name</Label>
            <Input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={placeholder}
              className="h-10"
              onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={creating}>
              Cancel
            </Button>
            <Button
              className="flex-1 gap-1.5 bg-[#3ECF8E] hover:bg-[#34b87a] text-white"
              onClick={submit}
              disabled={creating || !name.trim()}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {creating ? "Creating…" : "Create & Open"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

/**
 * Live preview of a template — renders the actual email body (with sample data) in a
 * scaled-down iframe, full-bleed. Shows a blank placeholder when the template has no body.
 */
function TemplatePreview({ body }: { body: string | null | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const { organization } = useOrganization();
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => { const w = el.clientWidth; if (w) setScale(w / 600); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!body || !body.trim()) {
    // Blank state — template has no content yet
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-muted/30 text-muted-foreground/50">
        <Mail className="w-6 h-6" />
        <span className="text-[11px]">No preview yet</span>
      </div>
    );
  }

  const mock = buildPreviewMock(organization);
  const rendered = body.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, k: string) => mock[k.trim()] ?? "");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Strip the email's outer grey canvas so the actual content fills the preview.
  const reset = `*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}.ax-wrap{background:#fff!important;padding:0!important}.ax-card{border:none!important;border-radius:0!important;box-shadow:none!important}.ax-foot{display:none!important}`;
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${origin}/"><style>${reset}</style></head><body>${rendered}</body></html>`;
  const displayH = 200; // matches the preview area height
  return (
    <div ref={ref} className="w-full h-full overflow-hidden bg-white">
      <iframe
        srcDoc={srcDoc}
        title="Template preview"
        scrolling="no"
        tabIndex={-1}
        sandbox="allow-same-origin"
        style={{
          width: 600,
          height: displayH / scale,
          border: "none",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function TemplateCard({
  template,
  isDraft,
  onEdit,
  onDelete,
  onDuplicate,
  onSendCampaign,
  deleting,
  duplicating,
}: {
  template: DeliveryTemplate;
  isDraft: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSendCampaign: () => void;
  deleting: boolean;
  duplicating: boolean;
}) {
  const cleanSubject = (template.email_subject ?? "")
    .replace(/\{\{[\w.\s]+\}\}/g, "…")
    .replace(/^[\p{Emoji}\s]+/u, "")
    .trim() || "No subject set";

  const updatedAt = new Date(template.updated_at);
  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const timeAgo =
    diffMins < 60 ? `${diffMins}m ago` :
    diffHours < 24 ? `${diffHours}h ago` :
    diffDays === 1 ? "Yesterday" :
    diffDays < 30 ? `${diffDays}d ago` :
    updatedAt.toLocaleDateString("en", { month: "short", day: "numeric" });

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-card overflow-hidden cursor-pointer transition-all duration-200",
        "hover:shadow-xl hover:-translate-y-0.5 hover:border-border",
        isDraft ? "border-dashed border-amber-500/30" : "border-border/60",
      )}
      onClick={onEdit}
    >
      {/* Preview — real rendered email (blank placeholder when no content) */}
      <div className="relative h-52 shrink-0 overflow-hidden border-b border-border/50">
        <TemplatePreview body={template.body} />
        {/* soft bottom fade so the crop blends in */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-card to-transparent pointer-events-none" />
        {/* Status badges */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {template.is_default && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#3ECF8E] text-white shadow-sm">
              <CheckCircle2 className="w-2.5 h-2.5" /> Default
            </span>
          )}
          {isDraft && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500 text-white shadow-sm">
              <Clock className="w-2.5 h-2.5" /> Draft
            </span>
          )}
          {!template.is_active && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted-foreground/80 text-white shadow-sm">
              Inactive
            </span>
          )}
        </div>
        {/* Actions menu — top right, on hover */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-7 h-7 rounded-lg bg-background/85 backdrop-blur-sm border border-border/60 flex items-center justify-center text-muted-foreground hover:bg-background transition-colors">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSendCampaign}>
                <Send className="w-3.5 h-3.5 mr-2" /> Send as campaign
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} disabled={duplicating}>
                {duplicating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} disabled={deleting} className="text-destructive focus:text-destructive">
                {deleting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-2" />}
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 px-3.5 pt-2.5 pb-3 gap-1.5">
        <p className="text-sm font-semibold leading-snug line-clamp-1">{template.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{cleanSubject}</p>
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> {timeAgo}
          </span>
          <span className="text-[11px] font-medium text-[#3ECF8E] flex items-center gap-1">
            <Edit2 className="w-3 h-3" /> Edit
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
  const { orgPath, slug } = useOrg();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToSend = searchParams.get("returnToSend") === "1";
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Sample chooser
  const [showSamples, setShowSamples] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPurposeDialog, setShowPurposeDialog] = useState(false);
  // Purpose selection — shown before sample chooser opens
  const [showSamplePurposeDialog, setShowSamplePurposeDialog] = useState(false);
  const [samplePurpose, setSamplePurpose] = useState<"certificate" | "broadcast">("certificate");

  // Saved IDs from localStorage (scoped by org slug)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => getSavedIds(slug));

  const { templates: rawTemplates, loading, error: fetchError, refetch: refetchTemplates } = useDeliveryTemplates();
  const { integrations } = useDeliveryIntegrations();
  const createTemplate = useCreateDeliveryTemplate();
  const deleteTemplate = useDeleteDeliveryTemplate();
  const duplicateTemplate = useDuplicateDeliveryTemplate();

  // For migrating customers: import their existing Resend templates into ours.
  const resendIntegration = integrations.find(i => i.is_active && i.provider === "resend");
  const [importing, setImporting] = useState(false);
  const handleImportFromResend = async () => {
    if (!resendIntegration) return;
    setImporting(true);
    try {
      const { imported, skipped } = await api.delivery.importResendTemplates(resendIntegration.id);
      toast.success(
        imported > 0
          ? `Imported ${imported} template${imported !== 1 ? "s" : ""} from Resend${skipped ? ` (${skipped} already linked)` : ""}`
          : `No new templates to import${skipped ? ` (${skipped} already linked)` : ""}`,
      );
      await refetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import from Resend");
    } finally {
      setImporting(false);
    }
  };

  // Sort by updated_at desc
  const templates = [...rawTemplates].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  const error = fetchError ?? createTemplate.error?.message ?? "";

  // Split templates
  const savedTemplates = templates.filter(t => isTemplateSaved(t, savedIds));
  const draftTemplates = templates.filter(t => !isTemplateSaved(t, savedIds));

  const createBlankWithPurpose = (purpose: { name: string; subject: string }) => {
    if (creating) return;
    setShowPurposeDialog(false);
    setCreating(true);
    createTemplate.mutate(
      {
        channel: "email" as const,
        name: purpose.name,
        email_subject: purpose.subject,
        body: "",
        variables: [] as string[],
        is_default: templates.length === 0,
        is_active: true,
      },
      {
        onSuccess: (created) => {
          setCreating(false);
          router.push(orgPath(`/email-templates/${created.id}${returnToSend ? "?returnToSend=1" : ""}`));
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to create template");
          setCreating(false);
        },
      },
    );
  };

  const handleSampleUse = (sample: PredefinedTemplate) => {
    setShowSamples(false);
    if (creating) return;
    setCreating(true);
    createTemplate.mutate(
      {
        channel: "email" as const,
        name: sample.name,
        email_subject: sample.email_subject,
        body: sample.body,
        variables: sample.variables,
        is_default: templates.length === 0,
        is_active: true,
      },
      {
        onSuccess: (created) => {
          toast.success(`"${sample.name}" created`);
          setCreating(false);
          // hasBody=1 tells the editor to suppress the starter gallery on first render
          // (before the async template fetch returns) — prevents the gallery flash.
          const qs = returnToSend ? "?hasBody=1&returnToSend=1" : "?hasBody=1";
          router.push(orgPath(`/email-templates/${created.id}${qs}`));
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to create template");
          setCreating(false);
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    setConfirmDeleteId(null);
    deleteTemplate.mutate(id, {
      onSuccess: () => toast.success("Template deleted"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete template"),
    });
  };

  const handleDuplicate = (id: string) => {
    duplicateTemplate.mutate(id, {
      onSuccess: (duplicated) => {
        toast.success(`"${duplicated.name}" created`);
        // Mark the duplicate as saved so it appears in the correct section immediately
        setSavedIds(prev => {
          const next = new Set(prev);
          next.add(duplicated.id);
          try { localStorage.setItem(`et_saved_ids:${slug}`, JSON.stringify([...next])); } catch { /* non-fatal */ }
          return next;
        });
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to duplicate template"),
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Design reusable emails for certificate delivery and broadcast campaigns.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {resendIntegration && (
            <Button variant="outline" onClick={handleImportFromResend} disabled={importing}
              title="Import templates from your Resend account">
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Import from Resend
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowSamplePurposeDialog(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            Browse Samples
          </Button>
          <Button
            onClick={() => setShowPurposeDialog(true)}
            disabled={creating}
            className="bg-[#3ECF8E] hover:bg-[#34b87a] text-white"
          >
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PenLine className="w-4 h-4 mr-2" />}
            New Template
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Templates content */}
      {loading ? (
        <div className="grid gap-5 justify-center grid-cols-[repeat(auto-fill,minmax(260px,300px))]">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="rounded-2xl border bg-card overflow-hidden animate-pulse">
              <div className="h-52 bg-muted" />
              <div className="px-3.5 pt-2.5 pb-3 space-y-2">
                <div className="h-3 bg-muted rounded w-2/3" />
                <div className="h-2.5 bg-muted/60 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-5 rounded-full bg-linear-to-br from-[#3ECF8E]/15 to-[#1a9f6a]/10 mb-5 ring-1 ring-[#3ECF8E]/20">
            <Mail className="w-10 h-10 text-[#3ECF8E]" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No email templates yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-8">
            Create your first email template to start sending certificates.
            Choose a professionally designed sample or start from scratch.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" size="lg" onClick={() => setShowSamplePurposeDialog(true)} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Browse Samples
            </Button>
            <Button
              size="lg"
              onClick={() => setShowPurposeDialog(true)}
              disabled={creating}
              className="gap-2 bg-[#3ECF8E] hover:bg-[#34b87a] text-white"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Design from Scratch
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-10">

          {/* ── Saved Templates ──────────────────────────────────── */}
          {savedTemplates.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-[#3ECF8E]" />
                <h2 className="text-sm font-semibold text-foreground">Saved Templates</h2>
                <span className="text-xs text-muted-foreground">({savedTemplates.length})</span>
              </div>
              <div className="grid gap-5 justify-center grid-cols-[repeat(auto-fill,minmax(260px,300px))]">
                {savedTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isDraft={false}
                    onEdit={() => router.push(orgPath(`/email-templates/${template.id}${returnToSend ? "?returnToSend=1" : ""}`))}
                    onDelete={() => setConfirmDeleteId(template.id)}
                    onDuplicate={() => handleDuplicate(template.id)}
                    onSendCampaign={() => router.push(orgPath(`/broadcasts?fromTemplate=${template.id}`))}
                    deleting={deleteTemplate.isPending && deleteTemplate.variables === template.id}
                    duplicating={duplicateTemplate.isPending && duplicateTemplate.variables === template.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── In Progress / Drafts ─────────────────────────────── */}
          {draftTemplates.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Continue Working</h2>
                <span className="text-xs text-muted-foreground">({draftTemplates.length})</span>
                <span className="text-[10px] text-muted-foreground/50 ml-1">— auto-saved, not yet published</span>
              </div>
              <div className="grid gap-5 justify-center grid-cols-[repeat(auto-fill,minmax(260px,300px))]">
                {draftTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isDraft
                    onEdit={() => router.push(orgPath(`/email-templates/${template.id}${returnToSend ? "?returnToSend=1" : ""}`))}
                    onDelete={() => setConfirmDeleteId(template.id)}
                    onDuplicate={() => handleDuplicate(template.id)}
                    onSendCampaign={() => router.push(orgPath(`/broadcasts?fromTemplate=${template.id}`))}
                    deleting={deleteTemplate.isPending && deleteTemplate.variables === template.id}
                    duplicating={duplicateTemplate.isPending && duplicateTemplate.variables === template.id}
                  />
                ))}
              </div>
            </section>
          )}

        </div>
      )}

      {/* Sample purpose — asked before the sample chooser opens */}
      <Dialog open={showSamplePurposeDialog} onOpenChange={setShowSamplePurposeDialog}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <DialogTitle className="text-lg font-bold">What is this email for?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">We'll show you templates that match your goal.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 px-6 pb-6 pt-3">
            <button
              onClick={() => {
                setSamplePurpose("certificate");
                setShowSamplePurposeDialog(false);
                setShowSamples(true);
              }}
              className="flex items-center gap-4 rounded-xl border border-border/60 px-5 py-4 text-left hover:border-[#3ECF8E]/60 hover:bg-[#3ECF8E]/5 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-[#3ECF8E]/10 transition-colors">
                <Award className="w-5 h-5 text-muted-foreground group-hover:text-[#3ECF8E] transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">Certificate Delivery</p>
                <p className="text-xs text-muted-foreground mt-0.5">Send certificates, completions, or awards to recipients</p>
              </div>
            </button>
            <button
              onClick={() => {
                setSamplePurpose("broadcast");
                setShowSamplePurposeDialog(false);
                setShowSamples(true);
              }}
              className="flex items-center gap-4 rounded-xl border border-border/60 px-5 py-4 text-left hover:border-[#3ECF8E]/60 hover:bg-[#3ECF8E]/5 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-[#3ECF8E]/10 transition-colors">
                <Megaphone className="w-5 h-5 text-muted-foreground group-hover:text-[#3ECF8E] transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">Broadcast / Newsletter</p>
                <p className="text-xs text-muted-foreground mt-0.5">Announce updates, promotions, or events to a group</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purpose dialog — shown before creating a blank template */}
      <Dialog open={showPurposeDialog} onOpenChange={setShowPurposeDialog}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <DialogTitle className="text-lg font-bold">What's this email for?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">We'll set a starter name and subject so you can dive straight into designing.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 px-6 pb-6 pt-3">
            {[
              { icon: Award, label: "Certificate Delivery", desc: "Send a certificate to a recipient after course or event completion", name: "Certificate Email", subject: "Your Certificate from {{organization_name}}" },
              { icon: Users, label: "Welcome Email", desc: "Greet new members, students, or subscribers", name: "Welcome Email", subject: "Welcome to {{organization_name}}, {{recipient_name}}!" },
              { icon: CheckCircle2, label: "Course / Workshop Completion", desc: "Celebrate finishing a program or workshop", name: "Completion Email", subject: "You've completed {{course_name}} 🎉" },
              { icon: CalendarDays, label: "Event Notification", desc: "Invite or remind recipients about an upcoming event", name: "Event Email", subject: "You're invited: {{event_name}}" },
              { icon: Newspaper, label: "Newsletter / Update", desc: "Regular digest, announcement, or update to your audience", name: "Newsletter", subject: "{{organization_name}} — {{month}} Update" },
              { icon: FileText, label: "General Purpose", desc: "A blank canvas for any other email type", name: "Untitled Email Template", subject: "Message from {{organization_name}}" },
            ].map(opt => (
              <button
                key={opt.label}
                disabled={creating}
                onClick={() => createBlankWithPurpose({ name: opt.name, subject: opt.subject })}
                className="flex items-center gap-4 rounded-xl border border-border/60 px-4 py-3 text-left hover:border-[#3ECF8E]/60 hover:bg-[#3ECF8E]/5 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-[#3ECF8E]/10 transition-colors">
                  <opt.icon className="w-4 h-4 text-muted-foreground group-hover:text-[#3ECF8E] transition-colors" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
                {creating && <Loader2 className="w-4 h-4 animate-spin ml-auto shrink-0 text-muted-foreground" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sample chooser modal */}
      <Dialog open={showSamples} onOpenChange={setShowSamples}>
        <DialogContent className="max-w-5xl h-[88vh] flex flex-col overflow-hidden p-0">
          <SampleChooser
            templates={PREDEFINED_TEMPLATES}
            purpose={samplePurpose}
            onUse={handleSampleUse}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
