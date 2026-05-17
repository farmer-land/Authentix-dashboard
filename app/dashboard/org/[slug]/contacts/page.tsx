"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, Upload, Loader2,
  Award, Megaphone, Mail, ChevronDown, FileText, Trash2, Search,
} from "lucide-react";
import { toast } from "sonner";
import { useEmailContacts } from "@/lib/hooks/queries/delivery";
import { useTemplates } from "@/lib/hooks/queries/templates";
import { api } from "@/lib/api/client";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { parseFile } from "@/lib/file-parser";
import { FieldMappingModal, CONTACT_PLATFORM_FIELDS } from "@/components/contacts/FieldMappingModal";
import { useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";

const BATCH_SIZE = 500;
const ACCEPTED_TYPES = ".xlsx,.xls,.csv,.tsv,.tab,.md,.markdown";

// ── Import session tracking ────────────────────────────────────────────────────

interface ImportSession {
  source_ref: string;
  file_name: string;
  total_rows: number;
  imported: number;
  skipped: number;
  imported_at: string;
}

const importLogKey = (slug: string) => `contact_import_log:${slug}`;

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
  onDesignEmail,
  onUseLater,
  onDelete,
}: {
  onGenerateCerts: () => void;
  onBroadcast: () => void;
  onDesignEmail: () => void;
  onUseLater?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onGenerateCerts}>
        <Award className="h-3 w-3 mr-1" /> Certificates
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onBroadcast}>
        <Megaphone className="h-3 w-3 mr-1" /> Broadcast
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDesignEmail}>
        <Mail className="h-3 w-3 mr-1" /> Email
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

// ── File import accordion row ──────────────────────────────────────────────────

function ImportAccordionRow({
  session,
  onGenerateCerts,
  onBroadcast,
  onDesignEmail,
  onUseLater,
  onDelete,
}: {
  session: ImportSession;
  onGenerateCerts: (source_ref: string) => void;
  onBroadcast: () => void;
  onDesignEmail: () => void;
  onUseLater: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { contacts, total, loading } = useEmailContacts(
    open ? { source_ref: session.source_ref, limit: 200 } : undefined,
  );

  return (
    <div className="border-t first:border-t-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
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
              Rows skipped — check that each row has a valid email address (must contain @)
            </p>
          )}
        </div>
        <AccordionActions
          onGenerateCerts={() => onGenerateCerts(session.source_ref)}
          onBroadcast={onBroadcast}
          onDesignEmail={onDesignEmail}
          onUseLater={onUseLater}
          onDelete={onDelete}
        />
      </button>

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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.slug as string;
  const queryClient = useQueryClient();

  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // File parse → name → mapping pipeline
  const [pendingFile, setPendingFile] = useState<{
    headers: string[];
    rows: Record<string, string>[];
    rawName: string;
  } | null>(null);
  const [importName, setImportName] = useState("");
  const [parsedFile, setParsedFile] = useState<{
    headers: string[];
    rows: Record<string, string>[];
    fileName: string;
  } | null>(null);

  // Import sessions (localStorage)
  const [importLog, setImportLog] = useState<ImportSession[]>([]);
  useEffect(() => {
    setImportLog(readImportLog(orgSlug));
  }, [orgSlug]);

  // The most recently imported file — shown as the "what's next?" green card
  // until the user takes an action or dismisses it. Resets on page load.
  const [recentCard, setRecentCard] = useState<ImportSession | null>(null);

  // Certificate template picker modal
  const [certModal, setCertModal] = useState<{ open: boolean; source_ref?: string }>({ open: false });

  // Delete recent import confirmation
  const [deleteImportTarget, setDeleteImportTarget] = useState<ImportSession | null>(null);

  // All contacts accordion
  const [allContactsOpen, setAllContactsOpen] = useState(true);

  // Total contact count (for the accordion header)
  const { total } = useEmailContacts({ limit: 1 });

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const parsed = await parseFile(file);
      if (!parsed.headers.length) {
        toast.error("Could not detect any columns in this file");
        return;
      }
      const rawName = stripExtension(parsed.fileName);
      setPendingFile({ headers: parsed.headers, rows: parsed.rows, rawName });
      setImportName(rawName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read file");
    }
  }, []);

  const handleNameConfirm = useCallback(() => {
    if (!pendingFile) return;
    const name = importName.trim() || pendingFile.rawName;
    setParsedFile({ headers: pendingFile.headers, rows: pendingFile.rows, fileName: name });
    setPendingFile(null);
  }, [pendingFile, importName]);

  const handleMappingConfirm = useCallback(
    async (mapping: Record<string, string>) => {
      if (!parsedFile) return;
      const { headers, rows, fileName } = parsedFile;
      setParsedFile(null);

      const source_ref = nanoid();
      const mappedCsvCols = new Set(Object.values(mapping));
      const extraCols = headers.filter((h) => !mappedCsvCols.has(h));

      const normalizedRows: Record<string, string>[] = rows.map((row) => {
        const normalized: Record<string, string> = {};
        for (const [platformKey, csvCol] of Object.entries(mapping)) {
          normalized[platformKey] = row[csvCol] ?? "";
        }
        for (const col of extraCols) {
          normalized[col] = row[col] ?? "";
        }
        return normalized;
      });

      setIsImporting(true);
      const batches: Record<string, string>[][] = [];
      for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
        batches.push(normalizedRows.slice(i, i + BATCH_SIZE));
      }

      const toastId = batches.length > 1
        ? toast.loading(`Importing batch 1 of ${batches.length}…`)
        : toast.loading("Importing contacts…");

      let totalImported = 0;
      let totalSkipped = 0;
      const allErrors: string[] = [];

      try {
        for (let i = 0; i < batches.length; i++) {
          if (batches.length > 1) {
            toast.loading(`Importing batch ${i + 1} of ${batches.length}…`, { id: toastId });
          }
          const result = await api.delivery.importContactsBatch(batches[i]!, source_ref);
          totalImported += result.imported;
          totalSkipped += result.skipped;
          allErrors.push(...result.errors);
        }

        const parts = [`${totalImported.toLocaleString()} imported`];
        if (totalSkipped > 0) parts.push(`${totalSkipped.toLocaleString()} skipped`);
        toast.success(parts.join(", "), { id: toastId });

        if (allErrors.length > 0) {
          toast.warning(`${allErrors.length} batch${allErrors.length !== 1 ? "es" : ""} had errors`);
        }

        const session: ImportSession = {
          source_ref,
          file_name: fileName,
          total_rows: normalizedRows.length,
          imported: totalImported,
          skipped: totalSkipped,
          imported_at: new Date().toISOString(),
        };
        const updated = [session, ...readImportLog(orgSlug)];
        writeImportLog(orgSlug, updated);
        setImportLog(updated);
        setRecentCard(session);
        queryClient.invalidateQueries({ queryKey: ["delivery"] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed", { id: toastId });
      } finally {
        setIsImporting(false);
      }
    },
    [parsedFile, queryClient, orgSlug]
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
            {total > 0
              ? `${total.toLocaleString()} contact${total !== 1 ? "s" : ""}`
              : "Import from CSV, Excel, TSV, or Markdown"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Upload className="h-4 w-4 mr-2" />}
            {isImporting ? "Importing…" : "Import contacts"}
          </Button>
          <p className="text-xs text-muted-foreground hidden sm:block">or drop a file anywhere</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Recent import card — shown right after a fresh import, dismissed on action */}
      {recentCard && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">
              {recentCard.imported.toLocaleString()} contact{recentCard.imported !== 1 ? "s" : ""} imported
              {recentCard.skipped > 0 && ` · ${recentCard.skipped.toLocaleString()} skipped`}
            </p>
            {recentCard.skipped > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                Rows are skipped when the email address is missing or invalid (no @).
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              What would you like to do with <span className="font-medium">{recentCard.file_name}</span>?
            </p>
          </div>
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
              onClick={() => { setRecentCard(null); router.push(`/dashboard/org/${orgSlug}/broadcasts`); }}
            >
              <Megaphone className="h-3.5 w-3.5 mr-1.5" /> Send Broadcast
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRecentCard(null); router.push(`/dashboard/org/${orgSlug}/email-templates`); }}
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" /> Design Email
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
        </div>
      )}

      {/* All Contacts accordion */}
      <div className="border rounded-xl overflow-hidden">
        {/* Header */}
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
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
          <AccordionActions
            onGenerateCerts={() => setCertModal({ open: true })}
            onBroadcast={() => router.push(`/dashboard/org/${orgSlug}/broadcasts`)}
            onDesignEmail={() => router.push(`/dashboard/org/${orgSlug}/email-templates`)}
          />
        </button>

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
                    onClick={() => fileInputRef.current?.click()}
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
                  onBroadcast={() => router.push(`/dashboard/org/${orgSlug}/broadcasts`)}
                  onDesignEmail={() => router.push(`/dashboard/org/${orgSlug}/email-templates`)}
                  onUseLater={() => removeFromLog(session.source_ref)}
                  onDelete={() => setDeleteImportTarget(session)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Name import dialog */}
      <Dialog
        open={!!pendingFile}
        onOpenChange={(v) => { if (!v) setPendingFile(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Name this import</DialogTitle>
          </DialogHeader>
          <Input
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            placeholder="e.g. January batch, Marketing list…"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleNameConfirm(); }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingFile(null)}>Cancel</Button>
            <Button onClick={handleNameConfirm}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Field mapping modal */}
      <FieldMappingModal
        open={!!parsedFile}
        fileName={parsedFile?.fileName ?? ""}
        headers={parsedFile?.headers ?? []}
        sampleRows={parsedFile?.rows.slice(0, 3) ?? []}
        platformFields={CONTACT_PLATFORM_FIELDS}
        onConfirm={handleMappingConfirm}
        onCancel={() => setParsedFile(null)}
      />

      {/* Certificate template picker */}
      <ContactCertModal
        open={certModal.open}
        onClose={() => setCertModal({ open: false })}
        onConfirm={handleCertModalConfirm}
      />

      {/* Delete import confirmation */}
      <AlertDialog
        open={!!deleteImportTarget}
        onOpenChange={(open) => !open && setDeleteImportTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove import?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteImportTarget?.file_name}</strong> will be removed from your contacts list.
              The contacts remain in the database and can still be used for broadcasts and certificates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteImportTarget) return;
                removeFromLog(deleteImportTarget.source_ref);
                setDeleteImportTarget(null);
                toast.success("Import removed");
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
