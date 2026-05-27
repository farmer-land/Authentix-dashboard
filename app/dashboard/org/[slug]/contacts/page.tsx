"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, Upload, Loader2,
  Award, Mail, ChevronDown, FileText, Trash2, Search, PenLine,
  Megaphone, CheckCircle2, Download, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useEmailContacts, useDeliveryTemplates } from "@/lib/hooks/queries/delivery";
import { useTemplates } from "@/lib/hooks/queries/templates";
import { useUserProfile } from "@/lib/hooks/queries/users";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { parseFile } from "@/lib/file-parser";
import { FieldMappingModal, CONTACT_PLATFORM_FIELDS } from "@/components/contacts/FieldMappingModal";
import { useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";

// Rows per API call — small enough to finish in <5s even under load
const BATCH_SIZE = 100;
// Max concurrent batch calls to the backend
const BATCH_CONCURRENCY = 3;
const ACCEPTED_TYPES = ".xlsx,.xls,.csv,.tsv,.tab,.md,.markdown";


/** Run an array of async tasks with limited concurrency. */
async function parallelBatch<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]!();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ── Import session tracking ────────────────────────────────────────────────────

interface ImportSession {
  source_ref: string;
  file_name: string;
  total_rows: number;
  imported: number;
  skipped: number;
  imported_at: string;
  file_hash?: string; // lightweight fingerprint for duplicate detection
}

const importLogKey = (slug: string) => `contact_import_log:${slug}`;
const mappingProfileKey = (slug: string) => `contact_mapping_profiles:${slug}`;

function readImportLog(slug: string): ImportSession[] {
  try {
    return JSON.parse(localStorage.getItem(importLogKey(slug)) ?? "[]") as ImportSession[];
  } catch {
    return [];
  }
}

function writeImportLog(slug: string, sessions: ImportSession[]) {
  localStorage.setItem(importLogKey(slug), JSON.stringify(sessions.slice(0, 20)));
}

/** Lightweight fingerprint: sorted headers + first row values, no crypto needed. */
function computeFileHash(headers: string[], rows: Record<string, string>[]): string {
  const headerSig = [...headers].sort().join("|");
  const rowSig = rows.slice(0, 3).map(r =>
    headers.map(h => String(r[h] ?? "").slice(0, 30)).join(",")
  ).join(";");
  return `${headerSig}::${rowSig}`.slice(0, 300);
}

// ── Partial import recovery ────────────────────────────────────────────────────
// Written before batches fire so a crash leaves a breadcrumb; cleared on success.

interface PendingImport {
  source_ref: string;
  file_name: string;
  file_hash: string;
  total_rows: number;
  batch_count: number;
  started_at: string;
}

const pendingImportKey = (slug: string) => `contact_import_pending:${slug}`;

function readPendingImport(slug: string): PendingImport | null {
  try { return JSON.parse(localStorage.getItem(pendingImportKey(slug)) ?? "null"); }
  catch { return null; }
}
function writePendingImport(slug: string, p: PendingImport) {
  localStorage.setItem(pendingImportKey(slug), JSON.stringify(p));
}
function clearPendingImport(slug: string) {
  localStorage.removeItem(pendingImportKey(slug));
}

// ── Saved mapping profiles ─────────────────────────────────────────────────────

interface MappingProfile {
  headerSignature: string; // sorted headers joined — used as lookup key
  mapping: Record<string, string>; // platformKey → csvHeader
  savedAt: string;
}

function readMappingProfiles(slug: string): MappingProfile[] {
  try {
    return JSON.parse(localStorage.getItem(mappingProfileKey(slug)) ?? "[]") as MappingProfile[];
  } catch {
    return [];
  }
}

function saveMappingProfile(slug: string, headers: string[], mapping: Record<string, string>) {
  const sig = [...headers].sort().join("|");
  const profiles = readMappingProfiles(slug).filter(p => p.headerSignature !== sig);
  profiles.unshift({ headerSignature: sig, mapping, savedAt: new Date().toISOString() });
  localStorage.setItem(mappingProfileKey(slug), JSON.stringify(profiles.slice(0, 10)));
}

function findMappingProfile(slug: string, headers: string[]): MappingProfile | null {
  const sig = [...headers].sort().join("|");
  return readMappingProfiles(slug).find(p => p.headerSignature === sig) ?? null;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function toTitleCase(str: string): string {
  if (!str) return str;
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Accordion action bar ───────────────────────────────────────────────────────

function AccordionActions({
  onGenerateCerts,
  onBroadcast,
  onUseLater,
  onDelete,
}: {
  onGenerateCerts: () => void;
  onBroadcast: () => void;
  onUseLater?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onGenerateCerts}>
        <Award className="h-3 w-3 mr-1" /> Certificates
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onBroadcast}>
        <Megaphone className="h-3 w-3 mr-1" /> Broadcast
      </Button>
      {onUseLater && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={onUseLater}
        >
          Use Later
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Remove import"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// ── Certificate template picker modal ─────────────────────────────────────────

function ContactCertModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (templateId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { templates, loading } = useTemplates({ limit: 100 });

  useEffect(() => {
    if (!open) { setSelected(null); setSearch(""); }
  }, [open]);

  const items = (templates as Array<{ id: string; name: string; preview_url?: string | null }>).filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select a Certificate Template</DialogTitle>
        </DialogHeader>

        <div className="relative max-w-sm mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p className="text-sm">{search ? "No matching templates" : "No certificate templates yet"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-1">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "rounded-xl border text-left overflow-hidden transition-all",
                    selected === t.id
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-muted-foreground",
                  )}
                >
                  {t.preview_url ? (
                    <div className="aspect-4/3 bg-muted overflow-hidden">
                      <img src={t.preview_url} alt={t.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-4/3 bg-muted flex items-center justify-center">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="px-3 py-2">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!selected} onClick={() => selected && onConfirm(selected)}>
            Open in Designer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Broadcast template picker modal ───────────────────────────────────────────

const CERT_VARS_BCAST = ["certificate_number", "cert_number", "certificate_id", "course_name", "issue_date", "expiry_date"];
const CERT_BLOCKS_BCAST = ["qr_code", "details_box", "certificate_number"];

function inferBroadcastTemplateType(body: string): "broadcast" | "certificate" {
  const lower = body.toLowerCase();
  const hasCertVar = CERT_VARS_BCAST.some(v => lower.includes(`{{${v}}}`));
  const hasCertBlock = CERT_BLOCKS_BCAST.some(b => lower.includes(`"type":"${b}"`) || lower.includes(`"blockType":"${b}"`));
  return hasCertVar || hasCertBlock ? "certificate" : "broadcast";
}

function EmailHtmlThumbnail({ html }: { html: string }) {
  const SCALE = 0.26;
  const SRC_W = 620;
  const SRC_H = 480;
  return (
    <div className="relative overflow-hidden bg-white" style={{ height: Math.round(SRC_H * SCALE) }}>
      <iframe
        srcDoc={html || '<p style="color:#bbb;text-align:center;padding:40px 20px;font-family:sans-serif;font-size:13px;">No content</p>'}
        sandbox=""
        title="preview"
        style={{
          width: SRC_W,
          height: SRC_H,
          transform: `scale(${SCALE})`,
          transformOrigin: "top left",
          border: "none",
          pointerEvents: "none",
          display: "block",
        }}
      />
    </div>
  );
}

function BroadcastTemplateModal({
  open,
  onClose,
  onSelect,
  onScratch,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
  onScratch: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { templates, loading } = useDeliveryTemplates();

  useEffect(() => {
    if (!open) { setSelected(null); setSearch(""); }
  }, [open]);

  const broadcastTemplates = (templates as Array<{ id: string; name: string; body: string; email_subject?: string | null; is_active?: boolean }>)
    .filter(t => t.is_active && inferBroadcastTemplateType(t.body ?? "") === "broadcast")
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" /> New Broadcast Campaign
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Pick an email template or design a new one</p>
        </DialogHeader>

        {broadcastTemplates.length > 0 || loading ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-36 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-1">
              {broadcastTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "rounded-xl border-2 text-left overflow-hidden transition-all select-none",
                    selected === t.id
                      ? "border-primary shadow-md"
                      : "border-border hover:border-primary/40 hover:shadow-sm",
                  )}
                >
                  <div className="relative">
                    <EmailHtmlThumbnail html={t.body ?? ""} />
                    {selected === t.id && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-primary drop-shadow" />
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 py-2 border-t bg-card">
                    <p className="text-xs font-semibold truncate leading-tight">{t.name}</p>
                    {t.email_subject && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {t.email_subject.replace(/\{\{[\w.\s]+\}\}/g, "…")}
                      </p>
                    )}
                  </div>
                </button>
              ))}

              {/* Design from scratch */}
              <button
                onClick={onScratch}
                className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-all flex flex-col items-center justify-center gap-2 min-h-36"
              >
                <PenLine className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Design from scratch</p>
              </button>
            </div>
          )}

          {!loading && broadcastTemplates.length === 0 && !search && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No broadcast templates yet</p>
              <p className="text-xs mt-1">Use "Design from scratch" to compose your email</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!selected} onClick={() => selected && onSelect(selected)}>
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── File import accordion row ──────────────────────────────────────────────────

function ImportAccordionRow({
  session,
  onGenerateCerts,
  onBroadcast,
  onUseLater,
  onDelete,
}: {
  session: ImportSession;
  onGenerateCerts: (source_ref: string) => void;
  onBroadcast: (source_ref: string) => void;
  onUseLater: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { contacts, total, loading } = useEmailContacts(
    open ? { source_ref: session.source_ref, limit: 200 } : undefined,
  );

  return (
    <div className="border-t first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
          <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session.file_name}</p>
            <p className="text-xs text-muted-foreground">
              {session.imported.toLocaleString()} contact{session.imported !== 1 ? "s" : ""}
              {session.skipped > 0 && `, ${session.skipped.toLocaleString()} skipped`}
              {" · "}
              {formatDistanceToNow(new Date(session.imported_at), { addSuffix: true })}
            </p>
            {session.skipped > 0 && session.imported === 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                Rows skipped — check that each row has a valid email address
              </p>
            )}
          </div>
        </button>
        <AccordionActions
          onGenerateCerts={() => onGenerateCerts(session.source_ref)}
          onBroadcast={() => onBroadcast(session.source_ref)}
          onUseLater={onUseLater}
          onDelete={onDelete}
        />
      </div>

      {open && (
        <div className="px-4 pb-3 bg-muted/5 space-y-2">
          {loading ? (
            <div className="space-y-2 pt-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No contacts found for this import.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border bg-background">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.slice(0, 10).map((c) => {
                      const name = [toTitleCase(c.first_name ?? ""), toTitleCase(c.last_name ?? "")].filter(Boolean).join(" ") || "—";
                      return (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{name}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{c.email ?? "—"}</td>
                          <td className="px-3 py-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", c.unsubscribed ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700")}>
                              {c.unsubscribed ? "Unsub" : "Sub"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {total > 10 && (
                <p className="text-xs text-muted-foreground">
                  Showing 10 of {total.toLocaleString()} contacts
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Import dialog (drag-drop + file picker) ───────────────────────────────────

function ImportDialog({ onFile, onClose }: { onFile: (file: File) => void; onClose: () => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) { onFile(file); onClose(); }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onFile(file); onClose(); }
    e.target.value = "";
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <p className="text-sm text-muted-foreground">CSV, Excel, TSV, or Markdown</p>
        </DialogHeader>
        <div
          onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors select-none",
            isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
          )}
        >
          <Upload className={cn("h-8 w-8 mx-auto mb-3 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground")} />
          <p className="text-sm font-medium">Drop a file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to choose from your computer</p>
          <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={handleFile} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.slug as string;
  const queryClient = useQueryClient();

  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const dragCounterRef = useRef(0);

  // File parse → mapping pipeline
  const [parsedFile, setParsedFile] = useState<{
    headers: string[];
    rows: Record<string, string>[];
    fileName: string;
    fileHash: string;
    savedMappingProfile?: MappingProfile | null;
  } | null>(null);

  // Import sessions (localStorage)
  const [importLog, setImportLog] = useState<ImportSession[]>([]);
  useEffect(() => {
    setImportLog(readImportLog(orgSlug));
  }, [orgSlug]);

  // Stale pending import from a previous session (set before batches fire, cleared on success)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  useEffect(() => {
    setPendingImport(readPendingImport(orgSlug));
  }, [orgSlug]);

  // The most recently imported file — shown as the "what's next?" green card
  // until the user takes an action or dismisses it. Resets on page load.
  const [recentCard, setRecentCard] = useState<ImportSession | null>(null);

  // Certificate template picker modal
  const [certModal, setCertModal] = useState<{ open: boolean; source_ref?: string }>({ open: false });

  // Broadcast template picker modal
  const [broadcastModal, setBroadcastModal] = useState<{ open: boolean; source_ref?: string }>({ open: false });

  // Delete recent import confirmation
  const [deleteImportTarget, setDeleteImportTarget] = useState<ImportSession | null>(null);

  // All contacts accordion
  const [allContactsOpen, setAllContactsOpen] = useState(true);

  // Total contact count (for the accordion header and quota check)
  const { total } = useEmailContacts({ limit: 1 });

  // Billing caps — for contact quota display and pre-import quota check
  const { data: billingCaps } = useQuery({
    queryKey: ['billing', 'caps'],
    queryFn: () => api.billing.getCaps(),
    staleTime: 5 * 60 * 1000,
  });
  const { profile } = useUserProfile();
  const isProductOwner = ['xencus.com', 'yhills.com'].some(
    (d) => profile?.profile?.email?.endsWith(`@${d}`)
  );
  const contactCap = isProductOwner ? 0 : (billingCaps?.contact_cap ?? 0); // 0 = unlimited

  // Quota modal — shown when an import will exceed the contact cap
  const [quotaModal, setQuotaModal] = useState<{
    open: boolean;
    currentCount: number;
    newRows: number;
    cap: number;
    onProceed: (mode: 'all' | 'limit_only' | 'upgrade') => void;
  } | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const parsed = await parseFile(file);
      if (!parsed.headers.length) {
        toast.error("Could not detect any columns in this file");
        return;
      }

      const fileHash = computeFileHash(parsed.headers, parsed.rows);

      // Duplicate file detection — warn if this exact file was imported recently
      const log = readImportLog(orgSlug);
      const recentDuplicate = log.find(s => s.file_hash === fileHash && s.imported > 0);
      if (recentDuplicate) {
        const when = formatDistanceToNow(new Date(recentDuplicate.imported_at), { addSuffix: true });
        toast.warning(`This file looks like it was already imported ${when}`, {
          description: "You can still continue — duplicate emails will be merged, not doubled.",
          duration: 6000,
        });
      }

      const savedMappingProfile = findMappingProfile(orgSlug, parsed.headers);

      setParsedFile({
        headers: parsed.headers,
        rows: parsed.rows,
        fileName: stripExtension(parsed.fileName),
        fileHash,
        savedMappingProfile,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read file");
    }
  }, [orgSlug]);

  const runImport = useCallback(
    async (normalizedRows: Record<string, string>[], fileName: string, fileHash: string, source_ref: string, mappingToSave?: { headers: string[]; mapping: Record<string, string> }) => {
      const batches: Record<string, string>[][] = [];
      for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
        batches.push(normalizedRows.slice(i, i + BATCH_SIZE));
      }

      const toastId = toast.loading(
        batches.length > 1
          ? `Importing ${normalizedRows.length.toLocaleString()} contacts in ${batches.length} batches…`
          : "Importing contacts…"
      );

      let totalImported = 0;
      let totalSkipped = 0;
      const allErrors: string[] = [];
      const allSkippedDetails: Array<{ index: number; email?: string; reason: string }> = [];

      setIsImporting(true);
      try {
        // Write recovery breadcrumb before any network calls so a crash mid-import
        // leaves enough state for the user to safely resume with the same source_ref.
        const pending: PendingImport = {
          source_ref, file_name: fileName, file_hash: fileHash,
          total_rows: normalizedRows.length, batch_count: batches.length,
          started_at: new Date().toISOString(),
        };
        writePendingImport(orgSlug, pending);
        setPendingImport(pending);

        // Parallel batches — BATCH_CONCURRENCY at a time, much faster for large files
        const tasks = batches.map((batch) => () =>
          api.delivery.importContactsBatch(batch, source_ref)
        );
        const results = await parallelBatch(tasks, BATCH_CONCURRENCY);

        for (const result of results) {
          totalImported += result.imported;
          totalSkipped += result.skipped;
          allErrors.push(...result.errors);
          if (result.skipped_details) allSkippedDetails.push(...result.skipped_details);
        }

        const parts = [`${totalImported.toLocaleString()} imported`];
        if (totalSkipped > 0) parts.push(`${totalSkipped.toLocaleString()} skipped`);

        // Build actionable skip description
        const invalidEmailCount = allSkippedDetails.filter(d => d.reason === 'invalid email format').length;
        const dupCount = allSkippedDetails.filter(d => d.reason.startsWith('duplicate')).length;
        const skipReasons: string[] = [];
        if (invalidEmailCount > 0) skipReasons.push(`${invalidEmailCount} invalid email${invalidEmailCount !== 1 ? 's' : ''}`);
        if (dupCount > 0) skipReasons.push(`${dupCount} duplicate row${dupCount !== 1 ? 's' : ''} in file`);
        const skipDescription = skipReasons.length > 0 ? skipReasons.join(', ') : undefined;

        if (allErrors.length > 0) {
          console.error('[Import] batch errors:', allErrors);
          if (totalImported === 0) {
            toast.error('Import failed', { id: toastId, description: allErrors[0] });
          } else {
            toast.success(parts.join(", "), { id: toastId, description: skipDescription });
            toast.error('Some rows failed', { description: allErrors[0] });
          }
        } else {
          toast.success(parts.join(", "), { id: toastId, description: skipDescription });
        }

        if (totalImported > 0 && mappingToSave) {
          saveMappingProfile(orgSlug, mappingToSave.headers, mappingToSave.mapping);
        }

        const session: ImportSession = {
          source_ref,
          file_name: fileName,
          total_rows: normalizedRows.length,
          imported: totalImported,
          skipped: totalSkipped,
          imported_at: new Date().toISOString(),
          file_hash: fileHash,
        };
        const updated = [session, ...readImportLog(orgSlug)];
        writeImportLog(orgSlug, updated);
        setImportLog(updated);
        setRecentCard(session);
        // All batches completed — clear the recovery breadcrumb
        clearPendingImport(orgSlug);
        setPendingImport(null);
        queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "delivery"] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed", { id: toastId });
        // Leave pendingImport in place so the recovery banner appears on next load
      } finally {
        setIsImporting(false);
      }
    },
    [parsedFile, queryClient, orgSlug]  // eslint-disable-line react-hooks/exhaustive-deps
  );

  const removeFromLog = useCallback((source_ref: string) => {
    const updated = readImportLog(orgSlug).filter((s) => s.source_ref !== source_ref);
    writeImportLog(orgSlug, updated);
    setImportLog(updated);
  }, [orgSlug]);

  const handleCertModalConfirm = (templateId: string) => {
    const base = `/dashboard/org/${orgSlug}/generate-certificate?template=${templateId}`;
    const url = certModal.source_ref ? `${base}&source_ref=${certModal.source_ref}` : base;
    setCertModal({ open: false });
    router.push(url);
  };

  const handleBroadcast = (source_ref?: string) => {
    setBroadcastModal({ open: true, source_ref });
  };

  const handleBroadcastTemplateSelect = (templateId: string) => {
    const qs = new URLSearchParams();
    if (broadcastModal.source_ref) qs.set("source_ref", broadcastModal.source_ref);
    qs.set("fromTemplate", templateId);
    setBroadcastModal({ open: false });
    router.push(`/dashboard/org/${orgSlug}/broadcasts?${qs.toString()}`);
  };

  const handleBroadcastScratch = () => {
    const qs = new URLSearchParams();
    if (broadcastModal.source_ref) qs.set("source_ref", broadcastModal.source_ref);
    setBroadcastModal({ open: false });
    router.push(`/dashboard/org/${orgSlug}/broadcasts?${qs.toString()}`);
  };

  const handleMappingConfirm = useCallback((mapping: Record<string, string>) => {
    if (!parsedFile) return;

    // mapping is {platformKey: csvHeader} from FieldMappingModal
    const mappedCsvHeaders = new Set(Object.values(mapping));
    const normalizedRows = parsedFile.rows.map((row) => {
      const out: Record<string, string> = {};
      // Map platform fields: look up values by their CSV column header
      for (const [platformKey, csvHeader] of Object.entries(mapping)) {
        const val = row[csvHeader];
        if (val !== undefined) out[platformKey] = val;
      }
      // Include unmapped columns under original header (stored as custom properties by backend)
      for (const h of parsedFile.headers) {
        if (!mappedCsvHeaders.has(h)) {
          const val = row[h];
          if (val !== undefined) out[h] = val;
        }
      }
      // Split recipient_name into first_name / last_name when separate fields are absent
      if (out.recipient_name) {
        const parts = out.recipient_name.trim().split(/\s+/);
        if (!out.first_name) out.first_name = parts[0] ?? "";
        if (!out.last_name && parts.length > 1) out.last_name = parts.slice(1).join(" ");
      }
      return out;
    });

    // Reuse the source_ref from an interrupted import of the same file so the
    // backend upserts already-uploaded rows (no duplicates) instead of inserting them again.
    const existingPending = readPendingImport(orgSlug);
    const source_ref = (existingPending && existingPending.file_hash === parsedFile.fileHash)
      ? existingPending.source_ref
      : nanoid();
    const { fileName, fileHash, headers } = parsedFile;
    const mappingToSave = { headers, mapping };
    const willExceed = contactCap > 0 && total + normalizedRows.length > contactCap;

    if (willExceed) {
      // Save pending import state so user can retry after upgrading
      setParsedFile(null);
      setQuotaModal({
        open: true,
        currentCount: total,
        newRows: normalizedRows.length,
        cap: contactCap,
        onProceed: (mode) => {
          setQuotaModal(null);
          if (mode === "limit_only") {
            const remaining = Math.max(0, contactCap - total);
            runImport(normalizedRows.slice(0, remaining), fileName, fileHash, source_ref, mappingToSave);
          } else if (mode === "upgrade") {
            router.push(`/dashboard/org/${orgSlug}/billing`);
          } else {
            // "all" — import everything, extra contacts billed as add-ons
            runImport(normalizedRows, fileName, fileHash, source_ref, mappingToSave);
          }
        },
      });
    } else {
      setParsedFile(null);
      runImport(normalizedRows, fileName, fileHash, source_ref, mappingToSave);
    }
  }, [parsedFile, orgSlug, contactCap, total, runImport, router]);

  return (
    <div
      className="relative space-y-6 max-w-7xl mx-auto"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragCounterRef.current++;
        setIsDragOver(true);
      }}
      onDragLeave={() => {
        dragCounterRef.current--;
        if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragOver(false); }
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={(e) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
      }}
    >
      {/* Full-page drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 pointer-events-none rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-10 w-10" />
            <p className="text-base font-semibold">Drop to import contacts</p>
            <p className="text-sm text-primary/70">CSV, Excel, TSV, or Markdown</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {contactCap > 0
              ? `${total.toLocaleString()} / ${contactCap.toLocaleString()} · ${Math.max(0, contactCap - total).toLocaleString()} remaining`
              : total > 0
                ? `${total.toLocaleString()} contact${total !== 1 ? "s" : ""}`
                : "Import from CSV, Excel, TSV, or Markdown"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Download className="h-4 w-4 mr-1.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => api.delivery.exportContacts("csv")}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => api.delivery.exportContacts("json")}>
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => api.delivery.exportContacts("markdown")}>
                  Export as Markdown
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportDialog(true)}
            disabled={isImporting}
          >
            {isImporting
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Upload className="h-4 w-4 mr-2" />}
            {isImporting ? "Importing…" : "Import contacts"}
          </Button>
        </div>
      </div>

      {/* Partial import recovery banner — shown when a previous import was interrupted */}
      {pendingImport && !isImporting && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Import interrupted — <span className="font-normal">{pendingImport.file_name}</span>
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Started {formatDistanceToNow(new Date(pendingImport.started_at), { addSuffix: true })}.
              {" "}Some rows may have been partially imported.
              Re-upload <strong>{pendingImport.file_name}</strong> to safely resume — already-uploaded rows are skipped automatically.
            </p>
          </div>
          <button
            className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 shrink-0 mt-0.5 transition-colors"
            onClick={() => { clearPendingImport(orgSlug); setPendingImport(null); }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Recent import card — shown right after a fresh import, dismissed on action */}
      {recentCard && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">
              {recentCard.imported.toLocaleString()} contact{recentCard.imported !== 1 ? "s" : ""} imported
              {recentCard.skipped > 0 && ` · ${recentCard.skipped.toLocaleString()} skipped`}
            </p>
            {recentCard.skipped > 0 && recentCard.imported === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                No contacts were saved. Check that each row has a valid email address and try importing again.
              </p>
            )}
            {recentCard.imported > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                What would you like to do with <span className="font-medium">{recentCard.file_name}</span>?
              </p>
            )}
          </div>
          {recentCard.imported > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const ref = recentCard.source_ref;
                  setRecentCard(null);
                  setCertModal({ open: true, source_ref: ref });
                }}
              >
                <Award className="h-3.5 w-3.5 mr-1.5" /> Generate Certificates
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const ref = recentCard.source_ref;
                  setRecentCard(null);
                  handleBroadcast(ref);
                }}
              >
                <Megaphone className="h-3.5 w-3.5 mr-1.5" /> Broadcast
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground"
                onClick={() => setRecentCard(null)}
              >
                Use Later
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setRecentCard(null)}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}

      {/* All Contacts accordion */}
      <div className="border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
          <button
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
            onClick={() => setAllContactsOpen((v) => !v)}
          >
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", allContactsOpen && "rotate-180")} />
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">All Contacts</p>
              {total > 0 && (
                <p className="text-xs text-muted-foreground">{total.toLocaleString()} contact{total !== 1 ? "s" : ""}</p>
              )}
            </div>
          </button>
          <AccordionActions
            onGenerateCerts={() => setCertModal({ open: true })}
            onBroadcast={() => handleBroadcast()}
          />
        </div>

        {/* Body — file sub-accordions */}
        {allContactsOpen && (
          <div className="border-t">
            {importLog.length === 0 ? (
              total > 0 ? (
                /* Contacts exist but were imported before session tracking */
                <div className="px-4 py-4 flex items-start gap-3">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">
                      {total.toLocaleString()} contact{total !== 1 ? "s" : ""} in your database
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      These were imported before file history was tracked. Import a new file to see it listed here.
                    </p>
                  </div>
                </div>
              ) : (
                /* Truly empty */
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">No contacts yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Import a CSV, Excel, TSV, or Markdown file to get started
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImportDialog(true)}
                    disabled={isImporting}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Import contacts
                  </Button>
                </div>
              )
            ) : (
              /* File rows */
              importLog.map((session) => (
                <ImportAccordionRow
                  key={session.source_ref}
                  session={session}
                  onGenerateCerts={(ref) => setCertModal({ open: true, source_ref: ref })}
                  onBroadcast={(ref) => handleBroadcast(ref)}
                  onUseLater={() => removeFromLog(session.source_ref)}
                  onDelete={() => setDeleteImportTarget(session)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Import file dialog */}
      {showImportDialog && (
        <ImportDialog
          onFile={(file) => { setShowImportDialog(false); handleFileSelect(file); }}
          onClose={() => setShowImportDialog(false)}
        />
      )}

      {/* Field mapping modal */}
      <FieldMappingModal
        open={!!parsedFile}
        fileName={parsedFile?.fileName ?? ""}
        headers={parsedFile?.headers ?? []}
        sampleRows={parsedFile?.rows.slice(0, 3) ?? []}
        platformFields={CONTACT_PLATFORM_FIELDS}
        savedMapping={parsedFile?.savedMappingProfile?.mapping ?? null}
        onConfirm={handleMappingConfirm}
        onCancel={() => setParsedFile(null)}
      />

      {/* Certificate template picker */}
      <ContactCertModal
        open={certModal.open}
        onClose={() => setCertModal({ open: false })}
        onConfirm={handleCertModalConfirm}
      />

      {/* Broadcast template picker */}
      <BroadcastTemplateModal
        open={broadcastModal.open}
        onClose={() => setBroadcastModal({ open: false })}
        onSelect={handleBroadcastTemplateSelect}
        onScratch={handleBroadcastScratch}
      />

      {/* Quota modal — shown when import exceeds the contact cap */}
      {quotaModal && (() => {
        const overage = quotaModal.currentCount + quotaModal.newRows - quotaModal.cap;
        const withinLimit = Math.max(0, quotaModal.cap - quotaModal.currentCount);
        return (
          <Dialog open={quotaModal.open} onOpenChange={(open) => !open && setQuotaModal(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> You're over your contact limit
                </DialogTitle>
              </DialogHeader>

              {/* Usage bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Current: <strong className="text-foreground">{quotaModal.currentCount.toLocaleString()}</strong></span>
                  <span>Limit: <strong className="text-foreground">{quotaModal.cap.toLocaleString()}</strong></span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${Math.min(100, ((quotaModal.currentCount + quotaModal.newRows) / quotaModal.cap) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  This import adds <strong className="text-foreground">{quotaModal.newRows.toLocaleString()}</strong> contacts.{" "}
                  <strong className="text-amber-600 dark:text-amber-400">{overage.toLocaleString()} will exceed your plan limit.</strong>
                </p>
              </div>

              {/* Three options */}
              <div className="space-y-2 pt-1">
                {/* Option 1: Import all, bill overage */}
                <button
                  onClick={() => quotaModal.onProceed("all")}
                  className="w-full text-left rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors"
                >
                  <p className="text-sm font-semibold">Import all {quotaModal.newRows.toLocaleString()} contacts</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The {overage.toLocaleString()} extra contacts will be billed as add-ons on your next invoice.
                  </p>
                </button>

                {/* Option 2: Drop extras, stay within limit */}
                {withinLimit > 0 && (
                  <button
                    onClick={() => quotaModal.onProceed("limit_only")}
                    className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-sm font-semibold">Import only {withinLimit.toLocaleString()} contacts</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The last {overage.toLocaleString()} rows will be dropped to stay within your plan limit.
                    </p>
                  </button>
                )}

                {/* Option 3: Upgrade plan */}
                <button
                  onClick={() => quotaModal.onProceed("upgrade")}
                  className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <p className="text-sm font-semibold">Upgrade my plan first</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Go to billing and increase your contact limit, then come back to import.
                  </p>
                </button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Delete import confirmation — two modes: hide from list, or fully delete contacts */}
      <AlertDialog
        open={!!deleteImportTarget}
        onOpenChange={(open) => !open && setDeleteImportTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo import?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                <strong>{deleteImportTarget?.imported.toLocaleString()}</strong> contact{deleteImportTarget?.imported !== 1 ? "s" : ""} from{" "}
                <strong>{deleteImportTarget?.file_name}</strong> will be permanently deleted from the database.
              </span>
              <span className="block text-amber-600 dark:text-amber-400 text-xs">
                This cannot be undone. Certificates and emails already sent are not affected.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                if (!deleteImportTarget) return;
                removeFromLog(deleteImportTarget.source_ref);
                setDeleteImportTarget(null);
                toast.success("Removed from history (contacts kept)");
              }}
            >
              Remove from history only
            </Button>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={async () => {
                if (!deleteImportTarget) return;
                const target = deleteImportTarget;
                setDeleteImportTarget(null);
                removeFromLog(target.source_ref);
                queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "delivery"] });
                try {
                  const { deleted } = await api.delivery.deleteContactsBySourceRef(target.source_ref);
                  toast.success(`${deleted.toLocaleString()} contact${deleted !== 1 ? "s" : ""} deleted`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to delete contacts");
                }
              }}
            >
              Delete contacts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
