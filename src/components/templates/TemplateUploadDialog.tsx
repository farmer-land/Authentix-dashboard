"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Upload, Loader2, FileImage, FileType, File as FileIcon, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { useCatalogCategories } from "@/lib/hooks/use-catalog-categories";
import { useCatalogSubcategories } from "@/lib/hooks/use-catalog-subcategories";
import { IndustrySelectModal } from "./IndustrySelectModal";
import { useOrg } from "@/lib/org";

interface TemplateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialFile?: File;
}

export function TemplateUploadDialog({ open, onOpenChange, onSuccess, initialFile }: TemplateUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  
  const { orgPath } = useOrg();

  // Use the new catalog categories hook
  const {
    groups,
    loading: categoriesLoading,
    error: categoriesError,
    requiresIndustry,
    reload: reloadCategories,
  } = useCatalogCategories();

  // Debug logging for category state
  useEffect(() => {
    console.log('[TemplateUploadDialog] Category state:', {
      categoriesLoading,
      categoriesError,
      groupsCount: groups.length,
      groups: groups,
      requiresIndustry,
    });
  }, [categoriesLoading, categoriesError, groups, requiresIndustry]);

  // Fetch subcategories when category is selected
  const {
    subcategories,
    loading: subcategoriesLoading,
    error: subcategoriesError,
    reload: reloadSubcategories,
  } = useCatalogSubcategories(categoryId);

  // Find selected category for display
  const selectedCategory = groups
    .flatMap((group) => group.items)
    .find((item) => item.id === categoryId);

  // Find selected subcategory for display
  const selectedSubcategory = subcategories.find((item) => item.id === subcategoryId);

  // Pre-load file if provided (e.g. from page-level drag-and-drop)
  useEffect(() => {
    if (open && initialFile) {
      handleFileSelected(initialFile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  // Reset subcategory when category changes
  useEffect(() => {
    setSubcategoryId("");
  }, [categoryId]);

  // Reload categories when modal opens (if not already loading)
  useEffect(() => {
    if (open && !categoriesLoading && groups.length === 0) {
      console.log('[TemplateUploadDialog] Modal opened, reloading categories');
      reloadCategories();
    }
  }, [open, categoriesLoading, groups.length, reloadCategories]);

  // Reset form when modal closes (only after successful upload or explicit close)
  // Keep form data if user closes during upload or on error for retry
  useEffect(() => {
    if (!open && !uploading) {
      // Reset only if modal is closed and not uploading
      // This allows user to retry without losing data
      setFile(null);
      setTitle("");
      setCategoryId("");
      setSubcategoryId("");
      setError("");
    }
  }, [open, uploading]);

  // Handle industry requirement - show modal when 409 is detected
  useEffect(() => {
    if (requiresIndustry && open && !showIndustryModal) {
      setShowIndustryModal(true);
    }
  }, [requiresIndustry, open, showIndustryModal]);

  const handleIndustrySelected = async () => {
    // Reload categories after industry is set
    await reloadCategories();
    setShowIndustryModal(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelected(selectedFile);
    }
  };

  const MAX_TEMPLATE_FILE_MB = 50;

  const handleFileSelected = (selectedFile: File) => {
    if (selectedFile.size > MAX_TEMPLATE_FILE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum allowed size is ${MAX_TEMPLATE_FILE_MB} MB.`);
      return;
    }

    // Valid MIME types that match backend allowlist
    // Note: image/jpg is not standard - browsers report image/jpeg
    const validTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
      'image/avif',
      'image/heic',
      'image/heif',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];

    // HEIC/HEIF files often report empty MIME type on non-Apple browsers
    const isHeicByExtension = /\.(heic|heif)$/i.test(selectedFile.name) && !selectedFile.type;

    if (validTypes.includes(selectedFile.type) || isHeicByExtension) {
      setFile(selectedFile);
      // Auto-fill title from filename if title is empty
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
      if (!title.trim()) {
        setTitle(nameWithoutExt);
      }
      setError("");
    } else {
      setError("Please upload a valid file (PDF, PNG, JPG, WebP, SVG, AVIF, HEIC, DOCX, PPTX)");
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelected(droppedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setError("");
    setTitleError(null);

    // Debug: Log current state values
    console.log('[TemplateUploadDialog] Submit attempt:', {
      hasFile: !!file,
      title: title,
      titleTrimmed: title.trim(),
      categoryId: categoryId,
      subcategoryId: subcategoryId,
      categoriesLoading,
      subcategoriesLoading,
      subcategoriesCount: subcategories.length,
    });

    // Validate file
    if (!file) {
      setError("Please select a certificate design file");
      return;
    }

    // Validate title - mandatory with whitespace trimming
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      console.warn('[TemplateUploadDialog] Title validation failed:', { title, trimmedTitle });
      setTitleError("Title is required");
      setError("Please fill in all required fields");
      return;
    }

    // Category and subcategory are optional — templates can be categorized later

    setUploading(true);
    setError("");
    setTitleError(null);

    try {
      // Create template via API with new endpoint format
      // Backend expects: file, title, category_id, subcategory_id as multipart/form-data
      // Frontend sends ONLY metadata - backend handles all storage paths
      console.log('[TemplateUploadDialog] Calling API with:', {
        fileName: file.name,
        title: trimmedTitle,
        categoryId: categoryId,
        subcategoryId: subcategoryId,
      });
      
      const result = await api.templates.create(file, {
        title: trimmedTitle, // Always use trimmed title
        category_id: categoryId,
        subcategory_id: subcategoryId,
      });
      
      console.log('[TemplateUploadDialog] Upload successful:', result);

      // Reset form state after successful upload
      setFile(null);
      setTitle("");
      setCategoryId("");
      setSubcategoryId("");
      setTitleError(null);
      
      // Close modal first
      onOpenChange(false);
      
      // Call success callback to refresh templates list (template will appear as a card)
      onSuccess();
      
      // Do NOT redirect - user stays on templates list page and sees the new template card
    } catch (err: any) {
      console.error('Upload error:', err);
      
      // User-friendly error handling
      let errorMessage = "Failed to upload certificate template";
      
      if (err instanceof ApiError) {
        const errorCode = err.code || "";
        const errorMsg = err.message || "";
        
        // Map backend errors to user-friendly messages
        if (errorMsg.toLowerCase().includes("title") && errorMsg.toLowerCase().includes("required")) {
          setTitleError("Title is required");
          errorMessage = "Please fill in all required fields";
        } else if (errorCode === "VALIDATION_ERROR" || errorMsg.toLowerCase().includes("validation")) {
          errorMessage = "Please check your input and try again";
        } else if (errorMsg.toLowerCase().includes("storage") || errorMsg.toLowerCase().includes("path") || errorMsg.toLowerCase().includes("bucket")) {
          errorMessage = "Upload failed due to configuration error. Please retry.";
        } else if (errorMsg.toLowerCase().includes("category") || errorMsg.toLowerCase().includes("subcategory")) {
          errorMessage = "Invalid category or subcategory. Please select again.";
        } else {
          // Use backend message if it's user-friendly, otherwise generic message
          errorMessage = errorMsg || errorMessage;
        }
      } else {
        errorMessage = err.message || errorMessage;
      }
      
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="h-6 w-6" />;
    if (file.type === 'application/pdf') return <FileType className="h-6 w-6" />;
    if (file.type.startsWith('image/')) return <FileImage className="h-6 w-6" />;
    return <FileIcon className="h-6 w-6" />;
  };

  return (
    <>
      <IndustrySelectModal
        open={showIndustryModal}
        onOpenChange={setShowIndustryModal}
        onIndustrySelected={handleIndustrySelected}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Upload Certificate Template</DialogTitle>
            <DialogDescription className="text-sm">
              Upload your certificate design and assign it to a category
            </DialogDescription>
          </DialogHeader>

        {categoriesError && !requiresIndustry && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{categoriesError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => reloadCategories()}
                className="ml-4"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* File Upload FIRST */}
          <div className="space-y-2">
            <Label>
              Certificate Design <span className="text-destructive">*</span>
            </Label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                file && "border-primary bg-primary/5"
              )}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.avif,.heic,.heif,.docx,.pptx"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading}
              />

              {file ? (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-muted text-muted-foreground">
                    {getFileIcon()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      // Don't clear title - user may want to keep it
                    }}
                    disabled={uploading}
                    className="h-8 text-xs"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-muted text-muted-foreground">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Drop your certificate design here</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      or click to browse
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supports: PDF, PNG, JPG, WebP, SVG, AVIF, HEIC/HEIF, DOCX, PPTX (Max 50MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Template Title (Auto-filled from filename, editable) */}
          {file && (
            <>
              <div className="space-y-2">
                <Label htmlFor="template-title">
                  Template Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="template-title"
                  placeholder="e.g., Certificate of Completion"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    // Clear title error when user starts typing
                    if (titleError) {
                      setTitleError(null);
                    }
                  }}
                  onBlur={() => {
                    // Validate on blur
                    if (!title.trim()) {
                      setTitleError("Title is required");
                    } else {
                      setTitleError(null);
                    }
                  }}
                  disabled={uploading}
                  required
                  className={titleError ? "border-destructive" : ""}
                  aria-invalid={!!titleError}
                  aria-describedby={titleError ? "title-error" : undefined}
                />
                {titleError && (
                  <p id="title-error" className="text-sm text-destructive">
                    {titleError}
                  </p>
                )}
              </div>

              {/* Category Dropdown with Grouping */}
              <div className="space-y-2">
                <Label htmlFor="category">
                  Category <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Select 
                  value={categoryId} 
                  onValueChange={setCategoryId} 
                  disabled={uploading || categoriesLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={categoriesLoading ? "Loading categories..." : "Select category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesLoading ? (
                      // Skeleton loader
                      <div className="p-4 space-y-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                        ))}
                      </div>
                    ) : categoriesError ? (
                      <div className="p-4 space-y-3">
                        <div className="text-sm text-destructive text-center">
                          {categoriesError}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => reloadCategories()}
                          className="w-full"
                        >
                          Retry
                        </Button>
                      </div>
                    ) : groups.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        No categories available
                      </div>
                    ) : (
                      groups.map((group, groupIndex) => (
                        <div key={group.group_key}>
                          {/* Group divider label */}
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase sticky top-0 bg-background z-10">
                            {group.label}
                          </div>
                          {/* Group items */}
                          {group.items.map((item) => (
                            <SelectItem key={item.id} value={item.id} className="pl-4">
                              {item.name}
                            </SelectItem>
                          ))}
                          {/* Separator between groups (not after last group) */}
                          {groupIndex < groups.length - 1 && (
                            <SelectSeparator />
                          )}
                        </div>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Subcategory Dropdown - Only shown when category is selected */}
              {categoryId && (
                <div className="space-y-2">
                  <Label htmlFor="subcategory">
                    Subcategory <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Select 
                    value={subcategoryId} 
                    onValueChange={setSubcategoryId} 
                    disabled={uploading || subcategoriesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue 
                        placeholder={
                          subcategoriesLoading 
                            ? "Loading subcategories..." 
                            : subcategories.length === 0 
                            ? "No subcategories available" 
                            : "Select subcategory"
                        } 
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {subcategoriesLoading ? (
                        // Skeleton loader
                        <div className="p-4 space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                          ))}
                        </div>
                      ) : subcategoriesError ? (
                        // Error state with retry
                        <div className="p-4 space-y-3">
                          <div className="text-sm text-destructive">
                            {subcategoriesError}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              reloadSubcategories();
                            }}
                            className="w-full"
                          >
                            Retry
                          </Button>
                        </div>
                      ) : subcategories.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No subcategories available for this category
                        </div>
                      ) : (
                        subcategories.map((subcat) => (
                          <SelectItem key={subcat.id} value={subcat.id}>
                            {subcat.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}


          {/* Error Display with Retry */}
          {error && !uploading && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }}
                  className="ml-4"
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                uploading ||
                !file ||
                !title.trim()
              }
              className="gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload Certificate Template
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
