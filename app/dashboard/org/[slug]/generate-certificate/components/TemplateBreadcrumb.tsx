'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X, Check, Loader2, Pencil, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type ManagementCategory, type ManagementSubcategory } from '@/lib/api/client';
import { catalogKeys } from '@/lib/hooks/queries/catalog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e',
];

interface TemplateBreadcrumbProps {
  templateId: string;
  templateName: string;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string | null;
  subcategoryId?: string;
  subcategoryName?: string;
  subcategoryColor?: string | null;
  onChanged: (meta: {
    categoryId: string | null;
    categoryName: string;
    categoryColor: string | null;
    subcategoryId: string | null;
    subcategoryName: string;
    subcategoryColor: string | null;
  }) => void;
  onTemplateRenamed?: (name: string) => void;
}

function ColorDot({ color }: { color?: string | null }) {
  if (!color) return null;
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />;
}

function ColorRow({ value, onChange }: { value: string | null | undefined; onChange: (c: string | null) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn('w-4 h-4 rounded-full border-2 transition-all hover:scale-125', value === c ? 'border-white/80 scale-125' : 'border-transparent')}
          style={{ background: c }}
        />
      ))}
      {value && (
        <button onClick={() => onChange(null)} className="text-[9px] text-white/30 hover:text-white/60 px-1">
          clear
        </button>
      )}
    </div>
  );
}

export function TemplateBreadcrumb({
  templateId,
  templateName,
  categoryId,
  categoryName,
  categoryColor,
  subcategoryId,
  subcategoryName,
  subcategoryColor,
  onChanged,
  onTemplateRenamed,
}: TemplateBreadcrumbProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'category' | 'subcategory'>('category');
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  const [categories, setCategories] = useState<ManagementCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ManagementSubcategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const [selCatId, setSelCatId] = useState<string | null>(categoryId ?? null);
  const [selCatName, setSelCatName] = useState(categoryName ?? '');
  const [selCatColor, setSelCatColor] = useState<string | null>(categoryColor ?? null);
  const [selSubId, setSelSubId] = useState<string | null>(subcategoryId ?? null);
  const [selSubName, setSelSubName] = useState(subcategoryName ?? '');
  const [selSubColor, setSelSubColor] = useState<string | null>(subcategoryColor ?? null);
  const [renameCat, setRenameCat] = useState('');
  const [renameSub, setRenameSub] = useState('');

  // Create-new inputs
  const [newCatName, setNewCatName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [creatingSub, setCreatingSub] = useState(false);

  // Template inline rename
  const [renamingTemplate, setRenamingTemplate] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Display colors — start from props, auto-fetched if missing (template load doesn't return colors)
  const [displayCatColor, setDisplayCatColor] = useState<string | null>(categoryColor ?? null);
  const [displaySubColor, setDisplaySubColor] = useState<string | null>(subcategoryColor ?? null);

  useEffect(() => { setDisplayCatColor(categoryColor ?? null); }, [categoryColor]);
  useEffect(() => { setDisplaySubColor(subcategoryColor ?? null); }, [subcategoryColor]);

  // When categoryId is set but color isn't provided (initial template load), fetch it once
  useEffect(() => {
    if (!categoryId || categoryColor != null) return;
    api.catalog.manage.listCategories().then(cats => {
      const color = cats.find(c => c.category_id === categoryId)?.color ?? null;
      setDisplayCatColor(color);
    }).catch(() => {});
  }, [categoryId, categoryColor]);

  useEffect(() => {
    if (!categoryId || !subcategoryId || subcategoryColor != null) return;
    api.catalog.manage.listSubcategories(categoryId).then(subs => {
      const color = subs.find(s => s.subcategory_id === subcategoryId)?.color ?? null;
      setDisplaySubColor(color);
    }).catch(() => {});
  }, [categoryId, subcategoryId, subcategoryColor]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !containerRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (renamingTemplate) setTimeout(() => renameInputRef.current?.select(), 0);
  }, [renamingTemplate]);

  const commitRename = async () => {
    const name = renameDraft.trim();
    if (!name || name === templateName) { setRenamingTemplate(false); return; }
    setRenameSaving(true);
    try {
      await api.templates.update(templateId, { name });
      onTemplateRenamed?.(name);
    } catch (e) {
      console.error('[TemplateBreadcrumb] Failed to rename template:', e);
    } finally {
      setRenameSaving(false);
      setRenamingTemplate(false);
    }
  };

  const openPopover = async (startPhase: 'category' | 'subcategory' = 'category') => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Position popover below container, clamp so it doesn't go off the right edge
    const popLeft = Math.min(rect.left, window.innerWidth - 290);
    setPopoverPos({ top: rect.bottom + 8, left: popLeft });

    setSelCatId(categoryId ?? null);
    setSelCatName(categoryName ?? '');
    setSelCatColor(categoryColor ?? null);
    setSelSubId(subcategoryId ?? null);
    setSelSubName(subcategoryName ?? '');
    setSelSubColor(subcategoryColor ?? null);
    setRenameCat('');
    setRenameSub('');
    setNewCatName('');
    setNewSubName('');
    // If opening on subcategory but no category set yet, fall back to category tab
    setPhase(startPhase === 'subcategory' && categoryId ? 'subcategory' : 'category');
    setCatError(null);
    setOpen(true);

    setLoadingCats(true);
    try {
      const cats = await api.catalog.manage.listCategories();
      setCategories(cats); // show all categories including hidden so user can assign any
      const live = cats.find(c => c.category_id === categoryId);
      if (live) setSelCatColor(live.color ?? null);
    } catch (e) {
      console.error('[TemplateBreadcrumb] Failed to load categories:', e);
      setCatError('Could not load categories');
    } finally {
      setLoadingCats(false);
    }

    // Pre-load subcategories if category already set
    if (categoryId) {
      setLoadingSubs(true);
      try {
        const subs = await api.catalog.manage.listSubcategories(categoryId);
        setSubcategories(subs);
      } catch {
        setSubcategories([]);
      } finally {
        setLoadingSubs(false);
      }
    }
  };

  const selectCategory = async (cat: ManagementCategory | null) => {
    if (!cat) {
      setSelCatId(null); setSelCatName(''); setSelCatColor(null);
      setSelSubId(null); setSelSubName(''); setSelSubColor(null);
      setSubcategories([]); setRenameCat('');
      return;
    }
    setSelCatId(cat.category_id);
    setSelCatName(cat.name);
    setSelCatColor(cat.color ?? null);
    setSelSubId(null); setSelSubName(''); setSelSubColor(null);
    setRenameCat('');

    // Auto-advance to subcategory tab as soon as a category is picked
    setPhase('subcategory');

    setLoadingSubs(true);
    try {
      const subs = await api.catalog.manage.listSubcategories(cat.category_id);
      setSubcategories(subs.filter(s => !s.is_hidden));
    } catch {
      setSubcategories([]);
    } finally {
      setLoadingSubs(false);
    }
  };

  const selectSubcategory = (sub: ManagementSubcategory | null) => {
    if (!sub) { setSelSubId(null); setSelSubName(''); setSelSubColor(null); }
    else { setSelSubId(sub.subcategory_id); setSelSubName(sub.name); setSelSubColor(sub.color ?? null); }
    setRenameSub('');
  };

  const handleCreateCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setCreatingCat(true);
    try {
      const { category_id } = await api.catalog.manage.createCategory({ name });
      // Re-fetch the full list so we get all required fields from the server
      const refreshed = await api.catalog.manage.listCategories();
      setCategories(refreshed);
      const created = refreshed.find(c => c.category_id === category_id);
      if (created) await selectCategory(created);
      setNewCatName('');
    } catch (e) {
      console.error('[TemplateBreadcrumb] Failed to create category:', e);
    } finally {
      setCreatingCat(false);
    }
  };

  const handleCreateSubcategory = async () => {
    const name = newSubName.trim();
    if (!name || !selCatId) return;
    setCreatingSub(true);
    try {
      const { subcategory_id } = await api.catalog.manage.createSubcategory(selCatId, { name });
      // Re-fetch subs so we get all required fields
      const refreshed = await api.catalog.manage.listSubcategories(selCatId);
      setSubcategories(refreshed);
      const created = refreshed.find(s => s.subcategory_id === subcategory_id);
      if (created) selectSubcategory(created);
      setNewSubName('');
    } catch (e) {
      console.error('[TemplateBreadcrumb] Failed to create subcategory:', e);
    } finally {
      setCreatingSub(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Rename / recolor category — non-fatal
      if (selCatId) {
        const liveCat = categories.find(c => c.category_id === selCatId);
        if (renameCat.trim() && renameCat.trim() !== selCatName) {
          await api.catalog.manage.updateCategory(selCatId, { name: renameCat.trim() }).catch(() => {});
        }
        if (liveCat && (liveCat.color ?? null) !== selCatColor) {
          await api.catalog.manage.updateCategory(selCatId, { color: selCatColor }).catch(() => {});
        }
      }
      // Rename / recolor subcategory — non-fatal
      if (selCatId && selSubId) {
        const liveSub = subcategories.find(s => s.subcategory_id === selSubId);
        if (renameSub.trim() && renameSub.trim() !== selSubName) {
          await api.catalog.manage.updateSubcategory(selCatId, selSubId, { name: renameSub.trim() }).catch(() => {});
        }
        if (liveSub && (liveSub.color ?? null) !== selSubColor) {
          await api.catalog.manage.updateSubcategory(selCatId, selSubId, { color: selSubColor }).catch(() => {});
        }
      }
      // Template category assignment — always runs
      await api.templates.update(templateId, { category_id: selCatId, subcategory_id: selSubId });
      onChanged({
        categoryId: selCatId,
        categoryName: renameCat.trim() || selCatName,
        categoryColor: selCatColor,
        subcategoryId: selSubId,
        subcategoryName: renameSub.trim() || selSubName,
        subcategoryColor: selSubColor,
      });
      queryClient.invalidateQueries({ queryKey: catalogKeys.categories() });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  };

  const hasCat = !!categoryName;
  const hasSub = !!subcategoryName;
  // Use auto-fetched colors when props don't provide them (initial template load)
  const effectiveCatColor = categoryColor ?? displayCatColor;
  const effectiveSubColor = subcategoryColor ?? displaySubColor;

  const popover = open ? (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 9999 }}
      className="w-70 bg-[#141414] border border-white/8 rounded-xl shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Phase tabs */}
      <div className="flex border-b border-white/6">
        <button
          onClick={() => setPhase('category')}
          className={cn('flex-1 py-2 text-[11px] font-medium transition-colors', phase === 'category' ? 'text-white/90 bg-white/5' : 'text-white/40 hover:text-white/70')}
        >
          Category
        </button>
        <button
          onClick={() => selCatId && setPhase('subcategory')}
          disabled={!selCatId}
          className={cn('flex-1 py-2 text-[11px] font-medium transition-colors', phase === 'subcategory' ? 'text-white/90 bg-white/5' : 'text-white/40 hover:text-white/70', !selCatId && 'opacity-30 cursor-not-allowed')}
        >
          Subcategory
        </button>
      </div>

      <div className="p-3 space-y-3">
        {phase === 'category' ? (
          <>
            {/* Category list */}
            <div className="space-y-0.5 max-h-45 overflow-y-auto">
              <button
                onClick={() => selectCategory(null)}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px]', !selCatId ? 'bg-white/8 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/70')}
              >
                <X className="w-3 h-3 shrink-0 text-white/30" />
                <span>No category</span>
                {!selCatId && <Check className="w-3 h-3 ml-auto text-primary shrink-0" />}
              </button>
              {loadingCats ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-white/30" /></div>
              ) : catError ? (
                <p className="text-[10px] text-red-400/80 px-2 py-2">{catError}</p>
              ) : categories.length === 0 ? (
                <p className="text-[10px] text-white/25 px-2 py-2">No categories yet — create one below</p>
              ) : (
                categories.map(cat => (
                  <button
                    key={cat.category_id}
                    onClick={() => selectCategory(cat)}
                    className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px]', selCatId === cat.category_id ? 'bg-white/8 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/70')}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10" style={{ background: cat.color ?? 'transparent' }} />
                    <span className="truncate">{cat.name}</span>
                    {cat.is_hidden && <span className="text-[9px] text-white/20 ml-1 shrink-0">hidden</span>}
                    {selCatId === cat.category_id && <Check className="w-3 h-3 ml-auto text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>

            {/* Create new category */}
            <div className="border-t border-white/6 pt-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">New category</p>
              <div className="flex items-center gap-1.5">
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); }}
                  placeholder="Category name…"
                  className="flex-1 min-w-0 bg-[#0A0A0A] border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-primary/40"
                />
                <button
                  onClick={handleCreateCategory}
                  disabled={!newCatName.trim() || creatingCat}
                  className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30"
                >
                  {creatingCat ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Rename / recolor selected category */}
            {selCatId && (
              <div className="border-t border-white/6 pt-2 space-y-2">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Rename selected</p>
                <input
                  value={renameCat}
                  onChange={e => setRenameCat(e.target.value)}
                  placeholder={selCatName}
                  className="w-full bg-[#0A0A0A] border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-primary/40"
                />
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Color</p>
                <ColorRow value={selCatColor} onChange={setSelCatColor} />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Subcategory list */}
            <div className="space-y-0.5 max-h-45 overflow-y-auto">
              <button
                onClick={() => selectSubcategory(null)}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px]', !selSubId ? 'bg-white/8 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/70')}
              >
                <X className="w-3 h-3 shrink-0 text-white/30" />
                <span>No subcategory</span>
                {!selSubId && <Check className="w-3 h-3 ml-auto text-primary shrink-0" />}
              </button>
              {loadingSubs ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-white/30" /></div>
              ) : subcategories.length === 0 ? (
                <p className="text-[10px] text-white/25 px-2 py-2">No subcategories — create one below</p>
              ) : (
                subcategories.map(sub => (
                  <button
                    key={sub.subcategory_id}
                    onClick={() => selectSubcategory(sub)}
                    className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px]', selSubId === sub.subcategory_id ? 'bg-white/8 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/70')}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10" style={{ background: sub.color ?? 'transparent' }} />
                    <span className="truncate">{sub.name}</span>
                    {sub.is_hidden && <span className="text-[9px] text-white/20 ml-1 shrink-0">hidden</span>}
                    {selSubId === sub.subcategory_id && <Check className="w-3 h-3 ml-auto text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>

            {/* Create new subcategory */}
            <div className="border-t border-white/6 pt-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">New subcategory</p>
              <div className="flex items-center gap-1.5">
                <input
                  value={newSubName}
                  onChange={e => setNewSubName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateSubcategory(); }}
                  placeholder="Subcategory name…"
                  className="flex-1 min-w-0 bg-[#0A0A0A] border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-primary/40"
                />
                <button
                  onClick={handleCreateSubcategory}
                  disabled={!newSubName.trim() || creatingSub}
                  className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30"
                >
                  {creatingSub ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Rename / recolor selected subcategory */}
            {selSubId && (
              <div className="border-t border-white/6 pt-2 space-y-2">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Rename selected</p>
                <input
                  value={renameSub}
                  onChange={e => setRenameSub(e.target.value)}
                  placeholder={selSubName}
                  className="w-full bg-[#0A0A0A] border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-primary/40"
                />
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Color</p>
                <ColorRow value={selSubColor} onChange={setSelSubColor} />
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-2 border-t border-white/6 pt-2">
          <button onClick={() => setOpen(false)} className="flex-1 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-1.5 rounded-lg text-[11px] bg-primary/20 text-primary hover:bg-primary/30 transition-colors font-medium flex items-center justify-center gap-1 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // Inline rename input shown when renamingTemplate
  const renameInput = renamingTemplate ? (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        ref={renameInputRef}
        value={renameDraft}
        onChange={e => setRenameDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commitRename();
          if (e.key === 'Escape') setRenamingTemplate(false);
        }}
        onBlur={commitRename}
        disabled={renameSaving}
        className="text-xs bg-white/8 border border-primary/40 rounded px-1.5 py-0.5 text-white/90 outline-none focus:border-primary/70 min-w-0 max-w-45"
        style={{ width: `${Math.max(80, renameDraft.length * 7)}px` }}
      />
      {renameSaving && <Loader2 className="w-3 h-3 animate-spin text-white/40 shrink-0" />}
    </div>
  ) : null;

  // Template name clickable span — stops propagation so it doesn't open the category dropdown
  const templateNameSpan = renamingTemplate ? renameInput : (
    <span
      className="text-xs text-white/75 leading-none font-medium truncate max-w-45 hover:text-white cursor-pointer"
      title="Click to rename"
      onClick={e => {
        e.stopPropagation();
        setRenameDraft(templateName);
        setRenamingTemplate(true);
      }}
    >
      {templateName}
    </span>
  );

  return (
    <>
      <div ref={containerRef} className="flex items-center gap-1">
        {hasCat ? (
          <>
            {/* Category — click to open on category tab */}
            <button
              onClick={() => openPopover('category')}
              className="flex items-center gap-1"
              title="Change category"
            >
              <ColorDot color={effectiveCatColor} />
              <span className="text-xs text-white/55 hover:text-white/85 transition-colors leading-none">{categoryName}</span>
            </button>
            {hasSub ? (
              <>
                <ChevronRight className="w-3 h-3 text-white/25 shrink-0" />
                {/* Subcategory — click to open on subcategory tab */}
                <button
                  onClick={() => openPopover('subcategory')}
                  className="flex items-center gap-1"
                  title="Change subcategory"
                >
                  <ColorDot color={effectiveSubColor} />
                  <span className="text-xs text-white/55 hover:text-white/85 transition-colors leading-none">{subcategoryName}</span>
                </button>
              </>
            ) : (
              /* No subcategory yet — small + to open subcategory tab */
              <button
                onClick={() => openPopover('subcategory')}
                className="text-white/25 hover:text-white/55 transition-colors"
                title="Add subcategory"
              >
                <ChevronRight className="w-3 h-3 shrink-0" />
              </button>
            )}
            <ChevronRight className="w-3 h-3 text-white/25 shrink-0" />
            {/* Template name — clicking renames inline */}
            {templateNameSpan}
          </>
        ) : (
          /* No category: pencil icon opens dropdown, name clicks to rename */
          <>
            <button
              onClick={() => openPopover('category')}
              className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors"
              title="Set category"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {templateNameSpan}
          </>
        )}
      </div>

      {typeof window !== 'undefined' && createPortal(popover, document.body)}
    </>
  );
}
