"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { JSONContent } from "@tiptap/core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Megaphone, Plus, Loader2, Send, Trash2, MoreHorizontal, Clock,
  CheckCircle2, AlertCircle, Edit2, Users, Upload, FileSpreadsheet,
  ChevronRight, ChevronLeft, MailIcon, PenLine, Eye, X, RefreshCw, Info,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import {
  useEmailBroadcasts, useCreateBroadcast, useUpdateBroadcast,
  useSendBroadcast, useDeleteBroadcast, useDeliveryIntegrations,
  useEmailContacts, useDeliveryTemplates,
} from "@/lib/hooks/queries/delivery";
import { useEmailSegments } from "@/lib/hooks/queries/delivery";
import type { EmailBroadcast, BroadcastStatus, CreateBroadcastDto } from "@/lib/api/client";
import { api } from "@/lib/api/client";
import { EmailEditor, type EmailEditorResult } from "./EmailEditor";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ── Template type inference ────────────────────────────────────────────────────

const CERT_VARS = ["certificate_number", "cert_number", "certificate_id", "recipient_name", "course_name", "issue_date", "expiry_date"];
const CERT_BLOCKS = ["qr_code", "details_box", "certificate_number"];

function inferTemplateType(body: string): "broadcast" | "certificate" {
  const lower = body.toLowerCase();
  const hasCertVar = CERT_VARS.some(v => lower.includes(`{{${v}}}`));
  const hasCertBlock = CERT_BLOCKS.some(b => lower.includes(`"type":"${b}"`) || lower.includes(`"blockType":"${b}"`));
  return hasCertVar || hasCertBlock ? "certificate" : "broadcast";
}

// ── Template gradient tiles (no iframes — consistent, dark-mode-safe) ────────

const TPL_GRADIENTS: [string, string][] = [
  ["#6366f1", "#8b5cf6"],
  ["#0ea5e9", "#06b6d4"],
  ["#10b981", "#14b8a6"],
  ["#f59e0b", "#f97316"],
  ["#ec4899", "#f43f5e"],
  ["#3b82f6", "#6366f1"],
  ["#22c55e", "#10b981"],
  ["#a855f7", "#ec4899"],
  ["#64748b", "#475569"],
  ["#f97316", "#ef4444"],
];

function tplGradient(id: string): [string, string] {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return TPL_GRADIENTS[hash % TPL_GRADIENTS.length]!;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type RecipientMode = "csv" | "manual" | "segment" | "contacts";

interface ParsedRecipient {
  email: string;
  [key: string]: string;
}

interface WizardState {
  // Step 1 — Campaign info
  name: string;
  email_type: string;
  from_name: string;
  from_email: string;
  reply_to: string;

  // Step 2 — Recipients
  recipient_mode: RecipientMode;
  recipients: ParsedRecipient[];         // parsed from CSV, manual, or contacts
  csv_columns: string[];                  // column headers from CSV / contacts (used as template vars)
  manual_emails: string;                  // raw textarea value
  segment_id: string;
  contacts_search: string;
  // Extra recipients stacked on top of contacts when initialSourceRef is set
  extra_recipients: ParsedRecipient[];   // from additional file upload
  extra_manual_emails: string;           // from additional manual entry

  // Step 3 — Design / Compose
  subject: string;
  preview_text: string;
  html_body: string;
  content_json: JSONContent | null;
}

const EMAIL_TYPES = [
  { value: "transactional", label: "Transactional", desc: "Receipts, certificates, confirmations" },
  { value: "lifecycle",     label: "Lifecycle",     desc: "Onboarding, batch start, milestones" },
  { value: "newsletter",    label: "Newsletter",     desc: "Regular updates and digests" },
  { value: "promotional",   label: "Promotional",   desc: "Offers, discounts, sales" },
  { value: "personal",      label: "Personal",       desc: "1-to-1 personalised messages" },
];

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BroadcastStatus, { label: string; className: string; icon: React.ReactNode }> = {
  draft:     { label: "Draft",     className: "border-gray-200 text-gray-600 bg-gray-50 dark:bg-gray-900/30",     icon: <PenLine className="h-3 w-3" /> },
  scheduled: { label: "Scheduled", className: "border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-950/20",     icon: <Clock className="h-3 w-3" /> },
  sending:   { label: "Sending",   className: "border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-950/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  sent:      { label: "Sent",      className: "border-green-200 text-green-700 bg-green-50 dark:bg-green-950/20", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed:    { label: "Failed",    className: "border-red-200 text-red-700 bg-red-50 dark:bg-red-950/20",         icon: <AlertCircle className="h-3 w-3" /> },
};

// ── CSV / Excel parser ─────────────────────────────────────────────────────────

function parseFile(file: File): Promise<{ rows: ParsedRecipient[]; columns: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]!]!;
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
        if (!json.length) { reject(new Error("File is empty")); return; }
        const columns = Object.keys(json[0]!);
        const emailCol = columns.find(c => c.toLowerCase().includes("email"));
        if (!emailCol) { reject(new Error("No email column found. Add a column named 'email'.")); return; }
        const rows = json
          .map(row => ({ ...row, email: (row[emailCol] ?? "").trim().toLowerCase() }))
          .filter(r => r.email && r.email.includes("@"));
        resolve({ rows, columns });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseManualEmails(raw: string): ParsedRecipient[] {
  return raw
    .split(/[\n,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.includes("@"))
    .map(email => ({ email }));
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function WizardSteps({ current }: { current: number }) {
  const labels = ["Compose", "Recipients"];
  return (
    <div className="flex items-center gap-1">
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className={cn(
              "flex items-center gap-1.5 text-xs font-semibold",
              done ? "text-[#3ECF8E]" : active ? "text-foreground" : "text-muted-foreground/50",
            )}>
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold",
                done ? "bg-[#3ECF8E] text-white" :
                active ? "bg-foreground text-background" :
                "bg-muted text-muted-foreground",
              )}>
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </div>
              <span className="hidden sm:block">{label}</span>
            </div>
            {i < labels.length - 1 && (
              <ChevronRight className={cn("h-3.5 w-3.5 mx-2 shrink-0", done ? "text-[#3ECF8E]" : "text-muted-foreground/30")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Wizard ─────────────────────────────────────────────────────────────────────

function CampaignWizard({
  onClose,
  onCreated,
  initialTemplateId,
  initialSourceRef,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  initialTemplateId?: string;
  initialSourceRef?: string;
}) {
  const { segments } = useEmailSegments();
  const createMutation = useCreateBroadcast();
  const { integrations: rawIntegrations, loading: integrationsLoading } = useDeliveryIntegrations();
  const { templates: emailTemplates, loading: templatesLoading } = useDeliveryTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId ?? null);
  // Default to broadcast-only so certificate delivery templates (which need generated cert data) are hidden by default
  const [templateFilter, setTemplateFilter] = useState<"all" | "broadcast" | "certificate">("broadcast");
  const [debouncedContactSearch, setDebouncedContactSearch] = useState("");
  const { contacts: allContacts, total: contactTotal, loading: contactsLoading } = useEmailContacts({
    limit: 500,
    offset: 0,
    search: debouncedContactSearch || undefined,
    unsubscribed: false,
    source_ref: initialSourceRef || undefined,
  });
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // When both template + contacts source are pre-configured, skip compose and start at recipients
  const [step, setStep] = useState(initialTemplateId && initialSourceRef ? 1 : 0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showAddMore, setShowAddMore] = useState<"file" | "manual" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('');
  const didAutoSelect = useRef(false);
  const [contactSearch, setContactSearch] = useState("");
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const PLATFORM_OPT = {
    id: '__platform__',
    name: 'DigiCertificates',
    email: 'hello@digicertificates.in',
    replyTo: '',
    isPlatform: true,
  } as const;

  const activeIntegrations = rawIntegrations.filter(i => i.channel === 'email' && i.is_active);

  // Real options mapped from org integrations
  const realOptions = activeIntegrations.map(i => ({
    id: i.id,
    name: i.from_name ?? i.display_name,
    email: i.from_email ?? '',
    replyTo: i.reply_to ?? '',
    isPlatform: false as const,
  }));

  // All selectable options: real integrations + platform always at the bottom.
  // Used for the dropdown when multiple senders are available.
  const allSenderOptions: Array<{ id: string; name: string; email: string; replyTo: string; isPlatform: boolean }> = integrationsLoading
    ? []
    : [
        ...realOptions,
        { ...PLATFORM_OPT, name: realOptions.length > 0 ? 'Platform Default (DigiCertificates)' : 'DigiCertificates' },
      ];

  // Show the dropdown only when the org has 2+ real integrations to choose from.
  // 0 or 1 real integration → auto-selected silently (platform fills in for 0).
  const showSenderDropdown = !integrationsLoading && realOptions.length > 1;
  // integrationOptions kept for backwards-compat in the rest of the file
  const integrationOptions = allSenderOptions;

  const [w, setW] = useState<WizardState>({
    name: "",
    email_type: "lifecycle",
    from_name: "",
    from_email: "",
    reply_to: "",
    // Default to contacts mode whenever we have a pre-selected template or source_ref.
    // For "Send as campaign" from template list, this pre-loads the user's existing contacts.
    recipient_mode: (initialSourceRef || initialTemplateId) ? "contacts" : "csv",
    recipients: [],
    csv_columns: [],
    manual_emails: "",
    segment_id: "",
    contacts_search: "",
    extra_recipients: [],
    extra_manual_emails: "",
    subject: "",
    preview_text: "",
    html_body: "",
    content_json: null,
  });

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setW(prev => ({ ...prev, [key]: value }));

  // Auto-populate name, subject + body when an initial template is provided
  useEffect(() => {
    if (!initialTemplateId || !emailTemplates.length) return;
    const t = emailTemplates.find(et => et.id === initialTemplateId);
    if (t) {
      setW(prev => ({
        ...prev,
        // Auto-generate a campaign name so the user doesn't have to type one
        name: prev.name || `${t.name} — ${format(new Date(), 'MMM d, yyyy')}`,
        html_body: prev.html_body || t.body,
        subject: prev.subject || t.email_subject || "",
      }));
    }
  }, [initialTemplateId, emailTemplates]);

  // Auto-select once integrations finish loading (real or platform default)
  // Auto-select once integrations load.
  // - 0 real integrations → picks platform default (hello@digicertificates.in)
  // - 1 real integration  → picks that one
  // - 2+ real integrations → dropdown is shown; no auto-select
  useEffect(() => {
    if (didAutoSelect.current || integrationsLoading || showSenderDropdown) return;
    if (allSenderOptions.length === 0) return;
    didAutoSelect.current = true;
    const def = realOptions.find(o => activeIntegrations.find(i => i.id === o.id)?.is_default)
      ?? realOptions[0]
      ?? allSenderOptions[0]!; // platform default when no real options
    setSelectedIntegrationId(def.id);
    setW(prev => ({ ...prev, from_name: def.name, from_email: def.email, reply_to: def.replyTo }));
  }, [integrationsLoading, showSenderDropdown, allSenderOptions.length]);

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const { rows, columns } = await parseFile(file);
      set("recipients", rows);
      set("csv_columns", columns);
      toast.success(`Parsed ${rows.length} recipients from ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setUploading(false);
    }
  }, []);

  // Extra file upload — adds to contacts mode recipients without replacing them
  const handleExtraFile = useCallback(async (file: File) => {
    try {
      const { rows } = await parseFile(file);
      setW(prev => ({ ...prev, extra_recipients: [...prev.extra_recipients, ...rows] }));
      toast.success(`Added ${rows.length} more recipients from ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    }
  }, []);

  // ── Template variables used in the composed HTML ──────────────────────────
  // These are auto-filled by the system and must not be shown as required recipient columns.
  const SYSTEM_VARS = new Set([
    "verification_url", "certificate_number", "certificate_id",
    "certificate_image_url", "unsubscribe_url", "preview_url",
  ]);
  const templateVarsFromHtml: string[] = w.html_body
    ? [...new Set([...w.html_body.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]!))]
        .filter(v => v.toLowerCase() !== "email" && !SYSTEM_VARS.has(v.toLowerCase()))
    : [];

  // Structured manual mode: when the email uses variables, show a table instead of a textarea
  const isStructuredManual = w.recipient_mode === "manual" && templateVarsFromHtml.length > 0;

  // ── Effective recipients list ──────────────────────────────────────────────
  const contactRecipients: ParsedRecipient[] = w.recipient_mode === "contacts"
    ? allContacts
        .filter(c => selectedContactIds.size === 0 || selectedContactIds.has(c.id))
        .map(c => ({
          email: c.email,
          first_name: c.first_name ?? "",
          last_name: c.last_name ?? "",
          ...Object.fromEntries(
            Object.entries(c.custom_properties ?? {}).map(([k, v]) => [k, String(v)])
          ),
        }))
    : [];

  const extraManualRecipients = parseManualEmails(w.extra_manual_emails);
  const effectiveRecipients = isStructuredManual
    ? w.recipients.filter(r => r.email?.includes("@"))
    : w.recipient_mode === "manual"
    ? parseManualEmails(w.manual_emails)
    : w.recipient_mode === "csv" ? w.recipients
    : w.recipient_mode === "contacts"
    // When contacts mode, combine pre-loaded contacts + any extra file/manual additions
    ? [...contactRecipients, ...w.extra_recipients, ...extraManualRecipients]
    : [];

  const recipientCount = w.recipient_mode === "segment"
    ? (segments.find(s => s.id === w.segment_id)?.contact_count ?? 0)
    : effectiveRecipients.length;

  // ── Detected variables (from CSV columns or contact properties, for the editor hint) ──
  const contactCustomKeys: string[] = w.recipient_mode === "contacts"
    ? [...new Set(
        allContacts.flatMap(c => Object.keys(c.custom_properties ?? {}))
      )].filter(k => k.toLowerCase() !== "email")
    : [];

  const templateVars = w.recipient_mode === "csv"
    ? w.csv_columns.filter(c => c.toLowerCase() !== "email")
    : w.recipient_mode === "contacts"
    ? ["first_name", "last_name", ...contactCustomKeys]
    : [];

  // ── Step validation ────────────────────────────────────────────────────────
  const step0Valid = !!w.name.trim() && !!w.from_email.trim() && !!w.from_name.trim();
  const step1Valid = w.recipient_mode === "segment"
    ? !!w.segment_id
    : w.recipient_mode === "contacts"
    ? contactTotal > 0
    : recipientCount > 0;
  const step2Valid = !!w.subject.trim() && !!w.html_body.trim();

  const handleEditorDone = useCallback((result: EmailEditorResult) => {
    setW(prev => ({
      ...prev,
      subject: result.subject,
      from_name: result.from_name,
      from_email: result.from_email,
      reply_to: result.reply_to,
      preview_text: result.preview_text,
      html_body: result.html_body,
      content_json: result.content_json,
    }));
    setShowEditor(false);
    setStep(1); // advance to Recipients step after design is done
  }, []);

  // ── Structured manual row helpers ─────────────────────────────────────────
  const addManualRow = useCallback(() => {
    const row: ParsedRecipient = { email: "" };
    templateVarsFromHtml.forEach(v => { row[v] = ""; });
    set("recipients", [...w.recipients, row]);
  }, [w.recipients, templateVarsFromHtml]);

  const updateManualRow = useCallback((idx: number, field: string, value: string) => {
    const updated = [...w.recipients];
    updated[idx] = { ...updated[idx]!, [field]: value };
    set("recipients", updated);
  }, [w.recipients]);

  const removeManualRow = useCallback((idx: number) => {
    set("recipients", w.recipients.filter((_, i) => i !== idx));
  }, [w.recipients]);

  // ── Contact search with debounce ───────────────────────────────────────────
  const handleContactSearchChange = useCallback((value: string) => {
    setContactSearch(value);
    clearTimeout(contactSearchTimer.current);
    contactSearchTimer.current = setTimeout(() => {
      setDebouncedContactSearch(value);
    }, 350);
  }, []);

  // ── Smart step navigation ─────────────────────────────────────────────────
  // Step index 1 is the Design step. Skip it when template is already pre-selected
  // so the user never sees a pointless "template already chosen → Continue" screen.
  const handleContinue = () => {
    const next = step + 1;
    setStep(next === 1 && selectedTemplateId ? 2 : next);
  };
  const handleBack = () => {
    const prev = step - 1;
    setStep(prev === 1 && selectedTemplateId ? 0 : prev);
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@"(),:;<>[\]\\]+@[^\s@"(),:;<>[\]\\]+\.[^\s@"(),:;<>[\]\\]{2,}$/;

  const handleSend = async () => {
    if (sending) return; // guard against double-click before re-render
    setSending(true);
    try {
      // Warn (non-blocking) when effective recipients have invalid email addresses
      if (w.recipient_mode !== "segment") {
        const invalidCount = effectiveRecipients.filter(r => !r.email || !EMAIL_RE.test(r.email)).length;
        if (invalidCount > 0) {
          toast.warning(
            `${invalidCount} recipient${invalidCount !== 1 ? "s" : ""} will be skipped`,
            { description: "Invalid email addresses cannot receive this campaign." },
          );
        }
      }

      const dto: CreateBroadcastDto = {
        name: w.name,
        subject: w.subject,
        from_name: w.from_name,
        from_email: w.from_email,
        html: w.html_body,
        email_type: w.email_type,
        segment_id: w.recipient_mode === "segment" ? w.segment_id : null,
        inline_recipients: w.recipient_mode !== "segment"
          ? (w.recipient_mode === "contacts" ? contactRecipients : effectiveRecipients)
          : undefined,
      };
      const broadcast = await createMutation.mutateAsync(dto);
      try {
        await api.delivery.sendBroadcast(broadcast.id);
        toast.success(`Campaign sent to ${recipientCount} recipients!`);
      } catch (sendErr) {
        const reason = sendErr instanceof Error ? sendErr.message : "Unknown error";
        toast.error(`Campaign saved but send failed: ${reason}. Find it in drafts to retry.`);
      }
      onCreated(broadcast.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!w.name.trim()) {
      toast.error("Enter a campaign name before saving");
      return;
    }
    try {
      const broadcast = await createMutation.mutateAsync({
        name: w.name,
        subject: w.subject || "(draft)",
        from_name: w.from_name,
        from_email: w.from_email || "draft@placeholder.local",
        html: w.html_body || "",
        email_type: w.email_type,
        segment_id: w.recipient_mode === "segment" ? w.segment_id : null,
        inline_recipients: w.recipient_mode !== "segment" ? effectiveRecipients : undefined,
      });
      toast.success("Saved as draft");
      onCreated(broadcast.id);
    } catch {
      toast.error("Failed to save draft");
    }
  };

  // ── Step 0: Compose (name + sender + subject + template) ──────────────────
  const renderCompose = () => {
    const savedTemplates = emailTemplates.filter(t => t.is_active);
    const filteredTemplates = savedTemplates.filter(t => {
      if (templateFilter === "all") return true;
      return inferTemplateType(t.body ?? "") === templateFilter;
    });

    return (
      <div className="space-y-5">
        {/* Campaign name — auto-filled, editable inline */}
        <div className="rounded-xl border bg-muted/20 px-4 py-3 space-y-1 focus-within:border-[#3ECF8E]/60 transition-colors">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign Name</p>
          <input
            className="w-full text-sm font-semibold bg-transparent outline-none placeholder:text-muted-foreground/50 text-foreground"
            placeholder="e.g. Python Batch April 2026 — Welcome"
            value={w.name}
            onChange={e => set("name", e.target.value)}
            autoFocus
          />
        </div>

        {/* Sender — compact pill, auto-selected */}
        {integrationsLoading ? (
          <div className="h-9 rounded-lg bg-muted/60 animate-pulse" />
        ) : (
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-7 h-7 rounded-full bg-[#3ECF8E]/10 flex items-center justify-center shrink-0">
              <MailIcon className="h-3.5 w-3.5 text-[#3ECF8E]" />
            </div>
            <p className="text-xs flex-1 min-w-0 truncate">
              <span className="font-semibold text-foreground">{w.from_name || "—"}</span>
              {w.from_email && (
                <span className="text-muted-foreground ml-1.5 font-mono">&lt;{w.from_email}&gt;</span>
              )}
              {selectedIntegrationId === "__platform__" && (
                <span className="ml-1.5 text-amber-500 text-[10px]">· platform sender</span>
              )}
            </p>
            {selectedIntegrationId === "__platform__" && (
              <a href="../settings/delivery" className="text-[10px] text-amber-500 hover:text-foreground underline shrink-0 whitespace-nowrap">
                Add custom sender
              </a>
            )}
            {showSenderDropdown && (
              <Select
                value={selectedIntegrationId}
                onValueChange={(id) => {
                  const opt = allSenderOptions.find(o => o.id === id);
                  if (!opt) return;
                  setSelectedIntegrationId(id);
                  setW(prev => ({ ...prev, from_name: opt.name, from_email: opt.email, reply_to: opt.replyTo }));
                }}
              >
                <SelectTrigger className="h-7 text-xs border-border bg-muted/40 px-2 w-fit">
                  <SelectValue placeholder="Change" />
                </SelectTrigger>
                <SelectContent>
                  {allSenderOptions.map(opt => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name} — {opt.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Subject */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
            Subject line <span className="text-red-400 normal-case font-normal">*</span>
          </Label>
          <Input
            placeholder="What's this email about?"
            value={w.subject}
            onChange={e => set("subject", e.target.value)}
            className="h-10"
          />
        </div>

        {/* Template picker */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Email template <span className="text-red-400 normal-case font-normal">*</span>
            </Label>
            {savedTemplates.length > 0 && (
              <div className="flex gap-1">
                {(["broadcast", "certificate", "all"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setTemplateFilter(f)}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border transition-colors font-medium",
                      templateFilter === f
                        ? "bg-foreground text-background border-foreground"
                        : "text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {f === "all" ? "All" : f === "broadcast" ? "Broadcast" : "Certificate"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {templatesLoading ? (
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {filteredTemplates.map(t => {
                  const isSelected = selectedTemplateId === t.id;
                  const [from, to] = tplGradient(t.id);
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTemplateId(t.id);
                        setW(prev => ({
                          ...prev,
                          html_body: t.body,
                          subject: prev.subject || t.email_subject || "",
                        }));
                      }}
                      className={cn(
                        "rounded-xl border-2 cursor-pointer transition-all overflow-hidden select-none group",
                        isSelected
                          ? "border-[#3ECF8E] shadow-md shadow-[#3ECF8E]/15"
                          : "border-border hover:border-[#3ECF8E]/50 hover:shadow-sm",
                      )}
                    >
                      <div
                        className="relative h-16 flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                      >
                        <MailIcon className="h-5 w-5 text-white/40" />
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                            <CheckCircle2 className="h-6 w-6 text-white drop-shadow" />
                          </div>
                        )}
                      </div>
                      <div className="px-2.5 py-2 border-t bg-card">
                        <p className="text-[10px] font-semibold truncate leading-tight">{t.name}</p>
                      </div>
                    </div>
                  );
                })}

                {/* Design from scratch */}
                <div
                  onClick={() => { setSelectedTemplateId(null); set("html_body", ""); setShowEditor(true); }}
                  className="rounded-xl border-2 border-dashed border-border hover:border-[#3ECF8E]/50 hover:bg-muted/20 cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 select-none"
                  style={{ minHeight: 96 }}
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                    <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-[10px] font-medium text-muted-foreground text-center leading-tight">
                    Design<br />from scratch
                  </p>
                </div>
              </div>

              {filteredTemplates.length === 0 && savedTemplates.length > 0 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  No {templateFilter} templates.{" "}
                  <button className="underline" onClick={() => setTemplateFilter("all")}>Show all</button>
                </p>
              )}
              {savedTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No templates yet.{" "}
                  <a href="../email-templates" className="underline font-medium">Create one in Email Templates</a>
                  {" "}or click "Design from scratch".
                </p>
              )}
            </>
          )}

          {selectedTemplateId && (
            <button
              onClick={() => setShowEditor(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="h-3.5 w-3.5" /> Preview &amp; edit this template
            </button>
          )}
        </div>

        {/* Advanced — email type + reply-to, collapsed */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-90")} />
            Advanced settings
          </button>
          {showAdvanced && (
            <div className="space-y-3 pl-4 border-l-2 border-border mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Email type</Label>
                <Select value={w.email_type} onValueChange={v => set("email_type", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                        <span className="ml-2 text-xs text-muted-foreground">{t.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Reply-to <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  placeholder={w.from_email || "Same as from email"}
                  value={w.reply_to}
                  onChange={e => set("reply_to", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Step 1: Recipients ─────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-4">
      {/* Template variable hint — shown at top so user knows what columns to prepare */}
      {templateVarsFromHtml.length > 0 && (
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-xs text-blue-800 dark:text-blue-200 ml-1">
            <span className="font-medium">Your email uses these variables:</span>{" "}
            {templateVarsFromHtml.map(v => (
              <code key={v} className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded mx-0.5 font-mono">
                {`{{${v}}}`}
              </code>
            ))}
            <span className="block mt-1 text-blue-600 dark:text-blue-300">
              Make sure your data includes matching columns so each recipient gets a personalised email.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Mode tabs */}
      <div className="flex rounded-lg border overflow-hidden flex-wrap">
        {([
          { mode: "csv" as RecipientMode, icon: <FileSpreadsheet className="h-4 w-4" />, label: "Upload file" },
          { mode: "contacts" as RecipientMode, icon: <Users className="h-4 w-4" />, label: "From contacts" },
          { mode: "manual" as RecipientMode, icon: <PenLine className="h-4 w-4" />, label: "Enter manually" },
          { mode: "segment" as RecipientMode, icon: <RefreshCw className="h-4 w-4" />, label: "Use segment" },
        ] as const).map(({ mode, icon, label }) => (
          <button
            key={mode}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors min-w-28",
              w.recipient_mode === mode
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted text-muted-foreground",
            )}
            onClick={() => {
              if (mode !== w.recipient_mode) {
                set("recipients", []);
                set("csv_columns", []);
                set("manual_emails", "");
                setSelectedContactIds(new Set());
              }
              set("recipient_mode", mode);
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* CSV upload */}
      {w.recipient_mode === "csv" && (
        <div className="space-y-3">
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              uploading ? "border-primary/50 bg-primary/5" : "hover:border-primary/50 hover:bg-muted/30",
            )}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 text-primary mx-auto mb-2 animate-spin" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            )}
            <p className="font-medium text-sm">
              {uploading ? "Parsing file…" : "Drop your Excel or CSV file here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Required column: <code className="bg-muted px-1 rounded">email</code>
              {templateVarsFromHtml.length > 0 && (
                <> — also add columns: {templateVarsFromHtml.map((v, i) => (
                  <span key={v}><code className="bg-muted px-1 rounded">{v}</code>{i < templateVarsFromHtml.length - 1 ? ", " : ""}</span>
                ))}</>
              )}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </div>

          {w.recipients.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="inline h-4 w-4 mr-1" />
                  {w.recipients.length} recipients loaded
                </p>
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => { set("recipients", []); set("csv_columns", []); }}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              </div>

              {/* Template variable coverage — shows which vars are satisfied by CSV columns */}
              {templateVarsFromHtml.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
                    Template variable coverage
                  </div>
                  <div className="divide-y">
                    {templateVarsFromHtml.map(v => {
                      const matchedCol = w.csv_columns.find(c => c.toLowerCase() === v.toLowerCase());
                      return (
                        <div key={v} className="flex items-center gap-3 px-3 py-2 text-xs">
                          {matchedCol ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                          <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{`{{${v}}}`}</code>
                          {matchedCol ? (
                            <span className="text-green-700 dark:text-green-400">
                              matched by <span className="font-medium">"{matchedCol}"</span> column
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">
                              no matching column — will be blank for all recipients
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available columns (non-template info) */}
              {w.csv_columns.filter(c => c.toLowerCase() !== "email" && !templateVarsFromHtml.some(v => v.toLowerCase() === c.toLowerCase())).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Extra columns in file (not used as variables):{" "}
                  {w.csv_columns.filter(c => c.toLowerCase() !== "email" && !templateVarsFromHtml.some(v => v.toLowerCase() === c.toLowerCase())).map(c => (
                    <code key={c} className="bg-muted px-1 rounded mx-0.5">{c}</code>
                  ))}
                </p>
              )}

              {/* Preview table */}
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      {w.csv_columns.slice(0, 5).map(col => (
                        <th key={col} className="text-left px-3 py-2 font-medium text-muted-foreground">{col}</th>
                      ))}
                      {w.csv_columns.length > 5 && <th className="px-3 py-2 text-muted-foreground">…</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {w.recipients.slice(0, 4).map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {w.csv_columns.slice(0, 5).map(col => (
                          <td key={col} className="px-3 py-2 text-muted-foreground truncate max-w-32">{r[col] ?? "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {w.recipients.length > 4 && (
                  <p className="text-xs text-muted-foreground px-3 py-2 border-t">
                    +{w.recipients.length - 4} more rows
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual entry */}
      {w.recipient_mode === "manual" && (
        isStructuredManual ? (
          /* Structured table when template has variables */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Recipients <span className="text-red-500">*</span></Label>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addManualRow}>
                <Plus className="h-3 w-3 mr-1" /> Add row
              </Button>
            </div>

            {w.recipients.length === 0 ? (
              <div
                className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={addManualRow}
              >
                <PenLine className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Add your first recipient</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Fill in email + personalised values for each person
                </p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-44">Email *</th>
                      {templateVarsFromHtml.map(v => (
                        <th key={v} className="text-left px-3 py-2 font-medium text-muted-foreground min-w-32">
                          <code className="font-mono text-[11px] bg-muted px-1 rounded">{`{{${v}}}`}</code>
                        </th>
                      ))}
                      <th className="w-8 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {w.recipients.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="px-2 py-1.5">
                          <Input
                            value={row.email}
                            onChange={e => updateManualRow(i, "email", e.target.value)}
                            placeholder="email@example.com"
                            className="h-7 text-xs font-mono"
                          />
                        </td>
                        {templateVarsFromHtml.map(v => (
                          <td key={v} className="px-2 py-1.5">
                            <Input
                              value={(row[v] as string) ?? ""}
                              onChange={e => updateManualRow(i, v, e.target.value)}
                              placeholder={v}
                              className="h-7 text-xs"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => removeManualRow(i)}
                            className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {w.recipients.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600 font-medium">
                  {w.recipients.filter(r => r.email?.includes("@")).length} valid recipients
                </span>
                {w.recipients.some(r => !r.email?.includes("@")) && (
                  <span className="text-amber-600 ml-2">
                    ({w.recipients.filter(r => !r.email?.includes("@")).length} rows missing a valid email)
                  </span>
                )}
              </p>
            )}
          </div>
        ) : (
          /* Simple textarea when no template variables */
          <div className="space-y-2">
            <Label>Email addresses</Label>
            <Textarea
              placeholder={"ravi@example.com\npriya@example.com\nananya@example.com"}
              value={w.manual_emails}
              onChange={e => set("manual_emails", e.target.value)}
              className="min-h-40 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              One per line, or comma/semicolon separated.
              {parseManualEmails(w.manual_emails).length > 0 && (
                <span className="text-green-600 ml-2 font-medium">
                  {parseManualEmails(w.manual_emails).length} valid emails detected
                </span>
              )}
            </p>
          </div>
        )
      )}

      {/* Contacts picker */}
      {w.recipient_mode === "contacts" && (
        <div className="space-y-3">
          {initialSourceRef && (
            <Alert className="border-primary/30 bg-primary/5 py-2">
              <AlertDescription className="text-xs text-primary">
                Showing contacts from your imported file — all {contactTotal > 0 ? contactTotal.toLocaleString() : ""} will be included unless you deselect some.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts…"
                value={contactSearch}
                onChange={e => handleContactSearchChange(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            {selectedContactIds.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-9 shrink-0"
                onClick={() => setSelectedContactIds(new Set())}
              >
                <X className="h-3 w-3 mr-1" /> Clear selection
              </Button>
            )}
          </div>

          {contactTotal === 0 && !contactsLoading ? (
            <Alert>
              <AlertDescription>
                No subscribed contacts yet.{" "}
                <a href="../contacts" className="underline">Import contacts</a> first, then come back.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{contactTotal} subscribed contact{contactTotal !== 1 ? "s" : ""}</span>
                {selectedContactIds.size > 0 ? (
                  <span className="text-primary font-medium">{selectedContactIds.size} selected</span>
                ) : (
                  <span>
                    All {Math.min(contactTotal, 200)} will be used
                    {contactTotal > 200 && " (first 200 loaded)"}
                  </span>
                )}
              </div>

              {contactsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
                  {allContacts.map(c => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                    const isSelected = selectedContactIds.has(c.id);
                    const customKeys = Object.keys(c.custom_properties ?? {});
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 border-b last:border-0 cursor-pointer transition-colors",
                          isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30",
                        )}
                        onClick={() => {
                          setSelectedContactIds(prev => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        }}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border-2 shrink-0",
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/40",
                        )}>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-mono truncate">{c.email}</p>
                          {name && <p className="text-xs text-muted-foreground">{name}</p>}
                          {customKeys.length > 0 && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {customKeys.slice(0, 3).join(", ")}
                              {customKeys.length > 3 && ` +${customKeys.length - 3} more`}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Variable coverage from contact properties */}
              {templateVarsFromHtml.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
                    Template variable coverage
                  </div>
                  <div className="divide-y">
                    {templateVarsFromHtml.map(v => {
                      const available = ["first_name", "last_name", ...contactCustomKeys];
                      const matched = available.some(k => k.toLowerCase() === v.toLowerCase());
                      return (
                        <div key={v} className="flex items-center gap-3 px-3 py-2 text-xs">
                          {matched ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                          <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{`{{${v}}}`}</code>
                          {matched ? (
                            <span className="text-green-700 dark:text-green-400">available from contacts</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">not in contact data — will be blank</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Add more recipients — stacked below contacts when coming from contacts page */}
          {initialSourceRef && (
            <div className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                <span className="text-xs font-medium text-muted-foreground">Add more recipients</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setShowAddMore(showAddMore === "file" ? null : "file")}
                    className={cn(
                      "flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors",
                      showAddMore === "file" ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/30 text-muted-foreground",
                    )}
                  >
                    <Upload className="h-3 w-3" /> Upload file
                  </button>
                  <button
                    onClick={() => setShowAddMore(showAddMore === "manual" ? null : "manual")}
                    className={cn(
                      "flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors",
                      showAddMore === "manual" ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/30 text-muted-foreground",
                    )}
                  >
                    <PenLine className="h-3 w-3" /> Enter manually
                  </button>
                </div>
              </div>

              {showAddMore === "file" && (
                <div className="p-3 space-y-2">
                  <div
                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                    onClick={() => extraFileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleExtraFile(f); }}
                  >
                    <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Drop a CSV / Excel file or click to browse</p>
                    <input
                      ref={extraFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleExtraFile(f); e.target.value = ""; }}
                    />
                  </div>
                  {w.extra_recipients.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        <CheckCircle2 className="h-3 w-3 inline mr-1" />{w.extra_recipients.length} extra recipients added
                      </span>
                      <button
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => set("extra_recipients", [])}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showAddMore === "manual" && (
                <div className="p-3 space-y-2">
                  <Textarea
                    placeholder={"ravi@example.com\npriya@example.com\nananya@example.com"}
                    value={w.extra_manual_emails}
                    onChange={e => set("extra_manual_emails", e.target.value)}
                    className="min-h-24 font-mono text-xs"
                  />
                  {extraManualRecipients.length > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      <CheckCircle2 className="h-3 w-3 inline mr-1" />{extraManualRecipients.length} additional emails detected
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Segment picker */}
      {w.recipient_mode === "segment" && (
        <div className="space-y-2">
          <Label>Select segment</Label>
          {segments.length === 0 ? (
            <Alert>
              <AlertDescription>
                No segments yet. <a href="../segments" className="underline">Create a segment</a> first, or use CSV upload / manual entry.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {segments.map(s => (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-4 py-3 cursor-pointer transition-colors",
                    w.segment_id === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/30",
                  )}
                  onClick={() => set("segment_id", s.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0",
                      w.segment_id === s.id ? "border-primary bg-primary" : "border-muted-foreground",
                    )} />
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{s.contact_count.toLocaleString()} contacts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Variable mismatch summary — shown when template uses vars not available in recipient data */}
      {(() => {
        const missingVars = templateVarsFromHtml.filter(
          v => !templateVars.some(t => t.toLowerCase() === v.toLowerCase()),
        );
        const hasRecipients = w.recipient_mode === "segment"
          ? !!w.segment_id
          : w.recipient_mode === "contacts"
          ? contactTotal > 0
          : recipientCount > 0;
        if (missingVars.length === 0 || !hasRecipients) return null;
        return (
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-200 ml-1">
              <span className="font-medium">
                {missingVars.length === 1
                  ? "1 template variable"
                  : `${missingVars.length} template variables`}{" "}
                {missingVars.length === 1 ? "is" : "are"} not available from your recipient data:
              </span>{" "}
              {missingVars.map(v => (
                <code key={v} className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded mx-0.5 font-mono">
                  {`{{${v}}}`}
                </code>
              ))}
              <span className="block mt-1 text-amber-700 dark:text-amber-300">
                {w.recipient_mode === "segment"
                  ? "Segment contacts may not have these properties — those placeholders will be blank."
                  : "These placeholders will render as blank for all recipients."}
              </span>
            </AlertDescription>
          </Alert>
        );
      })()}
    </div>
  );

  // ── 2-step wizard: Compose → Recipients ───────────────────────────────────
  const composeValid = !!w.name.trim() && !!w.from_email.trim() && !!w.subject.trim() && !!w.html_body.trim();
  const stepRenders = [renderCompose, renderStep1];
  const stepValid   = [composeValid, step1Valid];

  const recipientSummary =
    w.recipient_mode === "segment"
      ? `${recipientCount} in "${segments.find(s => s.id === w.segment_id)?.name ?? "segment"}"`
      : w.recipient_mode === "contacts"
      ? selectedContactIds.size > 0
        ? `${selectedContactIds.size} selected`
        : `All ${contactTotal} contacts`
      : `${recipientCount} recipients`;

  return (
    <>
    {showEditor && (
      <EmailEditor
        campaignName={w.name}
        subject={w.subject}
        fromName={w.from_name}
        fromEmail={w.from_email}
        replyTo={w.reply_to}
        initialHtml={w.html_body || undefined}
        availableVars={templateVars}
        suppressGallery={selectedTemplateId !== null}
        onDone={handleEditorDone}
        onBack={() => setShowEditor(false)}
      />
    )}
    {!showEditor && (
      <div className="space-y-5">
        <WizardSteps current={step} />

        <div className="min-h-48">
          {stepRenders[step]?.()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground/70 hover:text-foreground text-xs"
              onClick={handleSaveDraft}
            >
              Save draft
            </Button>
          </div>

          {step === 0 ? (
            <Button
              disabled={!composeValid}
              onClick={() => setStep(1)}
              className="bg-[#3ECF8E] hover:bg-[#34b87a] text-white gap-1.5 h-9 px-4"
            >
              Choose recipients <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              {recipientCount > 0 && (
                <p className="text-xs text-muted-foreground hidden sm:block">
                  <span className="font-semibold text-foreground">{recipientSummary}</span>
                </p>
              )}
              <Button
                disabled={!step1Valid || sending}
                onClick={handleSend}
                className="bg-[#3ECF8E] hover:bg-[#34b87a] text-white gap-2 h-9 px-5"
              >
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><Send className="h-4 w-4" /> Send Campaign</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}

// ── Broadcast card (expandable accordion) ─────────────────────────────────────

function BroadcastCard({
  broadcast,
  onDelete,
}: {
  broadcast: EmailBroadcast;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[broadcast.status];
  const bc = broadcast as unknown as {
    from_name?: string; from_email?: string; email_type?: string; failed_count?: number;
  };

  const sentDate = broadcast.sent_at
    ? format(new Date(broadcast.sent_at), "dd MMM yyyy, HH:mm")
    : format(new Date(broadcast.created_at), "dd MMM yyyy");

  const deliveryRate = broadcast.status === "sent" && broadcast.total_recipients > 0
    ? Math.round((broadcast.delivered_count / broadcast.total_recipients) * 100)
    : null;

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-all",
      expanded ? "shadow-sm" : "",
    )}>
      {/* ── Header row (always visible, click to expand) ── */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/20 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <ChevronRight className={cn(
          "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
          expanded && "rotate-90",
        )} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate leading-snug">{broadcast.name}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{broadcast.subject}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn("text-xs flex items-center gap-1 shrink-0", cfg.className)}>
            {cfg.icon} {cfg.label}
          </Badge>
          <span className="text-xs text-muted-foreground tabular-nums hidden sm:flex items-center gap-1">
            <Users className="h-3 w-3" /> {broadcast.total_recipients.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground hidden md:block tabular-nums shrink-0">{sentDate}</span>
          <div onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="border-t bg-muted/5 px-4 py-4 space-y-4">
          {/* Delivery stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recipients</p>
              <p className="text-base font-bold tabular-nums">{broadcast.total_recipients.toLocaleString()}</p>
            </div>
            {broadcast.status === "sent" ? (
              <>
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Delivered</p>
                  <p className="text-base font-bold tabular-nums text-green-600 dark:text-green-400">
                    {broadcast.delivered_count.toLocaleString()}
                    {deliveryRate !== null && (
                      <span className="text-xs font-normal text-muted-foreground ml-1">({deliveryRate}%)</span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Failed</p>
                  <p className={cn(
                    "text-base font-bold tabular-nums",
                    (bc.failed_count ?? 0) > 0 ? "text-red-500" : "text-muted-foreground",
                  )}>
                    {(bc.failed_count ?? 0).toLocaleString()}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-lg border bg-card px-3 py-2.5 col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                <p className="text-sm font-medium">{cfg.label}</p>
              </div>
            )}
          </div>

          {/* Meta rows */}
          <div className="space-y-2 text-xs">
            {bc.from_email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MailIcon className="h-3.5 w-3.5 shrink-0" />
                <span>From</span>
                <span className="font-medium text-foreground">
                  {bc.from_name || bc.from_email}
                </span>
                {bc.from_name && (
                  <span className="font-mono text-muted-foreground/70">&lt;{bc.from_email}&gt;</span>
                )}
              </div>
            )}
            {bc.email_type && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Type</span>
                <span className="font-medium text-foreground capitalize">{bc.email_type.replace(/_/g, " ")}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{broadcast.sent_at ? "Sent" : "Created"}</span>
              <span className="font-medium text-foreground">{sentDate}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function BroadcastsContent({
  initialTemplateId,
  initialSourceRef,
  embedded,
}: {
  initialTemplateId?: string;
  initialSourceRef?: string;
  embedded?: boolean;
} = {}) {
  const { broadcasts, loading, refetch } = useEmailBroadcasts();
  const deleteMutation = useDeleteBroadcast();
  const router = useRouter();

  // Open wizard automatically when coming from contacts (source_ref) or with a pre-selected template
  const [showWizard, setShowWizard] = useState(!!(initialTemplateId || initialSourceRef));
  const [deleteTarget, setDeleteTarget] = useState<EmailBroadcast | null>(null);

  const drafts = broadcasts.filter(b => b.status === "draft");
  const sent   = broadcasts.filter(b => b.status !== "draft");

  // ── Focused view when entering from contacts page ─────────────────────────
  if (initialSourceRef) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 text-muted-foreground h-8" onClick={() => router.back()}>
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Contacts
        </Button>
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b bg-muted/20">
            <Megaphone className="h-4 w-4 text-[#3ECF8E]" />
            <h2 className="text-sm font-semibold">New Broadcast Campaign</h2>
          </div>
          <div className="px-5 py-5">
            <CampaignWizard
              onClose={() => router.back()}
              onCreated={() => router.replace(window.location.pathname.replace(/\?.*$/, ""))}
              initialTemplateId={initialTemplateId}
              initialSourceRef={initialSourceRef}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-5" : "space-y-5"}>
      {/* Header — only shown when wizard is closed */}
      {!showWizard && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Send emails to batches, courses, or any group of recipients
            </p>
          </div>
          <Button
            onClick={() => setShowWizard(true)}
            className="bg-[#3ECF8E] hover:bg-[#34b87a] text-white h-9 px-4 gap-2"
          >
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        </div>
      )}

      {/* Wizard — full-width panel, no card-in-card */}
      {showWizard && (
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/20">
            <Megaphone className="h-4 w-4 text-[#3ECF8E] shrink-0" />
            <h2 className="text-sm font-semibold flex-1">New Campaign</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setShowWizard(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="px-5 py-5">
            <CampaignWizard
              onClose={() => setShowWizard(false)}
              onCreated={() => { setShowWizard(false); refetch(); }}
              initialTemplateId={initialTemplateId}
              initialSourceRef={initialSourceRef}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && broadcasts.length === 0 && !showWizard && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#3ECF8E]/10 flex items-center justify-center mb-4">
            <Megaphone className="h-7 w-7 text-[#3ECF8E]" />
          </div>
          <p className="font-semibold text-lg">No campaigns yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Send emails to a batch, course cohort, or any group of recipients
          </p>
          <Button
            className="mt-5 bg-[#3ECF8E] hover:bg-[#34b87a] text-white gap-2"
            onClick={() => setShowWizard(true)}
          >
            <Plus className="h-4 w-4" /> Create first campaign
          </Button>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
      )}

      {!showWizard && drafts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Drafts</h2>
          {drafts.map(b => (
            <BroadcastCard key={b.id} broadcast={b} onDelete={() => setDeleteTarget(b)} />
          ))}
        </div>
      )}

      {!showWizard && sent.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Sent</h2>
          {sent.map(b => (
            <BroadcastCard key={b.id} broadcast={b} onDelete={() => setDeleteTarget(b)} />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate(deleteTarget.id, {
                  onSuccess: () => { toast.success("Deleted"); setDeleteTarget(null); },
                  onError: () => toast.error("Failed to delete"),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BroadcastsPageInner() {
  const searchParams = useSearchParams();
  const fromTemplate = searchParams.get("fromTemplate") ?? undefined;
  const sourceRef = searchParams.get("source_ref") ?? undefined;
  return <BroadcastsContent initialTemplateId={fromTemplate} initialSourceRef={sourceRef} />;
}

export default function BroadcastsPage() {
  return (
    <Suspense fallback={<BroadcastsContent />}>
      <BroadcastsPageInner />
    </Suspense>
  );
}
