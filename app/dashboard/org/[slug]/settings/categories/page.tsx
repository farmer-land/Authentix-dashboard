"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  EyeOff,
  Eye,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Tag,
  LayoutList,
} from "lucide-react";
import { api, type ManagementCategory, type ManagementSubcategory } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useOrg } from "@/lib/org";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategoryWithSubs extends ManagementCategory {
  subcategories: ManagementSubcategory[] | null; // null = not yet loaded
  subsLoading: boolean;
  expanded: boolean;
}

const GROUP_LABELS: Record<string, string> = {
  course_certificates: "Course Certificates",
  company_work: "Company Work",
};
const GROUP_OPTIONS = [
  { value: "course_certificates", label: "Course Certificates" },
  { value: "company_work", label: "Company Work" },
];

// ── Inline rename input ───────────────────────────────────────────────────────

function RenameInput({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue) { onCancel(); return; }
    setSaving(true);
    try { await onSave(trimmed); } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-2 flex-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onCancel(); }}
        className="h-7 text-sm py-0 max-w-xs"
        disabled={saving}
      />
      <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleSave} disabled={saving || !value.trim()}>
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
    </div>
  );
}

// ── Subcategory row ───────────────────────────────────────────────────────────

function SubcategoryRow({
  sub,
  categoryId,
  onUpdate,
  onDelete,
}: {
  sub: ManagementSubcategory;
  categoryId: string;
  onUpdate: (patch: Partial<ManagementSubcategory>) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleRename = async (name: string) => {
    setBusy(true);
    try {
      await api.catalog.manage.updateSubcategory(categoryId, sub.subcategory_id, { name });
      onUpdate({ name, has_name_override: name !== sub.original_name });
    } finally { setBusy(false); setRenaming(false); }
  };

  const handleToggleHide = async () => {
    setBusy(true);
    try {
      await api.catalog.manage.updateSubcategory(categoryId, sub.subcategory_id, { is_hidden: !sub.is_hidden });
      onUpdate({ is_hidden: !sub.is_hidden });
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete subcategory "${sub.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.catalog.manage.deleteSubcategory(categoryId, sub.subcategory_id);
      onDelete();
    } finally { setBusy(false); }
  };

  return (
    <div className={cn(
      "flex items-center gap-3 pl-6 pr-4 py-2.5 group/sub rounded-lg transition-colors",
      sub.is_hidden ? "opacity-50" : "hover:bg-muted/30",
    )}>
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" />

      {renaming ? (
        <RenameInput initialValue={sub.name} onSave={handleRename} onCancel={() => setRenaming(false)} />
      ) : (
        <>
          <span className={cn("text-sm flex-1 min-w-0 truncate", sub.is_hidden && "line-through text-muted-foreground")}>
            {sub.name}
          </span>

          {sub.is_org_custom && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 shrink-0">
              Custom
            </span>
          )}
          {sub.is_hidden && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
              Hidden
            </span>
          )}

          <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => setRenaming(true)}
              disabled={busy}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Rename"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToggleHide}
              disabled={busy}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={sub.is_hidden ? "Show" : "Hide"}
            >
              {sub.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            {sub.is_org_custom && (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors"
                title="Delete"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Add subcategory inline form ───────────────────────────────────────────────

function AddSubcategoryForm({ categoryId, onAdded }: { categoryId: string; onAdded: (sub: ManagementSubcategory) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError("");
    try {
      const { subcategory_id } = await api.catalog.manage.createSubcategory(categoryId, { name: trimmed });
      onAdded({
        subcategory_id,
        category_id: categoryId,
        key: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
        name: trimmed,
        original_name: trimmed,
        sort_order: null,
        is_org_custom: true,
        is_hidden: false,
        has_name_override: false,
      });
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add subcategory");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pl-6 pr-4 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          placeholder="Subcategory name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
          className="h-7 text-sm py-0 max-w-xs"
          disabled={saving}
        />
        <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleAdd} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  onUpdate,
  onDelete,
  onSubsLoaded,
}: {
  cat: CategoryWithSubs;
  onUpdate: (patch: Partial<CategoryWithSubs>) => void;
  onDelete: () => void;
  onSubsLoaded: (subs: ManagementSubcategory[]) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingSub, setAddingSub] = useState(false);

  const toggleExpand = async () => {
    const willExpand = !cat.expanded;
    onUpdate({ expanded: willExpand });

    if (willExpand && cat.subcategories === null && !cat.subsLoading) {
      onUpdate({ subsLoading: true });
      try {
        const subs = await api.catalog.manage.listSubcategories(cat.category_id);
        onSubsLoaded(subs);
      } catch {
        onUpdate({ subsLoading: false });
      }
    }
  };

  const handleRename = async (name: string) => {
    setBusy(true);
    try {
      await api.catalog.manage.updateCategory(cat.category_id, { name });
      onUpdate({ name, has_name_override: name !== cat.original_name });
    } finally { setBusy(false); setRenaming(false); }
  };

  const handleToggleHide = async () => {
    setBusy(true);
    try {
      await api.catalog.manage.updateCategory(cat.category_id, { is_hidden: !cat.is_hidden });
      onUpdate({ is_hidden: !cat.is_hidden });
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.catalog.manage.deleteCategory(cat.category_id);
      onDelete();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete category");
    } finally { setBusy(false); }
  };

  const updateSub = (subcategoryId: string, patch: Partial<ManagementSubcategory>) => {
    const updated = (cat.subcategories ?? []).map(s =>
      s.subcategory_id === subcategoryId ? { ...s, ...patch } : s
    );
    onUpdate({ subcategories: updated });
  };

  const removeSub = (subcategoryId: string) => {
    onUpdate({ subcategories: (cat.subcategories ?? []).filter(s => s.subcategory_id !== subcategoryId) });
  };

  const addSub = (sub: ManagementSubcategory) => {
    onUpdate({ subcategories: [...(cat.subcategories ?? []), sub] });
    setAddingSub(false);
  };

  const subs = cat.subcategories ?? [];
  const visibleSubs = subs.filter(s => !s.is_hidden);
  const hiddenSubs = subs.filter(s => s.is_hidden);

  return (
    <div className={cn(
      "rounded-xl border border-border overflow-hidden transition-all",
      cat.is_hidden && "opacity-60",
    )}>
      {/* Category header row */}
      <div className={cn(
        "flex items-center gap-2 px-4 py-3 bg-card group hover:bg-muted/20 transition-colors",
        cat.expanded && "border-b border-border",
      )}>
        <button onClick={toggleExpand} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0">
          {cat.expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </button>

        {renaming ? (
          <RenameInput initialValue={cat.name} onSave={handleRename} onCancel={() => setRenaming(false)} />
        ) : (
          <>
            <span className={cn(
              "font-medium text-sm flex-1 min-w-0 truncate",
              cat.is_hidden && "line-through text-muted-foreground",
            )}>
              {cat.name}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {cat.is_org_custom ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                  Custom
                </span>
              ) : (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  Default
                </span>
              )}
              {cat.is_hidden && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Hidden
                </span>
              )}
              {cat.expanded && cat.subcategories !== null && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {visibleSubs.length} {visibleSubs.length === 1 ? "subcategory" : "subcategories"}
                  {hiddenSubs.length > 0 && ` · ${hiddenSubs.length} hidden`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => setRenaming(true)}
                disabled={busy}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Rename"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleToggleHide}
                disabled={busy}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title={cat.is_hidden ? "Show" : "Hide"}
              >
                {cat.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              {cat.is_org_custom && (
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Subcategories expanded panel */}
      {cat.expanded && (
        <div className="bg-muted/10 py-1.5 space-y-0.5">
          {cat.subsLoading ? (
            <div className="px-6 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading subcategories…
            </div>
          ) : subs.length === 0 && !addingSub ? (
            <p className="px-6 py-2.5 text-sm text-muted-foreground italic">
              No subcategories — certificates in this category won&apos;t require one.
            </p>
          ) : (
            <>
              {subs.map(sub => (
                <SubcategoryRow
                  key={sub.subcategory_id}
                  sub={sub}
                  categoryId={cat.category_id}
                  onUpdate={patch => updateSub(sub.subcategory_id, patch)}
                  onDelete={() => removeSub(sub.subcategory_id)}
                />
              ))}
            </>
          )}

          {addingSub && (
            <AddSubcategoryForm categoryId={cat.category_id} onAdded={addSub} />
          )}

          <div className="px-4 pt-1 pb-0.5">
            <button
              onClick={() => setAddingSub(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add subcategory
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add category modal ────────────────────────────────────────────────────────

function AddCategoryModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (cat: ManagementCategory) => void;
}) {
  const [name, setName] = useState("");
  const [groupKey, setGroupKey] = useState<string>("course_certificates");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError("");
    try {
      const { category_id } = await api.catalog.manage.createCategory({
        name: trimmed,
        group_key: groupKey as "course_certificates" | "company_work",
      });
      onAdded({
        category_id,
        key: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
        name: trimmed,
        original_name: trimmed,
        group_key: groupKey,
        sort_order: null,
        is_org_custom: true,
        is_hidden: false,
        has_name_override: false,
      });
      setName("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create category");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add custom category</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Category name</Label>
            <Input
              id="cat-name"
              placeholder="e.g. Safety Training"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-group">Group</Label>
            <Select value={groupKey} onValueChange={setGroupKey}>
              <SelectTrigger id="cat-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_OPTIONS.map(g => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Groups determine where this category appears in dropdowns.
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleAdd} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Add category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CategoriesSettingsPage() {
  const { orgPath } = useOrg();
  const [categories, setCategories] = useState<CategoryWithSubs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cats = await api.catalog.manage.listCategories();
      setCategories(cats.map(c => ({
        ...c,
        subcategories: null,
        subsLoading: false,
        expanded: false,
      })));
    } catch {
      setError("Failed to load categories. Make sure your organization has an industry set.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateCategory = (categoryId: string, patch: Partial<CategoryWithSubs>) => {
    setCategories(prev => prev.map(c => c.category_id === categoryId ? { ...c, ...patch } : c));
  };

  const removeCategory = (categoryId: string) => {
    setCategories(prev => prev.filter(c => c.category_id !== categoryId));
  };

  const addCategory = (cat: ManagementCategory) => {
    setCategories(prev => [...prev, { ...cat, subcategories: [], subsLoading: false, expanded: false }]);
  };

  const displayCats = showHidden ? categories : categories.filter(c => !c.is_hidden);

  // Group by group_key
  const groups = displayCats.reduce<Record<string, CategoryWithSubs[]>>((acc, cat) => {
    const key = cat.group_key ?? "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(cat);
    return acc;
  }, {});

  const groupOrder = ["course_certificates", "company_work", ...Object.keys(groups).filter(k => k !== "course_certificates" && k !== "company_work")];

  const hiddenCount = categories.filter(c => c.is_hidden).length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href={orgPath("/settings")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Categories & Subcategories</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Manage certificate categories for your organization. Defaults come from your industry and can be renamed or hidden.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 gap-2">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" className="h-8 gap-2" onClick={() => setShowAddModal(true)} disabled={loading}>
            <Plus className="w-3.5 h-3.5" />
            Add category
          </Button>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground">
        <LayoutList className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div>
          <strong className="text-foreground font-medium">How this works:</strong>{" "}
          Default categories come from your industry. You can rename or hide them without deleting. Custom categories you add can be deleted. Categories without subcategories are allowed — certificates in those categories won&apos;t require a subcategory selection.
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Tag className="w-10 h-10 text-muted-foreground" />
          <div>
            <p className="font-semibold">No categories yet</p>
            <p className="text-sm text-muted-foreground mt-1">Set your organization&apos;s industry first, or add a custom category.</p>
          </div>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add category
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupOrder.map(groupKey => {
            const items = groups[groupKey];
            if (!items || items.length === 0) return null;
            return (
              <div key={groupKey} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  {GROUP_LABELS[groupKey] ?? groupKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                </h3>
                <div className="space-y-2">
                  {items.map(cat => (
                    <CategoryRow
                      key={cat.category_id}
                      cat={cat}
                      onUpdate={patch => updateCategory(cat.category_id, patch)}
                      onDelete={() => removeCategory(cat.category_id)}
                      onSubsLoaded={subs => updateCategory(cat.category_id, { subcategories: subs, subsLoading: false })}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Hidden categories toggle */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(v => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showHidden ? "Hide" : "Show"} {hiddenCount} hidden categor{hiddenCount === 1 ? "y" : "ies"}
            </button>
          )}
        </div>
      )}

      <AddCategoryModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={addCategory}
      />
    </div>
  );
}
