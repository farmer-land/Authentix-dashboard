"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Calendar,
  FileText,
  Layers,
  MoreHorizontal,
  Database,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { type ImportJob } from "@/lib/api/client";
import { useImports, useImportData } from "@/lib/hooks/queries/imports";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow, format, subDays } from "date-fns";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMimeTypeLabel(fileType: string): string {
  const t = fileType.toLowerCase();
  if (t === "text/csv" || t === "csv") return "CSV";
  if (t.includes("spreadsheetml") || t === "xlsx") return "XLSX";
  if (t.includes("ms-excel") || t === "xls") return "XLS";
  if (t === "application/pdf" || t === "pdf") return "PDF";
  if (t.includes("opendocument.spreadsheet") || t === "ods") return "ODS";
  if (t === "text/tab-separated-values" || t === "tsv") return "TSV";
  if (t.includes("json")) return "JSON";
  const short = t.split("/").pop()?.split(".").pop() ?? t;
  return short.toUpperCase();
}

// Normalize a string for fuzzy matching (lowercase, replace non-alphanum with underscore)
function normalize(s: string) {
  return s.toLowerCase().replace(/[\s\-./]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// Common aliases for auto-mapping
const ALIASES: Record<string, string[]> = {
  name: ["name", "full_name", "fullname", "recipient_name", "student_name", "participant"],
  email: ["email", "email_address", "e_mail", "mail"],
  first_name: ["first_name", "firstname", "given_name"],
  last_name: ["last_name", "lastname", "surname", "family_name"],
  course: ["course", "course_name", "program", "programme", "subject", "certification"],
  date: ["date", "completion_date", "issue_date", "award_date", "certificate_date"],
  start_date: ["start_date", "startdate", "from", "from_date"],
  end_date: ["end_date", "enddate", "to", "to_date", "expiry_date"],
};

function autoMatchHeaders(
  headers: string[],
  templateFields: Array<{ id: string; label: string; field_key?: string; type?: string }>
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  const normalizedHeaders = headers.map((h) => ({ original: h, norm: normalize(h) }));

  for (const field of templateFields) {
    const fieldNorm = normalize(field.label);
    const fieldKey = field.field_key ? normalize(field.field_key) : fieldNorm;
    const fieldType = field.type ?? "";

    // 1. Exact match on label
    let match = normalizedHeaders.find((h) => h.norm === fieldNorm);
    // 2. Exact match on field_key
    if (!match) match = normalizedHeaders.find((h) => h.norm === fieldKey);
    // 3. Alias matching via type
    if (!match && ALIASES[fieldType]) {
      for (const alias of ALIASES[fieldType]!) {
        match = normalizedHeaders.find((h) => h.norm === alias);
        if (match) break;
      }
    }
    // 4. Alias matching via label
    if (!match && ALIASES[fieldNorm]) {
      for (const alias of ALIASES[fieldNorm]!) {
        match = normalizedHeaders.find((h) => h.norm === alias);
        if (match) break;
      }
    }
    // 5. Substring: header contains field label
    if (!match) match = normalizedHeaders.find((h) => h.norm.includes(fieldNorm) || fieldNorm.includes(h.norm));

    result[field.id] = match?.original ?? null;
  }
  return result;
}

// ── Sub-component: Import data preview ────────────────────────────────────────

function ImportPreview({ importId }: { importId: string }) {
  const { data, isLoading } = useImportData(importId, { page: 1, limit: 5 });
  const rows = (data?.items ?? []).map((r: any) => r.data ?? r) as Record<string, unknown>[];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No preview data available</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {Object.keys(rows[0] ?? {}).map((header) => (
                <th key={header} className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                {Object.values(row).map((value, j) => (
                  <td key={j} className="px-4 py-2 whitespace-nowrap">
                    {value !== null && value !== undefined ? (
                      String(value)
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-component: Template picker + field mapping modal ───────────────────────

type ModalStep = "pick" | "review";

interface UseForGenerationModalProps {
  importId: string | null;
  importJob: ImportJob | null;
  orgSlug: string;
  onClose: () => void;
}

function UseForGenerationModal({ importId, importJob, orgSlug, onClose }: UseForGenerationModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<ModalStep>("pick");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [reviewLoading, setReviewLoading] = useState(false);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const resp = await api.templates.list({ sort_by: "created_at", sort_order: "desc", limit: 50 });
      const items = (resp as any).items ?? [];

      // Fetch preview URLs with max 5 concurrent requests to avoid hammering the API
      const CONCURRENCY = 5;
      const withPreviews: any[] = [];
      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const batch = items.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (t: any) => {
            try {
              const url = await api.templates.getPreviewUrl(t.id);
              return { ...t, preview_url: url };
            } catch {
              return t;
            }
          })
        );
        withPreviews.push(...results);
      }
      setTemplates(withPreviews);
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // Load templates once on open
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleSelectTemplate = async (template: any) => {
    setSelectedTemplate(template);
    setReviewLoading(true);
    setStep("review");

    try {
      // Fetch first row of import data to get headers
      const dataPage = await api.imports.getData(importId!, { limit: 1 });
      const rawItems = (dataPage.items ?? []) as Array<{ row_index: number; data: Record<string, unknown> }>;
      const firstRow = rawItems[0]?.data ?? (rawItems[0] as any) ?? {};
      const headers = Object.keys(firstRow);
      setImportHeaders(headers);

      // Get fields from template — supports both old schema (fields array) and new schema
      const fields: Array<{ id: string; label: string; field_key?: string; type?: string }> =
        (template.fields ?? []).filter((f: any) => f.type !== "qr_code" && f.type !== "image");

      const autoMapped = autoMatchHeaders(headers, fields);
      setMappings(autoMapped);
    } catch {
      setImportHeaders([]);
      setMappings({});
    } finally {
      setReviewLoading(false);
    }
  };

  const handleProceed = () => {
    if (!selectedTemplate || !importId) return;
    router.push(
      `/dashboard/org/${orgSlug}/generate-certificate?import=${importId}&template=${selectedTemplate.id}`
    );
    onClose();
  };

  const filteredTemplates = templates.filter((t) =>
    t.name?.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.certificate_category?.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const templateFields: Array<{ id: string; label: string; type?: string }> =
    (selectedTemplate?.fields ?? []).filter((f: any) => f.type !== "qr_code" && f.type !== "image");

  const matchedCount = Object.values(mappings).filter(Boolean).length;
  const totalCount = templateFields.length;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            {step === "review" && (
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setStep("pick")}
              >
                ←
              </button>
            )}
            <div>
              <DialogTitle>
                {step === "pick" ? "Choose a Template" : "Field Mapping Review"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {step === "pick"
                  ? `Generating certificates from "${importJob?.file_name}"`
                  : `Matching CSV columns to "${selectedTemplate?.name}" fields`}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* ── Step 1: Template picker ── */}
          {step === "pick" && (
            <div className="p-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates…"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {templatesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No templates found</p>
                  <p className="text-sm mt-1">
                    Upload a template from the Certificate Templates page first.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="group text-left border rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                    >
                      {/* Preview image */}
                      <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                        {template.preview_url ? (
                          <img
                            src={template.preview_url}
                            alt={template.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                          {template.name}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {template.certificate_category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {template.certificate_category}
                            </span>
                          )}
                          {(template.fields?.length ?? 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {template.fields.filter((f: any) => f.type !== "qr_code").length} fields
                            </span>
                          )}
                          {(template.certificate_count ?? 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              {template.certificate_count?.toLocaleString()} issued
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Field mapping review ── */}
          {step === "review" && (
            <div className="p-6 space-y-4">
              {reviewLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Summary banner */}
                  <div className={cn(
                    "flex items-center gap-3 p-3 rounded-lg text-sm",
                    matchedCount === totalCount
                      ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                      : "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
                  )}>
                    {matchedCount === totalCount ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    <p className={matchedCount === totalCount ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}>
                      {matchedCount} of {totalCount} template fields matched to CSV columns.
                      {matchedCount < totalCount && " Unmatched fields will be blank — you can adjust this in the generator."}
                    </p>
                  </div>

                  {/* Field mapping list */}
                  {templateFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      This template has no mappable fields.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {templateFields.map((field) => {
                        const matched = mappings[field.id];
                        return (
                          <div
                            key={field.id}
                            className={cn(
                              "flex items-center gap-4 p-3 rounded-lg",
                              matched ? "bg-muted/30" : "bg-amber-50/50 dark:bg-amber-950/10"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <Label className="text-sm font-medium">{field.label}</Label>
                              {field.type && (
                                <p className="text-xs text-muted-foreground mt-0.5">{field.type}</p>
                              )}
                            </div>
                            <div className="flex-1">
                              <Select
                                value={matched ?? "__none__"}
                                onValueChange={(v) =>
                                  setMappings((prev) => ({
                                    ...prev,
                                    [field.id]: v === "__none__" ? null : v,
                                  }))
                                }
                              >
                                <SelectTrigger className={cn("text-sm", matched ? "border-green-400 dark:border-green-600" : "border-amber-300")}>
                                  <SelectValue placeholder="No column matched" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">
                                    <span className="text-muted-foreground">— Leave blank —</span>
                                  </SelectItem>
                                  {importHeaders.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {matched ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    You can fine-tune column mappings after loading in the certificate generator.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === "review" && (
            <Button onClick={handleProceed} disabled={reviewLoading} className="gap-2">
              Open in Generator
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_DAYS = 7;

export default function ImportsPage() {
  const params = useParams();
  const orgSlug = params.slug as string;

  const { imports, loading, refetch } = useImports({
    sort_by: "created_at",
    sort_order: "desc",
    limit: 50,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importToDelete, setImportToDelete] = useState<string | null>(null);

  // Template picker modal
  const [pickerImportId, setPickerImportId] = useState<string | null>(null);
  const [pickerImportJob, setPickerImportJob] = useState<ImportJob | null>(null);

  const toggleExpand = (importId: string) => {
    setExpandedId((prev) => (prev === importId ? null : importId));
  };

  const handleDownload = async (importId: string) => {
    try {
      const downloadUrl = await api.imports.getDownloadUrl(importId);
      window.open(downloadUrl, "_blank");
    } catch {
      alert("Failed to download file");
    }
  };

  const handleDelete = () => {
    setDeleteDialogOpen(false);
    setImportToDelete(null);
  };

  const handleOpenPicker = (importItem: ImportJob) => {
    setPickerImportId(importItem.id);
    setPickerImportJob(importItem);
  };

  const getStatusBadge = (status: ImportJob["status"]) => {
    const variants: Record<
      ImportJob["status"],
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
    > = {
      completed: { variant: "default", label: "Completed" },
      queued: { variant: "secondary", label: "Queued" },
      pending: { variant: "secondary", label: "Pending" },
      processing: { variant: "outline", label: "Processing" },
      failed: { variant: "destructive", label: "Failed" },
    };
    const config = variants[status] ?? variants.queued;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter out stale stuck imports (queued/pending/processing older than 7 days)
  const staleThreshold = subDays(new Date(), STALE_THRESHOLD_DAYS);
  const visibleImports = (imports as ImportJob[]).filter((item) => {
    const isStuck = ["queued", "pending", "processing"].includes(item.status);
    if (isStuck && new Date(item.created_at) < staleThreshold) return false;
    return true;
  });
  const staleCount = (imports as ImportJob[]).length - visibleImports.length;

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Imported Data</h1>
          <p className="text-muted-foreground mt-1.5 text-base">
            View and manage data files used for certificate generation
          </p>
        </div>
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Imported Data</h1>
          <p className="text-muted-foreground mt-1.5 text-base">
            View and manage data files used for certificate generation
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stale notice */}
      {staleCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted/50 text-sm text-muted-foreground border">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {staleCount} stuck import{staleCount !== 1 ? "s" : ""} older than {STALE_THRESHOLD_DAYS} days{" "}
          {staleCount !== 1 ? "are" : "is"} hidden (queued but never processed).
        </div>
      )}

      {/* Import Cards */}
      {visibleImports.length === 0 ? (
        <Card className="border-2 border-dashed border-border bg-card/40">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center mb-6">
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No imported data yet</h3>
            <p className="text-muted-foreground text-center max-w-md mb-8 leading-relaxed">
              Data files will appear here after you upload them during certificate generation.
            </p>
            <Button asChild>
              <a href={`/dashboard/org/${orgSlug}/generate-certificate`}>Generate Certificates</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleImports.map((importItem) => (
            <Card
              key={importItem.id}
              className={cn(
                "transition-all duration-200",
                expandedId === importItem.id && "ring-1 ring-primary"
              )}
            >
              {/* Card Header */}
              <div
                className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => toggleExpand(importItem.id)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="h-6 w-6 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base truncate">{importItem.file_name}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Layers className="h-3.5 w-3.5" />
                            {importItem.total_rows || 0} rows
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            {formatFileSize(importItem.file_size)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDistanceToNow(new Date(importItem.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        {/* Category / subcategory tags */}
                        {(importItem.certificate_category || importItem.certificate_subcategory) && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {importItem.certificate_category && (
                              <Badge variant="outline" className="text-xs">
                                {importItem.certificate_category}
                              </Badge>
                            )}
                            {importItem.certificate_subcategory && (
                              <Badge variant="outline" className="text-xs">
                                {importItem.certificate_subcategory}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {getStatusBadge(importItem.status)}

                        {/* Use for Generation — primary action */}
                        {importItem.status === "completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPicker(importItem);
                            }}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Generate
                          </Button>
                        )}

                        {/* Actions Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDownload(importItem.id)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                            {importItem.status === "completed" && (
                              <DropdownMenuItem onClick={() => handleOpenPicker(importItem)}>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Use for Generation
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setImportToDelete(importItem.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <div className="text-muted-foreground">
                          {expandedId === importItem.id ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded: data preview */}
              {expandedId === importItem.id && (
                <div className="border-t">
                  <div className="p-4">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Data Preview (Top 5 rows)</h4>
                    <ImportPreview importId={importItem.id} />

                    <div className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">File Type</p>
                          <p className="font-medium">{getMimeTypeLabel(importItem.file_type)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Uploaded</p>
                          <p className="font-medium">
                            {format(new Date(importItem.created_at), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Reusable</p>
                          <p className="font-medium">{importItem.reusable ? "Yes" : "No"}</p>
                        </div>
                        {importItem.error_message && (
                          <div className="col-span-2 md:col-span-4">
                            <p className="text-muted-foreground">Error</p>
                            <p className="font-medium text-destructive">{importItem.error_message}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Template picker modal */}
      {pickerImportId && (
        <UseForGenerationModal
          importId={pickerImportId}
          importJob={pickerImportJob}
          orgSlug={orgSlug}
          onClose={() => {
            setPickerImportId(null);
            setPickerImportJob(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Import</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this import? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
