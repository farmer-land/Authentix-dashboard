'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { CertificateField } from '@/lib/types/certificate';
import { api } from '@/lib/api/client';
import { DraggableField } from './DraggableField';
import { Button } from '@/components/ui/button';
import {
  RotateCw,
  ChevronLeft,
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
  Save,
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
  onFieldUpdate: (fieldId: string, updates: Partial<CertificateField>) => void;
  onFieldSelect: (fieldId: string) => void;
  onScaleChange: (scale: number) => void;
  onFieldDelete: (fieldId: string) => void;
  onTemplateResize?: (width: number, height: number) => void;
  onTemplateResizeStart?: (width: number, height: number) => void;
  onAssetDrop?: (url: string, name: string, x: number, y: number, replaceBlobUrl?: string) => void;
  onPreviewToggle?: () => void;
  previewOpen?: boolean;
  onFieldDuplicate?: (field: CertificateField) => void;
  // Undo / redo
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // Autosave status + explicit save
  saveStatus?: SaveStatus;
  lastSavedAt?: Date | null;
  onSaveNow?: () => void;
  /** fieldId → value from row 1 of imported data; drives live preview on the canvas */
  livePreviewValues?: Record<string, string>;
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
  // Height in px reserved by the stepper bar at the bottom of the canvas area.
  // fitToScreen shifts the template up by half this value so it stays visually
  // centred in the available space, and the toolbar sits above the stepper.
  footerHeight?: number;
  // Whether the left panel is currently open/visible (toggles trigger refit)
  leftPanelOpen?: boolean;
  // Whether the right panel is currently open/visible (toggles trigger refit)
  rightPanelOpen?: boolean;
  // When false (overlay covering canvas), the entrance animation is deferred until
  // this transitions to true — prevents the grow animation from playing while hidden.
  revealContent?: boolean;
}

const SNAP_SIZE = 8;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

function formatSavedAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
}

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
  onFieldUpdate,
  onFieldSelect,
  onScaleChange,
  onFieldDelete,
  onTemplateResize,
  onTemplateResizeStart,
  onAssetDrop,
  onPreviewToggle,
  previewOpen,
  onFieldDuplicate,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  saveStatus = 'idle',
  lastSavedAt,
  onSaveNow,
  livePreviewValues,
  onFieldsDelete,
  onFieldReorder,
  onFieldLock,
  onFieldDragStart,
  snapToGrid: snapToGridProp,
  fitTrigger,
  leftPanelWidth,
  rightPanelWidth,
  footerHeight = 0,
  leftPanelOpen = false,
  rightPanelOpen = false,
  revealContent,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Always-current refs for props that callbacks close over.
  // This avoids stale-closure bugs when useCallback deps don't update fast enough.
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const onFieldUpdateRef = useRef(onFieldUpdate);
  onFieldUpdateRef.current = onFieldUpdate;

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });

  // Interaction state
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  // Snap: controlled by parent if snapToGridProp provided, else internal
  const [snapToGridInternal] = useState(false);
  const snapToGrid = snapToGridProp ?? snapToGridInternal;

  // Image drag-over state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCountRef = useRef(0);

  // Alignment guide lines shown while dragging a field
  const [guides, setGuides] = useState<{ type: 'h' | 'v'; pos: number }[]>([]);

  // Tick every 30s so "Saved X min ago" stays accurate without a re-render from the parent
  const [, setSavedTick] = useState(0);
  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => setSavedTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  // Template resize state
  const [isResizingTemplate, setIsResizingTemplate] = useState(false);
  const resizeCorner = useRef<ResizeHandle | null>(null);
  const templateResizeStart = useRef({ x: 0, y: 0 });
  const initialTemplateDims = useRef({ w: 0, h: 0 });
  const resizePanStart = useRef({ x: 0, y: 0 });

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

  // Help panel (toolbar minimize/hover-expand removed — always-expanded prevents
  // the preview button from shifting position when the user moves toward it)
  const [helpPanelOpen, setHelpPanelOpen] = useState(false);

  // "Add fields" tip — shown once per session
  const [addFieldsTipSeen, setAddFieldsTipSeen] = useState(() => {
    try { return !!sessionStorage.getItem('cert_add_fields_tip_seen'); } catch { return false; }
  });
  const dismissAddFieldsTip = useCallback(() => {
    setAddFieldsTipSeen(true);
    try { sessionStorage.setItem('cert_add_fields_tip_seen', '1'); } catch { /* ignore storage errors */ }
  }, []);
  useEffect(() => {
    if (addFieldsTipSeen) return;
    // Auto-dismiss after 5 s
    const t = setTimeout(dismissAddFieldsTip, 5000);
    return () => clearTimeout(t);
  }, [addFieldsTipSeen, dismissAddFieldsTip]);
  // Dismiss when the left panel opens or the first field is added
  useEffect(() => {
    if (!addFieldsTipSeen && (leftPanelOpen || fields.length > 0)) dismissAddFieldsTip();
  }, [leftPanelOpen, fields.length, addFieldsTipSeen, dismissAddFieldsTip]);

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

  // ── Position calibration logger (browser console + server terminal) ─────────
  const serverLog = (label: string, data: unknown) => {
    console.log(`[Canvas] ${label}`, data);
    fetch('/api/dev/canvas-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, data }),
    }).catch(() => {});
  };

  // Debounced pan + zoom log (600ms after settling)
  useEffect(() => {
    const t = setTimeout(() => {
      serverLog('Template position', { pan: { x: Math.round(pan.x), y: Math.round(pan.y) }, zoom: `${Math.round(scale * 100)}%` });
    }, 600);
    return () => clearTimeout(t);
  }, [pan, scale]);

  // Reset rotation and entrance animation state when a new template is loaded.
  // Without resetting hasFitted, template switches wouldn't replay the grow animation.
  useEffect(() => { setRotation(0); setHasFitted(false); }, [fileUrl]);

  // Hides the canvas until the first fit runs so the user never sees pan={0,0}
  const [hasFitted, setHasFitted] = useState(false);

  // ── Auto-fit on mount and when template changes ──────────────────────────
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    if (cw === 0 || ch === 0) return; // Container is hidden (display:none) — skip
    const leftW = leftPanelWidth ?? 0;
    const rightW = rightPanelWidth ?? 0;
    const availW = cw - leftW - rightW;
    // Reserve space for the floating toolbar (52px offset above footerHeight + ~44px toolbar height + 16px gap)
    // so tall/vertical templates never overlap the toolbar after auto-fit.
    const TOOLBAR_RESERVED = 112;
    const effectiveH = ch - (footerHeight ?? 0) - TOOLBAR_RESERVED;

    // Fit template to occupy ~80% of the smaller available dimension, respecting both axes
    const fitScale = Math.min(availW / pdfWidth, effectiveH / pdfHeight) * 0.80;
    const clampedScale = Math.min(Math.max(fitScale, 0.04), 2);
    const centeredX = leftW + (availW - pdfWidth * clampedScale) / 2;
    // Center in the full available height (not effectiveH) so the template appears
    // visually centred on screen. effectiveH only controls fit scale (prevents overlap with toolbar).
    const fullAvailH = ch - (footerHeight ?? 0);
    const centeredY = Math.max(0, (fullAvailH - pdfHeight * clampedScale) / 2);
    onScaleChange(clampedScale);
    setPan({ x: centeredX, y: centeredY });
    panRef.current = { x: centeredX, y: centeredY };
    // Delay hasFitted by one frame so the centered pan renders first.
    // This way the scale-grow animation starts from the correct position
    // (no sliding from top-left — the template grows from its own center).
    requestAnimationFrame(() => setHasFitted(true));
  }, [pdfWidth, pdfHeight, footerHeight, leftPanelWidth, rightPanelWidth, onScaleChange]);

  // Run auto-fit whenever template dimensions change.
  // First load runs immediately (no delay) to avoid visible jump.
  // Subsequent changes (template switch) wait one frame for DOM reflow.
  const prevDimsRef = useRef({ w: 0, h: 0 });
  const isFirstFitRef = useRef(true);
  useEffect(() => {
    if (pdfWidth > 0 && pdfHeight > 0) {
      const prev = prevDimsRef.current;
      if (prev.w !== pdfWidth || prev.h !== pdfHeight) {
        prevDimsRef.current = { w: pdfWidth, h: pdfHeight };
        if (isFirstFitRef.current) {
          isFirstFitRef.current = false;
          fitToScreen();
        } else {
          setTimeout(fitToScreen, 50);
        }
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

  // Re-center when either panel opens/closes so the certificate always sits in
  // the middle of the visible space between them.
  const prevLeftPanelOpen = useRef(leftPanelOpen);
  useEffect(() => {
    if (leftPanelOpen !== prevLeftPanelOpen.current) {
      prevLeftPanelOpen.current = leftPanelOpen;
      setToolbarPos(null);
      setTimeout(fitToScreen, 80);
    }
  }, [leftPanelOpen, fitToScreen]);

  // Right panel opens on field-select (click) — not mid-drag — so it's safe to refit.
  // Explicit close buttons already fire fitTrigger; this handles the open transition.
  const prevRightPanelOpen = useRef(rightPanelOpen);
  useEffect(() => {
    if (rightPanelOpen !== prevRightPanelOpen.current) {
      prevRightPanelOpen.current = rightPanelOpen;
      setToolbarPos(null);
      setTimeout(fitToScreen, 80);
    }
  }, [rightPanelOpen, fitToScreen]);

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
      if (mod && e.key === 's') {
        e.preventDefault();
        onSaveNow?.();
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
  }, [scale, onScaleChange, fitToScreen, selectedFieldId, fields, onFieldDelete, onFieldDuplicate, onUndo, onRedo, multiSelectedIds, onFieldsDelete, onSaveNow]);

  // Clear alignment guides when any drag ends
  useEffect(() => {
    const clear = () => setGuides([]);
    document.addEventListener('mouseup', clear);
    return () => document.removeEventListener('mouseup', clear);
  }, []);

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
    resizePanStart.current = { x: panRef.current.x, y: panRef.current.y };
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
      // Screen-space deltas (not divided by scale) for pan adjustment
      const screenDx = e.clientX - templateResizeStart.current.x;
      const screenDy = e.clientY - templateResizeStart.current.y;
      let panX = resizePanStart.current.x;
      let panY = resizePanStart.current.y;
      switch (resizeCorner.current) {
        case 'se': nw += dx; nh += dy; break;
        case 'sw': nw -= dx; nh += dy; panX = resizePanStart.current.x + screenDx; break;
        case 'ne': nw += dx; nh -= dy; panY = resizePanStart.current.y + screenDy; break;
        case 'nw': nw -= dx; nh -= dy; panX = resizePanStart.current.x + screenDx; panY = resizePanStart.current.y + screenDy; break;
        case 'e':  nw += dx; break;
        case 'w':  nw -= dx; panX = resizePanStart.current.x + screenDx; break;
        case 's':  nh += dy; break;
        case 'n':  nh -= dy; panY = resizePanStart.current.y + screenDy; break;
      }
      // Clamp dims first, then correct pan if clamped
      const clampedW = Math.max(100, nw);
      const clampedH = Math.max(100, nh);
      if (clampedW !== nw) panX = resizePanStart.current.x; // undo pan if width clamped
      if (clampedH !== nh) panY = resizePanStart.current.y; // undo pan if height clamped
      const dims = { w: clampedW, h: clampedH };
      setPan({ x: panX, y: panY });
      panRef.current = { x: panX, y: panY };
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
    serverLog('Toolbar drag START', { x: Math.round(origX), y: Math.round(origY), minimized: false });

    const onMove = (ev: MouseEvent) => {
      if (!toolbarDragRef.current.dragging) return;
      const rawX = toolbarDragRef.current.origX + ev.clientX - toolbarDragRef.current.startX;
      const rawY = toolbarDragRef.current.origY + ev.clientY - toolbarDragRef.current.startY;
      // Clamp toolbar within the visible area, keeping it clear of the left panel
      if (containerRef.current && toolbarRef.current) {
        const ct = containerRef.current.getBoundingClientRect();
        const tb = toolbarRef.current.getBoundingClientRect();
        const minX = (leftPanelWidth ?? 0) + 4;
        const maxX = ct.width - tb.width - 4 - (rightPanelWidth ?? 0);
        const maxY = ct.height - tb.height - 4;
        setToolbarPos({ x: Math.max(minX, Math.min(rawX, maxX)), y: Math.max(4, Math.min(rawY, maxY)) });
      } else {
        setToolbarPos({ x: rawX, y: rawY });
      }
    };
    const onUp = () => {
      toolbarDragRef.current.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Log final position after drag (setToolbarPos is async, read from DOM)
      if (toolbarRef.current && containerRef.current) {
        const tb = toolbarRef.current.getBoundingClientRect();
        const ct = containerRef.current.getBoundingClientRect();
        const finalX = Math.round(tb.left - ct.left);
        const finalY = Math.round(tb.top - ct.top);
        serverLog('Toolbar drag END', { x: finalX, y: finalY, minimized: false });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Field interactions ────────────────────────────────────────────────────

  const handleFieldDrag = useCallback((id: string, deltaX: number, deltaY: number) => {
    const currentFields = fieldsRef.current;
    const field = currentFields.find(f => f.id === id);
    if (!field || field.locked) return;
    let nx = field.x + deltaX / scale;
    let ny = field.y + deltaY / scale;
    if (snapToGrid) {
      nx = Math.round(nx / SNAP_SIZE) * SNAP_SIZE;
      ny = Math.round(ny / SNAP_SIZE) * SNAP_SIZE;
    }

    // If multi-select active, move all selected fields together (no guides for multi-drag)
    if (multiSelectedIds.size > 1 && multiSelectedIds.has(id)) {
      setGuides([]);
      for (const fid of multiSelectedIds) {
        const f = currentFields.find(ff => ff.id === fid);
        if (!f || f.locked) continue;
        onFieldUpdateRef.current(fid, { x: f.x + deltaX / scale, y: f.y + deltaY / scale });
      }
      return;
    }

    // ── Alignment guides ──────────────────────────────────────────────────
    const THRESHOLD = 5 / scale; // 5 screen-px tolerance, in PDF-space units
    const dL = nx, dR = nx + field.width, dCX = nx + field.width / 2;
    const dT = ny, dB = ny + field.height, dCY = ny + field.height / 2;
    const seen = new Set<string>();
    const newGuides: { type: 'h' | 'v'; pos: number }[] = [];
    for (const other of currentFields) {
      if (other.id === id) continue;
      const oL = other.x, oR = other.x + other.width, oCX = other.x + other.width / 2;
      const oT = other.y, oB = other.y + other.height, oCY = other.y + other.height / 2;
      const checkV = (pdfX: number) => {
        const key = `v${Math.round(pdfX)}`;
        if (!seen.has(key)) { seen.add(key); newGuides.push({ type: 'v', pos: Math.round(pdfX * scale) }); }
      };
      const checkH = (pdfY: number) => {
        const key = `h${Math.round(pdfY)}`;
        if (!seen.has(key)) { seen.add(key); newGuides.push({ type: 'h', pos: Math.round(pdfY * scale) }); }
      };
      if (Math.abs(dCX - oCX) < THRESHOLD) checkV(oCX);
      if (Math.abs(dL  - oL)  < THRESHOLD) checkV(oL);
      if (Math.abs(dR  - oR)  < THRESHOLD) checkV(oR);
      if (Math.abs(dL  - oR)  < THRESHOLD) checkV(oR);
      if (Math.abs(dR  - oL)  < THRESHOLD) checkV(oL);
      if (Math.abs(dCY - oCY) < THRESHOLD) checkH(oCY);
      if (Math.abs(dT  - oT)  < THRESHOLD) checkH(oT);
      if (Math.abs(dB  - oB)  < THRESHOLD) checkH(oB);
      if (Math.abs(dT  - oB)  < THRESHOLD) checkH(oB);
      if (Math.abs(dB  - oT)  < THRESHOLD) checkH(oT);
    }
    setGuides(newGuides);
    // ─────────────────────────────────────────────────────────────────────

    onFieldUpdateRef.current(id, { x: nx, y: ny });
  }, [scale, snapToGrid, multiSelectedIds]);

  const handleFieldResize = useCallback((
    id: string,
    width: number,
    height: number,
    initialCanvasWidth: number,
    initialFontSize: number,
    newCanvasX?: number,
    newCanvasY?: number,
  ) => {
    const field = fieldsRef.current.find(f => f.id === id);
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
    // Left/top-edge handles also shift the field position (canvas units, pre-computed in DraggableField)
    if (newCanvasX !== undefined) updates.x = newCanvasX;
    if (newCanvasY !== undefined) updates.y = newCanvasY;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onFieldUpdateRef.current(id, updates as any);
  }, [scale, snapToGrid]);

  const handleFieldRotate = useCallback((id: string, rotation: number) => {
    onFieldUpdateRef.current(id, { rotation });
  }, []);

  const alignSelectedField = useCallback((alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
    const field = fieldsRef.current.find(f => f.id === selectedFieldId);
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
    onFieldUpdateRef.current(field.id, updates);
  }, [selectedFieldId, pdfWidth, pdfHeight]);


  const cursor = isPanning ? 'grabbing' : (isSpacePressed ? 'grab' : 'default');
  const canvasW = pdfWidth * scale;
  const canvasH = pdfHeight * scale;
  // During resize: use visualDims for smooth visual feedback without re-rendering PDF
  const displayW = (visualDims?.w ?? pdfWidth) * scale;
  const displayH = (visualDims?.h ?? pdfHeight) * scale;
  const visibleFields = fields.filter(f => !hiddenFields.has(f.id));

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ backgroundColor: 'var(--canvas-bg)', cursor, overscrollBehavior: 'none' }}
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

      {/* ── Certificate Canvas ── */}
      <div
        className="absolute"
        style={{
          width: displayW,
          height: displayH,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transition: (isPanning || isResizingTemplate || isRotating) ? 'none' : 'transform 0.15s ease-out',
          willChange: isPanning ? 'transform' : 'auto',
        }}
        data-field="canvas"
      >
      {/* Scale-grow entrance wrapper — template grows from its own center on first fit.
          Gates on revealContent so the animation is deferred until the loading overlay
          disappears: when revealContent transitions false→true while hasFitted is already
          true, the CSS transition fires naturally (scale 0.06→1) without any extra JS. */}
      <div style={{
        width: '100%',
        height: '100%',
        transform: (hasFitted && (revealContent ?? true)) ? 'scale(1)' : 'scale(0.06)',
        opacity: (hasFitted && (revealContent ?? true)) ? 1 : 0,
        transition: hasFitted ? 'transform 0.55s cubic-bezier(0.16,1,0.3,1), opacity 0.35s ease' : 'none',
        transformOrigin: 'center center',
      }}>
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
                  onResize={(w, h, iw, ifs, nx, ny) => handleFieldResize(field.id, w, h, iw, ifs, nx, ny)}
                  onRotate={(r) => handleFieldRotate(field.id, r)}
                  previewValue={livePreviewValues?.[field.id]}
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

          {/* Alignment guides — rendered during field drag */}
          {guides.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-40" aria-hidden>
              {guides.map((g, i) => (
                <div
                  key={i}
                  style={g.type === 'h'
                    ? { position: 'absolute', left: 0, right: 0, top: g.pos, height: 1, backgroundColor: 'rgba(255, 55, 136, 0.85)', boxShadow: '0 0 3px rgba(255,55,136,0.5)' }
                    : { position: 'absolute', top: 0, bottom: 0, left: g.pos, width: 1, backgroundColor: 'rgba(255, 55, 136, 0.85)', boxShadow: '0 0 3px rgba(255,55,136,0.5)' }
                  }
                />
              ))}
            </div>
          )}

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
      </div>{/* end scale-grow wrapper */}
      </div>{/* end certificate canvas */}

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
                : { position: 'absolute', bottom: footerHeight + 52, left: `calc(${leftPanelWidth ?? 0}px + (100% - ${(leftPanelWidth ?? 0) + (rightPanelWidth ?? 0)}px) / 2)`, transform: 'translateX(-50%)', userSelect: 'none' }
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
              {/* Grip — drag to move */}
              <div
                data-grip
                className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing px-0.5"
                title="Drag to move"
              >
                <GripHorizontal className="w-3.5 h-3.5" />
              </div>

              {/* ── Tool section — always visible ── */}
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

              {/* ── Preview + global actions ── */}
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

              {/* Live data badge — shown when row 1 values are applied to the canvas */}
              {livePreviewValues && Object.keys(livePreviewValues).length > 0 && (
                <div className="flex items-center gap-1 text-[10px] px-2 h-7 rounded-lg font-medium bg-primary/8 text-primary border border-primary/20" title="Canvas is showing values from row 1 of your imported data">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  Row 1 preview
                </div>
              )}

              {/* Preview + Save — only when at least 1 field is on the canvas */}
              {fields.length > 0 && (
                <>
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

                  {/* Save button + status indicator */}
                  {saveStatus === 'saving' && (
                    <div className="flex items-center gap-1 text-[10px] px-2 rounded-lg h-7 font-medium text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Saving…</span>
                    </div>
                  )}
                  {saveStatus === 'saved' && (
                    <div className="flex items-center gap-1 text-[10px] px-2 rounded-lg h-7 font-medium text-primary">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Saved</span>
                    </div>
                  )}
                  {saveStatus === 'error' && (
                    <div className="flex items-center gap-1.5 text-[10px] px-2 rounded-lg h-7 font-medium text-destructive">
                      <AlertCircle className="w-3 h-3" />
                      <span>Save failed</span>
                      {onSaveNow && (
                        <button
                          onClick={onSaveNow}
                          className="underline underline-offset-2 hover:no-underline"
                        >Retry</button>
                      )}
                    </div>
                  )}
                  {saveStatus === 'idle' && onSaveNow && (
                    <button
                      onClick={onSaveNow}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Save design now (⌘S)"
                    >
                      <Save className="w-3.5 h-3.5 shrink-0" />
                      <span>Save</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Empty state tip (left edge, pointing toward left panel) — once per session ── */}
      {fields.length === 0 && !addFieldsTipSeen && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <div className="flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border/60 rounded-xl px-3 py-2.5 shadow-lg max-w-42.5">
            <ChevronLeft className="w-4 h-4 text-primary shrink-0 animate-pulse" />
            <div>
              <p className="text-[11px] font-semibold text-foreground leading-tight">Add fields</p>
              <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">Open Fields tab to add text, QR codes &amp; images</p>
            </div>
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
