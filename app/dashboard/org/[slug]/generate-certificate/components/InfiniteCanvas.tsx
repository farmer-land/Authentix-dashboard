'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { CertificateField } from '@/lib/types/certificate';
import { api } from '@/lib/api/client';
import { DraggableField } from './DraggableField';
import { Button } from '@/components/ui/button';
import {
  RotateCw,
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterHorizontal,
  AlignEndVertical,
  HelpCircle,
  Copy,
  Trash2,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Bold,
  Italic,
  X,
  PlayCircle,
} from 'lucide-react';
import { KeyboardShortcuts } from './KeyboardShortcuts';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface InfiniteCanvasProps {
  fileUrl: string;
  pdfWidth: number;
  pdfHeight: number;
  fields: CertificateField[];
  selectedFieldId: string | null;
  hiddenFields: Set<string>;
  scale: number;
  currentPage?: number;
  totalPages?: number;
  onFieldUpdate: (fieldId: string, updates: Partial<CertificateField>) => void;
  onFieldSelect: (fieldId: string) => void;
  onScaleChange: (scale: number) => void;
  onFieldDelete: (fieldId: string) => void;
  onTemplateResize?: (width: number, height: number) => void;
  onTemplateResizeStart?: (width: number, height: number) => void;
  onPageChange?: (page: number) => void;
  onAssetDrop?: (url: string, name: string, x: number, y: number, replaceBlobUrl?: string) => void;
  onPreviewToggle?: () => void;
  previewOpen?: boolean;
  onFieldDuplicate?: (field: CertificateField) => void;
  // Undo / redo
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // Autosave status
  saveStatus?: SaveStatus;
  // Multi-select delete
  onFieldsDelete?: (ids: string[]) => void;
  // Field reorder (z-index)
  onFieldReorder?: (fieldId: string, direction: 'front' | 'back') => void;
  // Field lock toggle
  onFieldLock?: (fieldId: string, locked: boolean) => void;
  // Drag-start snapshot for undo
  onFieldDragStart?: () => void;
  // Snap to grid (controlled from right panel)
  snapToGrid?: boolean;
  onSnapToggle?: () => void;
  // Fit-to-screen trigger (increment to fire)
  fitTrigger?: number;
  // Left panel width in px so the toolbar clamp avoids it
  leftPanelWidth?: number;
  // Right panel width in px so toolbar + fit-to-screen account for it
  rightPanelWidth?: number;
}

const SNAP_SIZE = 8;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

// Per-field-type info shown in the help panel
const FIELD_TYPE_INFO: Record<string, { label: string; description: string; tips: string[] }> = {
  name: {
    label: 'Recipient Name',
    description: 'Auto-filled from your data file — one per row. Each certificate gets its own recipient name.',
    tips: ['Use a large font for prominence', 'Center-align for formal designs', 'Try a script font for elegance'],
  },
  course: {
    label: 'Course / Program Name',
    description: 'The title of the course, program, or achievement being certified.',
    tips: ['Keep it concise', 'Bold weight stands out on the certificate', 'Often centered below the recipient name'],
  },
  start_date: {
    label: 'Start Date',
    description: 'The issue or start date of the certificate. Formatted automatically from your data.',
    tips: ['Choose a date format in the Properties panel', 'Pair with End Date for duration display', 'Use a smaller font size than the recipient name'],
  },
  end_date: {
    label: 'Expiry / End Date',
    description: 'The expiry or completion date. Shares the same date format options as Start Date.',
    tips: ['Place near Start Date for readability', 'Can be left empty if the certificate does not expire'],
  },
  custom_text: {
    label: 'Custom Text',
    description: 'Static text that appears the same on every certificate — great for headings, labels, or legal text.',
    tips: ['Use for "This certifies that", "has successfully completed", etc.', 'No data column needed — type the value in Properties', 'Supports prefix/suffix for dynamic-looking static text'],
  },
  qr_code: {
    label: 'QR Code',
    description: 'Links to a unique verification page for each certificate. Scan to confirm authenticity instantly.',
    tips: ['Keep at least 80×80 px for reliable scanning', 'Use transparent background to blend with coloured templates', 'Choose rounded or dots style for modern designs'],
  },
  image: {
    label: 'Image / Logo',
    description: 'Upload a logo, signature, stamp, or decorative image from the Assets panel.',
    tips: ['Use PNG with transparent background for logos', 'Adjust opacity in Properties for watermark effects', 'Corner radius rounds the image for badge-style designs'],
  },
};

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

// Clamp scale
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function InfiniteCanvas({
  fileUrl,
  pdfWidth,
  pdfHeight,
  fields,
  selectedFieldId,
  hiddenFields,
  scale,
  currentPage = 1,
  totalPages = 1,
  onFieldUpdate,
  onFieldSelect,
  onScaleChange,
  onFieldDelete,
  onTemplateResize,
  onTemplateResizeStart,
  onPageChange,
  onAssetDrop,
  onPreviewToggle,
  previewOpen,
  onFieldDuplicate,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  saveStatus = 'idle',
  onFieldsDelete,
  onFieldReorder,
  onFieldLock,
  onFieldDragStart,
  snapToGrid: snapToGridProp,
  onSnapToggle,
  fitTrigger,
  leftPanelWidth,
  rightPanelWidth,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });

  // Interaction state
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  // Snap: controlled by parent if snapToGridProp provided, else internal
  const [snapToGridInternal, setSnapToGridInternal] = useState(false);
  const snapToGrid = snapToGridProp ?? snapToGridInternal;

  // Image drag-over state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCountRef = useRef(0);

  // Template resize state
  const [isResizingTemplate, setIsResizingTemplate] = useState(false);
  const resizeCorner = useRef<ResizeHandle | null>(null);
  const templateResizeStart = useRef({ x: 0, y: 0 });
  const initialTemplateDims = useRef({ w: 0, h: 0 });

  // Template rotation state
  const [rotation, setRotation] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const rotateStartRef = useRef({ angle: 0, startRotation: 0, cx: 0, cy: 0 });

  // Visual dims during template resize — keeps PDF stable while dragging
  const [visualDims, setVisualDims] = useState<{ w: number; h: number } | null>(null);
  const latestResizeDims = useRef<{ w: number; h: number } | null>(null);

  // Clipboard for copy/paste
  const clipboardRef = useRef<CertificateField | null>(null);

  // Multi-select
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fieldId: string } | null>(null);

  // Keyboard shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Toolbar minimize + help panel
  const [toolbarMinimized, setToolbarMinimized] = useState(false);
  const [helpPanelOpen, setHelpPanelOpen] = useState(false);

  // Inject Google Fonts stylesheets for all fonts used by current fields so text renders
  // in the correct typeface while editing (not just in the preview panel).
  useEffect(() => {
    const families = [...new Set(fields.map(f => f.fontFamily).filter(Boolean))];
    families.forEach(family => {
      const id = `gf-canvas-${family.replace(/\s+/g, '-')}`;
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap`;
      document.head.appendChild(link);
    });
  }, [fields]);

  // Panning refs
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  // Floating toolbar drag state — null = CSS default (bottom center)
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const toolbarDragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
  });

  // Sync panRef so wheel handler (non-React closure) can read latest pan
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Reset rotation when a new template is loaded
  useEffect(() => { setRotation(0); }, [fileUrl]);

  // ── Auto-fit on mount and when template changes ──────────────────────────
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    // Account for floating panels so the template centers in the visible gap
    const leftW = leftPanelWidth ?? 0;
    const rightW = rightPanelWidth ?? 0;
    const usableW = cw - leftW - rightW;
    const padding = 80;
    const fitScale = clamp(
      Math.min((usableW - padding * 2) / pdfWidth, (ch - padding * 2) / pdfHeight),
      MIN_SCALE,
      MAX_SCALE,
    );
    const centeredX = leftW + (usableW - pdfWidth * fitScale) / 2;
    const centeredY = (ch - pdfHeight * fitScale) / 2;
    onScaleChange(fitScale);
    setPan({ x: centeredX, y: centeredY });
    panRef.current = { x: centeredX, y: centeredY };
  }, [pdfWidth, pdfHeight, onScaleChange, leftPanelWidth, rightPanelWidth]);

  // Run auto-fit whenever the template dimensions change
  const prevDimsRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    if (pdfWidth > 0 && pdfHeight > 0) {
      const prev = prevDimsRef.current;
      if (prev.w !== pdfWidth || prev.h !== pdfHeight) {
        prevDimsRef.current = { w: pdfWidth, h: pdfHeight };
        // Delay slightly so container has rendered
        setTimeout(fitToScreen, 50);
      }
    }
  }, [pdfWidth, pdfHeight, fitToScreen]);

  // External fit-to-screen trigger (e.g. right panel open/close changes available width).
  // setTimeout lets the DOM finish reflowing before we measure the container.
  // Also reset toolbar to CSS default so it re-centers in the new layout.
  const prevFitTrigger = useRef(fitTrigger ?? 0);
  useEffect(() => {
    if (fitTrigger !== undefined && fitTrigger !== prevFitTrigger.current) {
      prevFitTrigger.current = fitTrigger;
      setToolbarPos(null);
      setTimeout(fitToScreen, 80);
    }
  }, [fitTrigger, fitToScreen]);

  // Toolbar starts at CSS default (bottom center) — no JS init needed.
  // toolbarPos is only set after the user drags; null = use CSS default.

  // ── Non-passive wheel for trackpad / mouse wheel ─────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom (Mac trackpad pinch sends ctrlKey=true)
        // Use multiplicative delta so pinch feels natural
        const zoomFactor = e.deltaMode === 0
          ? 1 - e.deltaY * 0.004        // pixel mode (trackpad)
          : 1 - e.deltaY * 0.05;         // line mode (mouse wheel)

        const newScale = clamp(scaleRef.current * zoomFactor, MIN_SCALE, MAX_SCALE);
        const ratio = newScale / scaleRef.current;

        setPan(prev => ({
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        }));
        onScaleChange(newScale);
      } else {
        // Two-finger scroll / mouse pan
        setPan(prev => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onScaleChange]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;

      // Space → pan mode
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
        return;
      }

      // Cmd/Ctrl+Z → undo
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
        return;
      }

      // Cmd/Ctrl+Shift+Z → redo
      if (mod && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // Cmd/Ctrl+Y → redo (Windows)
      if (mod && e.key === 'y') {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // ? → open keyboard shortcuts
      if (e.key === '?' && !mod) {
        setShowShortcuts(true);
        return;
      }

      // Delete / Backspace → delete selected field(s)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
        if (multiSelectedIds.size > 1) {
          e.preventDefault();
          onFieldsDelete?.(Array.from(multiSelectedIds));
          setMultiSelectedIds(new Set());
          return;
        }
        if (selectedFieldId) {
          e.preventDefault();
          onFieldDelete(selectedFieldId);
          return;
        }
      }

      // Cmd/Ctrl+C → copy selected field to clipboard
      if (mod && e.key === 'c' && selectedFieldId) {
        const field = fields.find(f => f.id === selectedFieldId);
        if (field) clipboardRef.current = field;
        return;
      }

      // Cmd/Ctrl+V → paste from clipboard (offset by 20px)
      if (mod && e.key === 'v' && clipboardRef.current && onFieldDuplicate) {
        e.preventDefault();
        const src = clipboardRef.current;
        onFieldDuplicate({ ...src, x: src.x + 20, y: src.y + 20 });
        return;
      }

      // Cmd/Ctrl+D → duplicate selected field (offset by 20px)
      if (mod && e.key === 'd' && selectedFieldId && onFieldDuplicate) {
        e.preventDefault();
        const field = fields.find(f => f.id === selectedFieldId);
        if (field) onFieldDuplicate({ ...field, x: field.x + 20, y: field.y + 20 });
        return;
      }

      // Zoom shortcuts
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        onScaleChange(clamp(scale + 0.1, MIN_SCALE, MAX_SCALE));
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        onScaleChange(clamp(scale - 0.1, MIN_SCALE, MAX_SCALE));
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        fitToScreen();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [scale, onScaleChange, fitToScreen, selectedFieldId, fields, onFieldDelete, onFieldDuplicate, onUndo, onRedo, multiSelectedIds, onFieldsDelete]);

  // ── Mouse panning ─────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-field]') ||
      target.closest('button') ||
      target.closest('[data-resize-handle]') ||
      target.closest('[data-toolbar]')
    ) return;

    if (e.button === 1 || e.button === 0) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const newPan = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
      setPan(newPan);
      panRef.current = newPan;
    };
    const onUp = () => setIsPanning(false);

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning]);

  // ── Template resize ───────────────────────────────────────────────────────
  const handleTemplateResizeStart = (e: React.MouseEvent, corner: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizingTemplate(true);
    resizeCorner.current = corner;
    templateResizeStart.current = { x: e.clientX, y: e.clientY };
    initialTemplateDims.current = { w: pdfWidth, h: pdfHeight };
    onTemplateResizeStart?.(pdfWidth, pdfHeight);
  };

  useEffect(() => {
    if (!isResizingTemplate) return;
    let rafId = 0;
    const onMove = (e: MouseEvent) => {
      if (!resizeCorner.current) return;
      // Use scaleRef.current so this handler never needs to be recreated when scale changes
      const dx = (e.clientX - templateResizeStart.current.x) / scaleRef.current;
      const dy = (e.clientY - templateResizeStart.current.y) / scaleRef.current;
      let nw = initialTemplateDims.current.w;
      let nh = initialTemplateDims.current.h;
      switch (resizeCorner.current) {
        case 'se': nw += dx; nh += dy; break;
        case 'sw': nw -= dx; nh += dy; break;
        case 'ne': nw += dx; nh -= dy; break;
        case 'nw': nw -= dx; nh -= dy; break;
        case 'e':  nw += dx; break;
        case 'w':  nw -= dx; break;
        case 's':  nh += dy; break;
        case 'n':  nh -= dy; break;
      }
      const dims = { w: Math.max(100, nw), h: Math.max(100, nh) };
      latestResizeDims.current = dims;
      // Throttle visual updates to one per animation frame to prevent jitter
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setVisualDims(dims));
    };
    const onUp = () => {
      cancelAnimationFrame(rafId);
      if (latestResizeDims.current) {
        onTemplateResize?.(latestResizeDims.current.w, latestResizeDims.current.h);
      }
      setIsResizingTemplate(false);
      resizeCorner.current = null;
      setVisualDims(null);
      latestResizeDims.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  // Intentionally omit `scale` — we use scaleRef.current to read the latest value
  // without re-creating the listener (which caused jitter during resize)
   
  }, [isResizingTemplate, onTemplateResize]);

  // ── Template rotation ─────────────────────────────────────────────────────
  const handleRotateStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + pan.x + canvasW / 2;
    const cy = rect.top + pan.y + canvasH / 2;
    const initialAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    rotateStartRef.current = { angle: initialAngle, startRotation: rotation, cx, cy };
    setIsRotating(true);
  };

  useEffect(() => {
    if (!isRotating) return;
    const onMove = (e: MouseEvent) => {
      const { cx, cy, angle: startAngle, startRotation } = rotateStartRef.current;
      const newAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      setRotation(startRotation + newAngle - startAngle);
    };
    const onUp = () => setIsRotating(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isRotating]);

  // ── Toolbar dragging ──────────────────────────────────────────────────────
  const toolbarRef = useRef<HTMLDivElement>(null);
  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    // only drag from the grip icon
    if (!(e.target as HTMLElement).closest('[data-grip]')) return;
    e.preventDefault();
    // If not yet dragged, read the toolbar's current rendered position from DOM
    let origX = toolbarPos?.x ?? 0;
    let origY = toolbarPos?.y ?? 0;
    if (!toolbarPos && toolbarRef.current && containerRef.current) {
      const tb = toolbarRef.current.getBoundingClientRect();
      const ct = containerRef.current.getBoundingClientRect();
      origX = tb.left - ct.left;
      origY = tb.top - ct.top;
    }
    toolbarDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };

    const onMove = (ev: MouseEvent) => {
      if (!toolbarDragRef.current.dragging) return;
      const rawX = toolbarDragRef.current.origX + ev.clientX - toolbarDragRef.current.startX;
      const rawY = toolbarDragRef.current.origY + ev.clientY - toolbarDragRef.current.startY;
      // Clamp toolbar within the visible area, keeping it clear of the left panel
      if (containerRef.current && toolbarRef.current) {
        const ct = containerRef.current.getBoundingClientRect();
        const tb = toolbarRef.current.getBoundingClientRect();
        const minX = 4;
        const maxX = ct.width - tb.width - 4;
        const maxY = ct.height - tb.height - 4;
        setToolbarPos({ x: Math.max(minX, Math.min(rawX, maxX)), y: Math.max(4, Math.min(rawY, maxY)) });
      } else {
        setToolbarPos({ x: rawX, y: rawY });
      }
    };
    const onUp = () => { toolbarDragRef.current.dragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Field interactions ────────────────────────────────────────────────────

  const handleFieldDrag = useCallback((id: string, deltaX: number, deltaY: number) => {
    const field = fields.find(f => f.id === id);
    if (!field || field.locked) return;
    let nx = field.x + deltaX / scale;
    let ny = field.y + deltaY / scale;
    if (snapToGrid) {
      nx = Math.round(nx / SNAP_SIZE) * SNAP_SIZE;
      ny = Math.round(ny / SNAP_SIZE) * SNAP_SIZE;
    }

    // If multi-select active, move all selected fields together
    if (multiSelectedIds.size > 1 && multiSelectedIds.has(id)) {
      for (const fid of multiSelectedIds) {
        const f = fields.find(ff => ff.id === fid);
        if (!f || f.locked) continue;
        onFieldUpdate(fid, { x: f.x + deltaX / scale, y: f.y + deltaY / scale });
      }
      return;
    }

    onFieldUpdate(id, { x: nx, y: ny });
  }, [fields, scale, snapToGrid, onFieldUpdate, multiSelectedIds]);

  const handleFieldResize = useCallback((id: string, width: number, height: number, initialCanvasWidth: number, initialFontSize: number) => {
    const field = fields.find(f => f.id === id);
    if (field?.locked) return;
    let w = width / scale;
    let h = height / scale;
    if (snapToGrid) {
      w = Math.round(w / SNAP_SIZE) * SNAP_SIZE;
      h = Math.round(h / SNAP_SIZE) * SNAP_SIZE;
    }
    const newW = Math.max(SNAP_SIZE, w);
    const newH = Math.max(SNAP_SIZE, h);
    const updates: Record<string, unknown> = { width: newW, height: newH };
    // Scale font size relative to the dimensions at resize-start (not the last tick) so
    // the font tracks the full drag delta, not just the per-tick delta.
    if (field && !['image', 'qr_code'].includes(field.type) && initialCanvasWidth > 0) {
      const ratio = newW / initialCanvasWidth;
      updates.fontSize = Math.max(6, Math.round(initialFontSize * ratio));
    }
    onFieldUpdate(id, updates as any);
  }, [fields, scale, snapToGrid, onFieldUpdate]);

  const alignSelectedField = useCallback((alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
    const field = fields.find(f => f.id === selectedFieldId);
    if (!field) return;
    let updates: Partial<CertificateField> = {};
    switch (alignment) {
      case 'left':     updates = { x: 0 }; break;
      case 'center-h': updates = { x: (pdfWidth - field.width) / 2 }; break;
      case 'right':    updates = { x: pdfWidth - field.width }; break;
      case 'top':      updates = { y: 0 }; break;
      case 'center-v': updates = { y: (pdfHeight - field.height) / 2 }; break;
      case 'bottom':   updates = { y: pdfHeight - field.height }; break;
    }
    onFieldUpdate(field.id, updates);
  }, [fields, selectedFieldId, pdfWidth, pdfHeight, onFieldUpdate]);


  const cursor = isPanning ? 'grabbing' : (isSpacePressed ? 'grab' : 'default');
  const canvasW = pdfWidth * scale;
  const canvasH = pdfHeight * scale;
  // During resize: use visualDims for smooth visual feedback without re-rendering PDF
  const displayW = (visualDims?.w ?? pdfWidth) * scale;
  const displayH = (visualDims?.h ?? pdfHeight) * scale;
  const visibleFields = fields.filter(f => !hiddenFields.has(f.id));

  // ── Dot grid background ───────────────────────────────────────────────────
  // We use a CSS radial-gradient trick for dots — infinitely tiling, no SVG overhead
  const DOT_SPACING = 24;
  const DOT_SIZE = 1.5;
  const dotBg = {
    backgroundImage: `radial-gradient(circle, var(--canvas-dot) ${DOT_SIZE}px, transparent ${DOT_SIZE}px)`,
    backgroundSize: `${DOT_SPACING}px ${DOT_SPACING}px`,
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ ...dotBg, backgroundColor: 'var(--canvas-bg)', cursor }}
      onMouseDown={handleMouseDown}
      onMouseUp={() => { setIsPanning(false); }}
      onMouseLeave={() => { setIsPanning(false); }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          dragCountRef.current++;
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => {
        dragCountRef.current--;
        if (dragCountRef.current <= 0) { dragCountRef.current = 0; setIsDragOver(false); }
      }}
      onDragOver={(e) => {
        // Accept any drag — type check happens in onDrop; we must always
        // call preventDefault here to register as a valid drop target.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCountRef.current = 0;
        setIsDragOver(false);
        if (!onAssetDrop) return;
        const rect = containerRef.current!.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / scale;
        const canvasY = (e.clientY - rect.top - pan.y) / scale;
        // Internal asset drag
        const url = e.dataTransfer.getData('asset-url');
        if (url) {
          const name = e.dataTransfer.getData('asset-name');
          onAssetDrop(url, name, canvasX, canvasY);
          return;
        }
        // OS file drag — upload to storage so the backend can fetch the URL
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
          // Use blob URL immediately for preview; upload in background and swap the URL
          const blobUrl = URL.createObjectURL(file);
          onAssetDrop(blobUrl, file.name, canvasX, canvasY);
          // Tell parent to swap the imageUrl once the permanent URL is ready
          api.templates.uploadAsset(file).then((permanentUrl) => {
            URL.revokeObjectURL(blobUrl);
            // Parent receives this as an "update last blob URL" signal
            onAssetDrop(permanentUrl, file.name, canvasX, canvasY, blobUrl);
          }).catch((err) => {
            console.error('[InfiniteCanvas] Asset upload failed — image will work this session only:', err);
          });
        }
      }}
    >

      {/* ── Image drag-over overlay ── */}
      {isDragOver && (
        <div className="absolute inset-0 z-[150] pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary/50 rounded-sm" />
          <div className="relative flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-primary" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-primary">Drop image to add as field</p>
            <p className="text-xs text-primary/60">PNG, JPG, SVG, WebP</p>
          </div>
        </div>
      )}

      {/* ── Page Navigation (multi-page PDF) ── */}
      {totalPages > 1 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-border/50 px-2 py-1 rounded-lg shadow-lg">
          <Button
            variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs font-medium text-foreground/80 px-1 min-w-[72px] text-center">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* ── Certificate Canvas ── */}
      <div
        className="absolute"
        style={{
          width: displayW,
          height: displayH,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          willChange: isPanning ? 'transform' : 'auto',
        }}
        data-field="canvas"
      >
        {/* Rotation wrapper — rotates everything (template + handles) around its center */}
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center',
            position: 'relative',
            outline: '2px solid rgba(62, 207, 142, 0.85)',
            outlineOffset: '8px',
          }}
        >
          {/* Drop shadow behind template */}
          <div
            className="absolute inset-0 rounded-sm"
            style={{ boxShadow: '0 8px 40px 0 rgba(0,0,0,0.55)' }}
            aria-hidden
          />

          {/* Template image */}
          <img
            src={fileUrl}
            alt="Certificate template"
            className="absolute inset-0 select-none pointer-events-none rounded-sm"
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
            draggable={false}
          />

          {/* Fields */}
          <div className="absolute inset-0 z-20">
            {visibleFields.map(field => (
              <div
                key={field.id}
                data-field="true"
                style={{ zIndex: field.zIndex ?? 0 }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onFieldSelect(field.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, fieldId: field.id });
                }}
              >
                <DraggableField
                  field={field}
                  scale={scale}
                  isSelected={selectedFieldId === field.id || multiSelectedIds.has(field.id)}
                  isMultiSelected={multiSelectedIds.has(field.id)}
                  onDrag={(dx, dy) => handleFieldDrag(field.id, dx, dy)}
                  onDragStart={onFieldDragStart}
                  onResize={(w, h, iw, ifs) => handleFieldResize(field.id, w, h, iw, ifs)}
                  onSelect={e => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      setMultiSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(field.id)) next.delete(field.id);
                        else next.add(field.id);
                        return next;
                      });
                    } else {
                      setMultiSelectedIds(new Set());
                      onFieldSelect(field.id);
                    }
                  }}
                />
              </div>
            ))}
          </div>

          {/* Template resize handles (8 handles) + rotation handle */}
          {onTemplateResize && (
            <div className="absolute inset-0 pointer-events-none z-30">
              {/* ── Corners (resize square + outer rotation zone) ── */}
              {([
                { id: 'nw', cursor: 'nwse-resize', style: { top: -14, left: -14 }, rotStyle: { top: -30, left: -30 } },
                { id: 'ne', cursor: 'nesw-resize', style: { top: -14, right: -14 }, rotStyle: { top: -30, right: -30 } },
                { id: 'sw', cursor: 'nesw-resize', style: { bottom: -14, left: -14 }, rotStyle: { bottom: -30, left: -30 } },
                { id: 'se', cursor: 'nwse-resize', style: { bottom: -14, right: -14 }, rotStyle: { bottom: -30, right: -30 } },
              ] as const).map(({ id, cursor, style, rotStyle }) => (
                <div key={id}>
                  {/* Outer rotation zone — invisible, shows rotate icon on hover */}
                  <div
                    className="absolute w-5 h-5 pointer-events-auto flex items-center justify-center group/rot"
                    style={{ cursor: isRotating ? 'grabbing' : 'crosshair', ...rotStyle }}
                    data-resize-handle
                    onMouseDown={handleRotateStart}
                    title="Drag to rotate"
                  >
                    <RotateCw className="w-3 h-3 text-[#3ecf8e] opacity-0 group-hover/rot:opacity-100 transition-opacity" />
                  </div>
                  {/* Inner resize square */}
                  <div
                    className="absolute w-3 h-3 rounded-[2px] pointer-events-auto hover:scale-125 transition-transform"
                    style={{ backgroundColor: '#ffffff', border: '2px solid #3ecf8e', cursor, ...style }}
                    data-resize-handle
                    onMouseDown={e => handleTemplateResizeStart(e, id as ResizeHandle)}
                  />
                </div>
              ))}

              {/* ── Edge midpoints ── */}
              <div
                className="absolute w-3 h-3 rounded-[2px] pointer-events-auto cursor-ns-resize hover:scale-125 transition-transform"
                style={{ backgroundColor: '#ffffff', border: '2px solid #3ecf8e', top: -14, left: '50%', transform: 'translateX(-50%)' }}
                data-resize-handle
                onMouseDown={e => handleTemplateResizeStart(e, 'n')}
              />
              <div
                className="absolute w-3 h-3 rounded-[2px] pointer-events-auto cursor-ns-resize hover:scale-125 transition-transform"
                style={{ backgroundColor: '#ffffff', border: '2px solid #3ecf8e', bottom: -14, left: '50%', transform: 'translateX(-50%)' }}
                data-resize-handle
                onMouseDown={e => handleTemplateResizeStart(e, 's')}
              />
              <div
                className="absolute w-3 h-3 rounded-[2px] pointer-events-auto cursor-ew-resize hover:scale-125 transition-transform"
                style={{ backgroundColor: '#ffffff', border: '2px solid #3ecf8e', right: -14, top: '50%', transform: 'translateY(-50%)' }}
                data-resize-handle
                onMouseDown={e => handleTemplateResizeStart(e, 'e')}
              />
              <div
                className="absolute w-3 h-3 rounded-[2px] pointer-events-auto cursor-ew-resize hover:scale-125 transition-transform"
                style={{ backgroundColor: '#ffffff', border: '2px solid #3ecf8e', left: -14, top: '50%', transform: 'translateY(-50%)' }}
                data-resize-handle
                onMouseDown={e => handleTemplateResizeStart(e, 'w')}
              />

            </div>
          )}
        </div>
      </div>

      {/* ── Floating draggable toolbar ── */}
      {(() => {
        const selectedField = fields.find(f => f.id === selectedFieldId) ?? null;
        const isTextField = selectedField && !['image', 'qr_code'].includes(selectedField.type);
        const fieldInfo = selectedField ? FIELD_TYPE_INFO[selectedField.type] : null;

        return (
          <div
            ref={toolbarRef}
            data-toolbar
            className="z-50"
            style={
              toolbarPos
                ? { position: 'absolute', left: toolbarPos.x, top: toolbarPos.y, userSelect: 'none' }
                : { position: 'absolute', bottom: 64, left: `calc(${leftPanelWidth ?? 0}px + (100% - ${(leftPanelWidth ?? 0) + (rightPanelWidth ?? 0)}px) / 2)`, transform: 'translateX(-50%)', userSelect: 'none' }
            }
            onMouseDown={handleToolbarMouseDown}
          >
            {/* Help panel — floats above toolbar */}
            {helpPanelOpen && (
              <div className="absolute bottom-full mb-2 left-0 w-64 bg-card border border-border/60 rounded-xl shadow-2xl p-4 z-[60]">
                <div className="flex items-start justify-between mb-2.5">
                  <div className="text-xs font-semibold text-foreground">
                    {fieldInfo ? fieldInfo.label : 'Certificate Designer'}
                  </div>
                  <button
                    className="text-muted-foreground/50 hover:text-muted-foreground p-0.5 rounded transition-colors"
                    onClick={() => setHelpPanelOpen(false)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {fieldInfo ? (
                  <>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                      {fieldInfo.description}
                    </p>
                    <ul className="space-y-1.5 mb-3">
                      {fieldInfo.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80">
                          <span className="text-primary mt-0.5 shrink-0 leading-none">·</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                    Select a field on the canvas to see tips and usage details for that field type.
                  </p>
                )}

                <div className="border-t border-border/40 pt-3">
                  <button
                    className="w-full text-[11px] text-primary hover:text-primary/80 font-medium text-left transition-colors flex items-center gap-1"
                    onClick={() => { setHelpPanelOpen(false); setShowShortcuts(true); }}
                  >
                    View keyboard shortcuts →
                  </button>
                </div>
              </div>
            )}

            {/* Toolbar pill */}
            <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur-md border border-border/50 rounded-xl shadow-2xl px-2 py-1.5">
              {/* Grip */}
              <div
                data-grip
                className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing px-0.5"
                title="Drag to move"
              >
                <GripHorizontal className="w-3.5 h-3.5" />
              </div>

              {/* Minimize / expand toggle */}
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted rounded-lg"
                onClick={() => setToolbarMinimized(v => !v)}
                title={toolbarMinimized ? 'Expand toolbar' : 'Minimize toolbar'}
              >
                {toolbarMinimized
                  ? <ChevronRight className="w-3.5 h-3.5" />
                  : <ChevronLeft className="w-3.5 h-3.5" />}
              </Button>

              {/* ── Expanded section ── */}
              {!toolbarMinimized && (
                <>
                  <div className="w-px h-4 bg-border mx-0.5" />

                  {/* Undo / Redo */}
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-30"
                    onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-30"
                    onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </Button>

                  {/* ── Contextual field tools ── */}
                  {selectedField && (
                    <>
                      <div className="w-px h-4 bg-border mx-0.5" />

                      {/* Text-only controls */}
                      {isTextField && (
                        <>
                          <Button
                            variant="ghost" size="icon"
                            className={`h-7 w-7 rounded-lg transition-colors ${selectedField.fontWeight === 'bold' ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                            onClick={() => onFieldUpdate(selectedField.id, { fontWeight: selectedField.fontWeight === 'bold' ? 'normal' : 'bold' })}
                            title="Bold"
                          >
                            <Bold className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className={`h-7 w-7 rounded-lg transition-colors ${selectedField.fontStyle === 'italic' ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                            onClick={() => onFieldUpdate(selectedField.id, { fontStyle: selectedField.fontStyle === 'italic' ? 'normal' : 'italic' })}
                            title="Italic"
                          >
                            <Italic className="w-3.5 h-3.5" />
                          </Button>

                          <div className="w-px h-4 bg-border mx-0.5" />

                          {/* Text alignment */}
                          {[
                            { value: 'left',   Icon: AlignLeft,   title: 'Align text left' },
                            { value: 'center', Icon: AlignCenter, title: 'Align text center' },
                            { value: 'right',  Icon: AlignRight,  title: 'Align text right' },
                          ].map(({ value, Icon, title }) => (
                            <Button
                              key={value}
                              variant="ghost" size="icon"
                              className={`h-7 w-7 rounded-lg transition-colors ${selectedField.textAlign === value ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                              onClick={() => onFieldUpdate(selectedField.id, { textAlign: value as CertificateField['textAlign'] })}
                              title={title}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </Button>
                          ))}

                          <div className="w-px h-4 bg-border mx-0.5" />
                        </>
                      )}

                      {/* Page alignment (all field types) */}
                      {[
                        { id: 'left',     Icon: AlignLeft,             title: 'Snap to left edge' },
                        { id: 'center-h', Icon: AlignCenter,           title: 'Center horizontally' },
                        { id: 'right',    Icon: AlignRight,            title: 'Snap to right edge' },
                        { id: 'top',      Icon: AlignStartVertical,    title: 'Snap to top edge' },
                        { id: 'center-v', Icon: AlignCenterHorizontal, title: 'Center vertically' },
                        { id: 'bottom',   Icon: AlignEndVertical,      title: 'Snap to bottom edge' },
                      ].map(({ id, Icon, title }) => (
                        <Button
                          key={id}
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                          onClick={() => alignSelectedField(id as Parameters<typeof alignSelectedField>[0])}
                          title={title}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </Button>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* ── Always-visible buttons ── */}
              <div className="w-px h-4 bg-border mx-0.5" />

              {/* Help — before preview */}
              <Button
                variant="ghost" size="icon"
                className={`h-7 w-7 rounded-lg transition-colors ${helpPanelOpen ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                onClick={() => setHelpPanelOpen(v => !v)}
                title="Field help & keyboard shortcuts (?)"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </Button>

              {/* Preview */}
              {onPreviewToggle && (
                <button
                  className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${previewOpen ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  onClick={onPreviewToggle}
                  title={previewOpen ? 'Exit preview' : 'Preview certificate'}
                >
                  <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Preview</span>
                </button>
              )}

              {/* Autosave indicator */}
              {saveStatus !== 'idle' && (
                <div className={`flex items-center gap-1 text-[10px] px-2 rounded-lg h-7 font-medium ${
                  saveStatus === 'saving' ? 'text-muted-foreground' :
                  saveStatus === 'saved'  ? 'text-primary' :
                  'text-destructive'
                }`}>
                  {saveStatus === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {saveStatus === 'saved'  && <CheckCircle2 className="w-3 h-3" />}
                  {saveStatus === 'error'  && <AlertCircle className="w-3 h-3" />}
                  <span>
                    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Empty state guide ── */}
      {fields.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center space-y-2 opacity-40">
            <div className="w-12 h-12 rounded-xl border-2 border-dashed border-muted-foreground/40 flex items-center justify-center mx-auto">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-muted-foreground/60" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Add fields from the left panel</p>
            <p className="text-[10px] text-muted-foreground/70">Name, dates, QR code, images and more</p>
          </div>
        </div>
      )}

      {/* ── Multi-select indicator ── */}
      {multiSelectedIds.size > 1 && (
        <div className="absolute top-14 right-3 z-50 flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary text-xs px-3 py-1.5 rounded-full shadow-sm">
          <span className="font-medium">{multiSelectedIds.size} fields selected</span>
          <button
            className="hover:bg-primary/20 rounded px-1 text-[10px]"
            onClick={() => setMultiSelectedIds(new Set())}
          >
            Clear
          </button>
          <button
            className="hover:bg-destructive/20 text-destructive rounded px-1 text-[10px]"
            onClick={() => { onFieldsDelete?.(Array.from(multiSelectedIds)); setMultiSelectedIds(new Set()); }}
          >
            Delete all
          </button>
        </div>
      )}

      {/* ── Canvas info bar (bottom-left) ── */}
      <div className="absolute bottom-3 left-3 z-40 flex items-center gap-2 text-[10px] text-muted-foreground/50 select-none pointer-events-none">
        <span>{Math.round(visualDims?.w ?? pdfWidth)} × {Math.round(visualDims?.h ?? pdfHeight)}</span>
        <span className="w-px h-2.5 bg-border" />
        <span>{visibleFields.length} field{visibleFields.length !== 1 ? 's' : ''}</span>
        {snapToGrid && (
          <>
            <span className="w-px h-2.5 bg-border" />
            <span className="text-primary/70">Snap {SNAP_SIZE}px</span>
          </>
        )}
      </div>

      {/* ── Keyboard hint (bottom-right) ── */}
      <div className="absolute bottom-3 right-3 z-40 text-[9px] text-muted-foreground/30 select-none pointer-events-none text-right leading-relaxed">
        Del · ⌘Z undo · ⌘C/V/D copy/paste/dup · Shift+click multi-select · ? shortcuts
      </div>

      {/* ── Right-click context menu ── */}
      {contextMenu && (() => {
        const ctxField = fields.find(f => f.id === contextMenu.fieldId);
        if (!ctxField) return null;
        return (
          <div
            className="fixed z-[100] bg-card border border-border/50 rounded-lg shadow-2xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseLeave={() => setContextMenu(null)}
          >
            {[
              { label: 'Copy', icon: Copy, action: () => { clipboardRef.current = ctxField; } },
              { label: 'Duplicate', icon: Copy, action: () => { onFieldDuplicate?.({ ...ctxField, x: ctxField.x + 20, y: ctxField.y + 20 }); } },
              null,
              { label: ctxField.locked ? 'Unlock' : 'Lock', icon: ctxField.locked ? Unlock : Lock, action: () => onFieldLock?.(ctxField.id, !ctxField.locked) },
              { label: 'Bring to Front', icon: ArrowUp, action: () => onFieldReorder?.(ctxField.id, 'front') },
              { label: 'Send to Back', icon: ArrowDown, action: () => onFieldReorder?.(ctxField.id, 'back') },
              null,
              { label: 'Delete', icon: Trash2, action: () => onFieldDelete(ctxField.id), danger: true },
            ].map((item, i) =>
              item === null ? (
                <div key={i} className="border-t border-border/40 my-1" />
              ) : (
                <button
                  key={item.label}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left ${item.danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground'}`}
                  onClick={() => { item.action(); setContextMenu(null); }}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              )
            )}
          </div>
        );
      })()}

      {/* ── Keyboard shortcuts modal ── */}
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
