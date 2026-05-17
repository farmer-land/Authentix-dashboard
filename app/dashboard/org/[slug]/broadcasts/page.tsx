"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  useEmailContacts,
} from "@/lib/hooks/queries/delivery";
import { useEmailSegments } from "@/lib/hooks/queries/delivery";
import type { EmailBroadcast, BroadcastStatus, CreateBroadcastDto } from "@/lib/api/client";
import { api } from "@/lib/api/client";
import { EmailEditor, type EmailEditorResult } from "./EmailEditor";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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

function Steps({ current }: { current: number }) {
  const steps = ["Campaign info", "Design email", "Recipients", "Review & Send"];
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className={cn(
            "flex items-center gap-2 text-sm font-medium",
            i < current  ? "text-primary" : i === current ? "text-foreground" : "text-muted-foreground",
          )}>
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border-2",
              i < current  ? "border-primary bg-primary text-primary-foreground" :
              i === current ? "border-foreground bg-background text-foreground" :
                              "border-muted-foreground/30 bg-background text-muted-foreground",
            )}>
              {i < current ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className="hidden sm:block">{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px w-8 mx-2", i < current ? "bg-primary" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Wizard ─────────────────────────────────────────────────────────────────────

function CampaignWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { segments } = useEmailSegments();
  const createMutation = useCreateBroadcast();
  const { integrations: rawIntegrations } = useDeliveryIntegrations();
  const [contactSearch, setContactSearch] = useState("");
  const { contacts: allContacts, total: contactTotal, loading: contactsLoading } = useEmailContacts({
    limit: 200,
    offset: 0,
    search: contactSearch || undefined,
    unsubscribed: false,
  });
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('');
  const didAutoSelect = useRef(false);

  const activeIntegrations = rawIntegrations.filter(i => i.channel === 'email' && i.is_active);
  const integrationOptions = activeIntegrations.map(i => ({
    id: i.id,
    name: i.from_name ?? i.display_name,
    email: i.from_email ?? '',
    replyTo: i.reply_to ?? '',
  }));

  const [w, setW] = useState<WizardState>({
    name: "",
    email_type: "lifecycle",
    from_name: "",
    from_email: "",
    reply_to: "",
    recipient_mode: "csv",
    recipients: [],
    csv_columns: [],
    manual_emails: "",
    segment_id: "",
    contacts_search: "",
    subject: "",
    preview_text: "",
    html_body: "",
    content_json: null,
  });

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setW(prev => ({ ...prev, [key]: value }));

  // Auto-select default integration once integrations load
  useEffect(() => {
    if (didAutoSelect.current || activeIntegrations.length === 0) return;
    didAutoSelect.current = true;
    const def = activeIntegrations.find(i => i.is_default) ?? activeIntegrations[0]!;
    setSelectedIntegrationId(def.id);
    setW(prev => ({
      ...prev,
      from_name: def.from_name ?? def.display_name,
      from_email: def.from_email ?? '',
      reply_to: def.reply_to ?? '',
    }));
  }, [activeIntegrations]);

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

  // ── Template variables used in the composed HTML ──────────────────────────
  const templateVarsFromHtml: string[] = w.html_body
    ? [...new Set([...w.html_body.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]!))]
        .filter(v => v.toLowerCase() !== "email")
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

  const effectiveRecipients = isStructuredManual
    ? w.recipients.filter(r => r.email?.includes("@"))
    : w.recipient_mode === "manual"
    ? parseManualEmails(w.manual_emails)
    : w.recipient_mode === "csv" ? w.recipients
    : w.recipient_mode === "contacts" ? contactRecipients
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
  const step0Valid = w.name.trim() && w.from_email.trim() && w.from_name.trim();
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
    setStep(2); // advance to Recipients step after design is done
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

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    setSending(true);
    try {
      const dto: CreateBroadcastDto = {
        name: w.name,
        subject: w.subject,
        from_name: w.from_name,
        from_email: w.from_email,
        html: w.html_body,                               // map internal state name → API field
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
        toast.error("Campaign saved but send failed — find it in drafts to retry.");
      }
      onCreated(broadcast.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const broadcast = await createMutation.mutateAsync({
        name: w.name,
        subject: w.subject || "(draft)",
        from_name: w.from_name,
        from_email: w.from_email,
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

  // ── Step 0: Campaign info ──────────────────────────────────────────────────
  const renderStep0 = () => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Campaign name <span className="text-red-500">*</span></Label>
        <Input
          placeholder="e.g. Python Batch April 2026 — Welcome"
          value={w.name}
          onChange={e => set("name", e.target.value)}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">For your reference only, not shown to recipients.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Email type</Label>
        <div className="grid grid-cols-1 gap-2">
          {EMAIL_TYPES.map(t => (
            <div
              key={t.value}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
                w.email_type === t.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/30",
              )}
              onClick={() => set("email_type", t.value)}
            >
              <div className={cn(
                "w-4 h-4 rounded-full border-2 shrink-0",
                w.email_type === t.value ? "border-primary bg-primary" : "border-muted-foreground",
              )} />
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Send From <span className="text-red-500">*</span></Label>
        {integrationOptions.length > 0 ? (
          <Select
            value={selectedIntegrationId}
            onValueChange={(id) => {
              const opt = integrationOptions.find(o => o.id === id);
              if (!opt) return;
              setSelectedIntegrationId(id);
              setW(prev => ({ ...prev, from_name: opt.name, from_email: opt.email, reply_to: opt.replyTo }));
            }}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select sender…" />
            </SelectTrigger>
            <SelectContent>
              {integrationOptions.map(opt => (
                <SelectItem key={opt.id} value={opt.id}>
                  <span className="flex items-center gap-2">
                    <span>{opt.name}</span>
                    <span className="text-xs text-muted-foreground">{opt.email}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Sender name"
              value={w.from_name}
              onChange={e => set("from_name", e.target.value)}
            />
            <Input
              placeholder="hello@yourdomain.com"
              value={w.from_email}
              onChange={e => set("from_email", e.target.value)}
            />
          </div>
        )}
        {integrationOptions.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No email integrations configured. <a href="../settings/delivery" className="underline">Set one up</a> to auto-fill this.</p>
        )}
        {w.from_email && (
          <p className="text-[11px] text-muted-foreground">Sending as: <span className="font-medium text-foreground">{w.from_name} &lt;{w.from_email}&gt;</span></p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Reply-to <span className="text-xs text-muted-foreground">(optional)</span></Label>
        <Input
          placeholder="Same as from email"
          value={w.reply_to}
          onChange={e => set("reply_to", e.target.value)}
        />
      </div>
    </div>
  );

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
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts…"
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
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
    </div>
  );

  // ── Step 2: Design ────────────────────────────────────────────────────────
  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Subject line <span className="text-red-500">*</span></Label>
        <Input
          placeholder="Welcome to Python Batch — April 2026!"
          value={w.subject}
          onChange={e => set("subject", e.target.value)}
          autoFocus
        />
      </div>

      {templateVars.length > 0 && (
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <AlertDescription className="text-xs text-blue-800 dark:text-blue-200">
            <span className="font-medium">Variables available in the editor:</span>{" "}
            {templateVars.map(v => (
              <code key={v} className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded mx-0.5">
                {`{{${v}}}`}
              </code>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Email design <span className="text-red-500">*</span></Label>
          {w.html_body && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6"
              onClick={() => setShowEditor(true)}
            >
              <Edit2 className="h-3 w-3 mr-1" /> Redesign
            </Button>
          )}
        </div>

        {w.html_body ? (
          <div className="rounded-lg border bg-muted/20 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 text-xs text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Email designed — click "Redesign" to edit
            </div>
            <div className="p-3 max-h-40 overflow-hidden pointer-events-none">
              <div
                className="text-xs origin-top-left scale-[0.7]"
                style={{ width: "143%" }}
                dangerouslySetInnerHTML={{ __html: w.html_body }}
              />
            </div>
          </div>
        ) : (
          <div
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => setShowEditor(true)}
          >
            <MailIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-medium text-sm">Design your email</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use the visual editor to compose a beautiful email
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={e => { e.stopPropagation(); setShowEditor(true); }}
            >
              Open editor
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Step 3: Review & Send ──────────────────────────────────────────────────
  const renderStep3 = () => {
    // Detect {{variables}} actually used in the composed HTML body
    const htmlVars = [...new Set(
      [...(w.html_body.matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]!)
    )];

    // Case-insensitive set of column names available from the recipient data
    const availableCols = new Set(
      w.csv_columns.map(c => c.toLowerCase()).filter(c => c !== "email")
    );

    // Variables in the HTML that have no corresponding data column
    const missingVars = htmlVars.filter(v => !availableCols.has(v.toLowerCase()));

    // Show warning when variables can't be filled
    const showVarWarning =
      htmlVars.length > 0 &&
      (w.recipient_mode === "manual" ||
        (w.recipient_mode === "csv" && missingVars.length > 0));

    const sample = effectiveRecipients[0];
    // Build a case-insensitive lookup from the first recipient row
    const sampleLower: Record<string, string> = {};
    if (sample) {
      for (const [k, v] of Object.entries(sample)) {
        sampleLower[k.toLowerCase()] = String(v);
      }
    }

    return (
      <div className="space-y-4">
        <div className="rounded-xl border divide-y overflow-hidden">
          <ReviewRow label="Campaign" value={w.name} />
          <ReviewRow label="Email type" value={EMAIL_TYPES.find(t => t.value === w.email_type)?.label ?? w.email_type} />
          <ReviewRow label="From" value={`${w.from_name} <${w.from_email}>`} />

          {/* Editable subject — user can tweak it right before sending */}
          <div className="flex items-center gap-4 px-4 py-2">
            <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">Subject</span>
            <input
              type="text"
              value={w.subject}
              onChange={e => set("subject", e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none border-b border-transparent focus:border-border transition-colors py-1 min-w-0"
              placeholder="Enter subject line…"
            />
          </div>

          <ReviewRow
            label="Recipients"
            value={
              w.recipient_mode === "segment"
                ? `${recipientCount} contacts in "${segments.find(s => s.id === w.segment_id)?.name ?? "segment"}"`
                : w.recipient_mode === "csv"
                ? `${recipientCount} recipients from file`
                : w.recipient_mode === "contacts"
                ? selectedContactIds.size > 0
                  ? `${selectedContactIds.size} selected contacts`
                  : `All ${contactTotal} subscribed contacts`
                : `${recipientCount} emails entered manually`
            }
          />
          {htmlVars.length > 0 && (
            <ReviewRow label="Variables" value={htmlVars.map(v => `{{${v}}}`).join(", ")} />
          )}
        </div>

        {/* Variable mismatch warning */}
        {showVarWarning && (
          <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription className="text-orange-800 dark:text-orange-200 text-xs">
              {w.recipient_mode === "manual" ? (
                <>
                  <span className="font-medium">No data columns for variables.</span>{" "}
                  Your email uses{" "}
                  {htmlVars.map(v => (
                    <code key={v} className="bg-orange-100 dark:bg-orange-900/40 px-1 rounded mx-0.5">{`{{${v}}}`}</code>
                  ))}{" "}
                  but manual entry has no named columns — these will be left blank in each email.
                </>
              ) : (
                <>
                  <span className="font-medium">{missingVars.length} variable{missingVars.length !== 1 ? "s" : ""} not in CSV.</span>{" "}
                  {missingVars.map(v => (
                    <code key={v} className="bg-orange-100 dark:bg-orange-900/40 px-1 rounded mx-0.5">{`{{${v}}}`}</code>
                  ))}{" "}
                  {missingVars.length === 1 ? "is" : "are"} used in the email but not found as a column in your CSV — {missingVars.length === 1 ? "it" : "they"} will be sent blank.
                  {availableCols.size > 0 && (
                    <span className="block mt-1">
                      Available columns:{" "}
                      {[...availableCols].map(c => (
                        <code key={c} className="bg-orange-100 dark:bg-orange-900/40 px-1 rounded mx-0.5">{`{{${c}}}`}</code>
                      ))}
                    </span>
                  )}
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Body preview with first-recipient substitution */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Email preview</p>
          <div className="rounded-lg border p-4 bg-white dark:bg-gray-950 text-sm max-h-64 overflow-y-auto">
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: w.html_body.replace(
                  /\{\{(\w+)\}\}/g,
                  (_, key: string) => {
                    // Try exact match first, then case-insensitive
                    const val = sample?.[key] ?? sampleLower[key.toLowerCase()];
                    return val !== undefined
                      ? val
                      : `<span style="background:#fef3c7;color:#92400e;padding:0 3px;border-radius:3px;font-size:0.8em">{{${key}}}</span>`;
                  },
                ),
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {sample
              ? "Preview shows first recipient's data. Highlighted variables have no matching column."
              : "No recipient data to preview — variables will appear blank in sent emails."}
          </p>
        </div>

        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
            <span className="font-medium">Ready to send to {recipientCount} recipients.</span> This cannot be undone once sent.
          </AlertDescription>
        </Alert>
      </div>
    );
  };

  // Order: Campaign info → Design email → Recipients → Review & Send
  const steps = [renderStep0, renderStep2, renderStep1, renderStep3];
  const stepValid = [step0Valid, step2Valid, step1Valid, true];

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
        onDone={handleEditorDone}
        onBack={() => setShowEditor(false)}
      />
    )}
    {!showEditor && <div className="space-y-4">
      <Steps current={step} />

      <div className="min-h-64">
        {steps[step]?.()}
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          <Button variant="ghost" className="text-muted-foreground" onClick={handleSaveDraft}>
            Save draft
          </Button>
        </div>

        {step < 3 ? (
          <Button
            disabled={!stepValid[step]}
            onClick={() => setStep(s => s + 1)}
          >
            Continue <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            disabled={sending}
            onClick={handleSend}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending…</>
              : <><Send className="h-4 w-4 mr-2" /> Send campaign</>}
          </Button>
        )}
      </div>
    </div>}
    </>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

// ── Broadcast card (list view) ─────────────────────────────────────────────────

function BroadcastCard({
  broadcast,
  onDelete,
}: {
  broadcast: EmailBroadcast;
  onDelete: () => void;
}) {
  const cfg = STATUS_CONFIG[broadcast.status];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{broadcast.name}</CardTitle>
            <CardDescription className="text-xs mt-0.5 truncate">{broadcast.subject}</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={cn("text-xs flex items-center gap-1", cfg.className)}>
              {cfg.icon} {cfg.label}
            </Badge>
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
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {broadcast.total_recipients.toLocaleString()} recipients
          </span>
          {broadcast.status === "sent" && (
            <>
              <span className="text-green-600">{broadcast.delivered_count} delivered</span>
              {(broadcast as unknown as { failed_count?: number }).failed_count
                ? <span className="text-red-600">{(broadcast as unknown as { failed_count: number }).failed_count} failed</span>
                : null}
            </>
          )}
          <span className="ml-auto">
            {broadcast.sent_at
              ? format(new Date(broadcast.sent_at), "dd MMM yyyy, HH:mm")
              : format(new Date(broadcast.created_at), "dd MMM yyyy")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BroadcastsPage() {
  const { broadcasts, loading, refetch } = useEmailBroadcasts();
  const deleteMutation = useDeleteBroadcast();

  const [showWizard, setShowWizard] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmailBroadcast | null>(null);

  const drafts = broadcasts.filter(b => b.status === "draft");
  const sent   = broadcasts.filter(b => b.status !== "draft");

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send emails to batches, courses, or any group of recipients
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-2" /> New campaign
        </Button>
      </div>

      {/* Wizard */}
      {showWizard && (
        <Card className="border-primary/30 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">New campaign</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowWizard(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <CampaignWizard
              onClose={() => setShowWizard(false)}
              onCreated={() => { setShowWizard(false); refetch(); }}
            />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && broadcasts.length === 0 && !showWizard && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Send emails to a new batch, course cohort, or any group — upload a CSV or type emails directly
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create first campaign
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Drafts</h2>
          {drafts.map(b => (
            <BroadcastCard key={b.id} broadcast={b} onDelete={() => setDeleteTarget(b)} />
          ))}
        </div>
      )}

      {sent.length > 0 && (
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
