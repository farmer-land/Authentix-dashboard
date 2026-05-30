import { CertificateField } from '@/lib/types/certificate';

const TYPE_CHIP: Record<string, string> = {
  name: 'name', course: 'course', start_date: 'date',
  end_date: 'date', custom_text: 'text', qr_code: 'qr', image: 'image',
};
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Trash2, Eye, EyeOff, Lock, Unlock, GripVertical, Copy, Pencil, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useState, useRef, useEffect } from 'react';

interface FieldLayersListProps {
  fields: CertificateField[];
  selectedFieldId: string | null;
  hiddenFields: Set<string>;
  onFieldSelect: (fieldId: string) => void;
  onFieldDelete: (fieldId: string) => void;
  onToggleVisibility: (fieldId: string) => void;
  onFieldReorder?: (orderedIds: string[]) => void;
  onFieldLock?: (fieldId: string, locked: boolean) => void;
  onFieldRename?: (fieldId: string, label: string) => void;
  onFieldDuplicate?: (field: CertificateField) => void;
}

interface ContextMenu {
  x: number;
  y: number;
  fieldId: string;
}

export function FieldLayersList({
  fields,
  selectedFieldId,
  hiddenFields,
  onFieldSelect,
  onFieldDelete,
  onToggleVisibility,
  onFieldReorder,
  onFieldLock,
  onFieldRename,
  onFieldDuplicate,
}: FieldLayersListProps) {
  const [fieldToDelete, setFieldToDelete] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId) {
      setTimeout(() => renameInputRef.current?.focus(), 0);
    }
  }, [renamingId]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!contextMenuRef.current?.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [contextMenu]);

  if (fields.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed">
        <p className="text-sm text-muted-foreground">
          No fields added yet. Click the buttons above to add fields.
        </p>
      </Card>
    );
  }

  const isRenameConflict = renamingId !== null &&
    fields.some(f => f.id !== renamingId && f.label.toLowerCase() === renameValue.trim().toLowerCase());

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onFieldRename?.(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const startRename = (field: CertificateField) => {
    setRenamingId(field.id);
    setRenameValue(field.label);
    setContextMenu(null);
  };

  const handleDeleteClient = () => {
    if (fieldToDelete) {
      onFieldDelete(fieldToDelete);
      setFieldToDelete(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragIdRef.current !== id) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = dragIdRef.current;
    if (!srcId || srcId === targetId) { setDragOverId(null); return; }
    const ids = fields.map(f => f.id);
    const from = ids.indexOf(srcId);
    const to = ids.indexOf(targetId);
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, srcId);
    onFieldReorder?.(reordered);
    dragIdRef.current = null;
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    dragIdRef.current = null;
    setDragOverId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, fieldId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onFieldSelect(fieldId);
    setContextMenu({ x: e.clientX, y: e.clientY, fieldId });
  };

  const ctxField = contextMenu ? fields.find(f => f.id === contextMenu.fieldId) : null;

  return (
    <>
      <div className="space-y-1">
        {fields.map((field) => {
          const isSelected = field.id === selectedFieldId;
          const isHidden = hiddenFields.has(field.id);
          const isDragOver = dragOverId === field.id;
          const isRenaming = renamingId === field.id;
          const typeLabel = TYPE_CHIP[field.type] ?? field.type;

          const isHovered = hoveredId === field.id;
          const showActions = isHovered;

          return (
            <Card
              key={field.id}
              draggable
              onMouseEnter={() => setHoveredId(field.id)}
              onMouseLeave={() => setHoveredId(null)}
              onDragStart={(e) => handleDragStart(e, field.id)}
              onDragOver={(e) => handleDragOver(e, field.id)}
              onDrop={(e) => handleDrop(e, field.id)}
              onDragEnd={handleDragEnd}
              onContextMenu={(e) => handleContextMenu(e, field.id)}
              className={`
                px-2 py-1.5 cursor-pointer transition-all bg-background dark:bg-[#0A0A0A] border-border dark:border-white/6
                ${isSelected ? 'ring-1 ring-primary/70' : ''}
                ${isHidden ? 'opacity-40' : ''}
                ${isDragOver ? 'bg-muted!' : ''}
              `}
              onClick={() => !isRenaming && onFieldSelect(field.id)}
            >
              {/* Single flex row: grip | content (2 rows) | actions */}
              <div className="flex items-center gap-1.5">

                {/* Drag handle */}
                <div className="text-muted-foreground/20 hover:text-muted-foreground/50 cursor-grab active:cursor-grabbing shrink-0">
                  <GripVertical className="w-3 h-3" />
                </div>

                {/* 2-row content */}
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    /* ── Rename mode ── */
                    <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          onBlur={commitRename}
                          className={`flex-1 min-w-0 text-xs bg-background rounded px-1.5 py-0.5 outline-none focus:ring-1 border ${
                            isRenameConflict
                              ? 'border-destructive/60 focus:ring-destructive/40 text-destructive'
                              : 'border-primary/50 focus:ring-primary'
                          }`}
                        />
                        <button
                          className="text-primary hover:text-primary/80 shrink-0"
                          onMouseDown={e => { e.preventDefault(); commitRename(); }}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          className="text-muted-foreground/60 hover:text-muted-foreground shrink-0"
                          onMouseDown={e => { e.preventDefault(); setRenamingId(null); }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {isRenameConflict && (
                        <p className="text-[9px] text-destructive/80 leading-none px-0.5">
                          Name already in use — will be auto-renamed
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Row 1: name — full width, never clipped by chip */}
                      <div
                        className="text-xs font-medium truncate"
                        title={field.label}
                        onDoubleClick={(e) => { e.stopPropagation(); startRename(field); }}
                      >
                        {field.label}
                        {field.locked && <Lock className="inline w-2.5 h-2.5 text-muted-foreground/40 ml-1 -mt-0.5" />}
                      </div>
                      {/* Row 2: type chip only */}
                      <div className="mt-px">
                        <span className="text-[9px] text-muted-foreground/60 px-1 py-px bg-muted rounded leading-none">
                          {typeLabel}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions — visible only on hover */}
                {!isRenaming && (
                  <div className={`flex items-center gap-2 shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    {onFieldLock && (
                      <button
                        title={field.locked ? 'Unlock field' : 'Lock field'}
                        onClick={(e) => { e.stopPropagation(); onFieldLock(field.id, !field.locked); }}
                        className="flex items-center justify-center"
                      >
                        {field.locked
                          ? <Lock className="h-3 w-3 text-primary" />
                          : <Unlock className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground" />}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleVisibility(field.id); }}
                      className="flex items-center justify-center"
                    >
                      {isHidden
                        ? <EyeOff className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground" />
                        : <Eye className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFieldToDelete(field.id); }}
                      className="flex items-center justify-center"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground/40 hover:text-destructive" />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Right-click context menu */}
      {contextMenu && ctxField && (
        <div
          ref={contextMenuRef}
          className="fixed z-[200] bg-card border border-border/50 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {[
            {
              label: 'Rename',
              icon: Pencil,
              action: () => { startRename(ctxField); },
            },
            {
              label: 'Duplicate',
              icon: Copy,
              action: () => { onFieldDuplicate?.(ctxField); setContextMenu(null); },
            },
            null,
            {
              label: ctxField.locked ? 'Unlock' : 'Lock',
              icon: ctxField.locked ? Unlock : Lock,
              action: () => { onFieldLock?.(ctxField.id, !ctxField.locked); setContextMenu(null); },
            },
            {
              label: hiddenFields.has(ctxField.id) ? 'Show' : 'Hide',
              icon: hiddenFields.has(ctxField.id) ? Eye : EyeOff,
              action: () => { onToggleVisibility(ctxField.id); setContextMenu(null); },
            },
            null,
            {
              label: 'Delete',
              icon: Trash2,
              action: () => { setFieldToDelete(ctxField.id); setContextMenu(null); },
              danger: true,
            },
          ].map((item, i) =>
            item === null ? (
              <div key={i} className="border-t border-border/40 my-1" />
            ) : (
              <button
                key={item.label}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left ${item.danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground'}`}
                onClick={item.action}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            )
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!fieldToDelete} onOpenChange={(open) => !open && setFieldToDelete(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Field</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this field? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteClient}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
