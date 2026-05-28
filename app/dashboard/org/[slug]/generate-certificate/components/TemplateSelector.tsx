'use client';

import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useDropzone } from 'react-dropzone';
import {
  Upload, Plus, Check, AlertCircle, Loader2, Trash2,
  Search, X, Clock, RotateCcw, Layers, Pencil,
  ChevronLeft, ChevronRight, Image as ImageIcon,
  Sparkles, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCatalogCategories } from '@/lib/hooks/use-catalog-categories';
import { useCatalogSubcategories } from '@/lib/hooks/use-catalog-subcategories';
import { IndustrySelectModal } from '@/components/templates/IndustrySelectModal';
import type { RecentGeneratedTemplate, InProgressTemplate } from '@/lib/api/client';

/* ─── Types ─────────────────────────────────────────────────────── */

interface PendingResumeSession {
  templateId: string;
  templateName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: any[];
  canvasScale?: number;
  templateVersionId: string | null;
  currentStep: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  importedDataMeta: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldMappings: any[];
}

interface TemplateSelectorProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  savedTemplates: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectTemplate: (template: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNewUpload: (file: File, width: number, height: number, saveTemplate: boolean, templateName?: string, categoryId?: string, subcategoryId?: string, onProgress?: (pct: number) => void, navigateToDesign?: boolean) => Promise<any>;
  onDeleteTemplate?: (templateId: string) => Promise<void>;
  recentGenerated?: RecentGeneratedTemplate[];
  inProgress?: InProgressTemplate[];
  recentLoading?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectRecentTemplate?: (template: any, loadFields: boolean) => void;
  templateMode?: 'single' | 'multi';
  onTemplateModeChange?: (mode: 'single' | 'multi') => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectMultipleTemplates?: (templates: any[]) => void;
  pendingResumeSession?: PendingResumeSession | null;
  onResumeSession?: () => void;
  onDismissResume?: () => void;
  onRenameTemplate?: (id: string, name: string) => Promise<void>;
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return day === 1 ? 'Yesterday' : `${day}d ago`;
}

/* ─── Component ──────────────────────────────────────────────────── */

export function TemplateSelector({
  savedTemplates,
  onSelectTemplate,
  onNewUpload,
  onDeleteTemplate,
  recentGenerated = [],
  inProgress = [],
  recentLoading = false,
  onSelectRecentTemplate,
  onTemplateModeChange,
  onSelectMultipleTemplates,
  pendingResumeSession,
  onResumeSession,
  onDismissResume,
  onRenameTemplate,
}: TemplateSelectorProps) {

  /* ── State ── */
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [batchSelected, setBatchSelected] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [renameSavingId, setRenameSavingId] = useState<string | null>(null);
  const renamingInputRef = useRef<HTMLInputElement>(null);
  const inProgressScrollRef = useRef<HTMLDivElement>(null);
  const recentScrollRef = useRef<HTMLDivElement>(null);

  /* Upload state */
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadDims, setUploadDims] = useState<{ w: number; h: number } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showIndustryModal, setShowIndustryModal] = useState(false);

  const {
    groups, loading: categoriesLoading, error: categoriesError,
    requiresIndustry, reload: reloadCategories,
  } = useCatalogCategories();
  const {
    subcategories, loading: subcategoriesLoading, error: subcategoriesError,
    reload: reloadSubcategories,
  } = useCatalogSubcategories(categoryId);

  useEffect(() => { setSubcategoryId(''); }, [categoryId]);
  useEffect(() => {
    if (showUploadDialog && !categoriesLoading && groups.length === 0) reloadCategories();
  }, [showUploadDialog, categoriesLoading, groups.length, reloadCategories]);
  useEffect(() => {
    if (requiresIndustry && showUploadDialog && !showIndustryModal) setShowIndustryModal(true);
  }, [requiresIndustry, showUploadDialog, showIndustryModal]);
  useEffect(() => {
    if (!showUploadDialog && !isProcessing) {
      setUploadPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      setUploadFile(null); setTemplateName(''); setCategoryId(''); setSubcategoryId(''); setError('');
    }
  }, [showUploadDialog, isProcessing]);

  const handleIndustrySelected = async () => { await reloadCategories(); setShowIndustryModal(false); };

  /* Dropzone */
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploadFile(file);
    setUploadDims(null);
    setTemplateName(file.name.replace(/\.(pdf|jpe?g|png|webp|avif)$/i, ''));
    setIsProcessing(false);
    // One URL for both preview display and dimension measurement (revoked on dialog close)
    const url = URL.createObjectURL(file);
    setUploadPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    const img = new Image();
    img.onload = () => setUploadDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
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

  /* Upload handler — navigate=true opens design canvas, navigate=false saves to library only */
  const handleUpload = async (navigate: boolean) => {
    if (!uploadFile) return;
    const finalName = templateName.trim() ||
      uploadFile.name.replace(/\.(jpe?g|png|webp|avif)$/i, '').replace(/[-_]+/g, ' ').trim() ||
      `My Template ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    setIsProcessing(true); setError('');
    try {
      let width = 0, height = 0;
      const img = new Image();
      const imageUrl = URL.createObjectURL(uploadFile);
      await new Promise((resolve, reject) => {
        img.onload = () => { width = img.naturalWidth; height = img.naturalHeight; URL.revokeObjectURL(imageUrl); resolve(true); };
        img.onerror = () => { URL.revokeObjectURL(imageUrl); reject(new Error('Failed to load image')); };
        img.src = imageUrl;
      });
      setUploadProgress(0);
      const savedTemplate = await onNewUpload(
        uploadFile, width, height, true, finalName, categoryId || undefined, subcategoryId || undefined,
        (pct) => setUploadProgress(pct),
        navigate,
      );
      if (savedTemplate) {
        setBatchSelected(prev => prev.some(t => t.id === savedTemplate.id) ? prev : [...prev, savedTemplate]);
      }
      setShowUploadDialog(false);
      setUploadFile(null); setUploadDims(null); setUploadProgress(null);
      setTemplateName(''); setCategoryId(''); setSubcategoryId(''); setError('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setUploadProgress(null);
      setError(err.message || 'Failed to process file. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  /* Delete */
  const handleDeleteClick = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    if (!onDeleteTemplate) return;
    setDeleteConfirmId(templateId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId || !onDeleteTemplate) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    setDeletingId(id);
    try { await onDeleteTemplate(id); } finally { setDeletingId(null); }
  };

  /* Batch */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toggleBatch = (template: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setBatchSelected(prev => {
      const exists = prev.some(t => t.id === template.id);
      if (exists) {
        const next = prev.filter(t => t.id !== template.id);
        onTemplateModeChange?.('single');
        return next.length >= 2 ? next : [];
      }
      const next = [...prev, template];
      onTemplateModeChange?.(next.length >= 2 ? 'multi' : 'single');
      return next;
    });
  };

  /* Carousel scroll */
  const scrollCarousel = (ref: React.RefObject<HTMLDivElement | null>, dir: 'left' | 'right') => {
    ref.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  /* Filtered templates (search) */
  const filteredTemplates = search.trim()
    ? savedTemplates.filter(t => {
        const q = search.toLowerCase();
        return (
          (t.title || t.name || '').toLowerCase().includes(q) ||
          (t.category_name || '').toLowerCase().includes(q) ||
          (t.subcategory_name || '').toLowerCase().includes(q)
        );
      })
    : savedTemplates;

  /* In-progress lookup */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inProgressMap = new Map<string, any>(inProgress.map(t => [t.template_id, t]));

  /* Category color lookup: categoryId → configured hex color */
  const categoryColorMap = new Map<string, string>(
    groups.flatMap(g => g.items.map(item => [item.id, item.color ?? ''] as [string, string]))
         .filter(([, c]) => c),
  );

  const isLoading = recentLoading && savedTemplates.length === 0;

  /* Resume banner preview URL — looked up from savedTemplates */
  const resumePreviewUrl: string | null = pendingResumeSession
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (savedTemplates.find((t: any) => t.id === pendingResumeSession.templateId)?.preview_url ?? null)
    : null;

  const resumeCtaLabel = (() => {
    const step = pendingResumeSession?.currentStep;
    if (step === 'design') return 'Resume Designing';
    if (step === 'data') return 'Resume Import';
    if (step === 'export') return 'Resume Generation';
    return 'Resume Session';
  })();

  /* ── Template card (Netflix full-image style) ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTemplateCard = (template: any) => {
    const inProgressEntry = inProgressMap.get(template.id);
    const isResume = !!inProgressEntry || pendingResumeSession?.templateId === template.id;
    const isBatched = batchSelected.some(t => t.id === template.id);
    const isDeleting = deletingId === template.id;
    const categoryName: string = template.certificate_category || template.category_name || '';
    const subcategoryName: string = template.certificate_subcategory || template.subcategory_name || '';
    const name: string = template.title || template.name || 'Untitled';

    const handlePrimaryClick = () => {
      if (editingId === template.id) return;
      if (isResume) {
        if (pendingResumeSession?.templateId === template.id && onResumeSession) {
          onResumeSession();
        } else if (inProgressEntry && onSelectRecentTemplate) {
          onSelectRecentTemplate(inProgressEntry, true);
        }
      } else {
        onSelectTemplate(template);
      }
    };

    return (
      <div
        key={template.id}
        className={cn(
          'group relative overflow-hidden cursor-pointer select-none',
          'rounded-xl bg-slate-200 dark:bg-slate-800',
          'transition-all duration-300 ease-out',
          'hover:-translate-y-1 hover:scale-[1.02]',
          'hover:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45)] dark:hover:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)]',
          isBatched ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : '',
          isResume && !isBatched ? 'ring-2 ring-amber-400/70 shadow-lg shadow-amber-400/10' : '',
          isDeleting ? 'opacity-40 pointer-events-none' : '',
        )}
        style={{ aspectRatio: '3/4' }}
        onClick={handlePrimaryClick}
      >
        {/* Preview */}
        {template.preview_url ? (
          <img
            src={template.preview_url}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-108"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
            <ImageIcon className="w-10 h-10 text-slate-400 dark:text-slate-500" />
          </div>
        )}

        {/* Permanent bottom gradient */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

        {/* Card info — always visible, frosted glass backing */}
        <div className="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">
          <div className="rounded-lg bg-black/50 backdrop-blur-md px-2.5 py-2 space-y-1.5">
            {editingId === template.id ? (
              <input
                ref={renamingInputRef}
                autoFocus
                value={editingValue}
                onChange={e => setEditingValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={async () => {
                  const newName = editingValue.trim();
                  setEditingId(null);
                  if (!newName || newName === (template.title || template.name)) return;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const existing = savedTemplates.filter((t: any) => t.id !== template.id).map((t: any) => (t.title || t.name || '').toLowerCase());
                  let finalName = newName;
                  if (existing.includes(newName.toLowerCase())) {
                    const stripped = newName.replace(/\s*\(\d+\)$/, '');
                    let n = 2;
                    while (existing.includes(`${stripped} (${n})`.toLowerCase())) n++;
                    finalName = `${stripped} (${n})`;
                  }
                  setRenameSavingId(template.id);
                  try { await onRenameTemplate?.(template.id, finalName); }
                  finally { setRenameSavingId(null); }
                }}
                onClick={e => e.stopPropagation()}
                className="pointer-events-auto w-full text-sm font-semibold text-white bg-white/15 backdrop-blur-sm border border-white/30 rounded-md px-2 py-1 focus:outline-none focus:bg-white/25 focus:border-white/50"
              />
            ) : (
              <p className={cn(
                'text-white text-sm font-semibold leading-snug line-clamp-2',
                renameSavingId === template.id && 'opacity-50',
              )}>
                {name}
              </p>
            )}
            {(categoryName || subcategoryName) && (() => {
              const catColor = categoryColorMap.get(template.category_id ?? '') || null;
              const chipStyle = catColor
                ? { borderColor: catColor, color: catColor, backgroundColor: `${catColor}22` }
                : undefined;
              const defaultCls = 'text-[10px] border rounded-sm px-1.5 py-px backdrop-blur-sm';
              const defaultStyle = !catColor ? { borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.95)', backgroundColor: 'rgba(255,255,255,0.15)' } : undefined;
              return (
                <div className="flex flex-wrap gap-1">
                  {categoryName && (
                    <span className={defaultCls} style={catColor ? chipStyle : defaultStyle}>
                      {categoryName}
                    </span>
                  )}
                  {subcategoryName && (
                    <span className={defaultCls} style={catColor ? chipStyle : defaultStyle}>
                      {subcategoryName}
                    </span>
                  )}
                </div>
              );
            })()}
            {inProgressEntry && (
              <p className="text-[10px] text-amber-300/90 flex items-center gap-1">
                <RotateCcw className="w-2.5 h-2.5" />
                {relativeTime(inProgressEntry.last_modified_at)}
              </p>
            )}
            {!inProgressEntry && (() => {
              const recent = recentGenerated.find(r => r.template_id === template.id);
              if (!recent) return null;
              return (
                <p className="text-[10px] text-white/60 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {relativeTime(recent.last_generated_at)} · {recent.certificates_count} certs
                </p>
              );
            })()}
          </div>
        </div>

        {/* Hover overlay — CTA */}
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2.5 pointer-events-none group-hover:pointer-events-auto">
          {isResume ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handlePrimaryClick(); }}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white font-semibold text-xs px-4 py-2 rounded-md transition-colors shadow-lg"
              >
                <RotateCcw className="w-3 h-3" />
                Resume
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDismissResume?.(); onSelectTemplate(template); }}
                className="text-white/75 hover:text-white text-[11px] transition-colors underline underline-offset-2"
              >
                Fresh start
              </button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onSelectTemplate(template); }}
              className="bg-white hover:bg-gray-50 text-gray-900 font-semibold text-xs px-5 py-2 rounded-md transition-colors shadow-xl"
            >
              Use Template →
            </button>
          )}
        </div>

        {/* Top action bar — hover reveal */}
        <div className="absolute top-0 left-0 right-0 p-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Batch toggle */}
          <button
            onClick={(e) => toggleBatch(template, e)}
            title={isBatched ? 'Remove from batch' : 'Add to batch'}
            className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center transition-all',
              isBatched
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-black/50 backdrop-blur-sm text-white hover:bg-black/65',
            )}
          >
            {isBatched ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </button>

          {/* Rename + Delete */}
          <div className="flex items-center gap-1">
            {editingId !== template.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(template.id);
                  setEditingValue(name);
                }}
                className="w-7 h-7 rounded-md bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/65 transition-all"
                title="Rename"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDeleteTemplate && (
              <button
                onClick={(e) => handleDeleteClick(e, template.id)}
                title="Delete"
                className="w-7 h-7 rounded-md bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-500/75 transition-all"
              >
                {isDeleting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
              </button>
            )}
          </div>
        </div>

        {/* In-progress badge */}
        {isResume && (
          <div className="absolute top-2 left-9 flex items-center gap-1 bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            <Clock className="w-2.5 h-2.5" />
            In Progress
          </div>
        )}
      </div>
    );
  };

  /* ── Carousel card (smaller, for in-progress / recently used rows) ── */
  const renderCarouselCard = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: any,
    opts: { isInProgress?: boolean },
  ) => {
    const { isInProgress = false } = opts;
    const name: string = item.template_title || item.title || item.name || 'Untitled';
    const timestamp: string | undefined = isInProgress ? item.last_modified_at : item.last_generated_at;
    const certCount: number | undefined = !isInProgress ? item.certificates_count : undefined;
    const key = `${item.template_id}-${isInProgress ? 'ip' : 'rg'}`;

    const handleClick = () => {
      onSelectRecentTemplate?.(item, true);
    };

    return (
      <div
        key={key}
        className={cn(
          'group relative shrink-0 w-36 overflow-hidden cursor-pointer select-none',
          'rounded-xl bg-muted',
          'transition-all duration-300 ease-out',
          'hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.02]',
          isInProgress ? 'ring-1 ring-amber-400/50' : '',
        )}
        style={{ aspectRatio: '3/4' }}
        onClick={handleClick}
      >
        {item.preview_url ? (
          <img
            src={item.preview_url}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-108"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
            <ImageIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

        {/* Info */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5 pointer-events-none">
          <p className="text-white text-[11px] font-semibold leading-snug line-clamp-2">{name}</p>
          {timestamp && (
            <p className={cn('text-[10px] mt-1 flex items-center gap-1', isInProgress ? 'text-amber-300/80' : 'text-white/50')}>
              {isInProgress ? <RotateCcw className="w-2 h-2" /> : <Clock className="w-2 h-2" />}
              {relativeTime(timestamp)}
              {certCount !== undefined && ` · ${certCount} certs`}
            </p>
          )}
        </div>

        {/* Hover CTA */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none group-hover:pointer-events-auto">
          <span className={cn(
            'font-semibold text-[10px] px-3 py-1.5 rounded-md shadow-lg transition-colors',
            isInProgress
              ? 'bg-amber-500 hover:bg-amber-400 text-white'
              : 'bg-white hover:bg-gray-50 text-gray-900',
          )}>
            {isInProgress ? 'Resume' : 'Use'}
          </span>
        </div>

        {/* In-progress indicator dot */}
        {isInProgress && (
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 shadow-sm" />
        )}
      </div>
    );
  };

  /* ── Carousel section ── */
  const renderCarouselSection = (
    title: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[],
    scrollRef: React.RefObject<HTMLDivElement | null>,
    isInProgress: boolean,
  ) => {
    if (items.length === 0) return null;
    return (
      <section>
        <div className="flex items-center gap-2 px-8 mb-3">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        <div className="relative group/carousel">
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/95 backdrop-blur-sm border border-border/60 shadow-md items-center justify-center text-foreground/70 hover:text-foreground opacity-0 group-hover/carousel:opacity-100 transition-all hidden md:flex"
            onClick={() => scrollCarousel(scrollRef, 'left')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto px-8 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {items.map(item => renderCarouselCard(item, { isInProgress }))}
          </div>

          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/95 backdrop-blur-sm border border-border/60 shadow-md items-center justify-center text-foreground/70 hover:text-foreground opacity-0 group-hover/carousel:opacity-100 transition-all hidden md:flex"
            onClick={() => scrollCarousel(scrollRef, 'right')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    );
  };

  /* ── Empty state ── */
  const renderEmptyState = () => {
    const steps = [
      { n: 1, title: 'Upload', desc: 'Your certificate design image' },
      { n: 2, title: 'Design', desc: 'Add text fields, QR codes' },
      { n: 3, title: 'Generate', desc: 'Create certificates in bulk' },
    ];
    return (
      <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 shadow-[0_0_48px_-8px_rgba(var(--primary),0.35)] ring-1 ring-primary/15">
          <Sparkles className="w-9 h-9 text-primary" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-2">Welcome to Playground</h2>
        <p className="text-sm text-muted-foreground mb-10 max-w-xs leading-relaxed">
          Upload a certificate image and bring your designs to life — text, QR codes, and bulk generation in minutes.
        </p>

        {/* 3-step guide */}
        <div className="flex items-center gap-2 mb-10 max-w-lg w-full">
          {steps.map((step, i) => (
            <Fragment key={step.n}>
              <div className="flex-1 flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border bg-card shadow-sm">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
                  {step.n}
                </div>
                <span className="text-xs font-semibold text-foreground">{step.title}</span>
                <span className="text-[11px] text-muted-foreground leading-snug">{step.desc}</span>
              </div>
              {i < 2 && <ArrowRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />}
            </Fragment>
          ))}
        </div>

        <Button
          size="lg"
          className="gap-2 rounded-lg"
          onClick={() => setShowUploadDialog(true)}
        >
          <Upload className="w-4 h-4" />
          Upload Your First Template
        </Button>
        <p className="text-xs text-muted-foreground mt-3">Supports JPG, PNG, WebP · Up to 10 MB</p>
      </div>
    );
  };

  /* ── Render ── */
  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <IndustrySelectModal
        open={showIndustryModal}
        onOpenChange={setShowIndustryModal}
        onIndustrySelected={handleIndustrySelected}
      />

      {/* ── Upload dialog (single instance) ── */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a new template</DialogTitle>
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
          <div className="space-y-5 py-2">
            <div
              {...getRootProps()}
              className={cn(
                'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all overflow-hidden',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : uploadFile
                  ? 'border-green-400/60 bg-green-50/40 dark:bg-green-900/10'
                  : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30',
              )}
            >
              {/* Background preview of uploaded image */}
              {uploadFile && uploadPreviewUrl && (
                <img
                  src={uploadPreviewUrl}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover opacity-[0.18] pointer-events-none select-none"
                />
              )}
              <input {...getInputProps()} />
              <div className="relative flex flex-col items-center gap-3">
                {uploadFile ? (
                  <>
                    <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
                      <FileCheck className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{uploadFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(uploadFile.size / 1024 / 1024).toFixed(1)} MB
                        {uploadDims && <> · {uploadDims.w} × {uploadDims.h} px</>}
                      </p>
                      <p className="text-xs text-primary mt-1.5">Click or drop to replace</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
                      <Upload className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Drop your certificate image here</p>
                      <p className="text-xs text-muted-foreground mt-1">JPG · PNG · WebP · up to 10 MB</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {uploadFile && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <Label htmlFor="templateName" className="text-sm font-medium">Template name</Label>
                    <span className="text-xs text-muted-foreground">optional — we&apos;ll name it for you if blank</span>
                  </div>
                  <Input
                    id="templateName"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="e.g., Annual Award Certificate"
                    disabled={isProcessing}
                    className="rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <Label className="text-sm font-medium">Category</Label>
                    <span className="text-xs text-muted-foreground">optional — add later from the card</span>
                  </div>
                  <Select value={categoryId} onValueChange={setCategoryId} disabled={isProcessing || categoriesLoading}>
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder={categoriesLoading ? 'Loading…' : 'Skip for now'} />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesLoading ? (
                        <div className="p-4 space-y-2">
                          {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
                        </div>
                      ) : groups.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">No categories available</div>
                      ) : groups.map((group, gi) => (
                        <div key={group.group_key}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase sticky top-0 bg-background z-10">
                            {group.label}
                          </div>
                          {group.items.map(item => (
                            <SelectItem key={item.id} value={item.id} className="pl-4">{item.name}</SelectItem>
                          ))}
                          {gi < groups.length - 1 && <SelectSeparator />}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {categoryId && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      Subcategory <span className="text-xs text-muted-foreground font-normal ml-1">optional</span>
                    </Label>
                    <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={isProcessing || subcategoriesLoading}>
                      <SelectTrigger className="rounded-lg">
                        <SelectValue placeholder={
                          subcategoriesLoading ? 'Loading…' :
                          subcategories.length === 0 ? 'None available' : 'Select subcategory'
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {subcategoriesLoading ? (
                          <div className="p-4 space-y-2">
                            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
                          </div>
                        ) : subcategoriesError ? (
                          <div className="p-4 space-y-3">
                            <div className="text-sm text-destructive">{subcategoriesError}</div>
                            <Button type="button" variant="outline" size="sm" onClick={e => { e.stopPropagation(); reloadSubcategories(); }} className="w-full">Retry</Button>
                          </div>
                        ) : subcategories.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {error && !isProcessing && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {isProcessing && uploadProgress !== null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{uploadProgress < 100 ? 'Uploading…' : 'Processing…'}</span>
                      {uploadProgress < 100 && <span>{uploadProgress}%</span>}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-200"
                        style={{ width: uploadProgress < 100 ? `${uploadProgress}%` : '100%', opacity: uploadProgress >= 100 ? 0.6 : 1 }}
                      />
                    </div>
                  </div>
                )}
                <Button
                  onClick={() => handleUpload(true)}
                  disabled={isProcessing || !uploadFile}
                  className="w-full rounded-lg"
                  size="lg"
                >
                  {isProcessing
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploadProgress !== null && uploadProgress < 100 ? `Uploading ${uploadProgress}%…` : 'Processing…'}</>
                    : 'Start Designing →'}
                </Button>
                {!isProcessing && (
                  <button
                    onClick={() => handleUpload(false)}
                    disabled={!uploadFile}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Save to library, design later
                  </button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Header ── */}
      <header className="shrink-0 bg-background/85 z-20">
        {/* Batch bar — glass morphism */}
        {batchSelected.length >= 2 && (
          <div className="px-6 py-2.5 bg-primary/8 backdrop-blur-sm border-b border-primary/15 flex items-center gap-3">
            <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
              <Check className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">{batchSelected.length} templates selected</span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                size="sm"
                onClick={() => { onTemplateModeChange?.('multi'); onSelectMultipleTemplates?.(batchSelected); }}
                className="gap-1.5 h-7 text-xs rounded-md shadow-sm"
              >
                <Layers className="w-3.5 h-3.5" />
                Design Batch ({batchSelected.length})
              </Button>
              <button
                onClick={() => { setBatchSelected([]); onTemplateModeChange?.('single'); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Main header row */}
        <div className="px-8 py-4 flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-foreground">Playground</h1>

          <p className="flex-1 text-center text-xs text-muted-foreground/70 tracking-wide">
            Upload a design or pick from an existing template to get started
          </p>

          <div className="flex items-center gap-2">
            {/* Search — icon-only collapsed, expands LEFT with Siri gradient border */}
            {savedTemplates.length > 0 && (
              <div className="flex items-center flex-row-reverse gap-2">
                {/* Siri gradient icon button (always visible, anchors on right) */}
                {!searchExpanded && (
                  <button
                    className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center hover:bg-primary/20 hover:border-primary/50 transition-colors shrink-0"
                    onClick={() => { setSearchExpanded(true); setTimeout(() => searchRef.current?.focus(), 10); }}
                  >
                    <Search className="w-3.5 h-3.5 text-primary" />
                  </button>
                )}

                {/* Expanded input — appears to the LEFT of the icon */}
                {searchExpanded && (
                  <div className="relative flex items-center gap-1.5 animate-in slide-in-from-right-4 fade-in duration-200">
                    <input
                      ref={searchRef}
                      autoFocus
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onBlur={() => { if (!search) setSearchExpanded(false); }}
                      onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); setSearchExpanded(false); } }}
                      placeholder="Search templates…"
                      className="w-52 pl-3 pr-7 py-1.5 bg-muted/60 border border-border rounded-lg text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/40 transition-all"
                    />
                    <button
                      onClick={() => { setSearch(''); setSearchExpanded(false); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-muted-foreground/15 hover:bg-muted-foreground/25 flex items-center justify-center transition-colors"
                    >
                      <X className="w-2.5 h-2.5 text-muted-foreground" />
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </header>

      {/* ── Scrollable content — bottom fade mask only ── */}
      <div
        className="flex-1 overflow-y-auto bg-background [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, black 0, black calc(100% - 64px), transparent 100%)',
          maskImage: 'linear-gradient(to bottom, black 0, black calc(100% - 64px), transparent 100%)',
        }}
      >

        {/* Loading skeleton */}
        {isLoading && (
          <div className="px-8 pt-8 pb-6">
            <div className="h-3 w-32 bg-muted animate-pulse rounded-full mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-215 mx-auto">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="rounded-xl bg-muted animate-pulse" style={{ aspectRatio: '3/4' }} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state — first time */}
        {!isLoading && savedTemplates.length === 0 && renderEmptyState()}

        {!isLoading && savedTemplates.length > 0 && (
          <>
            {/* Resume session banner */}
            {pendingResumeSession && (
              <div className="px-8 mt-6 mb-2 flex justify-center">
                <div className="w-full max-w-2xl flex overflow-hidden rounded-2xl border border-primary/20 dark:border-primary/15 shadow-lg shadow-primary/5 ring-1 ring-primary/10 bg-card/95 backdrop-blur-xl min-h-44">
                  {/* Left: template preview */}
                  {resumePreviewUrl && (
                    <div className="w-44 shrink-0 relative overflow-hidden border-r border-primary/15 dark:border-primary/10">
                      <img
                        src={resumePreviewUrl}
                        alt={pendingResumeSession.templateName}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                  )}
                  {/* Right: stacked — icon+title / subtitle / actions */}
                  <div className="flex flex-col justify-between gap-3 px-5 py-5 flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5">
                        <Clock className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          &ldquo;{pendingResumeSession.templateName}&rdquo;
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          You have an unfinished session — pick up right where you left off
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <button
                        onClick={onResumeSession}
                        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {resumeCtaLabel}
                      </button>
                      <button
                        onClick={onDismissResume}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                      >
                        I will design later
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Continue Designing carousel */}
            {inProgress.length > 0 && (
              <div className="mt-6">
                {renderCarouselSection('Continue Designing', inProgress, inProgressScrollRef, true)}
              </div>
            )}

            {/* Recently Used carousel */}
            {recentGenerated.length > 0 && (
              <div className={inProgress.length > 0 ? 'mt-6' : 'mt-6'}>
                {renderCarouselSection('Recently Used', recentGenerated, recentScrollRef, false)}
              </div>
            )}

            {/* All Templates grid */}
            <section className="px-8 pt-8 pb-20">
              <div className="flex items-center gap-1.5 mb-5">
                <h2 className="text-xs font-medium text-muted-foreground">All Templates</h2>
                <span className="text-xs text-muted-foreground/60">{filteredTemplates.length}</span>
                {search && filteredTemplates.length === 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    — no results for &ldquo;{search}&rdquo;{' '}
                    <button onClick={() => setSearch('')} className="text-primary hover:underline">clear</button>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-215 mx-auto">
                {/* Upload card — hidden when search is active */}
                {!search && (
                  <button
                    className={cn(
                      'rounded-xl border-2 border-dashed border-border bg-muted/20',
                      'hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group',
                      'flex flex-col items-center justify-center gap-3 text-center',
                    )}
                    style={{ aspectRatio: '3/4' }}
                    onClick={() => setShowUploadDialog(true)}
                  >
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all">
                      <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-muted-foreground group-hover:text-foreground transition-colors">Upload Template</p>
                      <p className="text-xs text-muted-foreground/75 mt-0.5">JPG, PNG, WebP</p>
                    </div>
                  </button>
                )}

                {/* Template cards */}
                {filteredTemplates.map((template, index) => (
                  <div key={template.id || `template-${index}`}>
                    {renderTemplateCard(template)}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-semibold">Delete this template?</h3>
              <p className="text-xs text-muted-foreground mt-1.5">This action cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
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
