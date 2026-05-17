"use client";

import { useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, Upload, Search, Trash2, Loader2,
  MailX, MailCheck, ChevronLeft, ChevronRight,
  Award, Megaphone, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { useEmailContacts, useDeleteContact, useUpdateContact } from "@/lib/hooks/queries/delivery";
import type { EmailContact } from "@/lib/api/client";
import { api } from "@/lib/api/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { parseFile } from "@/lib/file-parser";
import { FieldMappingModal, CONTACT_PLATFORM_FIELDS } from "@/components/contacts/FieldMappingModal";
import { PostImportIntentDialog } from "@/components/contacts/PostImportIntentDialog";
import { useQueryClient } from "@tanstack/react-query";

const PAGE_SIZE = 50;
const BATCH_SIZE = 500;
const ACCEPTED_TYPES = ".xlsx,.xls,.csv,.tsv,.tab,.md,.markdown";

function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPropertyKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

  // Parsed file state — shown in mapping modal
  const [parsedFile, setParsedFile] = useState<{
    headers: string[];
    rows: Record<string, string>[];
    fileName: string;
  } | null>(null);

  // Post-import intent
  const [intentState, setIntentState] = useState<{ open: boolean; imported: number }>({
    open: false,
    imported: 0,
  });

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
      setParsedFile({ headers: parsed.headers, rows: parsed.rows, fileName: parsed.fileName });
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

  const handleMappingConfirm = useCallback(
    async (mapping: Record<string, string>) => {
      if (!parsedFile) return;
      const { headers, rows } = parsedFile;
      setParsedFile(null);

      // Build normalized rows (platform keys + extra columns as custom properties)
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

      // Send in batches — handles any number of rows without file size limits
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
          const result = await api.delivery.importContactsBatch(batches[i]!);
          totalImported += result.imported;
          totalSkipped += result.skipped;
          allErrors.push(...result.errors);
        }

        toast.success(`${totalImported.toLocaleString()} contacts imported`, { id: toastId });
        queryClient.invalidateQueries({ queryKey: ["delivery"] });

        if (totalSkipped > 0) {
          toast.info(`${totalSkipped.toLocaleString()} row${totalSkipped !== 1 ? "s" : ""} skipped (duplicates or invalid email)`);
        }
        if (allErrors.length > 0) {
          toast.warning(`${allErrors.length} batch${allErrors.length !== 1 ? "es" : ""} had errors`);
        }

        setIntentState({ open: true, imported: totalImported });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed", { id: toastId });
      } finally {
        setIsImporting(false);
      }
    },
    [parsedFile, queryClient]
  );

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

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Drop zone — only when empty */}
          {!loading && !hasContacts && (
            <div
              className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"
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
                We'll help you map columns — handles any file size automatically
              </p>
            </div>
          )}

          {/* Filters */}
          {hasContacts && (
            <div className="flex items-center gap-2 flex-wrap">
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="ml-auto"
              >
                {isImporting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                Import more
              </Button>
            </div>
          )}

          {/* Table */}
          {contacts.length > 0 && (
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
          )}

          {/* Loading skeleton */}
          {loading && (
            <Card>
              <CardContent className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
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

        {/* Right action panel — always visible */}
        <div className="w-52 shrink-0 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Use contacts for
          </p>
          <ActionCard
            icon={Award}
            title="Generate Certificates"
            description="Bulk-issue certificates to your contacts"
            onClick={() => router.push(`/dashboard/org/${orgSlug}/generate-certificate`)}
          />
          <ActionCard
            icon={Megaphone}
            title="Send Broadcast"
            description="Email campaign to your list"
            onClick={() => router.push(`/dashboard/org/${orgSlug}/broadcasts`)}
          />
          <ActionCard
            icon={Mail}
            title="Design Email Template"
            description="Create a reusable email template"
            onClick={() => router.push(`/dashboard/org/${orgSlug}/email-templates`)}
          />

          {total > 0 && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>{total.toLocaleString()} contacts total</span>
              </div>
            </div>
          )}
        </div>
      </div>

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

      {/* Post-import intent dialog */}
      <PostImportIntentDialog
        open={intentState.open}
        imported={intentState.imported}
        orgSlug={orgSlug}
        onDismiss={() => setIntentState({ open: false, imported: 0 })}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium">{deleteTarget?.email}</span> from your contact list.
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
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border p-3 hover:border-primary hover:bg-primary/5 transition-colors group"
    >
      <div className="flex items-start gap-2.5">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        <div>
          <p className="text-xs font-medium">{title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
        </div>
      </div>
    </button>
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
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{contact.email}</td>
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
