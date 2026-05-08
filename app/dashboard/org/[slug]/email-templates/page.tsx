"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Copy, Sparkles, ChevronLeft, ChevronRight, Clock, CheckCircle2, PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { type DeliveryTemplate } from "@/lib/api/client";
import {
  useDeliveryTemplates,
  useCreateDeliveryTemplate,
  useDeleteDeliveryTemplate,
  useDuplicateDeliveryTemplate,
} from "@/lib/hooks/queries/delivery";
import { useOrg } from "@/lib/org";
import { useRouter } from "next/navigation";
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

// ── Certificate image options ─────────────────────────────────────────────────

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
  verification_url: "#",
};

// ── SampleChooser ─────────────────────────────────────────────────────────────

function SampleChooser({
  templates,
  onUse,
}: {
  templates: PredefinedTemplate[];
  onUse: (t: PredefinedTemplate) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [activeIdx, setActiveIdx] = useState(0);
  const [certImg, setCertImg] = useState(CERT_IMAGES[0]);
  const [iframeH, setIframeH] = useState(700);

  const filteredTemplates =
    categoryFilter === "All" ? templates : templates.filter(t => t.category === categoryFilter);

  useEffect(() => { setActiveIdx(0); }, [categoryFilter]);

  const safeIdx = activeIdx < filteredTemplates.length ? activeIdx : 0;
  const activeTemplate = filteredTemplates[safeIdx] ?? filteredTemplates[0];

  const prev = () => setActiveIdx(i => (i - 1 + filteredTemplates.length) % filteredTemplates.length);
  const next = () => setActiveIdx(i => (i + 1) % filteredTemplates.length);

  const mockVars = { ...BASE_MOCK, certificate_image_url: certImg };
  const renderedHtml = activeTemplate
    ? activeTemplate.body.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, key: string) => (mockVars as Record<string, string>)[key.trim()] ?? "")
    : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${origin}/"><style>*{box-sizing:border-box}body{margin:0;padding:0;background:#ffffff}</style></head><body>${renderedHtml}</body></html>`;

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
        <DialogTitle className="text-xl font-bold tracking-tight">Sample Email Templates</DialogTitle>
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

function TemplateCard({
  template,
  isDraft,
  onEdit,
  onDelete,
  onDuplicate,
  deleting,
  duplicating,
}: {
  template: DeliveryTemplate;
  isDraft: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  deleting: boolean;
  duplicating: boolean;
}) {
  const certImgIndex = template.id.charCodeAt(0) % CERT_IMAGES.length;
  const certImg = CERT_IMAGES[certImgIndex]!;

  // Clean subject for display — strip variables, trim emoji prefix
  const cleanSubject = (template.email_subject ?? "")
    .replace(/\{\{[\w.\s]+\}\}/g, "…")
    .replace(/^[\p{Emoji}\s]+/u, "")
    .trim() || "No subject set";

  const updatedAt = new Date(template.updated_at);
  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const timeAgo = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;

  return (
    <Card
      className={cn(
        "group overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer",
        isDraft && "border-dashed border-zinc-700/60"
      )}
      onClick={onEdit}
    >
      {/* Thumbnail */}
      <div className="h-28 overflow-hidden relative bg-zinc-900 border-b border-border/20">
        <img
          src={certImg}
          alt="Certificate preview"
          className="w-full h-full object-cover pointer-events-none select-none opacity-70"
        />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background/90 pointer-events-none" />
        <div className="absolute top-2 right-2 flex gap-1.5">
          {template.is_default && (
            <Badge className="text-[10px] border-[#3ECF8E]/50 text-[#3ECF8E] bg-background/90" variant="outline">Default</Badge>
          )}
          {!template.is_active && (
            <Badge variant="secondary" className="text-[10px] bg-background/90">Inactive</Badge>
          )}
          {isDraft && (
            <Badge variant="outline" className="text-[10px] bg-background/90 text-amber-500 border-amber-500/40">Draft</Badge>
          )}
        </div>
      </div>

      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="text-sm font-semibold truncate leading-tight">{template.name}</CardTitle>
        <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5 leading-tight">{cleanSubject}</p>
      </CardHeader>

      <CardContent className="pt-0 pb-3 px-3">
        <div className="flex items-center gap-1 mb-2">
          <Clock className="w-2.5 h-2.5 text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground/40">{timeAgo}</span>
        </div>
        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={onEdit}>
            <Edit2 className="w-3 h-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Duplicate"
            disabled={duplicating}
            onClick={onDuplicate}
            className="shrink-0 h-7 w-7 p-0"
          >
            {duplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={deleting}
            onClick={onDelete}
            className="shrink-0 h-7 w-7 p-0"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-destructive" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
  const { orgPath, slug } = useOrg();
  const router = useRouter();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Sample chooser
  const [showSamples, setShowSamples] = useState(false);

  // Name dialog
  type PendingCreate = { kind: "blank" } | { kind: "sample"; template: PredefinedTemplate };
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);

  // Saved IDs from localStorage (scoped by org slug, loaded once)
  const [savedIds] = useState<Set<string>>(() => getSavedIds(slug));

  const { templates: rawTemplates, loading, error: fetchError } = useDeliveryTemplates();
  const createTemplate = useCreateDeliveryTemplate();
  const deleteTemplate = useDeleteDeliveryTemplate();
  const duplicateTemplate = useDuplicateDeliveryTemplate();

  // Sort by updated_at desc
  const templates = [...rawTemplates].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  const error = fetchError ?? createTemplate.error?.message ?? "";

  // Split templates
  const savedTemplates = templates.filter(t => isTemplateSaved(t, savedIds));
  const draftTemplates = templates.filter(t => !isTemplateSaved(t, savedIds));

  const handleSampleUse = (sample: PredefinedTemplate) => {
    setShowSamples(false);
    setPendingCreate({ kind: "sample", template: sample });
  };

  const handleNameConfirm = async (name: string) => {
    if (!pendingCreate) return;
    const isFromSample = pendingCreate.kind === "sample";
    const dto = isFromSample
      ? {
          channel: "email" as const,
          name,
          email_subject: pendingCreate.template.email_subject,
          body: pendingCreate.template.body,
          variables: pendingCreate.template.variables,
          is_default: templates.length === 0,
          is_active: true,
        }
      : {
          channel: "email" as const,
          name,
          email_subject: "Your Certificate from {{organization_name}}",
          body: "",
          variables: [] as string[],
          is_default: templates.length === 0,
          is_active: true,
        };

    createTemplate.mutate(dto, {
      onSuccess: (created) => {
        toast.success(isFromSample ? `"${name}" created from sample` : `"${name}" created`);
        setPendingCreate(null);
        router.push(orgPath(`/email-templates/${created.id}`));
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to create template");
      },
    });
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
      onSuccess: (duplicated) => toast.success(`"${duplicated.name}" created`),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to duplicate template"),
    });
  };

  const nameDialogProps = pendingCreate ? (
    pendingCreate.kind === "blank"
      ? {
          title: "Name your template",
          placeholder: "e.g. Course Completion Email",
          description: "Give this template a clear name so you can find it later.",
        }
      : {
          title: "Name your template",
          placeholder: pendingCreate.template.name,
          description: `Starting from "${pendingCreate.template.name}" — you can rename it anything.`,
        }
  ) : { title: "", placeholder: "", description: "" };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-muted-foreground mt-1.5 text-base">
            Design and manage the emails sent to recipients when certificates are issued.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setShowSamples(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            Sample Email Templates
          </Button>
          <Button
            onClick={() => setPendingCreate({ kind: "blank" })}
            className="bg-[#3ECF8E] hover:bg-[#34b87a] text-white"
          >
            <PenLine className="w-4 h-4 mr-2" />
            Design from Scratch
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading templates…</span>
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
            <Button variant="outline" size="lg" onClick={() => setShowSamples(true)} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Browse Samples
            </Button>
            <Button
              size="lg"
              onClick={() => setPendingCreate({ kind: "blank" })}
              className="gap-2 bg-[#3ECF8E] hover:bg-[#34b87a] text-white"
            >
              <Plus className="w-4 h-4" />
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
                <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Saved Templates</h2>
                <span className="text-xs text-muted-foreground">({savedTemplates.length})</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {savedTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isDraft={false}
                    onEdit={() => router.push(orgPath(`/email-templates/${template.id}`))}
                    onDelete={() => setConfirmDeleteId(template.id)}
                    onDuplicate={() => handleDuplicate(template.id)}
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
                <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Continue Working</h2>
                <span className="text-xs text-muted-foreground">({draftTemplates.length})</span>
                <span className="text-[10px] text-muted-foreground/50 ml-1">— auto-saved, not yet published</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {draftTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isDraft
                    onEdit={() => router.push(orgPath(`/email-templates/${template.id}`))}
                    onDelete={() => setConfirmDeleteId(template.id)}
                    onDuplicate={() => handleDuplicate(template.id)}
                    deleting={deleteTemplate.isPending && deleteTemplate.variables === template.id}
                    duplicating={duplicateTemplate.isPending && duplicateTemplate.variables === template.id}
                  />
                ))}
              </div>
            </section>
          )}

        </div>
      )}

      {/* Sample chooser modal */}
      <Dialog open={showSamples} onOpenChange={setShowSamples}>
        <DialogContent className="max-w-5xl h-[88vh] flex flex-col overflow-hidden p-0">
          <SampleChooser
            templates={PREDEFINED_TEMPLATES}
            onUse={handleSampleUse}
          />
        </DialogContent>
      </Dialog>

      {/* Name dialog */}
      <NameDialog
        open={!!pendingCreate}
        title={nameDialogProps.title}
        placeholder={nameDialogProps.placeholder}
        description={nameDialogProps.description}
        creating={createTemplate.isPending}
        onConfirm={handleNameConfirm}
        onCancel={() => setPendingCreate(null)}
      />

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
