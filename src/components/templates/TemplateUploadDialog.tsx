"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { FileImage, AlertCircle, X, ImageIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCatalogCategories } from "@/lib/hooks/use-catalog-categories";
import { useCatalogSubcategories } from "@/lib/hooks/use-catalog-subcategories";
import { IndustrySelectModal } from "./IndustrySelectModal";
import { useOrg } from "@/lib/org";

// ── Animated SVG components ──────────────────────────────────────────────────

function UploadIdleSVG({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <style>{`
        @keyframes _upload_float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes _upload_cloud_pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }
        .upload-float { animation: _upload_float 2s ease-in-out infinite; }
        .upload-cloud { animation: _upload_cloud_pulse 2s ease-in-out infinite; }
      `}</style>

      {/* Cloud body */}
      <g className="upload-cloud">
        <path
          d="M58 38H22a14 14 0 1 1 2.9-27.7A18 18 0 1 1 58 38z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Upward arrow */}
      <g className="upload-float">
        <line x1="40" y1="72" x2="40" y2="48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <polyline points="30,57 40,47 50,57" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function UploadDragSVG({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <style>{`
        @keyframes _drag_pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.08); }
        }
        .drag-pulse { animation: _drag_pulse 0.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      `}</style>
      <g className="drag-pulse">
        <rect x="14" y="20" width="52" height="40" rx="6" stroke="currentColor" strokeWidth="2.2" strokeDasharray="6 4" />
        <polyline points="30,44 40,34 50,44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="40" y1="34" x2="40" y2="52" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function SuccessSVG({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 52 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <style>{`
        @keyframes _check_circle { to { stroke-dashoffset: 0; } }
        @keyframes _check_mark   { to { stroke-dashoffset: 0; } }
        .check-circle { stroke-dasharray: 166; stroke-dashoffset: 166; animation: _check_circle 0.55s cubic-bezier(0.65,0,0.45,1) forwards; }
        .check-mark   { stroke-dasharray: 48;  stroke-dashoffset: 48;  animation: _check_mark   0.3s 0.55s cubic-bezier(0.65,0,0.45,1) forwards; }
      `}</style>
      <circle className="check-circle" cx="26" cy="26" r="25" stroke="currentColor" strokeWidth="2" />
      <path className="check-mark" d="M14 27l8 8 16-16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_TEMPLATE_FILE_MB = 50;
const VALID_TYPES = [
  'image/png', 'image/jpeg', 'image/webp',
  'image/svg+xml', 'image/avif', 'image/heic', 'image/heif',
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TemplateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialFile?: File;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TemplateUploadDialog({ open, onOpenChange, onSuccess, initialFile }: TemplateUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'processing' | 'success'>('uploading');
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { orgPath: _orgPath } = useOrg();

  const { groups, loading: categoriesLoading, error: categoriesError, requiresIndustry, reload: reloadCategories } = useCatalogCategories();
  const { subcategories, loading: subcategoriesLoading, error: subcategoriesError, reload: reloadSubcategories } = useCatalogSubcategories(categoryId);

  // ── File selection ────────────────────────────────────────────────────────

  const applyFile = useCallback((selectedFile: File) => {
    if (selectedFile.size > MAX_TEMPLATE_FILE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum allowed size is ${MAX_TEMPLATE_FILE_MB} MB.`);
      return;
    }
    const isHeicByExtension = /\.(heic|heif)$/i.test(selectedFile.name) && !selectedFile.type;
    if (!VALID_TYPES.includes(selectedFile.type) && !isHeicByExtension) {
      setError("Please upload an image file (PNG, JPG, WebP, SVG, AVIF, HEIC/HEIF). PDFs can only be used as email attachments.");
      return;
    }

    // Revoke previous blob URL
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPreviewFailed(false);
    setFile(selectedFile);
    setError("");

    // Instant thumbnail from local file
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    // Auto-fill title
    if (!title.trim()) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
    }
  }, [title]);

  // Revoke blob URL on unmount / file clear
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFile = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (previewUrl) { URL.revokeObjectURL(previewUrl); }
    setFile(null);
    setPreviewUrl(null);
    setPreviewFailed(false);
  }, [previewUrl]);

  // ── Initial file from page-level drop ────────────────────────────────────

  useEffect(() => {
    if (open && initialFile) applyFile(initialFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  // ── Reset on close ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open && !uploading) {
      clearFile();
      setTitle("");
      setCategoryId("");
      setSubcategoryId("");
      setError("");
      setTitleError(null);
      setUploadProgress(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uploading]);

  // ── Categories ────────────────────────────────────────────────────────────

  useEffect(() => { setSubcategoryId(""); }, [categoryId]);

  useEffect(() => {
    if (requiresIndustry && open && !showIndustryModal) setShowIndustryModal(true);
  }, [requiresIndustry, open, showIndustryModal]);

  useEffect(() => {
    if (open && !categoriesLoading && groups.length === 0) reloadCategories();
  }, [open, categoriesLoading, groups.length, reloadCategories]);

  const handleIndustrySelected = async () => {
    await reloadCategories();
    setShowIndustryModal(false);
  };

  // ── Drag + drop ───────────────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) applyFile(dropped);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setTitleError(null);

    if (!file) { setError("Please select a certificate design file"); return; }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setTitleError("Title is required"); setError("Please fill in all required fields"); return; }

    setUploading(true);
    setUploadProgress(0);
    setUploadPhase('uploading');

    try {
      await api.templates.create(
        file,
        { title: trimmedTitle, category_id: categoryId, subcategory_id: subcategoryId },
        (pct) => {
          setUploadProgress(pct);
          if (pct >= 100) setUploadPhase('processing');
        },
      );

      setUploadPhase('success');
      // Show success briefly before closing
      await new Promise(r => setTimeout(r, 900));

      clearFile();
      setTitle("");
      setCategoryId("");
      setSubcategoryId("");
      setTitleError(null);
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      let errorMessage = "Failed to upload certificate template";
      if (err instanceof ApiError) {
        const msg = err.message ?? "";
        if (msg.toLowerCase().includes("title") && msg.toLowerCase().includes("required")) {
          setTitleError("Title is required");
          errorMessage = "Please fill in all required fields";
        } else if (err.code === "VALIDATION_ERROR" || msg.toLowerCase().includes("validation")) {
          errorMessage = "Please check your input and try again";
        } else {
          errorMessage = msg || errorMessage;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const uploadedBytes = file ? Math.round((uploadProgress / 100) * file.size) : 0;
  const circumference = 2 * Math.PI * 22; // r=22

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <IndustrySelectModal
        open={showIndustryModal}
        onOpenChange={setShowIndustryModal}
        onIndustrySelected={handleIndustrySelected}
      />

      <Dialog open={open} onOpenChange={(v) => { if (!uploading) onOpenChange(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Upload Certificate Template</DialogTitle>
            <DialogDescription className="text-sm">
              Upload your certificate design image to use as a template
            </DialogDescription>
          </DialogHeader>

          {categoriesError && !requiresIndustry && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{categoriesError}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => reloadCategories()} className="ml-4">Retry</Button>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 mt-2">

            {/* ── Drop zone ──────────────────────────────────────────────── */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg,.avif,.heic,.heif"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) applyFile(f); e.target.value = ""; }}
              disabled={uploading}
            />

            {uploading ? (
              /* ── Upload progress ───────────────────────────────────────── */
              <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-4">
                <div className="flex items-center gap-4">
                  {/* Circular progress or success SVG */}
                  <div className="relative shrink-0 w-14 h-14">
                    {uploadPhase === 'success' ? (
                      <SuccessSVG className="w-14 h-14 text-[#3ECF8E]" />
                    ) : uploadPhase === 'processing' ? (
                      /* Spinning arc during server-side processing */
                      <svg className="w-14 h-14 animate-spin" viewBox="0 0 52 52" fill="none">
                        <circle cx="26" cy="26" r="22" stroke="currentColor" strokeWidth="3" className="text-muted-foreground/20" />
                        <path d="M26 4a22 22 0 0 1 22 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-primary" />
                      </svg>
                    ) : (
                      /* Circular progress during upload */
                      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 52 52" fill="none">
                        <circle cx="26" cy="26" r="22" stroke="currentColor" strokeWidth="3" className="text-muted-foreground/20" />
                        <circle
                          cx="26" cy="26" r="22"
                          stroke="currentColor" strokeWidth="3"
                          strokeLinecap="round"
                          className="text-primary transition-all duration-200"
                          strokeDasharray={circumference}
                          strokeDashoffset={circumference * (1 - uploadProgress / 100)}
                        />
                      </svg>
                    )}
                    {uploadPhase === 'uploading' && (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                        {uploadProgress}%
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{file?.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {uploadPhase === 'success'
                        ? 'Template saved successfully!'
                        : uploadPhase === 'processing'
                        ? 'Processing your template on the server…'
                        : `${formatBytes(uploadedBytes)} of ${formatBytes(file?.size ?? 0)} uploaded`}
                    </p>
                  </div>
                </div>

                {/* Linear bar */}
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      uploadPhase === 'success' ? "bg-[#3ECF8E]" : "bg-primary",
                      uploadPhase === 'processing' && "animate-pulse",
                    )}
                    style={{ width: uploadPhase === 'success' ? '100%' : `${uploadProgress}%` }}
                  />
                </div>

                <p className="text-[11px] text-center text-muted-foreground">
                  {uploadPhase === 'success'
                    ? 'Redirecting…'
                    : uploadPhase === 'processing'
                    ? 'Generating preview & storing image — almost done'
                    : 'Do not close this window'}
                </p>
              </div>
            ) : file ? (
              /* ── File selected: show thumbnail ─────────────────────────── */
              <div
                className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 overflow-hidden cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {/* Thumbnail */}
                <div className="relative bg-[#0d0d0d] flex items-center justify-center min-h-35 max-h-56 overflow-hidden">
                  {previewUrl && !previewFailed ? (
                    <img
                      src={previewUrl}
                      alt="Certificate template preview"
                      className="max-w-full max-h-56 object-contain"
                      onError={() => setPreviewFailed(true)}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                      <FileImage className="w-8 h-8" />
                      <span className="text-xs">Preview not available</span>
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="flex items-center gap-2 text-white text-sm font-medium bg-black/40 rounded-lg px-3 py-1.5">
                      <ImageIcon className="w-4 h-4" />
                      Change image
                    </div>
                  </div>
                </div>

                {/* File info bar */}
                <div className="px-3.5 py-2.5 bg-muted/40 border-t border-border/40 flex items-center gap-3">
                  <FileImage className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive shrink-0"
                    onClick={clearFile}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Empty: animated upload SVG ────────────────────────────── */
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer space-y-3",
                  dragActive
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-border hover:border-primary/60 hover:bg-muted/40",
                )}
              >
                <div className="flex justify-center">
                  {dragActive ? (
                    <UploadDragSVG className="w-14 h-14 text-primary" />
                  ) : (
                    <UploadIdleSVG className="w-14 h-14 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {dragActive ? "Drop to upload" : "Drop your certificate design here"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">or click to browse files</p>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  PNG, JPG, WebP, SVG, AVIF, HEIC/HEIF &middot; Max 50 MB
                </p>
              </div>
            )}

            {/* ── Form fields (hidden during upload) ─────────────────────── */}
            {!uploading && file && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="template-title">
                    Template Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="template-title"
                    placeholder="e.g., Certificate of Completion"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(null); }}
                    onBlur={() => { if (!title.trim()) setTitleError("Title is required"); else setTitleError(null); }}
                    className={titleError ? "border-destructive" : ""}
                    aria-invalid={!!titleError}
                    aria-describedby={titleError ? "title-error" : undefined}
                  />
                  {titleError && <p id="title-error" className="text-xs text-destructive">{titleError}</p>}
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <Label htmlFor="category">
                    Category <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Select value={categoryId} onValueChange={setCategoryId} disabled={categoriesLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder={categoriesLoading ? "Loading categories…" : "Select category"} />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesLoading ? (
                        <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
                      ) : categoriesError ? (
                        <div className="p-3 space-y-2 text-sm text-destructive text-center">
                          {categoriesError}
                          <Button type="button" variant="outline" size="sm" onClick={() => reloadCategories()} className="w-full mt-2">Retry</Button>
                        </div>
                      ) : groups.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">No categories available</div>
                      ) : (
                        groups.map((group, gi) => (
                          <div key={group.group_key}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase sticky top-0 bg-background z-10">
                              {group.label}
                            </div>
                            {group.items.map((item) => (
                              <SelectItem key={item.id} value={item.id} className="pl-4">{item.name}</SelectItem>
                            ))}
                            {gi < groups.length - 1 && <SelectSeparator />}
                          </div>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subcategory */}
                {categoryId && (
                  <div className="space-y-1.5">
                    <Label htmlFor="subcategory">
                      Subcategory <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={subcategoriesLoading}>
                      <SelectTrigger>
                        <SelectValue placeholder={subcategoriesLoading ? "Loading…" : subcategories.length === 0 ? "No subcategories" : "Select subcategory"} />
                      </SelectTrigger>
                      <SelectContent>
                        {subcategoriesLoading ? (
                          <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
                        ) : subcategoriesError ? (
                          <div className="p-3 text-sm text-destructive">
                            {subcategoriesError}
                            <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); reloadSubcategories(); }} className="w-full mt-2">Retry</Button>
                          </div>
                        ) : subcategories.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">No subcategories for this category</div>
                        ) : (
                          subcategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* ── Error ──────────────────────────────────────────────────── */}
            {error && !uploading && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* ── Actions ────────────────────────────────────────────────── */}
            {!uploading && (
              <div className="flex justify-end gap-3 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!file || !title.trim()}
                  className="gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload Template
                </Button>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
