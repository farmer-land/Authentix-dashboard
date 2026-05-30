'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X, Check, Loader2, Pencil, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type ManagementCategory, type ManagementSubcategory } from '@/lib/api/client';
import { catalogKeys } from '@/lib/hooks/queries/catalog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { TemplateCategoryAssignment } from '../schema/types';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e',
];

interface TemplateBreadcrumbProps {
  templateId: string;
  templateName: string;
  categories: TemplateCategoryAssignment[];
  onCategoriesChanged: (cats: TemplateCategoryAssignment[]) => void;
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

// ── Category assignment popover ──────────────────────────────────────────────

interface CategoryPopoverProps {
  /** The existing assignment being edited, or null when adding new */
  editing: TemplateCategoryAssignment | null;
  /** All current assignments (to check for duplicates) */
  currentCategories: TemplateCategoryAssignment[];
  pos: { top: number; left: number };
  onSave: (updated: TemplateCategoryAssignment) => void;
  onRemove: () => void;
  onClose: () => void;
}

function CategoryPopover({
  editing,
  currentCategories,
  pos,
  onSave,
  onRemove,
  onClose,
}: CategoryPopoverProps) {
  const [phase, setPhase] = useState<'category' | 'subcategory'>('category');
  const [categories, setCategories] = useState<ManagementCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ManagementSubcategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const [selCatId, setSelCatId] = useState<string | null>(editing?.categoryId ?? null);
  const [selCatName, setSelCatName] = useState(editing?.categoryName ?? '');
  const [selCatColor, setSelCatColor] = useState<string | null>(editing?.categoryColor ?? null);
  const [selSubId, setSelSubId] = useState<string | null>(editing?.subcategoryId ?? null);
  const [selSubName, setSelSubName] = useState(editing?.subcategoryName ?? '');
  const [selSubColor, setSelSubColor] = useState<string | null>(editing?.subcategoryColor ?? null);
  const [renameCat, setRenameCat] = useState('');
  const [renameSub, setRenameSub] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [creatingSub, setCreatingSub] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Load categories on mount
  useEffect(() => {
    setLoadingCats(true);
    api.catalog.manage.listCategories().then(cats => {
      setCategories(cats);
      if (editing?.categoryId) {
        const live = cats.find(c => c.category_id === editing.categoryId);
        if (live?.color) setSelCatColor(live.color);
      }
    }).catch(() => {
      setCatError('Could not load categories');
    }).finally(() => setLoadingCats(false));
  }, [editing?.categoryId]);

  // Pre-load subcategories if editing an existing assignment
  useEffect(() => {
    if (!editing?.categoryId) return;
    setLoadingSubs(true);
    api.catalog.manage.listSubcategories(editing.categoryId).then(subs => {
      setSubcategories(subs);
    }).catch(() => {}).finally(() => setLoadingSubs(false));
  }, [editing?.categoryId]);

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
    setPhase('subcategory');
    setLoadingSubs(true);
    try {
      const subs = await api.catalog.manage.listSubcategories(cat.category_id);
      setSubcategories(subs.filter(s => !s.is_hidden));
    } catch { setSubcategories([]); }
    setLoadingSubs(false);
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
      const refreshed = await api.catalog.manage.listCategories();
      setCategories(refreshed);
      const created = refreshed.find(c => c.category_id === category_id);
      if (created) await selectCategory(created);
      setNewCatName('');
    } catch { toast.error('Failed to create category'); }
    setCreatingCat(false);
  };

  const handleCreateSubcategory = async () => {
    const name = newSubName.trim();
    if (!name || !selCatId) return;
    setCreatingSub(true);
    try {
      const { subcategory_id } = await api.catalog.manage.createSubcategory(selCatId, { name });
      const refreshed = await api.catalog.manage.listSubcategories(selCatId);
      setSubcategories(refreshed);
      const created = refreshed.find(s => s.subcategory_id === subcategory_id);
      if (created) selectSubcategory(created);
      setNewSubName('');
    } catch { toast.error('Failed to create subcategory'); }
    setCreatingSub(false);
  };

  const handleSave = async () => {
    if (!selCatId) { toast.error('Select a category first'); return; }

    // Don't allow adding duplicate category (same category_id, different assignment)
    const isDuplicate = currentCategories.some(
      c => c.categoryId === selCatId && c.categoryId !== editing?.categoryId,
    );
    if (isDuplicate) { toast.error('This category is already assigned to the template'); return; }

    setSaving(true);
    try {
      // Rename / recolor category
      if (selCatId) {
        const liveCat = categories.find(c => c.category_id === selCatId);
        if (renameCat.trim() && renameCat.trim() !== selCatName)
          await api.catalog.manage.updateCategory(selCatId, { name: renameCat.trim() }).catch(() => {});
        if (liveCat && (liveCat.color ?? null) !== selCatColor)
          await api.catalog.manage.updateCategory(selCatId, { color: selCatColor }).catch(() => {});
      }
      // Rename / recolor subcategory
      if (selCatId && selSubId) {
        const liveSub = subcategories.find(s => s.subcategory_id === selSubId);
        if (renameSub.trim() && renameSub.trim() !== selSubName)
          await api.catalog.manage.updateSubcategory(selCatId, selSubId, { name: renameSub.trim() }).catch(() => {});
        if (liveSub && (liveSub.color ?? null) !== selSubColor)
          await api.catalog.manage.updateSubcategory(selCatId, selSubId, { color: selSubColor }).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: catalogKeys.categories() });

      onSave({
        id: editing?.id,
        categoryId: selCatId,
        categoryName: renameCat.trim() || selCatName,
        categoryColor: selCatColor,
        subcategoryId: selSubId,
        subcategoryName: renameSub.trim() || selSubName || null,
        subcategoryColor: selSubColor,
        isPrimary: editing?.isPrimary ?? false,
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-70 bg-[#141414] border border-white/8 rounded-xl shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Phase tabs */}
      <div className="flex border-b border-white/6">
        <button onClick={() => setPhase('category')} className={cn('flex-1 py-2 text-[11px] font-medium transition-colors', phase === 'category' ? 'text-white/90 bg-white/5' : 'text-white/40 hover:text-white/70')}>
          Category
        </button>
        <button onClick={() => selCatId && setPhase('subcategory')} disabled={!selCatId} className={cn('flex-1 py-2 text-[11px] font-medium transition-colors', phase === 'subcategory' ? 'text-white/90 bg-white/5' : 'text-white/40 hover:text-white/70', !selCatId && 'opacity-30 cursor-not-allowed')}>
          Subcategory
        </button>
      </div>

      <div className="p-3 space-y-3">
        {phase === 'category' ? (
          <>
            <div className="space-y-0.5 max-h-45 overflow-y-auto">
              <button onClick={() => selectCategory(null)} className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px]', !selCatId ? 'bg-white/8 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/70')}>
                <X className="w-3 h-3 shrink-0 text-white/30" />
                <span>No category</span>
                {!selCatId && <Check className="w-3 h-3 ml-auto text-primary shrink-0" />}
              </button>
              {loadingCats ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-white/30" /></div>
              ) : catError ? (
                <p className="text-[10px] text-red-400/80 px-2 py-2">{catError}</p>
              ) : (
                categories.map(cat => (
                  <button key={cat.category_id} onClick={() => selectCategory(cat)} className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px]', selCatId === cat.category_id ? 'bg-white/8 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/70')}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10" style={{ background: cat.color ?? 'transparent' }} />
                    <span className="truncate">{cat.name}</span>
                    {cat.is_hidden && <span className="text-[9px] text-white/20 ml-1 shrink-0">hidden</span>}
                    {selCatId === cat.category_id && <Check className="w-3 h-3 ml-auto text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-white/6 pt-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">New category</p>
              <div className="flex items-center gap-1.5">
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); }} placeholder="Category name…" className="flex-1 min-w-0 bg-[#0A0A0A] border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-primary/40" />
                <button onClick={handleCreateCategory} disabled={!newCatName.trim() || creatingCat} className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30">
                  {creatingCat ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                </button>
              </div>
            </div>
            {selCatId && (
              <div className="border-t border-white/6 pt-2 space-y-2">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Rename selected</p>
                <input value={renameCat} onChange={e => setRenameCat(e.target.value)} placeholder={selCatName} className="w-full bg-[#0A0A0A] border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-primary/40" />
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Color</p>
                <ColorRow value={selCatColor} onChange={setSelCatColor} />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-0.5 max-h-45 overflow-y-auto">
              <button onClick={() => selectSubcategory(null)} className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px]', !selSubId ? 'bg-white/8 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/70')}>
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
                  <button key={sub.subcategory_id} onClick={() => selectSubcategory(sub)} className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px]', selSubId === sub.subcategory_id ? 'bg-white/8 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/70')}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10" style={{ background: sub.color ?? 'transparent' }} />
                    <span className="truncate">{sub.name}</span>
                    {sub.is_hidden && <span className="text-[9px] text-white/20 ml-1 shrink-0">hidden</span>}
                    {selSubId === sub.subcategory_id && <Check className="w-3 h-3 ml-auto text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-white/6 pt-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">New subcategory</p>
              <div className="flex items-center gap-1.5">
                <input value={newSubName} onChange={e => setNewSubName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreateSubcategory(); }} placeholder="Subcategory name…" className="flex-1 min-w-0 bg-[#0A0A0A] border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-primary/40" />
                <button onClick={handleCreateSubcategory} disabled={!newSubName.trim() || creatingSub} className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30">
                  {creatingSub ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                </button>
              </div>
            </div>
            {selSubId && (
              <div className="border-t border-white/6 pt-2 space-y-2">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Rename selected</p>
                <input value={renameSub} onChange={e => setRenameSub(e.target.value)} placeholder={selSubName} className="w-full bg-[#0A0A0A] border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-primary/40" />
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Color</p>
                <ColorRow value={selSubColor} onChange={setSelSubColor} />
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-2 border-t border-white/6 pt-2">
          {editing && (
            <button onClick={onRemove} className="px-2 py-1.5 rounded-lg text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors">
              Remove
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !selCatId} className="flex-1 py-1.5 rounded-lg text-[11px] bg-primary/20 text-primary hover:bg-primary/30 transition-colors font-medium flex items-center justify-center gap-1 disabled:opacity-50">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main TemplateBreadcrumb ───────────────────────────────────────────────────

export function TemplateBreadcrumb({
  templateId,
  templateName,
  categories,
  onCategoriesChanged,
  onTemplateRenamed,
}: TemplateBreadcrumbProps) {
  // Which assignment is being edited (index into categories), or -1 for "add new"
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const [persistSaving, setPersistSaving] = useState(false);

  // Auto-fetch colors for categories that are missing them
  const [displayColors, setDisplayColors] = useState<Map<string, { cat: string | null; sub: string | null }>>(new Map());
  useEffect(() => {
    if (categories.length === 0) return;
    const missing = categories.filter(c => c.categoryColor == null && c.categoryId);
    if (missing.length === 0) return;
    api.catalog.manage.listCategories().then(cats => {
      setDisplayColors(prev => {
        const next = new Map(prev);
        missing.forEach(m => {
          const cat = cats.find(c => c.category_id === m.categoryId);
          const entry = next.get(m.categoryId) ?? { cat: null, sub: null };
          next.set(m.categoryId, { ...entry, cat: cat?.color ?? null });
        });
        return next;
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.map(c => c.categoryId).join(',')]);

  // Template inline rename
  const [renamingTemplate, setRenamingTemplate] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const openAt = (index: number | -1, anchorEl: HTMLElement) => {
    const rect = anchorEl.getBoundingClientRect();
    const popLeft = Math.min(rect.left, window.innerWidth - 290);
    setPopoverPos({ top: rect.bottom + 8, left: popLeft });
    setActiveIndex(index === -1 ? categories.length : index); // -1 → append slot
  };

  const handleSave = async (updated: TemplateCategoryAssignment, editingIndex: number | null) => {
    let next: TemplateCategoryAssignment[];
    if (editingIndex === null || editingIndex >= categories.length) {
      // Adding new
      const isFirst = categories.length === 0;
      next = [...categories, { ...updated, isPrimary: isFirst }];
    } else {
      next = categories.map((c, i) => i === editingIndex ? { ...updated, isPrimary: c.isPrimary } : c);
    }
    // Ensure exactly one primary
    if (next.length > 0 && !next.some(c => c.isPrimary)) next[0]!.isPrimary = true;

    // Optimistic update
    onCategoriesChanged(next);

    // Persist to backend
    setPersistSaving(true);
    try {
      const persisted = await api.templates.setCategories(templateId, next.map(c => ({
        category_id: c.categoryId,
        subcategory_id: c.subcategoryId,
        is_primary: c.isPrimary,
      })));
      // Update with server-returned IDs
      onCategoriesChanged(persisted.map(c => ({
        id: c.id,
        categoryId: c.category_id,
        categoryName: c.category_name,
        categoryColor: next.find(n => n.categoryId === c.category_id)?.categoryColor ?? null,
        subcategoryId: c.subcategory_id,
        subcategoryName: c.subcategory_name,
        subcategoryColor: next.find(n => n.categoryId === c.category_id)?.subcategoryColor ?? null,
        isPrimary: c.is_primary,
      })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save categories');
    } finally {
      setPersistSaving(false);
    }
  };

  const handleRemove = async (index: number) => {
    const next = categories.filter((_, i) => i !== index);
    if (next.length > 0 && !next.some(c => c.isPrimary)) next[0]!.isPrimary = true;
    onCategoriesChanged(next);
    setActiveIndex(null);

    setPersistSaving(true);
    try {
      await api.templates.setCategories(templateId, next.map(c => ({
        category_id: c.categoryId,
        subcategory_id: c.subcategoryId,
        is_primary: c.isPrimary,
      })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove category');
    } finally {
      setPersistSaving(false);
    }
  };

  const effectiveColor = (cat: TemplateCategoryAssignment, type: 'cat' | 'sub') => {
    if (type === 'cat') return cat.categoryColor ?? displayColors.get(cat.categoryId)?.cat ?? null;
    return cat.subcategoryColor ?? displayColors.get(cat.categoryId)?.sub ?? null;
  };

  const templateNameSpan = renamingTemplate ? (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        ref={renameInputRef}
        value={renameDraft}
        onChange={e => setRenameDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingTemplate(false); }}
        onBlur={commitRename}
        disabled={renameSaving}
        className="text-xs bg-white/8 border border-primary/40 rounded px-1.5 py-0.5 text-white/90 outline-none focus:border-primary/70 min-w-0 max-w-45"
        style={{ width: `${Math.max(80, renameDraft.length * 7)}px` }}
      />
      {renameSaving && <Loader2 className="w-3 h-3 animate-spin text-white/40 shrink-0" />}
    </div>
  ) : (
    <span
      className="text-xs text-white/75 leading-none font-medium truncate max-w-45 hover:text-white cursor-pointer"
      title="Click to rename"
      onClick={e => { e.stopPropagation(); setRenameDraft(templateName); setRenamingTemplate(true); }}
    >
      {templateName}
    </span>
  );

  const editingCat = activeIndex !== null && activeIndex < categories.length ? categories[activeIndex]! : null;

  return (
    <>
      <div ref={containerRef} className="flex items-center gap-1 flex-wrap">
        {categories.length === 0 ? (
          /* No categories: pencil opens add popover */
          <button
            onClick={e => openAt(-1, e.currentTarget)}
            className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors"
            title="Set category"
          >
            <Pencil className="w-3 h-3" />
          </button>
        ) : (
          categories.map((cat, i) => (
            <button
              key={cat.categoryId}
              onClick={e => { e.stopPropagation(); openAt(i, e.currentTarget); }}
              className="flex items-center gap-1 group"
              title={`Edit: ${cat.categoryName}`}
            >
              <ColorDot color={effectiveColor(cat, 'cat')} />
              <span className="text-xs text-white/55 hover:text-white/85 transition-colors leading-none">{cat.categoryName}</span>
              {cat.subcategoryName && (
                <>
                  <ChevronRight className="w-3 h-3 text-white/25 shrink-0" />
                  <ColorDot color={effectiveColor(cat, 'sub')} />
                  <span className="text-xs text-white/55 hover:text-white/85 transition-colors leading-none">{cat.subcategoryName}</span>
                </>
              )}
              {i < categories.length - 1 && <span className="text-white/20 text-xs px-0.5">·</span>}
            </button>
          ))
        )}

        {/* Add another category */}
        {categories.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); openAt(-1, e.currentTarget); }}
            className="flex items-center gap-0.5 text-white/25 hover:text-white/55 transition-colors"
            title="Add category"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}

        {persistSaving && <Loader2 className="w-3 h-3 animate-spin text-white/30 shrink-0" />}

        <ChevronRight className="w-3 h-3 text-white/25 shrink-0" />
        {templateNameSpan}
      </div>

      {typeof window !== 'undefined' && activeIndex !== null && createPortal(
        <CategoryPopover
          editing={editingCat}
          currentCategories={categories}
          pos={popoverPos}
          onSave={(updated) => { handleSave(updated, editingCat ? activeIndex : null); }}
          onRemove={() => { if (activeIndex !== null && activeIndex < categories.length) handleRemove(activeIndex); }}
          onClose={() => setActiveIndex(null)}
        />,
        document.body,
      )}
    </>
  );
}
