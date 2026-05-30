'use client';

import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import { toast } from 'sonner';
import Lottie from 'lottie-react';
import playgroundIconAnim from '../assets/playground-icon.json';
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
  Search, X, Clock, RotateCcw, Layers, Pencil, Award,
  ChevronLeft, ChevronRight, Image as ImageIcon,
  ArrowRight,
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
  onStartFresh?: () => void;
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

/* ─── Node connection animation — shown in batch bar when ≥2 selected ── */

function NodeConnectionAnimation({ count }: { count: number }) {
  const n = Math.min(Math.max(count, 2), 7);
  const r = 5;
  const spacing = 26;
  const w = (n - 1) * spacing + r * 2;
  const h = r * 2 + 6;
  const cy = r + 3;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible">
      {/* Connecting lines with travelling dash */}
      {Array.from({ length: n - 1 }, (_, i) => {
        const x1 = i * spacing + r;
        const x2 = (i + 1) * spacing + r;
        return (
          <line
            key={`l${i}`}
            x1={x1} y1={cy} x2={x2} y2={cy}
            stroke="var(--primary)" strokeWidth={1.5} strokeOpacity={0.35} strokeDasharray="4 2"
          >
            <animate attributeName="stroke-dashoffset" values="12;0" dur={`${0.7 + i * 0.1}s`} repeatCount="indefinite" />
          </line>
        );
      })}
      {/* Travelling pulse dots — explicit initial cx/cy so they start at the right position */}
      {Array.from({ length: n - 1 }, (_, i) => {
        const x1 = i * spacing + r;
        const x2 = (i + 1) * spacing + r;
        return (
          <circle key={`p${i}`} cx={x1} cy={cy} r={2.5} fill="var(--primary)" opacity={0.9}>
            <animate attributeName="cx" values={`${x1};${x2};${x1}`} dur={`${1.0 + i * 0.1}s`} repeatCount="indefinite" begin={`${i * 0.2}s`} calcMode="linear" />
          </circle>
        );
      })}
      {/* Pulsing node circles */}
      {Array.from({ length: n }, (_, i) => (
        <circle key={`n${i}`} cx={i * spacing + r} cy={cy} r={r} fill="var(--primary)">
          <animate attributeName="r" values={`${r - 1};${r + 2};${r - 1}`} dur="1.5s" repeatCount="indefinite" begin={`${i * 0.2}s`} />
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin={`${i * 0.2}s`} />
        </circle>
      ))}
    </svg>
  );
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
  onStartFresh,
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
  const [savingForLater, setSavingForLater] = useState(false);
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
    // Auto-open the dialog so the user can confirm and name the template
    setShowUploadDialog(true);
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
    setIsProcessing(true); setSavingForLater(!navigate); setError('');
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
      setSavingForLater(false);
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

  /* Batch — sync template mode whenever selection length changes */
  useEffect(() => {
    onTemplateModeChange?.(batchSelected.length >= 2 ? 'multi' : 'single');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchSelected.length]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addOrRemoveFromBatch = useCallback((template: any) => {
    setBatchSelected(prev => {
      const exists = prev.some(t => t.id === template.id);
      if (exists) return prev.filter(t => t.id !== template.id);
      if (prev.length >= 5) {
        toast.error('Maximum 5 templates', { description: 'Remove a template to add another.' });
        return prev;
      }
      return [...prev, template];
    });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toggleBatch = (template: any, e: React.MouseEvent) => {
    e.stopPropagation();
    addOrRemoveFromBatch(template);
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

  /* ── Template card — split layout: padded image top, info panel bottom ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTemplateCard = (template: any) => {
    const inProgressEntry = inProgressMap.get(template.id);
    // Only mark a card as "in-progress" when the API confirms it (not just because the
    // banner session matches it — the banner handles resume with its own 3-button UI).
    const isResume = !!inProgressEntry;
    const isBatched = batchSelected.some(t => t.id === template.id);
    const isDeleting = deletingId === template.id;
    const categoryName: string = template.certificate_category || template.category_name || '';
    const subcategoryName: string = template.certificate_subcategory || template.subcategory_name || '';
    const name: string = template.title || template.name || 'Untitled';
    const catColor = categoryColorMap.get(template.category_id ?? '') || null;
    const recentEntry = recentGenerated.find(r => r.template_id === template.id);

    const handlePrimaryClick = () => {
      if (editingId === template.id) return;
      if (isResume) {
        if (pendingResumeSession?.templateId === template.id && onResumeSession) {
          onResumeSession();
        } else if (inProgressEntry && onSelectRecentTemplate) {
          onSelectRecentTemplate(inProgressEntry, true);
        }
      } else {
        // Add to batch selection — navigation happens via the floating bar action button
        addOrRemoveFromBatch(template);
      }
    };

    return (
      <div
        key={template.id}
        className={cn(
          'group relative flex flex-col cursor-pointer select-none',
          'rounded-2xl bg-card border overflow-hidden transition-all duration-300 ease-out',
          'hover:-translate-y-[3px] hover:scale-[1.015]',
          isBatched
            ? 'border-primary/50 shadow-[0_0_0_1px_rgba(62,207,142,0.3),0_12px_40px_-8px_rgba(62,207,142,0.15)]'
            : isResume && !isBatched
            ? 'border-amber-400/35'
            : 'border-border/40 hover:border-primary/20 hover:shadow-[0_12px_40px_-8px_rgba(62,207,142,0.07)]',
          isDeleting ? 'opacity-40 pointer-events-none' : '',
        )}
        style={{ aspectRatio: '3/4' }}
        onClick={handlePrimaryClick}
      >
        {/* ── Image area — always the same fixed size; chip floats as overlay ── */}
        <div className="relative bg-muted/20 dark:bg-muted/10 shrink-0" style={{ flex: '0 0 57%' }}>
          {/* Preview — always fills the same inset regardless of chip */}
          <div className="absolute inset-2 rounded-xl overflow-hidden bg-muted/30">
            {template.preview_url ? (
              <img
                src={template.preview_url}
                alt={name}
                className="w-full h-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
              </div>
            )}
          </div>
          {/* Status chip — absolute overlay, never shifts image area */}
          {isResume && (
            <div className="absolute top-3 left-3 z-10">
              <div className="inline-flex items-center gap-1 bg-amber-500/90 backdrop-blur-sm text-white text-[8px] font-bold tracking-wide px-1.5 py-0.5 rounded-sm border border-amber-400/30">
                <Clock className="w-1.5 h-1.5 shrink-0" />
                {recentEntry ? 'Editing' : 'Design Pending'}
              </div>
            </div>
          )}
        </div>

        {/* ── Info panel — fixed-slot layout, no shifting ── */}
        <div className="flex flex-col flex-1 px-3 pt-3 pb-3 min-h-0">

          {/* Slot 1: Title — single line, fixed height */}
          <div className="h-[1.25rem] flex items-center">
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
                className="w-full h-full text-sm font-semibold bg-muted/60 border border-border rounded-md px-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
              />
            ) : (
              <p className={cn(
                'text-sm font-semibold text-foreground truncate w-full leading-none',
                renameSavingId === template.id && 'opacity-40',
              )}>
                {name}
              </p>
            )}
          </div>

          {/* Slot 2: Category chips — fixed height, always present */}
          <div className="h-[1.25rem] flex items-center mt-2">
            {(categoryName || subcategoryName) ? (
              <div className="flex gap-1 min-w-0 overflow-hidden">
                {categoryName && (
                  <span
                    className="text-[9px] font-semibold tracking-wide border px-1.5 py-0.5 rounded-md shrink-0"
                    style={catColor
                      ? { borderColor: catColor, color: catColor, backgroundColor: `${catColor}18` }
                      : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }
                    }
                  >
                    {categoryName}
                  </span>
                )}
                {subcategoryName && (
                  <span
                    className="text-[9px] font-semibold tracking-wide border px-1.5 py-0.5 rounded-md truncate"
                    style={catColor
                      ? { borderColor: catColor, color: catColor, backgroundColor: `${catColor}18` }
                      : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }
                    }
                  >
                    {subcategoryName}
                  </span>
                )}
              </div>
            ) : null}
          </div>

          {/* Slot 3: Stats — fixed height, always present */}
          <div className="h-[1rem] flex items-center mt-1.5">
            {recentEntry ? (
              <p className="text-[9px] text-muted-foreground/60 flex items-center gap-1">
                <Award className="w-2 h-2 shrink-0" />
                {recentEntry.certificates_count} cert{recentEntry.certificates_count !== 1 ? 's' : ''} · {relativeTime(recentEntry.last_generated_at)}
              </p>
            ) : inProgressEntry ? (
              <p className="text-[9px] text-amber-500/70 flex items-center gap-1">
                <RotateCcw className="w-2 h-2 shrink-0" />
                Editing · {relativeTime(inProgressEntry.last_modified_at)}
              </p>
            ) : template.created_at ? (
              <p className="text-[9px] text-muted-foreground/40 flex items-center gap-1">
                <Clock className="w-2 h-2 shrink-0" />
                Added {relativeTime(template.created_at)}
              </p>
            ) : null}
          </div>

          <div className="flex-1" />

          {/* Slot 4: CTAs row — batch · rename · delete · primary */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => toggleBatch(template, e)}
              title={isBatched ? 'Remove from batch' : 'Add to batch'}
              className={cn(
                'w-6 h-6 rounded-md flex items-center justify-center transition-all shrink-0',
                isBatched
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 text-muted-foreground/50 hover:bg-muted hover:text-foreground',
              )}
            >
              {isBatched ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            </button>

            {editingId !== template.id && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditingId(template.id); setEditingValue(name); }}
                className="w-6 h-6 rounded-md bg-muted/40 text-muted-foreground/50 hover:bg-muted hover:text-foreground flex items-center justify-center transition-all shrink-0 opacity-0 group-hover:opacity-100"
                title="Rename"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}

            {onDeleteTemplate && (
              <button
                onClick={(e) => handleDeleteClick(e, template.id)}
                title="Delete"
                className="w-6 h-6 rounded-md bg-muted/40 text-muted-foreground/50 hover:bg-destructive/15 hover:text-destructive flex items-center justify-center transition-all shrink-0 opacity-0 group-hover:opacity-100"
              >
                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            )}

            <div className="flex-1" />

            {isResume ? (
              <button
                onClick={(e) => { e.stopPropagation(); handlePrimaryClick(); }}
                className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500 text-amber-600 dark:text-amber-400 hover:text-white text-[9px] font-bold tracking-wide px-2.5 py-1.5 rounded-lg transition-all border border-amber-500/25 hover:border-amber-500"
              >
                <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                Resume
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); addOrRemoveFromBatch(template); }}
                className={cn(
                  'flex items-center gap-1 text-[9px] font-bold tracking-wide px-2.5 py-1.5 rounded-lg transition-all border',
                  isBatched
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border-primary/20 hover:border-primary',
                )}
              >
                {isBatched
                  ? <><Check className="w-2.5 h-2.5 shrink-0" />Selected</>
                  : <><Plus className="w-2.5 h-2.5 shrink-0" />Select</>
                }
              </button>
            )}
          </div>
        </div>
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
    // Animation area height in px — connector nodes must align with its vertical centre.
    const ANIM_H = 160; // h-40

    const steps = [
      { n: 1, title: 'Upload',          desc: 'Drop in your certificate image — JPG, PNG, or WebP',              animPath: '/template/upload.json'         },
      { n: 2, title: 'Design',          desc: 'Place text fields, QR codes, and images on the canvas',           animPath: '/template/design.json'         },
      { n: 3, title: 'Import Contacts', desc: 'Upload recipient data — names, emails, and custom fields from a CSV', animPath: '/template/import-contact-new.json' },
      { n: 4, title: 'Generate',        desc: 'Create hundreds of personalised certificates in one click',        animPath: '/template/generate-new.json'   },
    ];

    // 3 connectors share a 12s period. Each fires exclusively in its own 4s slot,
    // keeping the other two idle — true "one at a time" sequential flow.
    // slotIndex 0→begins at 0s, 1→4s, 2→8s; all repeat every 12s.
    // Base attributes (strokeDasharray="0 48", opacity="0") cover the pre-start idle.
    function NodeConnector({ slotIndex = 0 }: { slotIndex?: number }) {
      const slotDur  = 4;                       // seconds per slot
      const totalDur = `${slotDur * 3}s`;       // 12s shared period
      const begin    = slotIndex > 0 ? `${slotIndex * slotDur}s` : '0s';

      // Fractions of 12s for the active 4s window [0, 1/3]:
      const grow = '0.167'; // line fully grown at 2s
      const hold = '0.283'; // hold ends at 3.4s
      const end  = '0.333'; // slot ends at 4s

      return (
        <svg
          width="48" height="24" viewBox="0 0 48 24" fill="none"
          className="shrink-0 self-center text-primary overflow-visible"
          aria-hidden
        >
          {/* Dashed track */}
          <line x1="0" y1="12" x2="48" y2="12"
            stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" strokeDasharray="3 3" />

          {/* Left node: pulse ring — visible while dot travels, hides after connection */}
          <circle cx="0" cy="12" r="5" fill="currentColor" fillOpacity="0.12" />
          <circle cx="0" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0">
            <animate attributeName="r"
              values="5;9;5;5;5" keyTimes={`0;${grow};${hold};${end};1`}
              dur={totalDur} begin={begin} repeatCount="indefinite"
              calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1;0 0 1 1;0 0 1 1" />
            <animate attributeName="stroke-opacity"
              values="0.5;0;0;0;0.5" keyTimes={`0;${grow};${hold};${end};1`}
              dur={totalDur} begin={begin} repeatCount="indefinite"
              calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1;0 0 1 1;0 0 1 1" />
          </circle>
          {/* Left solid dot — disappears the moment connection is made */}
          <circle cx="0" cy="12" r="3" fill="currentColor" fillOpacity="0.7">
            <animate attributeName="opacity"
              values="1;1;0;0;0;1"
              keyTimes="0;0.158;0.167;0.333;0.342;1"
              dur={totalDur} begin={begin} repeatCount="indefinite"
              calcMode="spline" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" />
          </circle>

          {/* Right node — hidden while dot travels, appears on connection */}
          <circle cx="48" cy="12" r="5" fill="currentColor" fillOpacity="0.12" opacity="0">
            <animate attributeName="opacity"
              values="0;0;1;1;0;0"
              keyTimes="0;0.158;0.167;0.333;0.342;1"
              dur={totalDur} begin={begin} repeatCount="indefinite"
              calcMode="spline" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" />
          </circle>
          <circle cx="48" cy="12" r="3" fill="currentColor" fillOpacity="0.7" opacity="0">
            <animate attributeName="opacity"
              values="0;0;1;1;0;0"
              keyTimes="0;0.158;0.167;0.333;0.342;1"
              dur={totalDur} begin={begin} repeatCount="indefinite"
              calcMode="spline" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" />
          </circle>

          {/* Progress line — base state idle (strokeDasharray="0 48") */}
          <line x1="0" y1="12" x2="48" y2="12"
            stroke="currentColor" strokeOpacity="0.65" strokeWidth="1.5" strokeLinecap="round"
            strokeDasharray="0 48">
            <animate attributeName="stroke-dasharray"
              values="0 48;48 0;48 0;0 48;0 48"
              keyTimes={`0;${grow};${hold};${end};1`}
              dur={totalDur} begin={begin} repeatCount="indefinite"
              calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1;0.6 0 0.4 1;0 0 1 1" />
          </line>

          {/* Traveling dot — base opacity=0 */}
          <circle r="3" cy="12" fill="currentColor" opacity="0">
            <animate attributeName="cx"
              values="0;48;48" keyTimes={`0;${grow};1`}
              dur={totalDur} begin={begin} repeatCount="indefinite"
              calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1" />
            <animate attributeName="opacity"
              values="0;1;1;0;0" keyTimes={`0;0.010;0.140;${grow};1`}
              dur={totalDur} begin={begin} repeatCount="indefinite"
              calcMode="spline" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" />
          </circle>
        </svg>
      );
    }

    return (
      <>
      {/* Neon glow keyframe — fires once per 12s period, starts when connection lands */}
      <style>{`
        @keyframes _pgCardGlow {
          0%      { box-shadow: none; }
          8%,16%  { box-shadow: 0 0 0 1.5px rgba(62,207,142,0.65), 0 0 20px rgba(62,207,142,0.18), 0 0 40px rgba(62,207,142,0.08); }
          28%,100%{ box-shadow: none; }
        }
      `}</style>
      <div {...getRootProps()} onClick={() => {}} className="relative flex flex-col items-center text-center px-6 py-6 w-full outline-none">
        {/* Hidden file input — required by react-dropzone even in drag-only mode */}
        <input {...getInputProps()} />

        {/* Full-area drag-over overlay */}
        {isDragActive && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[2px]">
            <Upload className="w-10 h-10 text-primary mb-3 animate-bounce" />
            <p className="text-sm font-semibold text-primary">Drop your template here</p>
            <p className="text-xs text-primary/60 mt-1">JPG · PNG · WebP</p>
          </div>
        )}

        {/* Hero animation */}
        <div className="w-24 h-24 mb-5">
          <Lottie
            animationData={playgroundIconAnim}
            loop autoplay
            style={{ width: '100%', height: '100%' }}
            rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
          />
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">Welcome to Playground</h2>
        <p className="text-sm text-muted-foreground mb-10 max-w-sm leading-relaxed">
          Your certificate studio — design once, generate thousands. Start by uploading a template.
        </p>

        {/* 4-step cards
            · items-stretch → all cards grow to the same height
            · gap-0 → SVG edges flush with card borders; overflow-visible nodes bleed into card space
        */}
        <div className="flex items-stretch gap-0 mb-10 w-full mx-auto" style={{ maxWidth: 1100 }}>
          {steps.map((step, i) => (
            <Fragment key={step.n}>

              {/* Card — no overflow-hidden so connector nodes can touch the edges */}
              <div className="flex-1 flex flex-col rounded-2xl border border-border/60 bg-card ring-1 ring-transparent transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 hover:ring-primary/20 relative">

                {/* Neon glow ring — destination cards (1,2,3) sync with their incoming connector */}
                {i > 0 && (
                  <div
                    className="absolute -inset-px rounded-2xl pointer-events-none"
                    style={{
                      animationName: '_pgCardGlow',
                      animationDuration: '12s',
                      animationDelay: `${(i - 1) * 4 + 2}s`,
                      animationIterationCount: 'infinite',
                      animationTimingFunction: 'linear',
                    }}
                  />
                )}

                {/* Animation area */}
                <div
                  className="rounded-t-2xl overflow-hidden flex items-center justify-center relative"
                  style={{ height: ANIM_H }}
                >
                  {/* upload.json is image-based — recolor toward brand green via CSS filter */}
                  <div style={{
                    width: 120, height: 120,
                    ...(i === 0 ? { filter: 'sepia(1) hue-rotate(120deg) saturate(1.8)' } : {}),
                  }}>
                    <Lottie
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      {...({ path: step.animPath, speed: 0.3 } as any)}
                      loop autoplay
                      style={{ width: '100%', height: '100%' }}
                      rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
                    />
                  </div>
                </div>

                {/* Step info */}
                <div className="px-5 py-4 flex flex-col gap-1.5 text-left flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                      {step.n}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{step.title}</span>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>

              {/* Node connector — slotIndex drives which 4s window is active in the 12s cycle */}
              {i < 3 && <NodeConnector slotIndex={i} />}

            </Fragment>
          ))}
        </div>

        <Button size="lg" className="gap-2 rounded-xl px-8" onClick={() => setShowUploadDialog(true)}>
          <Upload className="w-4 h-4" />
          {recentGenerated.length > 0 ? 'Upload a Template' : 'Upload Your First Template'}
        </Button>
        <p className="text-xs text-muted-foreground mt-3 opacity-50">Supports JPG, PNG, WebP · Up to 10 MB</p>
      </div>
      </>
    );
  };

  /* ── Render ── */
  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      <IndustrySelectModal
        open={showIndustryModal}
        onOpenChange={setShowIndustryModal}
        onIndustrySelected={handleIndustrySelected}
      />

      {/* ── Upload dialog (single instance) ── */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-sm">
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
                      <span>
                        {savingForLater
                          ? (uploadProgress < 100 ? 'Uploading…' : 'Saving to library…')
                          : (uploadProgress < 100 ? 'Uploading…' : 'Processing…')}
                      </span>
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
                  {isProcessing && !savingForLater
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploadProgress !== null && uploadProgress < 100 ? `Uploading ${uploadProgress}%…` : 'Processing…'}</>
                    : 'Start Designing →'}
                </Button>
                <button
                  onClick={() => handleUpload(false)}
                  disabled={isProcessing || !uploadFile}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                >
                  {savingForLater
                    ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</>
                    : 'Save to library, design later'}
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Header ── */}
      <header className="shrink-0 bg-background/85 z-20">
        {/* Main header row */}
        <div className="px-8 py-4 flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-foreground">Playground</h1>

          <div className="flex-1" />

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

      {/* ── Empty state — double-wrapper: outer scrolls, inner centers (justify-center
           needs min-h-full inside overflow-y-auto to work correctly) ── */}
      {!isLoading && savedTemplates.length === 0 && (
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="min-h-full flex flex-col items-center justify-center">
            {renderEmptyState()}
          </div>
        </div>
      )}

      {/* ── Scrollable content — bottom fade mask only ── */}
      {(isLoading || savedTemplates.length > 0) && (
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

        {!isLoading && savedTemplates.length > 0 && (
          <>
            {/* Resume session banner */}
            {pendingResumeSession && (
              <div className="px-8 mt-6 mb-2 flex justify-center">
                <div className="w-full max-w-2xl flex overflow-hidden rounded-2xl border border-primary/20 dark:border-primary/15 shadow-lg shadow-primary/5 ring-1 ring-primary/10 bg-card/95 backdrop-blur-xl min-h-44">
                  {/* Left: template preview */}
                  {resumePreviewUrl && (
                    <div className="w-44 shrink-0 relative overflow-hidden p-3">
                      <img
                        src={resumePreviewUrl}
                        alt={pendingResumeSession.templateName}
                        className="w-full h-full object-contain rounded-lg"
                      />
                    </div>
                  )}

                  {/* Center: title / subtitle / actions */}
                  <div className="flex flex-col justify-between gap-3 px-5 py-5 flex-1 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        &ldquo;{pendingResumeSession.templateName}&rdquo;
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        You have an unfinished session — pick up exactly where you left off, or start over.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={onResumeSession}
                        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {resumeCtaLabel}
                      </button>
                      <button
                        onClick={onStartFresh}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap border border-border/50 hover:border-border rounded-lg px-3 py-2"
                      >
                        Start fresh
                      </button>
                      <button
                        onClick={onDismissResume}
                        className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors whitespace-nowrap"
                      >
                        Move to template
                      </button>
                    </div>
                  </div>

                  {/* Right: resume animation */}
                  <div className="w-44 shrink-0 relative flex items-center justify-center overflow-hidden">
                    <Lottie
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      {...({ path: '/resume-banner-anim.json' } as any)}
                      loop
                      autoplay
                      style={{ width: 168, height: 168, position: 'relative', zIndex: 1 }}
                      rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
                    />
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
      )} {/* end (isLoading || savedTemplates.length > 0) */}

      {/* ── Delete confirmation ── */}
      {/* ── Floating batch action bar — slides up from bottom when ≥1 template is selected ── */}
      {batchSelected.length >= 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl bg-background/95 backdrop-blur-xl border border-primary/20 shadow-[0_8px_32px_-4px_rgba(62,207,142,0.15)] ring-1 ring-primary/10 animate-in slide-in-from-bottom-4 fade-in duration-200">
            {/* Node animation — only meaningful when 2+ templates connected */}
            {batchSelected.length >= 2 && <NodeConnectionAnimation count={batchSelected.length} />}
            <span className="text-sm font-semibold text-foreground whitespace-nowrap">
              {batchSelected.length} template{batchSelected.length > 1 ? 's' : ''} selected
            </span>
            {batchSelected.length >= 5 && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">(max 5)</span>
            )}
            <div className="w-px h-4 bg-border" />
            {batchSelected.length === 1 ? (
              <Button
                size="sm"
                onClick={() => {
                  const t = batchSelected[0];
                  setBatchSelected([]);
                  onTemplateModeChange?.('single');
                  onSelectTemplate(t);
                }}
                className="gap-1.5 h-8 text-xs px-4 rounded-xl"
              >
                Design
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => { onTemplateModeChange?.('multi'); onSelectMultipleTemplates?.(batchSelected); }}
                className="gap-1.5 h-8 text-xs px-4 rounded-xl"
              >
                Generate certificates
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
            <button
              onClick={() => { setBatchSelected([]); onTemplateModeChange?.('single'); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
