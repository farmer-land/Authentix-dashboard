"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Maximize2, Trash2, FileImage, FileType, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { TemplateUploadDialog } from "@/components/templates/TemplateUploadDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useOrg } from "@/lib/org";
import { getCachedPreviewUrl, cachePreviewUrl, getPreviewCacheKey, clearPreviewCache } from "@/lib/utils/preview-url-cache";
import { useCatalogCategories } from "@/lib/hooks/use-catalog-categories";
import { toast } from "sonner";

interface TemplatePreviewState {
  [templateId: string]: {
    url: string | null;
    loading: boolean;
    error: boolean;
  };
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewStates, setPreviewStates] = useState<TemplatePreviewState>({});
  const [retryingPreviews, setRetryingPreviews] = useState<Set<string>>(new Set());
  // Page-level drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFilePreview, setDroppedFilePreview] = useState<{ url: string; file: File } | null>(null);
  const router = useRouter();
  const { orgPath } = useOrg();
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate consistent color for category/subcategory badges
  const getColorForText = (text: string): { bg: string; text: string; border: string } => {
    const colors = [
      { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
      { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
      { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
      { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
      { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-300' },
      { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300' },
      { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
      { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-300' },
      { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-300' },
      { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300' },
    ];

    // Simple hash function to get consistent index
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index]!;
  };

  // Pre-fetch categories when page loads (for instant upload dialog)
  useCatalogCategories();

  useEffect(() => {
    loadTemplates();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      if (droppedFilePreview) URL.revokeObjectURL(droppedFilePreview.url);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Page-level drag-and-drop: accept image/pdf anywhere on the page
  const { getRootProps: getPageRootProps, getInputProps: getPageInputProps } = useDropzone({
    onDrop: (acceptedFiles) => {
      const f = acceptedFiles[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      if (droppedFilePreview) URL.revokeObjectURL(droppedFilePreview.url);
      setDroppedFilePreview({ url, file: f });
      setIsDragOver(false);
    },
    onDragEnter: () => setIsDragOver(true),
    onDragLeave: () => setIsDragOver(false),
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [], 'application/pdf': [] },
    maxFiles: 1,
    noClick: true,
  });

  // Refresh templates after upload (with delay)
  const handleUploadSuccess = useCallback(() => {
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Refresh after a short delay
    refreshTimeoutRef.current = setTimeout(() => {
      loadTemplates();
    }, 1000);
  }, []);

  // Load preview URL for a template (with caching)
  const loadPreviewUrl = useCallback(async (template: any): Promise<string | null> => {
    // Normalize template ID (backend may return template_id or id)
    const templateId = template.id || template.template_id;
    if (!templateId) {
      console.warn('Template missing ID:', template);
      return null;
    }

    // Normalize preview file ID (backend may return latest_preview_file_id or preview_file_id)
    const previewFileId = template.latest_preview_file_id || template.preview_file_id;
    
    const cacheKey = getPreviewCacheKey(
      templateId,
      previewFileId,
      template.preview_bucket,
      template.preview_path
    );

    // Check cache first
    const cached = getCachedPreviewUrl(cacheKey);
    if (cached) {
      return cached;
    }

    // If preview_url already exists, cache and return it
    if (template.preview_url) {
      cachePreviewUrl(cacheKey, template.preview_url);
      return template.preview_url;
    }

    // If preview data exists but no URL, try to fetch it
    // Check multiple possible field names for preview data (prioritize latest_preview_file_id from v_templates_list)
    const hasPreviewData = 
      template.latest_preview_file_id || // New: from v_templates_list view
      template.preview_bucket || 
      template.preview_path || 
      template.preview_file_id ||
      template.preview?.bucket ||
      template.preview?.path ||
      template.preview?.file_id;

    if (hasPreviewData) {
      try {
        const url = await api.templates.getPreviewUrl(templateId);
        if (url) {
          cachePreviewUrl(cacheKey, url);
          return url;
        }
      } catch (err) {
        console.error(`Error loading preview for template ${templateId}:`, err);
      }
    }

    // If no preview data, try to use source file as fallback
    // This is useful for newly uploaded templates that don't have previews yet
    if (template.latest_source_file_id || template.source_file?.url || template.source_file?.path) {
      try {
        // Try to get preview URL for source file
        const url = await api.templates.getPreviewUrl(templateId);
        if (url) {
          cachePreviewUrl(cacheKey, url);
          return url;
        }
      } catch (err) {
        // Ignore errors for source file fallback
        console.debug(`Source file preview not available for template ${templateId}`);
      }
    }

    return null;
  }, []);

  // Load preview URLs for all templates
  const loadAllPreviews = useCallback(async (templatesList: any[]) => {
    const previewPromises = templatesList.map(async (template) => {
      // Normalize template ID (backend may return template_id or id)
      const templateId = template.id || template.template_id;
      if (!templateId) {
        console.warn('Template missing ID in loadAllPreviews:', template);
        return { templateId: null, url: null };
      }
      
      const url = await loadPreviewUrl(template);
      return { templateId, url };
    });

    const results = await Promise.all(previewPromises);
    const newPreviewStates: TemplatePreviewState = {};

    results.forEach(({ templateId, url }) => {
      if (templateId) {
        newPreviewStates[templateId] = {
          url,
          loading: false,
          error: url === null,
        };
      }
    });

    setPreviewStates((prev) => ({ ...prev, ...newPreviewStates }));
  }, [loadPreviewUrl]);

  const loadTemplates = async () => {
    try {
      // Use BFF route to fetch templates with previews in single request
      // This eliminates N+1 pattern by fetching everything server-side
      const response = await fetch(
        "/api/templates/with-previews?sort_by=created_at&sort_order=desc",
        { credentials: "include" }
      );

      if (!response.ok) {
        // Try to get error details from response
        let errorMessage = `Failed to fetch templates (${response.status} ${response.statusText})`;
        let errorDetails: any = null;
        
        try {
          // Try to read response as text first to see what we got
          const responseText = await response.text();
          console.error('[TemplatesPage] Response text:', responseText.substring(0, 500));
          
          // Try to parse as JSON
          try {
            const errorData = JSON.parse(responseText);
            errorDetails = errorData;
            
            if (errorData.error) {
              errorMessage = typeof errorData.error === 'string' 
                ? errorData.error 
                : errorData.error.message || errorMessage;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch (parseError) {
            // Not JSON, use the text as error message
            errorMessage = responseText || errorMessage;
          }
        } catch (readError) {
          // Can't read response body, use status
          errorMessage = `${response.status} ${response.statusText}`;
        }
        
        console.error('[TemplatesPage] Fetch error:', {
          status: response.status,
          statusText: response.statusText,
          statusCode: response.status,
          errorMessage,
          errorDetails,
          url: response.url,
        });
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      // Check if response indicates an error
      if (!result.success && result.error) {
        const errorMessage = typeof result.error === 'string' 
          ? result.error 
          : result.error.message || 'Failed to fetch templates';
        console.error('[TemplatesPage] API error:', result.error);
        throw new Error(errorMessage);
      }
      
      const data = result.data?.items || [];
      
      // Debug: Log first template to see what we're getting
      if (data.length > 0) {
        console.log('[TemplatesPage] First template received:', {
          id: data[0].id,
          title: data[0].title,
          name: data[0].name,
          category_name: data[0].category_name,
          subcategory_name: data[0].subcategory_name,
          category_id: data[0].category_id,
          subcategory_id: data[0].subcategory_id,
        });
      }
      
      setTemplates(data);

      // Load preview URLs in background (non-blocking)
      loadAllPreviews(data);
    } catch (error: unknown) {
      console.error("Error loading templates:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load templates";
      setTemplates([]);
      // You might want to show an error toast/alert here
    } finally {
      setLoading(false);
    }
  };

  // Retry preview generation
  const handleRetryPreview = useCallback(async (template: any) => {
    // Normalize template ID
    const templateId = template.id || template.template_id;
    if (!templateId) {
      console.warn('Template missing ID in handleRetryPreview:', template);
      return;
    }
    
    // Need version ID to generate preview (prioritize latest_version_id from v_templates_list)
    const versionId = template.latest_version_id || template.version?.id || template.latest_version?.id;
    if (!versionId || retryingPreviews.has(templateId)) return;

    setRetryingPreviews((prev) => new Set(prev).add(templateId));
    setPreviewStates((prev) => ({
      ...prev,
      [templateId]: { 
        url: prev[templateId]?.url || null, 
        loading: true, 
        error: false 
      },
    }));

    try {
      // Clear cache for this template
      clearPreviewCache(templateId);

      // Generate preview
      await api.templates.generatePreview(templateId, versionId);

      // Wait a bit then reload preview URL
      setTimeout(async () => {
        const url = await loadPreviewUrl(template);
        setPreviewStates((prev) => ({
          ...prev,
          [templateId]: { url, loading: false, error: url === null },
        }));
        setRetryingPreviews((prev) => {
          const next = new Set(prev);
          next.delete(templateId);
          return next;
        });
      }, 2000);
    } catch (err: any) {
      console.error(`Error retrying preview for template ${templateId}:`, err);
      setPreviewStates((prev) => ({
        ...prev,
        [templateId]: { 
          url: prev[templateId]?.url || null, 
          loading: false, 
          error: true 
        },
      }));
      setRetryingPreviews((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    }
  }, [loadPreviewUrl, retryingPreviews]);

  const handleGenerateCertificate = (template: any) => {
    // Normalize template ID
    const templateId = template.id || template.template_id;
    if (!templateId) {
      console.warn('Template missing ID in handleGenerateCertificate:', template);
      return;
    }
    // Navigate to generate certificate page which will auto-select this template
    router.push(orgPath(`/generate-certificate?template=${templateId}`));
  };

  const handleDeleteClick = (template: any) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!templateToDelete) return;

    // Normalize template ID
    const templateId = templateToDelete.id || templateToDelete.template_id;
    if (!templateId) {
      console.error('Template missing ID in handleDeleteConfirm:', templateToDelete);
      return;
    }

    setDeleting(true);
    try {
      await api.templates.delete(templateId);

      console.log('[Templates] Template deleted:', templateToDelete.name);

      // Remove from local state (normalize ID comparison)
      const deleteId = templateToDelete.id || templateToDelete.template_id;
      setTemplates((prev) => prev.filter((t) => {
        const tId = t.id || t.template_id;
        return tId !== deleteId;
      }));

      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      toast.success('Template deleted');
    } catch (error: any) {
      console.error('[Templates] Error deleting template:', error);
      toast.error(error.message || 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-96 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-11 w-36 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <div className="aspect-[4/3] bg-muted animate-pulse" />
              <CardContent className="p-4">
                <div className="h-5 w-3/4 bg-muted animate-pulse rounded mb-2" />
                <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8" {...getPageRootProps()}>
        <input {...getPageInputProps()} />
        {/* Page-level drag-over overlay */}
        {isDragOver && (
          <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
            <div className="absolute inset-0 bg-primary/10 border-4 border-dashed border-primary/50" />
            <div className="relative flex flex-col items-center gap-3 text-center">
              <div className="w-20 h-20 rounded-2xl bg-primary/15 border-2 border-primary/40 flex items-center justify-center shadow-xl">
                <FileImage className="w-10 h-10 text-primary" />
              </div>
              <p className="text-lg font-semibold text-primary">Drop your certificate template</p>
              <p className="text-sm text-primary/70">PDF, JPEG, or PNG</p>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Certificate Templates</h1>
            <p className="text-muted-foreground mt-1.5 text-base">
              Manage your certificate templates
            </p>
          </div>
          {templates.length > 0 && (
            <Button
              className="h-9 px-4 gap-2"
              onClick={() => setUploadDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Upload Certificate Template
            </Button>
          )}
        </div>

        {templates.length === 0 ? (
          <Card className="border-2 border-dashed border-border bg-card/40 relative overflow-hidden">
            <CardContent className="relative flex flex-col items-center justify-center py-16">
              <div className="mb-6">
                <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-2">No certificate templates yet</h3>
              <p className="text-muted-foreground text-center mb-8 max-w-md leading-relaxed">
                Upload your certificate design to create your first template.
              </p>
              <Button
                className="h-9 px-4 gap-2"
                onClick={() => setUploadDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Upload Your First Certificate Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.map((template) => {
            // Normalize template ID for key and operations
            const templateId = template.id || template.template_id;
            if (!templateId) {
              console.warn('Template missing ID:', template);
              return null;
            }
            
            return (
              <Card
                key={templateId}
                className="group overflow-hidden hover:shadow-md transition-all duration-300 border border-border bg-card/60 p-0 flex flex-col"
              >
                {/* Preview / Icon - No gaps from top, left, right */}
                <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                  {(() => {
                    // Normalize template ID first (before using it)
                    const templateId = template.id || template.template_id;
                    const previewState = previewStates[templateId];
                    const previewUrl = previewState?.url || template.preview_url;
                    const isLoading = previewState?.loading || false;
                    const hasError = previewState?.error || false;
                    
                    // Check multiple possible field names for preview data (prioritize latest_preview_file_id from v_templates_list)
                    const hasPreviewData = 
                      template.latest_preview_file_id || // New: from v_templates_list view
                      template.preview_bucket || 
                      template.preview_path || 
                      template.preview_file_id ||
                      template.preview?.bucket ||
                      template.preview?.path ||
                      template.preview?.file_id ||
                      template.version?.preview_file_id ||
                      template.latest_version?.preview_file_id;
                    const previewStatus = template.preview_status;

                    // Show skeleton while loading
                    if (isLoading || (!previewUrl && hasPreviewData && previewStatus !== "failed")) {
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50">
                          <div className="w-full h-full bg-muted animate-pulse" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                            <span className="text-xs text-muted-foreground">Generating preview...</span>
                          </div>
                        </div>
                      );
                    }

                    // Show preview if available
                    if (previewUrl) {
                      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'image/png', 'image/jpeg', 'image/webp'].includes(template.file_type || '');
                      
                      return isImage ? (
                        <div className="w-full h-full">
                          <img
                            src={previewUrl}
                            alt={template.title || template.name}
                            className="w-full h-full object-cover"
                            onError={() => {
                              // Handle image load error
                              setPreviewStates((prev) => ({
                                ...prev,
                                [templateId]: { url: null, loading: false, error: true },
                              }));
                            }}
                          />
                        </div>
                      ) : (
                        // PDF preview using iframe with fit parameters
                        <div className="w-full h-full flex items-center justify-center bg-white">
                          <iframe
                            src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&zoom=page-fit`}
                            className="w-full h-full border-0"
                            style={{ 
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain'
                            }}
                          />
                        </div>
                      );
                    }

                    // Show placeholder with retry option if preview data exists but failed
                    if (hasPreviewData && (hasError || previewStatus === "failed")) {
                      const versionId = template.latest_version_id || template.version?.id || template.latest_version?.id;
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50 gap-2">
                          {template.file_type === 'pdf' ? (
                            <FileType className="h-12 w-12 text-muted-foreground/50" />
                          ) : (
                            <FileImage className="h-12 w-12 text-muted-foreground/50" />
                          )}
                          <span className="text-xs text-muted-foreground text-center px-2">
                            Preview unavailable
                          </span>
                          {versionId && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryPreview(template);
                              }}
                              disabled={retryingPreviews.has(template.id)}
                            >
                              {retryingPreviews.has(template.id) ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              Retry preview
                            </Button>
                          )}
                        </div>
                      );
                    }

                    // Default placeholder (no preview data)
                    return (
                      <div className="w-full h-full flex items-center justify-center">
                        {template.file_type === 'pdf' ? (
                          <FileType className="h-12 w-12 text-muted-foreground/50" />
                        ) : (
                          <FileImage className="h-12 w-12 text-muted-foreground/50" />
                        )}
                      </div>
                    );
                  })()}
                  {/* Clickable overlay to open preview */}
                  {(previewStates[templateId]?.url || template.preview_url) && (
                    <div
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors cursor-zoom-in flex items-center justify-center"
                      onClick={() => {
                        setPreviewTemplate({
                          ...template,
                          preview_url: previewStates[templateId]?.url || template.preview_url,
                        });
                        setPreviewOpen(true);
                      }}
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity w-10 h-10 rounded-lg bg-white/20 border border-white/40 flex items-center justify-center backdrop-blur-sm">
                        <Maximize2 className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}

                  {/* File Type Badge */}
                  <div className="absolute top-3 right-3">
                    <Badge variant="secondary" className="text-xs uppercase shadow-sm">
                      {(() => {
                        const fileType = template.file_type || template.source_file?.mime_type?.split('/')[1] || 'pdf';
                        // Normalize file type display
                        if (fileType === 'jpeg' || fileType === 'jpg') return 'jpg';
                        if (fileType === 'png') return 'png';
                        if (fileType === 'pdf') return 'pdf';
                        return fileType;
                      })()}
                    </Badge>
                  </div>
                  
                </div>
                
                {/* Content */}
                <CardContent className="p-4 flex flex-col flex-1">
                  <div className="flex flex-col flex-1">
                    <div className="flex-1">
                      <h3 className="font-semibold truncate mb-1">
                        {template.title || template.name || "Untitled Template"}
                      </h3>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {/* Check for category name in multiple possible locations (prioritize category_name from backend) */}
                        {(() => {
                          const categoryName = 
                            template.category_name || // New: from v_templates_list view
                            template.category?.name || 
                            template.certificate_category || 
                            null;
                          if (!categoryName) return null;
                          const categoryColors = getColorForText(categoryName);
                          return (
                            <span
                              className={cn(
                                "text-xs border rounded-md px-1.5 py-0.5 max-w-30 truncate inline-flex items-center",
                                categoryColors.bg,
                                categoryColors.text,
                                categoryColors.border
                              )}
                            >
                              {categoryName}
                            </span>
                          );
                        })()}
                        {/* Check for subcategory name in multiple possible locations (prioritize subcategory_name from backend) */}
                        {(() => {
                          const subcategoryName = 
                            template.subcategory_name || // New: from v_templates_list view
                            template.subcategory?.name || 
                            template.certificate_subcategory || 
                            null;
                          if (!subcategoryName) return null;
                          const subcategoryColors = getColorForText(subcategoryName);
                          return (
                            <span
                              className={cn(
                                "text-xs border rounded-md px-1.5 py-0.5 max-w-30 truncate inline-flex items-center",
                                subcategoryColors.bg,
                                subcategoryColors.text,
                                subcategoryColors.border
                              )}
                            >
                              {subcategoryName}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {template.certificate_count || 0} certificates issued
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9 gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateCertificate(template);
                        }}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Generate Certificate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(template);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <TemplateUploadDialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          setUploadDialogOpen(open);
          if (!open && droppedFilePreview) {
            URL.revokeObjectURL(droppedFilePreview.url);
            setDroppedFilePreview(null);
          }
        }}
        onSuccess={handleUploadSuccess}
        initialFile={droppedFilePreview?.file}
      />

      {/* Dropped-file preview modal */}
      <Dialog
        open={!!droppedFilePreview && !uploadDialogOpen}
        onOpenChange={(open) => {
          if (!open && droppedFilePreview) {
            URL.revokeObjectURL(droppedFilePreview.url);
            setDroppedFilePreview(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              {droppedFilePreview?.file.name}
            </DialogDescription>
          </DialogHeader>
          {droppedFilePreview && (
            <div className="space-y-4">
              <div className="w-full bg-muted rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                <img
                  src={droppedFilePreview.url}
                  alt="Template preview"
                  className="max-w-full max-h-full w-auto h-auto object-contain"
                  style={{ maxHeight: '60vh' }}
                />
              </div>
              <DialogFooter className="gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => {
                    URL.revokeObjectURL(droppedFilePreview.url);
                    setDroppedFilePreview(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setUploadDialogOpen(true);
                  }}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Certificate
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl w-full">
          {previewTemplate && (() => {
            // Normalize template ID
            const templateId = previewTemplate.id || previewTemplate.template_id;
            const previewUrl = templateId ? (previewStates[templateId]?.url || previewTemplate.preview_url) : previewTemplate.preview_url;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{previewTemplate.title || previewTemplate.name}</DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                  <div className="w-full bg-muted overflow-hidden rounded-md flex items-center justify-center" style={{ minHeight: '500px', maxHeight: '70vh' }}>
                    {(() => {
                      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'image/png', 'image/jpeg', 'image/webp'].includes(previewTemplate.file_type || '');

                      if (isImage && previewUrl) {
                        return (
                          <div className="w-full h-full flex items-center justify-center bg-white p-4">
                            <img
                              src={previewUrl}
                              alt={previewTemplate.title || previewTemplate.name}
                              className="max-w-full max-h-full w-auto h-auto object-contain"
                              style={{ 
                                width: 'auto',
                                height: 'auto',
                                maxWidth: '100%',
                                maxHeight: '70vh'
                              }}
                            />
                          </div>
                        );
                      } else if (previewUrl) {
                        return (
                          <div className="w-full h-full flex items-center justify-center bg-white">
                            <iframe
                              src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&zoom=page-fit`}
                              className="w-full h-full border-0"
                              style={{ 
                                minHeight: '500px', 
                                maxHeight: '70vh',
                                width: '100%',
                                height: '100%'
                              }}
                            />
                          </div>
                        );
                      } else {
                        return (
                          <div className="w-full h-full flex items-center justify-center" style={{ minHeight: '500px' }}>
                            {previewTemplate.file_type === 'pdf' ? (
                              <FileType className="h-12 w-12 text-muted-foreground/50" />
                            ) : (
                              <FileImage className="h-12 w-12 text-muted-foreground/50" />
                            )}
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{templateToDelete?.title || templateToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setTemplateToDelete(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
