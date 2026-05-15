'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDropzone } from 'react-dropzone';
import { FileText, Image as ImageIcon, Upload, Plus, Check, CheckCircle2, ChevronLeft, ChevronRight, AlertCircle, Loader2, Layers, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCatalogCategories } from '@/lib/hooks/use-catalog-categories';
import { useCatalogSubcategories } from '@/lib/hooks/use-catalog-subcategories';
import { IndustrySelectModal } from '@/components/templates/IndustrySelectModal';
import { RecentUsedTemplates } from './RecentUsedTemplates';
import type { RecentGeneratedTemplate, InProgressTemplate } from '@/lib/api/client';


interface RecentTemplate {
  template_id: string;
  template_title: string;
  template_version_id: string | null;
  preview_url: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  fields: Array<{
    id: string;
    field_key: string;
    label: string;
    type: string;
    page_number: number;
    x: number;
    y: number;
    width: number | null;
    height: number | null;
    style: Record<string, unknown> | null;
  }>;
}

interface TemplateSelectorProps {
  savedTemplates: any[];
  onSelectTemplate: (template: any) => void;
  onNewUpload: (file: File, width: number, height: number, saveTemplate: boolean, templateName?: string, categoryId?: string, subcategoryId?: string) => Promise<any>;
  onDeleteTemplate?: (templateId: string) => Promise<void>;
  recentGenerated?: RecentGeneratedTemplate[];
  inProgress?: InProgressTemplate[];
  recentLoading?: boolean;
  onSelectRecentTemplate?: (template: RecentTemplate, loadFields: boolean) => void;
  templateMode?: 'single' | 'multi';
  onTemplateModeChange?: (mode: 'single' | 'multi') => void;
  onSelectMultipleTemplates?: (templates: any[]) => void;
}

export function TemplateSelector({
  savedTemplates,
  onSelectTemplate,
  onNewUpload,
  onDeleteTemplate,
  recentGenerated = [],
  inProgress = [],
  recentLoading = false,
  onSelectRecentTemplate,
  templateMode = 'single',
  onTemplateModeChange,
  onSelectMultipleTemplates,
}: TemplateSelectorProps) {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [multiSelected, setMultiSelected] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toggleMultiSelect = (template: any) => {
    setMultiSelected(prev => {
      const exists = prev.some(t => t.id === template.id);
      return exists ? prev.filter(t => t.id !== template.id) : [...prev, template];
    });
  };

  const handleModeChange = (mode: 'single' | 'multi') => {
    onTemplateModeChange?.(mode);
    setMultiSelected([]);
  };

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [saveTemplate, setSaveTemplate] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showIndustryModal, setShowIndustryModal] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    groups,
    loading: categoriesLoading,
    error: categoriesError,
    requiresIndustry,
    reload: reloadCategories,
  } = useCatalogCategories();

  const {
    subcategories,
    loading: subcategoriesLoading,
    error: subcategoriesError,
    reload: reloadSubcategories,
  } = useCatalogSubcategories(categoryId);

  useEffect(() => {
    setSubcategoryId('');
  }, [categoryId]);

  useEffect(() => {
    if (showUploadDialog && !categoriesLoading && groups.length === 0) {
      reloadCategories();
    }
  }, [showUploadDialog, categoriesLoading, groups.length, reloadCategories]);

  useEffect(() => {
    if (requiresIndustry && showUploadDialog && !showIndustryModal) {
      setShowIndustryModal(true);
    }
  }, [requiresIndustry, showUploadDialog, showIndustryModal]);

  useEffect(() => {
    if (!showUploadDialog && !isProcessing) {
      setUploadFile(null);
      setTemplateName('');
      setCategoryId('');
      setSubcategoryId('');
      setError('');
    }
  }, [showUploadDialog, isProcessing]);

  const handleIndustrySelected = async () => {
    await reloadCategories();
    setShowIndustryModal(false);
  };

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
    ] as const;

    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length]!;
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: direction === 'left' ? -400 : 400, behavior: 'smooth' });
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploadFile(file);
    setTemplateName(file.name.replace(/\.(pdf|jpe?g|png)$/i, ''));
    setIsProcessing(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/avif': ['.avif'],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!uploadFile) return;
    setError('');

    if (!templateName.trim()) { setError('Template name is required'); return; }
    if (!categoryId) { setError('Please select a category'); return; }
    if (!subcategoryId && subcategories.length > 0) {
      if (subcategoriesLoading) { setError('Please wait for subcategories to load'); return; }
      setError('Please select a subcategory');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      let width = 0, height = 0;

      const img = new Image();
      const imageUrl = URL.createObjectURL(uploadFile);
      await new Promise((resolve, reject) => {
        img.onload = () => { width = img.naturalWidth; height = img.naturalHeight; URL.revokeObjectURL(imageUrl); resolve(true); };
        img.onerror = () => { URL.revokeObjectURL(imageUrl); reject(new Error('Failed to load image')); };
        img.src = imageUrl;
      });

      // In multi mode always save (blob URLs can't be reloaded across renders).
      const shouldSave = templateMode === 'multi' ? true : saveTemplate;
      const savedTemplate = await onNewUpload(uploadFile, width, height, shouldSave, templateName.trim(), categoryId, subcategoryId);

      // Multi mode: auto-add the newly saved template to the selection and stay on this step
      if (templateMode === 'multi' && savedTemplate) {
        setMultiSelected(prev => {
          const exists = prev.some(t => t.id === savedTemplate.id);
          return exists ? prev : [...prev, savedTemplate];
        });
      }

      setShowUploadDialog(false);
      setUploadFile(null);
      setTemplateName('');
      setCategoryId('');
      setSubcategoryId('');
      setError('');
    } catch (err: any) {
      console.error('Error processing file:', err);
      setError(err.message || 'Failed to process file. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecentSelect = (template: RecentTemplate, loadFields: boolean) => {
    onSelectRecentTemplate?.(template, loadFields);
  };

  const handleDeleteTemplate = async (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    if (!onDeleteTemplate) return;
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    setDeletingId(templateId);
    try {
      await onDeleteTemplate(templateId);
    } finally {
      setDeletingId(null);
    }
  };

  const hasRecentTemplates = recentGenerated.length > 0 || inProgress.length > 0 || recentLoading;

  return (
    <div className="h-full flex flex-col">
      {/* ── Mode Selection ─────────────────────────────────────────── */}
      <div className="px-8 pt-6 pb-4 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Choose Template</h2>
          <span className="text-muted-foreground text-sm">— select a template to get started</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* Single Certificate */}
          <button
            onClick={() => handleModeChange('single')}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
              templateMode === 'single'
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : 'border-border hover:border-primary/40 hover:bg-muted/30'
            )}
          >
            <div className={cn(
              'mt-0.5 p-2 rounded-lg shrink-0 transition-colors',
              templateMode === 'single' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn('font-semibold text-sm', templateMode === 'single' && 'text-primary')}>
                Single Certificate
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                One template design, generated for all recipients
              </div>
            </div>
            <div className={cn(
              'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors',
              templateMode === 'single' ? 'border-primary bg-primary' : 'border-muted-foreground/30'
            )}>
              {templateMode === 'single' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>

          {/* Multiple Certificates */}
          <button
            onClick={() => handleModeChange('multi')}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
              templateMode === 'multi'
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : 'border-border hover:border-primary/40 hover:bg-muted/30'
            )}
          >
            <div className={cn(
              'mt-0.5 p-2 rounded-lg shrink-0 transition-colors',
              templateMode === 'multi' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn('font-semibold text-sm', templateMode === 'multi' && 'text-primary')}>
                Generate Multiple Certificates
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Multiple certificate types from one data file at once
              </div>
            </div>
            <div className={cn(
              'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors',
              templateMode === 'multi' ? 'border-primary bg-primary' : 'border-muted-foreground/30'
            )}>
              {templateMode === 'multi' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>
        </div>
      </div>

      {/* ── Recent Templates ───────────────────────────────────────── */}
      {hasRecentTemplates && (
        <div className="px-8 pb-3 shrink-0">
          <RecentUsedTemplates
            recentGenerated={recentGenerated}
            inProgress={inProgress}
            loading={recentLoading}
            onSelectTemplate={handleRecentSelect}
          />
        </div>
      )}

      {/* ── Templates Section ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden px-8 pb-4">
        {/* Section header */}
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Your Templates</span>
          {savedTemplates.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {savedTemplates.length}
            </Badge>
          )}
          {templateMode === 'multi' && multiSelected.length > 0 && (
            <Badge className="text-xs ml-auto">
              {multiSelected.length} selected
            </Badge>
          )}
        </div>

        {/* Carousel row */}
        <div className="relative group/carousel flex-1 flex flex-col justify-center">
          {/* Left arrow */}
          <Button
            variant="outline" size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full opacity-0 group-hover/carousel:opacity-100 disabled:opacity-0 transition-opacity bg-background shadow-md hidden md:flex -translate-x-3"
            onClick={() => scroll('left')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          {/* Cards row */}
          <div
            ref={scrollContainerRef}
            className="flex overflow-x-auto gap-4 px-1 pb-2 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
          >
            {/* Upload New Template — always first, always visible */}
            <IndustrySelectModal
              open={showIndustryModal}
              onOpenChange={setShowIndustryModal}
              onIndustrySelected={handleIndustrySelected}
            />
            <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
              <DialogTrigger asChild>
                <Card className={cn(
                  'snap-start shrink-0 cursor-pointer border-2 border-dashed transition-all',
                  'hover:border-primary/60 hover:bg-muted/20 hover:shadow-md',
                  'flex flex-col items-center justify-center gap-3 text-center',
                  'w-[260px] min-h-[220px]'
                )}>
                  <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Plus className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Upload Template</p>
                    <p className="text-xs text-muted-foreground mt-0.5">PDF, JPEG, or PNG</p>
                  </div>
                </Card>
              </DialogTrigger>

              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Upload Certificate Template</DialogTitle>
                </DialogHeader>

                {categoriesError && !requiresIndustry && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>{categoriesError}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => reloadCategories()} className="ml-4">
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-6 py-4">
                  {/* Drop zone */}
                  <div
                    {...getRootProps()}
                    className={cn(
                      'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
                      isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50'
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center gap-4">
                      {uploadFile ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                            <FileCheck className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-base font-medium">{uploadFile.name}</p>
                            <p className="text-sm text-muted-foreground">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                            <Upload className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-base font-medium">Click to upload or drag and drop</p>
                            <p className="text-sm text-muted-foreground mt-1">PDF, JPEG, or PNG (Max 10MB)</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Template info */}
                  {uploadFile && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                      <div className="space-y-2">
                        <Label htmlFor="templateName">Template Name <span className="text-destructive">*</span></Label>
                        <Input
                          id="templateName"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder="e.g., Completion Certificate"
                          required
                          disabled={isProcessing}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="category">Category <span className="text-destructive">*</span></Label>
                        <Select value={categoryId} onValueChange={setCategoryId} disabled={isProcessing || categoriesLoading}>
                          <SelectTrigger>
                            <SelectValue placeholder={categoriesLoading ? 'Loading categories...' : 'Select category'} />
                          </SelectTrigger>
                          <SelectContent>
                            {categoriesLoading ? (
                              <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
                            ) : categoriesError ? (
                              <div className="p-4 space-y-3">
                                <div className="text-sm text-destructive text-center">{categoriesError}</div>
                                <Button type="button" variant="outline" size="sm" onClick={() => reloadCategories()} className="w-full">Retry</Button>
                              </div>
                            ) : groups.length === 0 ? (
                              <div className="p-4 text-sm text-muted-foreground text-center">No categories available</div>
                            ) : (
                              groups.map((group, groupIndex) => (
                                <div key={group.group_key}>
                                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase sticky top-0 bg-background z-10">{group.label}</div>
                                  {group.items.map(item => (
                                    <SelectItem key={item.id} value={item.id} className="pl-4">{item.name}</SelectItem>
                                  ))}
                                  {groupIndex < groups.length - 1 && <SelectSeparator />}
                                </div>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {categoryId && (
                        <div className="space-y-2">
                          <Label htmlFor="subcategory">
                            Subcategory{subcategories.length > 0 && <span className="text-destructive"> *</span>}
                          </Label>
                          <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={isProcessing || subcategoriesLoading}>
                            <SelectTrigger>
                              <SelectValue placeholder={subcategoriesLoading ? 'Loading subcategories...' : subcategories.length === 0 ? 'No subcategories available' : 'Select subcategory'} />
                            </SelectTrigger>
                            <SelectContent>
                              {subcategoriesLoading ? (
                                <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
                              ) : subcategoriesError ? (
                                <div className="p-4 space-y-3">
                                  <div className="text-sm text-destructive">{subcategoriesError}</div>
                                  <Button type="button" variant="outline" size="sm" onClick={e => { e.stopPropagation(); reloadSubcategories(); }} className="w-full">Retry</Button>
                                </div>
                              ) : subcategories.length === 0 ? (
                                <div className="p-4 text-sm text-muted-foreground text-center">No subcategories available</div>
                              ) : (
                                subcategories.map(subcat => (
                                  <SelectItem key={subcat.id} value={subcat.id}>{subcat.name}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Save toggle — hidden in multi mode (always saved, required for multi-load) */}
                      {templateMode !== 'multi' && (
                        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                          <div className="space-y-0.5">
                            <Label className="text-base">Save to Templates</Label>
                            <p className="text-sm text-muted-foreground">Save for future use in the templates library</p>
                          </div>
                          <button
                            onClick={() => setSaveTemplate(!saveTemplate)}
                            disabled={isProcessing}
                            className={cn('w-11 h-6 rounded-full transition-colors relative', saveTemplate ? 'bg-primary' : 'bg-muted-foreground/30', isProcessing && 'opacity-50 cursor-not-allowed')}
                          >
                            <div className={cn('absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform', saveTemplate && 'translate-x-5')} />
                          </button>
                        </div>
                      )}

                      {error && !isProcessing && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      )}

                      <Button
                        onClick={handleUpload}
                        disabled={isProcessing || !templateName.trim() || !categoryId || (!subcategoryId && subcategories.length > 0) || categoriesLoading || subcategoriesLoading}
                        className="w-full"
                        size="lg"
                      >
                        {isProcessing
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving template…</>
                          : templateMode === 'multi' ? 'Add to Selection' : 'Start Designing'}
                      </Button>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Empty state (no saved templates) */}
            {savedTemplates.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center px-8 py-12 gap-2">
                <p className="text-muted-foreground text-sm font-medium">No saved templates yet</p>
                <p className="text-muted-foreground/70 text-xs">
                  {templateMode === 'multi'
                    ? 'Upload your first template — it will be added to your selection automatically'
                    : 'Upload a template to get started'}
                </p>
              </div>
            )}

            {/* Saved template cards */}
            {savedTemplates.map((template, index) => {
              const isMultiSelected = multiSelected.some(t => t.id === template.id);
              return (
                <Card
                  key={template.id || `template-${index}`}
                  className={cn(
                    'snap-start shrink-0 overflow-hidden hover:shadow-lg transition-all cursor-pointer group border-muted hover:border-primary/50',
                    'w-[248px]',
                    isMultiSelected && 'border-primary ring-2 ring-primary/30'
                  )}
                  onClick={() => templateMode === 'multi' ? toggleMultiSelect(template) : onSelectTemplate(template)}
                >
                  <div className="aspect-[4/3.1] bg-muted relative overflow-hidden">
                    {(() => {
                      if (template.preview_url) return (
                        <img src={template.preview_url} alt={template.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      );
                      return (
                        <div className="w-full h-full flex items-center justify-center bg-secondary/50">
                          <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                        </div>
                      );
                    })()}

                    {templateMode === 'single' && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button variant="secondary" size="sm" className="font-medium h-8 text-xs">Use Template</Button>
                        {onDeleteTemplate && (
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            disabled={deletingId === template.id}
                            onClick={(e) => handleDeleteTemplate(e, template.id)}
                            title="Delete template"
                          >
                            {deletingId === template.id
                              ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                      </div>
                    )}

                    {templateMode === 'multi' && (
                      <div className={cn(
                        'absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                        isMultiSelected ? 'bg-primary border-primary text-primary-foreground' : 'bg-white/80 border-white/60 text-transparent group-hover:border-primary/60'
                      )}>
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {templateMode === 'multi' && isMultiSelected && (
                      <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
                    )}
                  </div>

                  <div className="p-3 space-y-1.5">
                    <h4 className="font-semibold truncate text-sm leading-tight">{template.name}</h4>
                    <div className="flex flex-wrap gap-1">
                      {template.certificate_category && (
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] border font-normal rounded-sm px-1.5 py-0 h-4', getColorForText(template.certificate_category).bg, getColorForText(template.certificate_category).text, getColorForText(template.certificate_category).border)}
                        >
                          {template.certificate_category}
                        </Badge>
                      )}
                      {template.certificate_subcategory && (
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] border font-normal rounded-sm px-1.5 py-0 h-4', getColorForText(template.certificate_subcategory).bg, getColorForText(template.certificate_subcategory).text, getColorForText(template.certificate_subcategory).border)}
                        >
                          {template.certificate_subcategory}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Badge variant="outline" className="font-normal rounded-sm px-1.5 py-0 h-4 text-[10px]">
                        {template.file_type?.toUpperCase()}
                      </Badge>
                      {template.width && template.height && (
                        <span>{Math.round(template.width)} × {Math.round(template.height)}px</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Right arrow */}
          <Button
            variant="outline" size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full opacity-0 group-hover/carousel:opacity-100 disabled:opacity-0 transition-opacity bg-background shadow-md hidden md:flex translate-x-3"
            onClick={() => scroll('right')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Multi-mode: selection summary bar ─────────────────────── */}
      {templateMode === 'multi' && (
        <div className={cn(
          'mx-8 mb-4 rounded-xl border p-3 transition-all shrink-0',
          multiSelected.length > 0 ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-dashed border-muted-foreground/20'
        )}>
          {multiSelected.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-1">
              {savedTemplates.length === 0
                ? 'Click "Upload Template" above to add your first template — it will auto-select here'
                : 'Click templates above to select them · Upload new ones to add to the selection'}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {multiSelected.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-1.5 bg-background border border-border rounded-full px-3 py-1 text-xs font-medium">
                    <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold shrink-0">{i + 1}</span>
                    <span className="truncate max-w-[120px]">{t.title || t.name}</span>
                    <button onClick={() => toggleMultiSelect(t)} className="text-muted-foreground hover:text-foreground ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <Button onClick={() => onSelectMultipleTemplates?.(multiSelected)} disabled={multiSelected.length < 1} className="gap-2 shrink-0" size="sm">
                <CheckCircle2 className="w-4 h-4" />
                Start Designing ({multiSelected.length})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function FileCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
