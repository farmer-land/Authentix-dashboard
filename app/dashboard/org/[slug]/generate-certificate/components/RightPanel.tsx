'use client';

import { createPortal } from 'react-dom';
import { CertificateField, FontWeight, CERTIFICATE_FONTS, PRESET_COLORS, DATE_FORMATS } from '@/lib/types/certificate';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlignLeft, AlignCenter, AlignRight, Italic, GripHorizontal, X, ChevronDown, ChevronRight, MoveHorizontal, MoveVertical, ArrowLeftRight, ArrowUpDown, Upload, Image as ImageIcon, ZoomIn, ZoomOut, Maximize2, Magnet, MousePointer2, Lock, Unlock, RefreshCw, Trash2, Search } from 'lucide-react';
import { RgbaColorPicker } from 'react-colorful';
import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react';
import { api } from '@/lib/api/client';
import type { GoogleFont } from '@/app/api/fonts/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const FONT_WEIGHTS: { label: string; value: FontWeight }[] = [
  { label: 'Thin', value: '100' },
  { label: 'Extra Light', value: '200' },
  { label: 'Light', value: '300' },
  { label: 'Regular', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Semi Bold', value: '600' },
  { label: 'Bold', value: '700' },
  { label: 'Extra Bold', value: '800' },
  { label: 'Black', value: '900' },
];

const FONT_SIZE_PRESETS = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96];

function normalizeFontWeight(w: string): FontWeight {
  if (w === 'normal') return '400';
  if (w === 'bold') return '700';
  return w as FontWeight;
}

const CHECKER = 'repeating-conic-gradient(#c0c0c0 0% 25%, #fff 0% 50%) 0 0 / 8px 8px';
const INP = 'bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-xs';

// ── Colour helpers ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string, opacity: number) {
  const h = hex.replace('#', '').padEnd(6, '0');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
    a: parseFloat((Math.max(0, Math.min(100, opacity)) / 100).toFixed(2)),
  };
}

function rgbaToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// ── Primitives ─────────────────────────────────────────────────────────────────

function Section({ label, children, defaultOpen = true }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/30">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left group"
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 select-none group-hover:text-muted-foreground/90 transition-colors">
          {label}
        </p>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground/30 transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function NumBox({
  label, value, onChange, unit, min, max, step, icon, className = '',
}: {
  label: string; value: number; onChange: (v: number) => void;
  unit?: string; min?: number; max?: number; step?: number;
  icon?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex items-center ${INP} h-8 px-2.5 gap-1.5 ${className}`}>
      <span className="text-[10px] text-muted-foreground/60 shrink-0 select-none">{label}</span>
      <input
        type="number" value={Math.round(value * 100) / 100}
        min={min} max={max} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 min-w-0 bg-transparent text-xs outline-none text-foreground"
      />
      {unit && <span className="text-[9px] text-muted-foreground/50 shrink-0 select-none">{unit}</span>}
      {icon && <span className="shrink-0 text-muted-foreground/35 ml-0.5">{icon}</span>}
    </div>
  );
}

/** Font size input with preset dropdown */
function FontSizeBox({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center ${INP} h-8 overflow-hidden`}>
        <span className="text-[10px] text-muted-foreground/60 shrink-0 select-none px-2.5">Size</span>
        <input
          type="number" value={Math.round(value)}
          onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
          className="flex-1 min-w-0 bg-transparent text-xs outline-none text-foreground"
        />
        <span className="text-[9px] text-muted-foreground/50 shrink-0 select-none pr-1">px</span>
        <button
          className="h-full px-1.5 border-l border-gray-200 dark:border-white/10 text-muted-foreground hover:text-foreground hover:bg-gray-50 dark:hover:bg-white/10 transition-colors flex items-center"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-0.5 bg-card border border-border/50 rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-44 overflow-y-auto">
            {FONT_SIZE_PRESETS.map((s) => (
              <button
                key={s}
                className={`w-full text-left px-2.5 py-1 text-xs hover:bg-muted transition-colors ${Math.round(value) === s ? 'text-primary font-semibold' : 'text-foreground'}`}
                onClick={() => { onChange(s); setOpen(false); }}
              >
                {s} px
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  name: 'Name', course: 'Course', start_date: 'Date',
  end_date: 'Date', custom_text: 'Text', qr_code: 'QR Code', image: 'Image',
};

// ── Floating colour picker ─────────────────────────────────────────────────────

type ColorTarget = 'main' | 'shadow' | 'stroke' | 'gradStart' | 'gradEnd';

function FloatingColorPicker({
  color, label, initialPos, onClose, onChange,
}: {
  color: { r: number; g: number; b: number; a: number };
  label: string;
  initialPos: { x: number; y: number };
  onClose: () => void;
  onChange: (c: { r: number; g: number; b: number; a: number }) => void;
}) {
  // Clamp to viewport so picker never starts off-screen
  const PICKER_W = 232;
  const PICKER_H = 380;
  const clampedInitial = {
    x: Math.min(Math.max(initialPos.x, 8), (typeof window !== 'undefined' ? window.innerWidth : 1200) - PICKER_W - 8),
    y: Math.min(Math.max(initialPos.y, 8), (typeof window !== 'undefined' ? window.innerHeight : 800) - PICKER_H - 8),
  };
  const [pos, setPos] = useState(clampedInitial);
  const dragOrigin = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin.current) return;
      setPos({
        x: Math.min(Math.max(dragOrigin.current.px + (e.clientX - dragOrigin.current.mx), 8), window.innerWidth - PICKER_W - 8),
        y: Math.min(Math.max(dragOrigin.current.py + (e.clientY - dragOrigin.current.my), 8), window.innerHeight - PICKER_H - 8),
      });
    };
    const onUp = () => { dragOrigin.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  return (
    <div className="fixed z-[9999] bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden select-none" style={{ left: pos.x, top: pos.y, width: 232 }}>
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border/30 cursor-grab active:cursor-grabbing bg-muted/20"
        onMouseDown={(e) => { e.preventDefault(); dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }; }}
      >
        <div className="flex items-center gap-1.5">
          <GripHorizontal className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
        </div>
        <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted" onClick={onClose} onMouseDown={(e) => e.stopPropagation()}>
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
      <div className="p-3 cp-compact">
        <RgbaColorPicker color={color} onChange={onChange} style={{ width: '100%' }} />
      </div>
      <div className="px-3 pb-3 pt-0.5 border-t border-border/30">
        <p className="text-[9px] text-muted-foreground/60 mb-1.5 select-none pt-2">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((preset) => (
            <button key={preset.value} title={preset.name}
              className="w-6 h-6 rounded-full border-2 border-transparent hover:border-primary/60 hover:scale-110 transition-all shrink-0"
              style={{ backgroundColor: preset.value }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onChange({ ...hexToRgba(preset.value, 100), a: 1 })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// System fonts bundled as fallback (shown when API key is not configured)
const SYSTEM_FONTS: GoogleFont[] = CERTIFICATE_FONTS.map((f) => ({
  family: f.value,
  category: f.category as GoogleFont['category'],
  variants: ['regular', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  menu: '',
  version: '',
  lastModified: '',
}));

const CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans Serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Script / Handwriting',
  monospace: 'Monospace',
};

// ── QR Logo Uploader ──────────────────────────────────────────────────────────

function QRLogoUploader({
  logoUrl,
  onLogoChange,
}: {
  logoUrl: string | null;
  onLogoChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    // Optimistic preview while uploading
    const blobUrl = URL.createObjectURL(file);
    onLogoChange(blobUrl);
    setUploading(true);
    try {
      const permanentUrl = await api.templates.uploadAsset(file);
      URL.revokeObjectURL(blobUrl);
      onLogoChange(permanentUrl);
    } catch (err) {
      console.error('[QRLogoUploader] Upload failed:', err);
      // Keep the blob URL as fallback so user can still see it locally
    } finally {
      setUploading(false);
    }
  }, [onLogoChange]);

  return (
    <div>
      <p className="text-[9px] text-muted-foreground/50 mb-1.5 select-none">QR Logo</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      {logoUrl ? (
        <div className="flex items-center gap-2.5">
          <div className="relative w-16 h-16 rounded border border-border/50 overflow-hidden bg-white shrink-0">
            <img src={logoUrl} alt="QR logo" className="w-full h-full object-contain" />
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              title="Replace logo"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="p-1.5 rounded border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              title="Remove logo"
              disabled={uploading}
              onClick={() => onLogoChange(null)}
              className="p-1.5 rounded border border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className="border border-dashed border-border/50 rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <Upload className="w-4 h-4 text-muted-foreground/50 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground/60">Click or drag image</p>
        </div>
      )}
    </div>
  );
}

// ── Gradient Angle Dial ────────────────────────────────────────────────────────

function GradientAngleDial({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  const dialRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const getAngle = (clientX: number, clientY: number) => {
    if (!dialRef.current) return 0;
    const rect = dialRef.current.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    return Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChangeRef.current(getAngle(e.clientX, e.clientY));
    const onMove = (ev: MouseEvent) => onChangeRef.current(getAngle(ev.clientX, ev.clientY));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // CSS angle 0° = top, clockwise — convert to SVG coords
  const rad = ((angle - 90) * Math.PI) / 180;
  const r = 10;
  const hx = 16 + r * Math.cos(rad);
  const hy = 16 + r * Math.sin(rad);

  return (
    <div
      ref={dialRef}
      onMouseDown={handleMouseDown}
      title={`${angle}°`}
      className="w-8 h-8 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 cursor-grab active:cursor-grabbing shrink-0 select-none flex items-center justify-center"
    >
      <svg width="32" height="32" viewBox="0 0 32 32" style={{ display: 'block' }}>
        <circle cx="16" cy="16" r="1.5" fill="rgba(100,100,100,0.4)" />
        <line x1="16" y1="16" x2={hx} y2={hy} stroke="rgba(100,100,100,0.4)" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx={hx} cy={hy} r="3" fill="white" stroke="oklch(0.765 0.149 162)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// ── Image Source Uploader ──────────────────────────────────────────────────────

function ImageSourceUploader({
  imageUrl,
  onImageChange,
}: {
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const blobUrl = URL.createObjectURL(file);
    onImageChange(blobUrl);
    setUploading(true);
    try {
      const permanentUrl = await api.templates.uploadAsset(file);
      URL.revokeObjectURL(blobUrl);
      onImageChange(permanentUrl);
    } catch (err) {
      console.error('[ImageSourceUploader] Upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [onImageChange]);

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      {imageUrl ? (
        <div className="flex items-center gap-2.5">
          <div className="relative w-16 h-16 rounded border border-border/50 overflow-hidden bg-muted/30 shrink-0">
            <img src={imageUrl} alt="Field image" className="w-full h-full object-contain" />
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              title="Replace image"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="p-1.5 rounded border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              title="Remove image"
              disabled={uploading}
              onClick={() => onImageChange(null)}
              className="p-1.5 rounded border border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className="border border-dashed border-border/50 rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <ImageIcon className="w-4 h-4 text-muted-foreground/50 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground/60">Click or drag image</p>
        </div>
      )}
    </div>
  );
}

// ── Props & Main Component ─────────────────────────────────────────────────────

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

interface RightPanelProps {
  selectedField: CertificateField | undefined;
  onFieldUpdate: (updates: Partial<CertificateField>) => void;
  allFieldLabels?: string[];
  // Canvas controls (shown when no field is selected)
  scale?: number;
  onScaleChange?: (s: number) => void;
  onFitToScreen?: () => void;
  snapToGrid?: boolean;
  onSnapToggle?: () => void;
  pdfWidth?: number;
  pdfHeight?: number;
}

type EffectType = 'none' | 'drop_shadow' | 'layer_blur' | 'background_blur';

export function RightPanel({ selectedField, onFieldUpdate, allFieldLabels, scale, onScaleChange, onFitToScreen, snapToGrid, onSnapToggle, pdfWidth, pdfHeight }: RightPanelProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<ColorTarget>('main');
  const [pickerInitialPos, setPickerInitialPos] = useState({ x: 0, y: 0 });
  const [hexInput, setHexInput] = useState('');
  const [hexFocused, setHexFocused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedEffect, setSelectedEffect] = useState<EffectType>('none');
  const [labelDraft, setLabelDraft] = useState(selectedField?.label ?? '');
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Font picker state
  const [googleFonts, setGoogleFonts] = useState<GoogleFont[]>(SYSTEM_FONTS);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontSearch, setFontSearch] = useState('');
  const fontSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Fetch all available Google Fonts from our server-side proxy
  useEffect(() => {
    fetch('/api/fonts')
      .then((r) => r.ok ? r.json() : null)
      .then((data: { fonts: GoogleFont[]; source: string } | null) => {
        if (data?.fonts?.length) setGoogleFonts(data.fonts);
      })
      .catch(() => { /* fall back to SYSTEM_FONTS already set */ });
  }, []);

  // Focus search input when picker opens
  useEffect(() => {
    if (fontPickerOpen) setTimeout(() => fontSearchRef.current?.focus(), 50);
    else setFontSearch('');
  }, [fontPickerOpen]);

  // Inject Google Fonts stylesheet for a given font family.
  // Builds the weight list from the font's actual variants so we don't request
  // weights the font doesn't support. Falls back to common weights if unknown.
  const loadFont = useCallback((family: string, font?: GoogleFont) => {
    const id = `gf-${family.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;

    // Derive numeric weights from the variants list
    const weights = font?.variants
      ? [...new Set(
          font.variants
            .map((v) => v === 'regular' ? '400' : v === 'italic' ? null : v.replace('italic', ''))
            .filter(Boolean) as string[]
        )].sort((a, b) => Number(a) - Number(b))
      : ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

    // Check if font has italic variants
    const hasItalic = font?.variants?.some((v) => v.includes('italic'));
    const wghtRange = weights.join(';');
    const italRange = hasItalic ? `;0,${wghtRange};1,${wghtRange}` : `:wght@${wghtRange}`;
    const familyParam = hasItalic
      ? `${encodeURIComponent(family)}:ital,wght@${italRange}`
      : `${encodeURIComponent(family)}:wght@${wghtRange}`;

    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
    document.head.appendChild(link);
  }, []);

  // Auto-load the currently selected field's font (pass font object for smart weight loading)
  useEffect(() => {
    if (selectedField?.fontFamily) {
      const font = googleFonts.find((f) => f.family === selectedField.fontFamily);
      loadFont(selectedField.fontFamily, font);
    }
  }, [selectedField?.fontFamily, googleFonts, loadFont]);

  // Sync label draft when a different field is selected
  useEffect(() => {
    if (!labelInputRef.current?.matches(':focus')) {
      setLabelDraft(selectedField?.label ?? '');
    }
  }, [selectedField?.id, selectedField?.label]);

  // Filtered + grouped fonts for the picker
  const filteredFonts = useMemo(() => {
    const q = fontSearch.trim().toLowerCase();
    const list = q ? googleFonts.filter((f) => f.family.toLowerCase().includes(q)) : googleFonts.slice(0, 200);
    const grouped: Record<string, GoogleFont[]> = {};
    for (const f of list) {
      const cat = f.category ?? 'sans-serif';
      (grouped[cat] ??= []).push(f);
    }
    return grouped;
  }, [googleFonts, fontSearch]);

  // Load menu preview fonts (tiny files) for visible fonts so their names
  // render in their own typeface inside the picker
  useEffect(() => {
    if (!fontPickerOpen) return;
    const visible = Object.values(filteredFonts).flat().slice(0, 50);
    for (const font of visible) {
      if (!font.menu) continue;
      const id = `gf-menu-${font.family.replace(/\s+/g, '-')}`;
      if (document.getElementById(id)) continue;
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `@font-face { font-family: '${font.family}'; src: url('${font.menu}'); }`;
      document.head.appendChild(style);
    }
  }, [fontPickerOpen, filteredFonts]);

  // Available weights for the currently selected font
  const availableWeights = useMemo(() => {
    if (!selectedField?.fontFamily) return FONT_WEIGHTS;
    const font = googleFonts.find((f) => f.family === selectedField.fontFamily);
    if (!font) return FONT_WEIGHTS;
    const weightSet = new Set(
      font.variants
        .map((v) => v === 'regular' ? '400' : v === 'italic' ? null : v.replace('italic', ''))
        .filter(Boolean)
    );
    return FONT_WEIGHTS.filter((w) => weightSet.has(w.value));
  }, [googleFonts, selectedField?.fontFamily]);

  const pct = Math.round((scale ?? 1) * 100);
  const clampScale = (s: number) => Math.min(8, Math.max(0.05, s));

  // Always-visible canvas controls (zoom + snap + template dims)
  const canvasControls = (
    <>
      <div className="px-4 py-3 border-t border-border/30">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3 select-none">Canvas</p>
        <div className="space-y-3">
          {/* Zoom controls */}
          <div>
            <p className="text-[10px] text-muted-foreground/50 mb-2 select-none">Zoom</p>
            <div className="flex items-center gap-2">
              <button
                className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => onScaleChange?.(clampScale((scale ?? 1) - 0.1))}
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <div className="relative flex-1">
                <select
                  value={ZOOM_STEPS.includes(scale ?? 1) ? (scale ?? 1) : ''}
                  onChange={(e) => e.target.value && onScaleChange?.(parseFloat(e.target.value))}
                  className="w-full h-8 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-xs text-center outline-none cursor-pointer appearance-none"
                  title="Zoom presets"
                >
                  {!ZOOM_STEPS.includes(scale ?? 1) && (
                    <option value="">{pct}%</option>
                  )}
                  {ZOOM_STEPS.map(s => (
                    <option key={s} value={s}>{Math.round(s * 100)}%</option>
                  ))}
                </select>
                <span className="absolute left-0 right-0 top-0 bottom-0 flex items-center justify-center pointer-events-none text-xs font-medium text-foreground/70">
                  {pct}%
                </span>
              </div>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => onScaleChange?.(clampScale((scale ?? 1) + 0.1))}
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={onFitToScreen}
                title="Fit to screen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Snap to grid */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Magnet className="w-3.5 h-3.5 text-muted-foreground/50" />
              <p className="text-xs text-foreground/70 select-none">Snap to Grid</p>
            </div>
            <button
              className="relative rounded-full transition-colors shrink-0"
              style={{ width: '28px', height: '14px', backgroundColor: snapToGrid ? 'var(--primary)' : 'var(--border)' }}
              onClick={onSnapToggle}
            >
              <span className="absolute bg-white rounded-full shadow-sm transition-all"
                style={{ width: '10px', height: '10px', top: '2px', left: snapToGrid ? 'calc(100% - 12px)' : '2px' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Template dimensions */}
      {(pdfWidth || pdfHeight) && (
        <div className="px-4 py-3 border-t border-border/30">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2 select-none">Template</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md h-8 px-2.5 gap-1.5">
              <span className="text-xs text-muted-foreground/60 shrink-0 select-none">W</span>
              <span className="flex-1 text-xs text-foreground">{Math.round(pdfWidth ?? 0)}</span>
              <span className="text-[10px] text-muted-foreground/50 shrink-0">px</span>
            </div>
            <div className="flex items-center bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md h-8 px-2.5 gap-1.5">
              <span className="text-xs text-muted-foreground/60 shrink-0 select-none">H</span>
              <span className="flex-1 text-xs text-foreground">{Math.round(pdfHeight ?? 0)}</span>
              <span className="text-[10px] text-muted-foreground/50 shrink-0">px</span>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!selectedField) {
    return (
      <div className="flex flex-col">
        {canvasControls}
        {/* Tip */}
        <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
          <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center">
            <MousePointer2 className="w-4 h-4 text-muted-foreground/50" />
          </div>
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed max-w-[160px]">
            Click a field on the canvas to edit its properties
          </p>
        </div>
      </div>
    );
  }

  const isDateField = selectedField.type === 'start_date' || selectedField.type === 'end_date';
  const isQRCode = selectedField.type === 'qr_code';
  const isImage = selectedField.type === 'image';
  const typeLabel = TYPE_LABEL[selectedField.type] ?? selectedField.type;
  const opacity = Math.round(selectedField.opacity ?? 100);
  const displayHex = selectedField.color.replace('#', '').toUpperCase();

  const openPicker = (target: ColorTarget, el: HTMLElement) => {
    setPickerTarget(target);
    const rect = el.getBoundingClientRect();
    setPickerInitialPos({ x: Math.max(8, rect.left - 232 - 24), y: Math.max(8, Math.min(window.innerHeight - 360, rect.top - 40)) });
    setShowPicker(true);
  };

  const handlePickerChange = (c: { r: number; g: number; b: number; a: number }) => {
    if (pickerTarget === 'shadow') {
      const prev = selectedField.textShadow ?? { offsetX: 2, offsetY: 2, blur: 4, color: '#000000' };
      onFieldUpdate({ textShadow: { ...prev, color: rgbaToHex(c) } });
    } else if (pickerTarget === 'stroke') {
      onFieldUpdate({ strokeColor: rgbaToHex(c) });
    } else if (pickerTarget === 'gradStart') {
      onFieldUpdate({ gradientStartColor: rgbaToHex(c), gradientStartOpacity: Math.round(c.a * 100) });
    } else if (pickerTarget === 'gradEnd') {
      onFieldUpdate({ gradientEndColor: rgbaToHex(c), gradientEndOpacity: Math.round(c.a * 100) });
    } else {
      onFieldUpdate({ color: rgbaToHex(c), opacity: Math.round(c.a * 100) });
    }
  };

  const commitHex = (raw: string) => {
    const clean = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    if (clean.length === 6) onFieldUpdate({ color: `#${clean}` });
  };

  const selCls = `h-8 text-xs ${INP}`;
  const activeBtn = 'bg-primary/15 text-primary border-primary/30';
  const inactiveBtn = `bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-muted-foreground hover:text-foreground`;
  const btn = (active: boolean) => `h-8 flex items-center justify-center rounded-md border transition-colors ${active ? activeBtn : inactiveBtn}`;

  return (
    <div className="flex flex-col">

      {/* ── Field type + label ── */}
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-2 shrink-0">
        <span className="text-[8px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-1.5 py-0.5 rounded select-none shrink-0">
          {typeLabel}
        </span>
        <input
          ref={labelInputRef}
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => {
            const trimmed = labelDraft.trim() || selectedField.label;
            const others = allFieldLabels ?? [];
            let final = trimmed;
            if (others.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
              const stripped = trimmed.replace(/\s*\(\d+\)$/, '');
              let n = 2;
              while (others.some(l => l.toLowerCase() === `${stripped} (${n})`.toLowerCase())) n++;
              final = `${stripped} (${n})`;
              setLabelDraft(final);
            }
            onFieldUpdate({ label: final });
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className={`flex-1 bg-transparent text-xs font-medium outline-none placeholder:text-muted-foreground min-w-0 ${
            (allFieldLabels ?? []).some(l => l.toLowerCase() === labelDraft.trim().toLowerCase())
              ? 'text-destructive'
              : 'text-foreground'
          }`}
          placeholder="Field label"
        />
      </div>
      {(allFieldLabels ?? []).some(l => l.toLowerCase() === labelDraft.trim().toLowerCase()) && (
        <p className="px-3 pb-1.5 text-[10px] text-destructive/80 leading-none">
          Name already in use — will be auto-renamed on blur
        </p>
      )}

      {/* ── Position ── */}
      <Section label="Position">
        <div className="grid grid-cols-2 gap-2.5">
          <NumBox label="X" value={selectedField.x} onChange={(v) => onFieldUpdate({ x: v })} icon={<MoveHorizontal className="w-3.5 h-3.5" />} />
          <NumBox label="Y" value={selectedField.y} onChange={(v) => onFieldUpdate({ y: v })} icon={<MoveVertical className="w-3.5 h-3.5" />} />
        </div>
      </Section>

      {/* ── Canvas controls (always visible) ── */}
      {canvasControls}

      {/* ── Dimensions ── */}
      <Section label="Dimensions">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <NumBox label="W" value={selectedField.width}
              className="w-full"
              onChange={(v) => {
                if (isImage && selectedField.lockAspectRatio && selectedField.width > 0) {
                  const ratio = selectedField.height / selectedField.width;
                  onFieldUpdate({ width: v, height: Math.round(v * ratio) });
                } else {
                  onFieldUpdate({ width: v });
                }
              }}
              icon={<ArrowLeftRight className="w-3.5 h-3.5" />} />
          </div>
          {isImage && (
            <button
              title={selectedField.lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              onClick={() => onFieldUpdate({ lockAspectRatio: !selectedField.lockAspectRatio })}
              className={`p-2 rounded transition-colors shrink-0 ${selectedField.lockAspectRatio ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
            >
              {selectedField.lockAspectRatio ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <NumBox label="H" value={selectedField.height}
              className="w-full"
              onChange={(v) => {
                if (isImage && selectedField.lockAspectRatio && selectedField.height > 0) {
                  const ratio = selectedField.width / selectedField.height;
                  onFieldUpdate({ width: Math.round(v * ratio), height: v });
                } else {
                  onFieldUpdate({ height: v });
                }
              }}
              icon={<ArrowUpDown className="w-3.5 h-3.5" />} />
          </div>
        </div>
      </Section>

      {/* ── Typography ── */}
      {!isQRCode && !isImage && (
        <Section label="Typography">
          <div className="space-y-3">

            {/* Font family — searchable combobox backed by full Google Fonts library */}
            <Popover open={fontPickerOpen} onOpenChange={(open) => startTransition(() => setFontPickerOpen(open))}>
              <PopoverTrigger asChild>
                <button className={`${selCls} w-full flex items-center justify-between px-3 h-8 text-xs`}>
                  <span style={{ fontFamily: selectedField.fontFamily, fontSize: '13px' }}>
                    {selectedField.fontFamily}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0 ml-1" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 p-0 overflow-hidden"
                align="start"
                side="left"
                sideOffset={4}
              >
                {/* Search */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
                  <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  <input
                    ref={fontSearchRef}
                    value={fontSearch}
                    onChange={(e) => setFontSearch(e.target.value)}
                    placeholder="Search fonts…"
                    className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
                  />
                </div>
                {/* Font list grouped by category */}
                <div className="overflow-y-auto max-h-72">
                  {Object.entries(filteredFonts).map(([cat, fonts]) => (
                    <div key={cat}>
                      <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 sticky top-0 bg-popover border-b border-border/10">
                        {CATEGORY_LABELS[cat] ?? cat}
                      </p>
                      {fonts.map((font) => (
                        <button
                          key={font.family}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${selectedField.fontFamily === font.family ? 'bg-accent/60' : ''}`}
                          onClick={() => {
                            loadFont(font.family, font);
                            onFieldUpdate({ fontFamily: font.family });
                            setFontPickerOpen(false);
                          }}
                        >
                          <span style={{ fontFamily: font.family, fontSize: '13px' }}>{font.family}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {Object.keys(filteredFonts).length === 0 && (
                    <p className="px-3 py-4 text-xs text-muted-foreground/50 text-center">No fonts found</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Font weight + Italic */}
            <div className="flex items-center gap-2">
              <Select value={normalizeFontWeight(selectedField.fontWeight)} onValueChange={(v) => onFieldUpdate({ fontWeight: v as FontWeight })}>
                <SelectTrigger className={`${selCls} flex-1 min-w-0`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableWeights.map((fw) => (
                    <SelectItem key={fw.value} value={fw.value} className="text-xs">{fw.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button title="Italic" className={`${btn(selectedField.fontStyle === 'italic')} w-8 h-8 shrink-0`}
                onClick={() => onFieldUpdate({ fontStyle: selectedField.fontStyle === 'italic' ? 'normal' : 'italic' })}>
                <Italic className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Font size with preset dropdown */}
            <FontSizeBox value={selectedField.fontSize} onChange={(v) => onFieldUpdate({ fontSize: v })} />

            {/* Letter spacing + Line height */}
            <div className="grid grid-cols-2 gap-2.5">
              <NumBox label="Letter Space" value={selectedField.letterSpacing ?? 0}
                onChange={(v) => onFieldUpdate({ letterSpacing: v })} unit="px" step={0.5} />
              <NumBox label="Line Height" value={selectedField.lineHeight ?? 1.2}
                onChange={(v) => onFieldUpdate({ lineHeight: Math.max(0.5, v) })} step={0.1} />
            </div>

            {/* Alignment + Text transform */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground/50 select-none">Alignment</p>
              <div className="flex items-center gap-2">
                {(['left', 'center', 'right'] as const).map((align) => {
                  const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                  return (
                    <button key={align} title={`Align ${align}`} className={`${btn(selectedField.textAlign === align)} flex-1`}
                      onClick={() => onFieldUpdate({ textAlign: align })}>
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground/50 select-none">Transform</p>
              <div className="flex items-center gap-2">
                {([{ v: 'uppercase', l: 'AA' }, { v: 'lowercase', l: 'aa' }, { v: 'capitalize', l: 'Aa' }] as const).map((t) => (
                  <button key={t.v} title={t.v}
                    className={`${btn(selectedField.textTransform === t.v)} flex-1 text-[11px] font-medium`}
                    onClick={() => onFieldUpdate({ textTransform: selectedField.textTransform === t.v ? 'none' : t.v })}>
                    {t.l}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </Section>
      )}

      {/* ── Image Source ── */}
      {isImage && (
        <Section label="Image Source">
          <ImageSourceUploader
            imageUrl={selectedField.imageUrl ?? null}
            onImageChange={(url) => onFieldUpdate({ imageUrl: url ?? undefined })}
          />
        </Section>
      )}

      {/* ── Appearance ── */}
      <Section label="Appearance">
        {isImage ? (
          <div className="grid grid-cols-2 gap-2">
            <NumBox label="Opacity" value={opacity} min={0} max={100} unit="%"
              onChange={(v) => onFieldUpdate({ opacity: v })} />
            <NumBox label="Corner" value={selectedField.cornerRadius ?? 0} min={0} max={500} unit="px"
              onChange={(v) => onFieldUpdate({ cornerRadius: v })} />
          </div>
        ) : isQRCode ? (
          <div className="space-y-2.5">
            {/* QR style dropdown */}
            <div>
              <p className="text-[9px] text-muted-foreground/50 mb-1.5 select-none">Design Style</p>
              <div className={`flex items-center ${INP} overflow-hidden`} style={{ height: '28px' }}>
                <select
                  value={selectedField.qrStyle ?? 'standard'}
                  onChange={(e) => onFieldUpdate({ qrStyle: e.target.value as CertificateField['qrStyle'] })}
                  className="flex-1 min-w-0 bg-transparent text-xs outline-none text-foreground px-2"
                >
                  <option value="standard">Standard (Square)</option>
                  <option value="rounded">Rounded</option>
                  <option value="dots">Dots</option>
                  <option value="classy">Classy</option>
                  <option value="logo">With Logo</option>
                </select>
              </div>
            </div>
            {/* QR color */}
            <div>
              <p className="text-[9px] text-muted-foreground/50 mb-1.5 select-none">Module Color</p>
              <div className={`flex items-stretch ${INP} overflow-hidden`} style={{ height: '30px' }}>
                <button title="Pick colour"
                  className="w-9 shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-white/10 hover:opacity-80 transition-opacity"
                  onClick={(e) => openPicker('main', e.currentTarget)}>
                  <span className="relative w-5 h-5 rounded-[4px] overflow-hidden" style={{ background: CHECKER }}>
                    <span className="absolute inset-0" style={{ backgroundColor: selectedField.color }} />
                  </span>
                </button>
                <span className="text-[10px] text-muted-foreground/50 flex items-center px-1 shrink-0">#</span>
                <input value={hexFocused ? hexInput : displayHex}
                  onFocus={() => { setHexFocused(true); setHexInput(displayHex); }}
                  onBlur={(e) => { setHexFocused(false); commitHex(e.target.value); }}
                  onChange={(e) => setHexInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { commitHex(hexInput); (e.target as HTMLInputElement).blur(); } }}
                  className="flex-1 min-w-0 bg-transparent text-xs font-mono uppercase outline-none"
                  maxLength={6} spellCheck={false} placeholder="000000" />
              </div>
            </div>
            {/* Transparent background */}
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-muted-foreground/50 select-none">Transparent Background</p>
              <button
                className="relative rounded-full transition-colors shrink-0"
                style={{ width: '28px', height: '14px', backgroundColor: selectedField.qrTransparentBg ? 'var(--primary)' : 'var(--border)' }}
                onClick={() => onFieldUpdate({ qrTransparentBg: !selectedField.qrTransparentBg })}
              >
                <span className="absolute bg-white rounded-full shadow-sm transition-all"
                  style={{ width: '10px', height: '10px', top: '2px', left: selectedField.qrTransparentBg ? 'calc(100% - 12px)' : '2px' }} />
              </button>
            </div>
            {/* Logo upload (logo style only) */}
            {selectedField.qrStyle === 'logo' && (
              <QRLogoUploader
                logoUrl={selectedField.qrLogoUrl ?? null}
                onLogoChange={(url) => onFieldUpdate({ qrLogoUrl: url ?? undefined })}
              />
            )}
            {/* Opacity */}
            <NumBox label="Opacity" value={opacity} min={0} max={100} unit="%" onChange={(v) => onFieldUpdate({ opacity: v })} />
          </div>
        ) : (
          <div className="space-y-2.5">

            {/* Fill mode tabs */}
            <div>
              <p className="text-[9px] text-muted-foreground/50 mb-1.5 select-none">Fill</p>
              <div className="flex items-center gap-1">
                {(['solid', 'linear', 'radial'] as const).map((mode) => (
                  <button key={mode}
                    className={`${btn((selectedField.colorMode ?? 'solid') === mode)} flex-1 text-[9px] capitalize`}
                    onClick={() => onFieldUpdate({ colorMode: mode })}>
                    {mode === 'solid' ? 'Solid' : mode === 'linear' ? 'Linear' : 'Radial'}
                  </button>
                ))}
              </div>
            </div>

            {/* Solid color */}
            {(selectedField.colorMode ?? 'solid') === 'solid' && (
              <div className={`flex items-stretch ${INP} overflow-hidden`} style={{ height: '30px' }}>
                <button title="Pick colour"
                  className="w-9 shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-white/10 hover:opacity-80 transition-opacity"
                  onClick={(e) => openPicker('main', e.currentTarget)}>
                  <span className="relative w-5 h-5 rounded-[4px] overflow-hidden" style={{ background: CHECKER }}>
                    <span className="absolute inset-0" style={{ backgroundColor: selectedField.color, opacity: opacity / 100 }} />
                  </span>
                </button>
                <span className="text-[10px] text-muted-foreground/50 flex items-center px-1 shrink-0">#</span>
                <input value={hexFocused ? hexInput : displayHex}
                  onFocus={() => { setHexFocused(true); setHexInput(displayHex); }}
                  onBlur={(e) => { setHexFocused(false); commitHex(e.target.value); }}
                  onChange={(e) => setHexInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { commitHex(hexInput); (e.target as HTMLInputElement).blur(); } }}
                  className="flex-1 min-w-0 bg-transparent text-xs font-mono uppercase outline-none"
                  maxLength={6} spellCheck={false} placeholder="000000" />
                <span className="w-px bg-gray-200 dark:bg-white/10 shrink-0 my-1" />
                <input type="number" min={0} max={100} value={opacity}
                  onChange={(e) => onFieldUpdate({ opacity: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                  className="w-7 bg-transparent text-xs text-right outline-none" />
                <span className="text-[10px] text-muted-foreground/50 flex items-center pr-1.5 shrink-0">%</span>
              </div>
            )}

            {/* Gradient controls */}
            {(selectedField.colorMode === 'linear' || selectedField.colorMode === 'radial') && (
              <div className="space-y-2">
                {/* Preview bar */}
                <div className="h-4 rounded w-full border border-gray-200 dark:border-white/10"
                  style={{
                    background: selectedField.colorMode === 'linear'
                      ? `linear-gradient(${selectedField.gradientAngle ?? 90}deg, ${selectedField.gradientStartColor ?? selectedField.color}, ${selectedField.gradientEndColor ?? '#ffffff'})`
                      : `radial-gradient(circle, ${selectedField.gradientStartColor ?? selectedField.color}, ${selectedField.gradientEndColor ?? '#ffffff'})`
                  }} />

                {/* Single row: [dial?] start-swatch opacity% → end-swatch opacity% */}
                <div className="flex items-center gap-2">
                  {selectedField.colorMode === 'linear' && (
                    <GradientAngleDial
                      angle={selectedField.gradientAngle ?? 90}
                      onChange={(v) => onFieldUpdate({ gradientAngle: v })}
                    />
                  )}
                  {/* Start stop */}
                  <button className="relative w-6 h-6 shrink-0 rounded border border-gray-200 dark:border-white/10 overflow-hidden hover:border-primary/50"
                    style={{ background: CHECKER }} onClick={(e) => openPicker('gradStart', e.currentTarget)}>
                    <span className="absolute inset-0" style={{ backgroundColor: selectedField.gradientStartColor ?? selectedField.color, opacity: (selectedField.gradientStartOpacity ?? 100) / 100 }} />
                  </button>
                  <input type="number" min={0} max={100} value={selectedField.gradientStartOpacity ?? 100}
                    onChange={(e) => onFieldUpdate({ gradientStartOpacity: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                    className={`w-8 h-6 ${INP} text-[10px] text-center px-0.5`} />
                  <span className="text-[9px] text-muted-foreground/40 shrink-0">%</span>
                  <span className="text-muted-foreground/30 text-xs shrink-0">→</span>
                  {/* End stop */}
                  <button className="relative w-6 h-6 shrink-0 rounded border border-gray-200 dark:border-white/10 overflow-hidden hover:border-primary/50"
                    style={{ background: CHECKER }} onClick={(e) => openPicker('gradEnd', e.currentTarget)}>
                    <span className="absolute inset-0" style={{ backgroundColor: selectedField.gradientEndColor ?? '#ffffff', opacity: (selectedField.gradientEndOpacity ?? 100) / 100 }} />
                  </button>
                  <input type="number" min={0} max={100} value={selectedField.gradientEndOpacity ?? 100}
                    onChange={(e) => onFieldUpdate({ gradientEndOpacity: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                    className={`w-8 h-6 ${INP} text-[10px] text-center px-0.5`} />
                  <span className="text-[9px] text-muted-foreground/40 shrink-0">%</span>
                </div>

                {/* Overall opacity */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/60 flex-1 select-none">Opacity</span>
                  <input type="number" min={0} max={100} value={opacity}
                    onChange={(e) => onFieldUpdate({ opacity: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                    className={`w-10 h-6 ${INP} text-xs text-right px-1`} />
                  <span className="text-[9px] text-muted-foreground/50 shrink-0">%</span>
                </div>
              </div>
            )}

            {/* Text shadow */}
            <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] text-muted-foreground/50 select-none">Text Shadow</p>
                  <button
                    className="relative rounded-full transition-colors shrink-0"
                    style={{ width: '28px', height: '14px', backgroundColor: selectedField.textShadow ? 'var(--primary)' : 'var(--border)' }}
                    onClick={() => onFieldUpdate({ textShadow: selectedField.textShadow ? null : { offsetX: 2, offsetY: 2, blur: 4, color: '#000000' } })}
                  >
                    <span className="absolute bg-white rounded-full shadow-sm transition-all"
                      style={{ width: '10px', height: '10px', top: '2px', left: selectedField.textShadow ? 'calc(100% - 12px)' : '2px' }} />
                  </button>
                </div>
                {selectedField.textShadow && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <NumBox label="X" value={selectedField.textShadow.offsetX}
                        onChange={(v) => onFieldUpdate({ textShadow: { ...selectedField.textShadow!, offsetX: v } })} unit="px" />
                      <NumBox label="Y" value={selectedField.textShadow.offsetY}
                        onChange={(v) => onFieldUpdate({ textShadow: { ...selectedField.textShadow!, offsetY: v } })} unit="px" />
                      <NumBox label="Blur" value={selectedField.textShadow.blur} min={0}
                        onChange={(v) => onFieldUpdate({ textShadow: { ...selectedField.textShadow!, blur: Math.max(0, v) } })} unit="px" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="relative w-7 h-7 shrink-0 rounded border border-gray-200 dark:border-white/10 overflow-hidden hover:border-primary/50"
                        style={{ background: CHECKER }} onClick={(e) => openPicker('shadow', e.currentTarget)}>
                        <span className="absolute inset-0" style={{ backgroundColor: selectedField.textShadow.color }} />
                      </button>
                      <span className="text-xs text-muted-foreground">Shadow color</span>
                    </div>
                  </div>
                )}
              </div>

          </div>
        )}
      </Section>

      {/* ── Stroke (image fields only) ── */}
      {isImage && (
        <Section label="Stroke">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-muted-foreground/50 select-none">Stroke</p>
              <button
                className="relative rounded-full transition-colors shrink-0"
                style={{ width: '28px', height: '14px', backgroundColor: selectedField.strokeWidth ? 'var(--primary)' : 'var(--border)' }}
                onClick={() => onFieldUpdate({ strokeWidth: selectedField.strokeWidth ? 0 : 2, strokeColor: selectedField.strokeColor || '#000000', strokePosition: selectedField.strokePosition || 'center' })}
              >
                <span className="absolute bg-white rounded-full shadow-sm transition-all"
                  style={{ width: '10px', height: '10px', top: '2px', left: selectedField.strokeWidth ? 'calc(100% - 12px)' : '2px' }} />
              </button>
            </div>
            {!!selectedField.strokeWidth && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <NumBox label="Weight" value={selectedField.strokeWidth ?? 2} min={0} max={50}
                    onChange={(v) => onFieldUpdate({ strokeWidth: v })} unit="px" />
                  {/* Color swatch inline */}
                  <button
                    className="flex items-center gap-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded h-7 px-2 hover:opacity-80 transition-opacity"
                    onClick={(e) => openPicker('stroke', e.currentTarget)}
                  >
                    <span className="relative w-4 h-4 rounded-[3px] overflow-hidden shrink-0" style={{ background: CHECKER }}>
                      <span className="absolute inset-0" style={{ backgroundColor: selectedField.strokeColor || '#000000' }} />
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono uppercase">{(selectedField.strokeColor || '#000000').replace('#','')}</span>
                  </button>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground/50 mb-1.5 select-none">Position</p>
                  <div className="flex items-center gap-1.5">
                    {(['inside', 'center', 'outside'] as const).map((pos) => (
                      <button key={pos}
                        className={`${btn(selectedField.strokePosition === pos)} flex-1 text-[10px] capitalize`}
                        onClick={() => onFieldUpdate({ strokePosition: pos })}>
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Effects (image fields only) ── */}
      {isImage && (
        <Section label="Effects">
          <div className="space-y-3">
            {/* Effect type selector */}
            <div className={`flex items-center ${INP} overflow-hidden`} style={{ height: '28px' }}>
              <span className="text-[10px] text-muted-foreground/60 shrink-0 select-none px-2">Effect</span>
              <select
                value={selectedEffect}
                onChange={(e) => {
                  const next = e.target.value as EffectType;
                  setSelectedEffect(next);
                  // Auto-enable the effect with defaults when switching to it
                  if (next === 'drop_shadow' && !selectedField.dropShadow) {
                    onFieldUpdate({ dropShadow: { offsetX: 4, offsetY: 4, blur: 8, spread: 0, color: '#00000066' } });
                  }
                }}
                className="flex-1 min-w-0 bg-transparent text-xs outline-none text-foreground pr-1"
              >
                <option value="none">None</option>
                <option value="drop_shadow">Drop Shadow</option>
                <option value="layer_blur">Layer Blur</option>
                <option value="background_blur">Background Blur</option>
              </select>
            </div>

            {/* Drop Shadow options */}
            {selectedEffect === 'drop_shadow' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-muted-foreground/50 select-none">Drop Shadow</p>
                  <button
                    className="relative rounded-full transition-colors"
                    style={{ width: '28px', height: '14px', backgroundColor: selectedField.dropShadow ? 'var(--primary)' : 'var(--border)' }}
                    onClick={() => onFieldUpdate({ dropShadow: selectedField.dropShadow ? null : { offsetX: 4, offsetY: 4, blur: 8, spread: 0, color: '#00000066' } })}
                  >
                    <span className="absolute bg-white rounded-full shadow-sm transition-all"
                      style={{ width: '10px', height: '10px', top: '2px', left: selectedField.dropShadow ? 'calc(100% - 12px)' : '2px' }} />
                  </button>
                </div>
                {selectedField.dropShadow && (
                  <div className="grid grid-cols-2 gap-2">
                    <NumBox label="X" value={selectedField.dropShadow.offsetX} unit="px"
                      onChange={(v) => onFieldUpdate({ dropShadow: { ...selectedField.dropShadow!, offsetX: v } })} />
                    <NumBox label="Y" value={selectedField.dropShadow.offsetY} unit="px"
                      onChange={(v) => onFieldUpdate({ dropShadow: { ...selectedField.dropShadow!, offsetY: v } })} />
                    <NumBox label="Blur" value={selectedField.dropShadow.blur} min={0} unit="px"
                      onChange={(v) => onFieldUpdate({ dropShadow: { ...selectedField.dropShadow!, blur: v } })} />
                    <NumBox label="Spread" value={selectedField.dropShadow.spread} unit="px"
                      onChange={(v) => onFieldUpdate({ dropShadow: { ...selectedField.dropShadow!, spread: v } })} />
                  </div>
                )}
              </div>
            )}

            {/* Layer Blur options */}
            {selectedEffect === 'layer_blur' && (
              <div className="flex items-center gap-2">
                <p className="text-[9px] text-muted-foreground/50 select-none flex-1">Blur</p>
                <NumBox label="" value={selectedField.layerBlur ?? 0} min={0} max={100} unit="px" className="w-24"
                  onChange={(v) => onFieldUpdate({ layerBlur: v })} />
              </div>
            )}

            {/* Background Blur options */}
            {selectedEffect === 'background_blur' && (
              <div className="flex items-center gap-2">
                <p className="text-[9px] text-muted-foreground/50 select-none flex-1">Blur</p>
                <NumBox label="" value={selectedField.backgroundBlur ?? 0} min={0} max={100} unit="px" className="w-24"
                  onChange={(v) => onFieldUpdate({ backgroundBlur: v })} />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Content ── */}
      <Section label="Content">
        <div className="space-y-2">
          {isDateField && (
            <Select
              value={selectedField.dateFormat || 'MMMM dd, yyyy'}
              onValueChange={(v) => {
                const fmt = DATE_FORMATS.find(f => f.value === v);
                onFieldUpdate({ dateFormat: v, sampleValue: fmt?.example ?? v });
              }}
            >
              <SelectTrigger className={`${selCls} w-full`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((fmt) => (
                  <SelectItem key={fmt.value} value={fmt.value} className="text-xs">
                    {fmt.label} <span className="text-muted-foreground ml-1">({fmt.example})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className={`flex items-center gap-2 ${INP} h-7 px-2`}>
            <span className="text-[10px] text-muted-foreground/60 shrink-0 select-none">Sample</span>
            <input value={selectedField.sampleValue || ''} onChange={(e) => onFieldUpdate({ sampleValue: e.target.value })}
              className="flex-1 min-w-0 bg-transparent text-xs font-mono outline-none" placeholder={selectedField.label} />
          </div>
          {!isQRCode && (
            <div className="grid grid-cols-2 gap-2">
              {(['prefix', 'suffix'] as const).map((key) => (
                <div key={key} className={`flex items-center gap-1 ${INP} h-7 px-2`}>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0 select-none">{key === 'prefix' ? 'Pre' : 'Suf'}</span>
                  <input value={selectedField[key] || ''} onChange={(e) => onFieldUpdate({ [key]: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-xs outline-none" placeholder={key === 'prefix' ? 'Prefix' : 'Suffix'} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <div className="h-6 shrink-0" />

      {/* ── Floating colour picker ── */}
      {mounted && showPicker && createPortal(
        <FloatingColorPicker
          color={
            pickerTarget === 'shadow'
              ? hexToRgba(selectedField.textShadow?.color ?? '#000000', 100)
              : pickerTarget === 'stroke'
              ? hexToRgba(selectedField.strokeColor ?? '#000000', 100)
              : pickerTarget === 'gradStart'
              ? hexToRgba(selectedField.gradientStartColor ?? selectedField.color, selectedField.gradientStartOpacity ?? 100)
              : pickerTarget === 'gradEnd'
              ? hexToRgba(selectedField.gradientEndColor ?? '#ffffff', selectedField.gradientEndOpacity ?? 100)
              : hexToRgba(selectedField.color, opacity)
          }
          label={
            pickerTarget === 'shadow' ? 'Shadow Color'
            : pickerTarget === 'stroke' ? 'Stroke Color'
            : pickerTarget === 'gradStart' ? 'Start Color'
            : pickerTarget === 'gradEnd' ? 'End Color'
            : 'Color'
          }
          initialPos={pickerInitialPos}
          onClose={() => setShowPicker(false)}
          onChange={handlePickerChange}
        />,
        document.body
      )}
    </div>
  );
}
