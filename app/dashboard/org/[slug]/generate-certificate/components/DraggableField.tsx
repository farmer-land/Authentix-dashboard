import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { CertificateField } from '@/lib/types/certificate';
import QRCodeLib from 'qrcode';

// ── Real QR code preview using qrcode package ────────────────────────────────

type QRStyle = 'standard' | 'rounded' | 'dots' | 'classy' | 'logo';

// Determine if a module index is inside one of the three finder patterns
function isFinderModule(row: number, col: number, size: number): boolean {
  // top-left: rows 0-6, cols 0-6
  if (row <= 6 && col <= 6) return true;
  // top-right: rows 0-6, cols size-7 to size-1
  if (row <= 6 && col >= size - 7) return true;
  // bottom-left: rows size-7 to size-1, cols 0-6
  if (row >= size - 7 && col <= 6) return true;
  return false;
}

function QRCodePreview({
  style, color, transparent, logoUrl,
}: {
  style: QRStyle;
  color: string;
  transparent: boolean;
  logoUrl: string | null;
}) {
  const [modules, setModules] = useState<{ data: Uint8Array; size: number } | null>(null);

  useEffect(() => {
    try {
      // `create` is a public export not reflected in @types/qrcode
      const qr = (QRCodeLib as any).create('https://authentix.app/verify/sample', {
        errorCorrectionLevel: style === 'logo' ? 'H' : 'M',
      });
      setModules({ data: qr.modules.data as Uint8Array, size: qr.modules.size as number });
    } catch {
      // fallback: no render
    }
  }, [style]);

  if (!modules) {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <rect x="0" y="0" width="100" height="100" fill={transparent ? 'transparent' : 'white'} />
      </svg>
    );
  }

  const { data, size } = modules;
  const pad = 2; // quiet zone in "units"
  const viewSize = size + pad * 2;
  const bg = transparent ? 'transparent' : 'white';
  const finderBg = transparent ? 'white' : bg;

  // Logo area bounds (centre 30% of QR)
  const logoRegionStart = Math.floor(size * 0.35);
  const logoRegionEnd = Math.ceil(size * 0.65);
  const isInLogoRegion = (r: number, c: number) =>
    r >= logoRegionStart && r <= logoRegionEnd && c >= logoRegionStart && c <= logoRegionEnd;

  const elements: React.ReactNode[] = [];

  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    const row = Math.floor(i / size);
    const col = i % size;
    const x = col + pad;
    const y = row + pad;
    const isFinder = isFinderModule(row, col, size);
    const skipForLogo = style === 'logo' && isInLogoRegion(row, col);
    if (skipForLogo && !isFinder) continue;

    if (style === 'dots' && !isFinder) {
      elements.push(<circle key={i} cx={x + 0.5} cy={y + 0.5} r="0.42" fill={color} />);
    } else if ((style === 'rounded' || style === 'classy') && !isFinder) {
      elements.push(<rect key={i} x={x + 0.08} y={y + 0.08} width="0.84" height="0.84" rx="0.25" fill={color} />);
    } else if (isFinder && (style === 'rounded' || style === 'classy')) {
      // Finder modules rendered separately below — skip here
    } else {
      elements.push(<rect key={i} x={x} y={y} width="1" height="1" fill={color} />);
    }
  }

  const outerRx = style === 'rounded' || style === 'classy' ? 1.2 : 0;
  const styledFinder = (fx: number, fy: number) => {
    const gx = fx + pad;
    const gy = fy + pad;
    return (
      <g key={`f-${fx}-${fy}`}>
        <rect x={gx} y={gy} width="7" height="7" rx={outerRx} fill={color} />
        <rect x={gx + 1} y={gy + 1} width="5" height="5" rx={outerRx * 0.5} fill={finderBg} />
        <rect x={gx + 2} y={gy + 2} width="3" height="3" rx={outerRx * 0.4} fill={color} />
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      className="w-full h-full"
      style={{ maxWidth: '100%', maxHeight: '100%' }}
    >
      <rect x="0" y="0" width={viewSize} height={viewSize} fill={bg} />
      {elements}
      {/* Styled finders for rounded/classy (drawn on top) */}
      {(style === 'rounded' || style === 'classy') && (
        <>
          {styledFinder(0, 0)}
          {styledFinder(size - 7, 0)}
          {styledFinder(0, size - 7)}
        </>
      )}
      {/* Logo centre overlay */}
      {style === 'logo' && (
        <>
          <rect
            x={logoRegionStart + pad - 0.5}
            y={logoRegionStart + pad - 0.5}
            width={logoRegionEnd - logoRegionStart + 1}
            height={logoRegionEnd - logoRegionStart + 1}
            fill="white"
            rx="1"
          />
          {logoUrl ? (
            <image
              href={logoUrl}
              x={logoRegionStart + pad}
              y={logoRegionStart + pad}
              width={logoRegionEnd - logoRegionStart}
              height={logoRegionEnd - logoRegionStart}
              preserveAspectRatio="xMidYMid meet"
            />
          ) : (
            <text
              x={(logoRegionStart + logoRegionEnd) / 2 + pad}
              y={(logoRegionStart + logoRegionEnd) / 2 + pad + 1}
              textAnchor="middle"
              fontSize="2.5"
              fill={color}
              fontFamily="sans-serif"
            >
              Logo
            </text>
          )}
        </>
      )}
    </svg>
  );
}

interface DraggableFieldProps {
  field: CertificateField;
  scale: number;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onDrag: (deltaX: number, deltaY: number) => void;
  onDragStart?: () => void;
  onResize: (width: number, height: number, initialCanvasWidth: number, initialFontSize: number) => void;
  onSelect: (e: React.MouseEvent) => void;
}

export function DraggableField({
  field,
  scale,
  isSelected,
  isMultiSelected = false,
  onDrag,
  onDragStart,
  onResize,
  onSelect,
}: DraggableFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  // Refs for coordinates — synchronous updates prevent stale reads between mousemove events.
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialDimsRef = useRef({ width: 0, height: 0 });
  // Canvas-unit field dimensions captured at the start of a resize gesture
  const initialFieldRef = useRef({ width: 0, fontSize: 0 });

  // Keep latest callbacks in refs so the mousemove/mouseup effect below never needs
  // to be re-registered just because the parent re-rendered with new function references.
  // Without this, every onFieldUpdate call (which happens on each drag tick) causes the
  // parent to re-render → new onDrag/onResize references → effect cleanup → brief gap
  // with no listeners → lost mousemove events → sticky/jittery drag.
  const onDragRef = useRef(onDrag);
  const onResizeRef = useRef(onResize);
  useLayoutEffect(() => { onDragRef.current = onDrag; }, [onDrag]);
  useLayoutEffect(() => { onResizeRef.current = onResize; }, [onResize]);

  // rAF handle — throttles state updates to one per animation frame to prevent jitter
  const rafRef = useRef<number>(0);

  // Calculate scaled dimensions
  const scaledX = field.x * scale;
  const scaledY = field.y * scale;
  const scaledWidth = field.width * scale;
  const scaledHeight = field.height * scale;
  const scaledFontSize = field.fontSize * scale;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => onDragRef.current(deltaX, deltaY));
      } else if (isResizing) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        const newWidth = initialDimsRef.current.width + deltaX;
        const newHeight = initialDimsRef.current.height + deltaY;
        if (newWidth > 20 && newHeight > 20) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() =>
            onResizeRef.current(newWidth, newHeight, initialFieldRef.current.width, initialFieldRef.current.fontSize)
          );
        }
      }
    };

    const handleMouseUp = () => {
      cancelAnimationFrame(rafRef.current);
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  // Intentionally omits onDrag/onResize — latest versions are accessed via refs above.
  }, [isDragging, isResizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(e);
    if (field.locked) return;
    onDragStart?.();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (field.locked) return;
    e.stopPropagation();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialDimsRef.current = { width: scaledWidth, height: scaledHeight };
    initialFieldRef.current = { width: field.width, fontSize: field.fontSize };
    setIsResizing(true);
  };

  // Use explicit sampleValue, then fall back to type-default (so renaming a field
  // doesn't accidentally replace "John Doe" with the new label name)
  const TYPE_SAMPLE_DEFAULTS: Record<string, string> = {
    name: 'John Doe', course: 'Web Development Fundamentals',
    start_date: 'January 15, 2026', end_date: 'March 15, 2026', custom_text: 'Custom Value',
  };
  const displayValue = field.sampleValue || TYPE_SAMPLE_DEFAULTS[field.type] || field.label;

  // Gradient / shadow styles for text content
  const isGradient = field.colorMode === 'linear' || field.colorMode === 'radial';
  const gradientBg = isGradient
    ? field.colorMode === 'linear'
      ? `linear-gradient(${field.gradientAngle ?? 90}deg, ${field.gradientStartColor ?? field.color}, ${field.gradientEndColor ?? '#ffffff'})`
      : `radial-gradient(circle, ${field.gradientStartColor ?? field.color}, ${field.gradientEndColor ?? '#ffffff'})`
    : undefined;
  // Base text styles (no clip properties — those live in .gradient-clip-text CSS class)
  const textContentStyle: React.CSSProperties = {
    lineHeight: field.lineHeight ?? 1.2,
    letterSpacing: field.letterSpacing ? `${field.letterSpacing * scale}px` : undefined,
    opacity: (field.opacity ?? 100) / 100,
    textTransform: (field.textTransform ?? 'none') as React.CSSProperties['textTransform'],
    textDecoration: field.textDecoration && field.textDecoration !== 'none' ? field.textDecoration : undefined,
    textShadow: field.textShadow
      ? `${field.textShadow.offsetX}px ${field.textShadow.offsetY}px ${field.textShadow.blur}px ${field.textShadow.color}`
      : undefined,
    // Only set the gradient background here; clipping is forced by .gradient-clip-text class
    ...(isGradient ? { background: gradientBg } : {}),
  };

  return (
    <div
      ref={fieldRef}
      className={`
        absolute pointer-events-auto group
        ${isSelected ? 'z-50' : 'z-10'}
        ${field.locked ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      `}
      style={{
        left: scaledX,
        top: scaledY,
        width: scaledWidth,
        height: scaledHeight,
        ...(field.type !== 'image' ? {
          fontSize: scaledFontSize,
          fontFamily: field.fontFamily,
          color: field.color,
          fontWeight: field.fontWeight,
          fontStyle: field.fontStyle,
          textAlign: field.textAlign,
          padding: '4px 8px',
          backgroundColor: field.backgroundColor || undefined,
        } : {}),
        display: 'flex',
        alignItems: 'center',
        justifyContent: field.type === 'image' ? 'center' : (field.textAlign === 'center' ? 'center' : field.textAlign === 'right' ? 'flex-end' : 'flex-start'),
        outline: isSelected
          ? '1.5px dashed var(--primary)'
          : isMultiSelected
          ? '2px solid var(--primary)'
          : undefined,
        outlineOffset: (isSelected || isMultiSelected) ? '1px' : '0px',
        borderRadius: field.type === 'image' ? (field.cornerRadius ? `${field.cornerRadius}px` : '2px') : '2px',
        opacity: field.locked ? 0.75 : 1,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
    >

      {/* Field Content */}
      {field.type === 'qr_code' ? (
        <div className="w-full h-full flex items-center justify-center p-1" style={{ opacity: (field.opacity ?? 100) / 100 }}>
          <QRCodePreview
            style={field.qrStyle ?? 'standard'}
            color={field.color ?? '#000000'}
            transparent={field.qrTransparentBg ?? false}
            logoUrl={field.qrStyle === 'logo' ? (field.qrLogoUrl ?? null) : null}
          />
        </div>
      ) : field.type === 'image' ? (
        <div className="w-full h-full overflow-hidden" style={{ opacity: (field.opacity ?? 100) / 100, borderRadius: field.cornerRadius ? `${field.cornerRadius}px` : undefined }}>
          {field.imageUrl ? (
            <img src={field.imageUrl} alt={field.label} className="w-full h-full object-contain" draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted/30 text-muted-foreground/40">
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </div>
          )}
        </div>
      ) : (
        <div
          className={isGradient ? 'gradient-clip-text w-full select-none' : 'truncate w-full select-none'}
          style={textContentStyle}
        >
          {field.prefix}{displayValue}{field.suffix}
        </div>
      )}

      {/* Resize Handles (when selected) — larger hit area via padding trick */}
      {isSelected && (
        <div
          className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
          style={{ borderColor: 'var(--primary)' }}
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );
}
