"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, Upload, Search, Trash2, Loader2,
  MailX, MailCheck, ChevronLeft, ChevronRight,
  Award, Megaphone, Mail, ChevronDown, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useEmailContacts, useDeleteContact, useUpdateContact } from "@/lib/hooks/queries/delivery";
import { useTemplates } from "@/lib/hooks/queries/templates";
import type { EmailContact } from "@/lib/api/client";
import { api } from "@/lib/api/client";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { parseFile } from "@/lib/file-parser";
import { FieldMappingModal, CONTACT_PLATFORM_FIELDS } from "@/components/contacts/FieldMappingModal";
import { useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";

const PAGE_SIZE = 50;
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  if (!str) return str;
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPropertyKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Accordion action bar (shared between recent imports and all contacts) ──────

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
  onDelete: () => void;
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
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        title="Remove import"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
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

        <div className="relative">
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

// ── Import accordion row ───────────────────────────────────────────────────────

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
    <div className="border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{session.file_name}</p>
          <p className="text-xs text-muted-foreground">
            {session.imported.toLocaleString()} imported
            {session.skipped > 0 && `, ${session.skipped.toLocaleString()} skipped`}
            {" · "}
            {formatDistanceToNow(new Date(session.imported_at), { addSuffix: true })}
          </p>
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
        <div className="border-t px-4 py-3 bg-muted/10 space-y-2">
          {loading ? (
            <div className="space-y-2">
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

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterUnsubscribed, setFilterUnsubscribed] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<EmailContact | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // File parsing — held here until the user names the import
  const [pendingFile, setPendingFile] = useState<{
    headers: string[];
    rows: Record<string, string>[];
    rawName: string;
  } | null>(null);
  const [importName, setImportName] = useState("");

  // After naming, passed to the mapping modal
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

  // Certificate template picker modal
  const [certModal, setCertModal] = useState<{ open: boolean; source_ref?: string }>({ open: false });

  // Delete recent import confirmation
  const [deleteImportTarget, setDeleteImportTarget] = useState<ImportSession | null>(null);

  // All contacts accordion
  const [allContactsOpen, setAllContactsOpen] = useState(true);

  const { contacts, total, loading } = useEmailContacts({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: debouncedSearch || undefined,
    unsubscribed: filterUnsubscribed,
  });

  const deleteMutation = useDeleteContact();
  const updateMutation = useUpdateContact();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 350);
  };

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

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

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

      const toastId =
        batches.length > 1
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

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasContacts = contacts.length > 0 || !!debouncedSearch || filterUnsubscribed !== undefined;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total > 0
              ? `${total.toLocaleString()} contact${total !== 1 ? "s" : ""} — import from CSV, Excel, TSV, or Markdown`
              : "Import from CSV, Excel, TSV, or Markdown"}
          </p>
        </div>
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

      {/* Recent imports accordion */}
      {importLog.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Imports</p>
          {importLog.map((session) => (
            <ImportAccordionRow
              key={session.source_ref}
              session={session}
              onGenerateCerts={(ref) => setCertModal({ open: true, source_ref: ref })}
              onBroadcast={() => router.push(`/dashboard/org/${orgSlug}/broadcasts`)}
              onDesignEmail={() => router.push(`/dashboard/org/${orgSlug}/email-templates`)}
              onUseLater={() => removeFromLog(session.source_ref)}
              onDelete={() => setDeleteImportTarget(session)}
            />
          ))}
        </div>
      )}

      {/* All Contacts accordion */}
      <div className="space-y-2">
        <div className="border rounded-xl overflow-hidden">
          {/* Accordion header */}
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
              onDelete={() => setDeleteTarget({ id: "__all__" } as EmailContact)}
            />
          </button>

          {/* Accordion body */}
          {allContactsOpen && (
            <div className="border-t bg-muted/10">
              {/* Drop zone — only when empty */}
              {!loading && !hasContacts && (
                <div
                  className="m-4 border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium">Drop your file here to import contacts</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supports CSV, Excel (.xlsx / .xls), TSV, and Markdown tables
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    We&apos;ll help you map columns — handles any file size automatically
                  </p>
                </div>
              )}

              {/* Filters */}
              {hasContacts && (
                <div className="flex items-center gap-2 flex-wrap px-4 pt-3">
                  <div className="relative flex-1 min-w-48 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or email…"
                      value={search}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    variant={filterUnsubscribed === undefined ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => { setFilterUnsubscribed(undefined); setPage(0); }}
                  >
                    All
                  </Button>
                  <Button
                    variant={filterUnsubscribed === false ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => { setFilterUnsubscribed(false); setPage(0); }}
                  >
                    <MailCheck className="h-3.5 w-3.5 mr-1.5" /> Subscribed
                  </Button>
                  <Button
                    variant={filterUnsubscribed === true ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => { setFilterUnsubscribed(true); setPage(0); }}
                  >
                    <MailX className="h-3.5 w-3.5 mr-1.5" /> Unsubscribed
                  </Button>
                </div>
              )}

              {/* Table */}
              {contacts.length > 0 && (
                <div className="px-4 py-3">
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Properties</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Added</th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody>
                            {contacts.map((contact) => (
                              <ContactRow
                                key={contact.id}
                                contact={contact}
                                onDelete={() => setDeleteTarget(contact)}
                                onToggleSubscription={() =>
                                  updateMutation.mutate(
                                    { id: contact.id, dto: { unsubscribed: !contact.unsubscribed } },
                                    {
                                      onSuccess: () =>
                                        toast.success(contact.unsubscribed ? "Resubscribed" : "Unsubscribed"),
                                    }
                                  )
                                }
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Loading skeleton */}
              {loading && (
                <div className="px-4 py-3">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Empty state */}
              {!loading && !hasContacts && importLog.length > 0 && (
                <div className="text-center py-6">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    No contacts yet
                  </p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm px-4 pb-3">
                  <span className="text-muted-foreground">
                    Page {page + 1} of {totalPages} · {total.toLocaleString()} contacts
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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

      {/* Delete recent import confirmation */}
      <AlertDialog
        open={!!deleteImportTarget}
        onOpenChange={(open) => !open && setDeleteImportTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove import?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteImportTarget?.file_name}</strong> will be removed from Recent Imports.
              The contacts will remain in All Contacts.
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

      {/* Delete contact confirmation */}
      <AlertDialog
        open={!!deleteTarget && deleteTarget.id !== "__all__"}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium">{deleteTarget?.email ?? "this contact"}</span> from your contact list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    toast.success("Contact deleted");
                    setDeleteTarget(null);
                  },
                  onError: () => toast.error("Failed to delete contact"),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all contacts confirmation */}
      <AlertDialog
        open={deleteTarget?.id === "__all__"}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all contacts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {total.toLocaleString()} contacts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setDeleteTarget(null);
                const toastId = toast.loading(`Deleting contacts…`);
                try {
                  // Delete the currently-visible page; invalidate to refetch remaining
                  await Promise.all(contacts.map((c) => api.delivery.deleteContact(c.id)));
                  queryClient.invalidateQueries({ queryKey: ["delivery"] });
                  toast.success("Contacts deleted", { id: toastId });
                } catch {
                  toast.error("Failed to delete some contacts", { id: toastId });
                }
              }}
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContactRow({
  contact,
  onDelete,
  onToggleSubscription,
}: {
  contact: EmailContact;
  onDelete: () => void;
  onToggleSubscription: () => void;
}) {
  const firstName = toTitleCase(contact.first_name ?? "");
  const lastName = toTitleCase(contact.last_name ?? "");
  const name = [firstName, lastName].filter(Boolean).join(" ") || "—";
  const customKeys = Object.keys(contact.custom_properties ?? {});

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3 font-medium text-sm">{name}</td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{contact.email ?? "—"}</td>
      <td className="px-4 py-3">
        {customKeys.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {customKeys.slice(0, 3).map((k) => (
              <span key={k} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                <span className="text-muted-foreground">{formatPropertyKey(k)}:</span>{" "}
                <span className="font-medium">{String(contact.custom_properties[k]).slice(0, 24)}</span>
              </span>
            ))}
            {customKeys.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{customKeys.length - 3} more</span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            contact.unsubscribed
              ? "border-red-200 text-red-600 bg-red-50 dark:bg-red-950/20"
              : "border-green-200 text-green-700 bg-green-50 dark:bg-green-950/20"
          )}
        >
          {contact.unsubscribed ? "Unsubscribed" : "Subscribed"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {format(new Date(contact.created_at), "dd MMM yyyy")}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onToggleSubscription}>
            {contact.unsubscribed ? (
              <MailCheck className="h-3.5 w-3.5" />
            ) : (
              <MailX className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
