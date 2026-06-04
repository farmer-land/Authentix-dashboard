import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { CertificateField } from '@/lib/types/certificate';
import QRCodeLib from 'qrcode';

// ── Real QR code preview using qrcode package ────────────────────────────────

type QRStyle = 'standard' | 'rounded' | 'dots' | 'classy' | 'extra-rounded' | 'classy-rounded' | 'logo';

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

type ResizeHandle = 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w';

interface DraggableFieldProps {
  field: CertificateField;
  scale: number;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onDrag: (deltaX: number, deltaY: number) => void;
  onDragStart?: () => void;
  /**
   * width/height are in screen pixels; InfiniteCanvas converts to canvas units.
   * newCanvasX/newCanvasY are already in canvas units (for left/top-edge handles that shift position).
   */
  onResize: (width: number, height: number, initialCanvasWidth: number, initialFontSize: number, newCanvasX?: number, newCanvasY?: number) => void;
  onRotate?: (rotation: number) => void;
  onSelect: (e: React.MouseEvent) => void;
  /** Live value from row 1 of imported data — overrides sampleValue when present */
  previewValue?: string;
}

export function DraggableField({
  field,
  scale,
  isSelected,
  isMultiSelected = false,
  onDrag,
  onDragStart,
  onResize,
  onRotate,
  onSelect,
  previewValue,
}: DraggableFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  // Refs for coordinates — synchronous updates prevent stale reads between mousemove events.
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialDimsRef = useRef({ width: 0, height: 0 });
  // Canvas-unit field dimensions + position captured at the start of a resize/rotate gesture
  const initialFieldRef = useRef({ width: 0, fontSize: 0, x: 0, y: 0 });
  // Screen-coord center of field at rotation start; initial cursor angle
  const fieldCenterRef = useRef({ x: 0, y: 0 });
  const initialRotationRef = useRef(0);
  const initialAngleRef = useRef(0);

  // Keep latest callbacks in refs so the mousemove/mouseup effect below never needs
  // to be re-registered just because the parent re-rendered with new function references.
  // Without this, every onFieldUpdate call (which happens on each drag tick) causes the
  // parent to re-render → new onDrag/onResize references → effect cleanup → brief gap
  // with no listeners → lost mousemove events → sticky/jittery drag.
  const onDragRef = useRef(onDrag);
  const onResizeRef = useRef(onResize);
  const onRotateRef = useRef(onRotate);
  useLayoutEffect(() => { onDragRef.current = onDrag; }, [onDrag]);
  useLayoutEffect(() => { onResizeRef.current = onResize; }, [onResize]);
  useLayoutEffect(() => { onRotateRef.current = onRotate; }, [onRotate]);

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
      } else if (resizeHandle) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        const iw = initialDimsRef.current.width;
        const ih = initialDimsRef.current.height;
        const ix = initialFieldRef.current.x;
        const iy = initialFieldRef.current.y;

        let newWidth: number;
        let newHeight: number;
        // Canvas-unit position — only set when the left or top edge moves
        let newCanvasX: number | undefined;
        let newCanvasY: number | undefined;

        switch (resizeHandle) {
          case 'se': newWidth = iw + deltaX; newHeight = ih + deltaY; break;
          case 'sw': newWidth = iw - deltaX; newHeight = ih + deltaY; newCanvasX = ix + deltaX / scale; break;
          case 'ne': newWidth = iw + deltaX; newHeight = ih - deltaY; newCanvasY = iy + deltaY / scale; break;
          case 'nw': newWidth = iw - deltaX; newHeight = ih - deltaY; newCanvasX = ix + deltaX / scale; newCanvasY = iy + deltaY / scale; break;
          case 'n':  newWidth = iw;          newHeight = ih - deltaY; newCanvasY = iy + deltaY / scale; break;
          case 's':  newWidth = iw;          newHeight = ih + deltaY; break;
          case 'e':  newWidth = iw + deltaX; newHeight = ih;          break;
          case 'w':  newWidth = iw - deltaX; newHeight = ih;          newCanvasX = ix + deltaX / scale; break;
          default: return;
        }

        if (newWidth > 20 && newHeight > 20) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() =>
            onResizeRef.current(newWidth, newHeight, initialFieldRef.current.width, initialFieldRef.current.fontSize, newCanvasX, newCanvasY)
          );
        }
      } else if (isRotating) {
        const dx = e.clientX - fieldCenterRef.current.x;
        const dy = e.clientY - fieldCenterRef.current.y;
        const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        const angleDelta = currentAngle - initialAngleRef.current;
        let newRotation = (initialRotationRef.current + angleDelta) % 360;
        if (newRotation < 0) newRotation += 360;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => onRotateRef.current?.(newRotation));
      }
    };

    const handleMouseUp = () => {
      cancelAnimationFrame(rafRef.current);
      setIsDragging(false);
      setResizeHandle(null);
      setIsRotating(false);
    };

    if (isDragging || resizeHandle !== null || isRotating) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  // Intentionally omits onDrag/onResize/onRotate — latest versions are accessed via refs above.
  }, [isDragging, resizeHandle, isRotating, scale]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(e);
    if (field.locked) return;
    onDragStart?.();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  };

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    if (field.locked) return;
    e.stopPropagation();
    e.preventDefault();
    onDragStart?.();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    // Exact field dimensions in screen pixels — matches the rendered box exactly.
    initialDimsRef.current = { width: scaledWidth, height: scaledHeight };
    initialFieldRef.current = { width: field.width, fontSize: field.fontSize, x: field.x, y: field.y };
    setResizeHandle(handle);
  };

  const handleRotationStart = (e: React.MouseEvent) => {
    if (field.locked) return;
    e.stopPropagation();
    e.preventDefault();
    onDragStart?.();
    const rect = fieldRef.current!.getBoundingClientRect();
    fieldCenterRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    initialRotationRef.current = field.rotation ?? 0;
    const dx = e.clientX - fieldCenterRef.current.x;
    const dy = e.clientY - fieldCenterRef.current.y;
    initialAngleRef.current = Math.atan2(dy, dx) * (180 / Math.PI);
    setIsRotating(true);
  };

  const TYPE_SAMPLE_DEFAULTS: Record<string, string> = {
    name: 'John Doe', course: 'Web Development Fundamentals',
    start_date: 'January 15, 2026', end_date: 'March 15, 2026', custom_text: 'Custom Value',
  };
  // Priority: live row-1 data > user-set sampleValue > type default > label
  const displayValue = previewValue || field.sampleValue || TYPE_SAMPLE_DEFAULTS[field.type] || field.label;

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

  // Scale handle sizes proportionally. Minimum 8px so they're always clickable.
  const hSize = Math.max(8, Math.min(12, Math.round(12 * scale)));
  // Show mid-edge handles when the bounding box is large enough to fit them.
  const showMidHandles = scaledWidth > hSize * 3 && scaledHeight > hSize * 3;

  // Handles are centered on the field's corner/edge points using transform.
  // This keeps 50% inside the field boundary (always hittable even if the canvas
  // container clips overflow) while still appearing on the field edge.
  const RESIZE_HANDLES: { id: ResizeHandle; cursor: string; style: React.CSSProperties }[] = [
    { id: 'nw', cursor: 'nwse-resize', style: { top: 0, left: 0, transform: 'translate(-50%, -50%)' } },
    { id: 'ne', cursor: 'nesw-resize', style: { top: 0, right: 0, transform: 'translate(50%, -50%)' } },
    { id: 'sw', cursor: 'nesw-resize', style: { bottom: 0, left: 0, transform: 'translate(-50%, 50%)' } },
    { id: 'se', cursor: 'nwse-resize', style: { bottom: 0, right: 0, transform: 'translate(50%, 50%)' } },
    ...(showMidHandles ? [
      { id: 'n' as ResizeHandle, cursor: 'ns-resize', style: { top: 0, left: '50%', transform: 'translate(-50%, -50%)' } as React.CSSProperties },
      { id: 's' as ResizeHandle, cursor: 'ns-resize', style: { bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' } as React.CSSProperties },
      { id: 'w' as ResizeHandle, cursor: 'ew-resize', style: { top: '50%', left: 0, transform: 'translate(-50%, -50%)' } as React.CSSProperties },
      { id: 'e' as ResizeHandle, cursor: 'ew-resize', style: { top: '50%', right: 0, transform: 'translate(50%, -50%)' } as React.CSSProperties },
    ] : []),
  ];

  return (
    <div
      ref={fieldRef}
      className={`
        absolute pointer-events-auto group
        ${isSelected ? 'z-50' : 'z-10'}
        ${field.locked ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}
        ${!isSelected && !isMultiSelected ? 'hover:outline-[1.5px] hover:outline-dashed hover:outline-primary/40' : ''}
      `}
      style={{
        // ── Outer wrapper: positioning + handle layer ─────────────────────────
        // overflow:visible so handles that extend outside the field boundary
        // are not clipped. The inner content div handles overflow:hidden.
        left: scaledX,
        top: scaledY,
        width: scaledWidth,
        height: scaledHeight,
        overflow: 'visible',
        transform: field.rotation ? `rotate(${field.rotation}deg)` : undefined,
        transformOrigin: 'center',
        opacity: field.locked ? 0.75 : 1,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
    >
      {/* ── Inner content box ────────────────────────────────────────────────
          Exact field dimensions, clips content (overflow:hidden).
          Selection ring lives here so it's flush with the field boundary. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: field.type === 'image' ? 'center' : (field.textAlign === 'center' ? 'center' : field.textAlign === 'right' ? 'flex-end' : 'flex-start'),
          borderRadius: field.type === 'image'
            ? (field.cornerRadius ? `${field.cornerRadius}px` : '2px')
            : (field.bgCornerRadius ? `${field.bgCornerRadius * scale}px` : '2px'),
          boxShadow: isSelected
            ? '0 0 0 1.5px var(--primary), 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent)'
            : isMultiSelected
            ? '0 0 0 1px var(--primary)'
            : undefined,
          ...(field.type !== 'image' ? {
            fontSize: scaledFontSize,
            fontFamily: field.fontFamily,
            color: field.color,
            fontWeight: field.fontWeight,
            fontStyle: field.fontStyle,
            textAlign: field.textAlign,
            padding: `${(field.bgPaddingV ?? 4) * scale}px ${(field.bgPaddingH ?? 8) * scale}px`,
            backgroundColor: field.backgroundColor || undefined,
          } : {}),
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
              <img
                src={field.imageUrl}
                alt={field.label}
                draggable={false}
                style={{
                  width: '100%', height: '100%',
                  objectFit: (field.objectFit ?? 'contain') as React.CSSProperties['objectFit'],
                  transform: [field.flipHorizontal ? 'scaleX(-1)' : '', field.flipVertical ? 'scaleY(-1)' : ''].filter(Boolean).join(' ') || undefined,
                }}
              />
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center gap-1"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1.5px dashed rgba(245,158,11,0.45)', borderRadius: 'inherit' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
                  style={{ width: 22, height: 22, color: 'rgba(245,158,11,0.65)' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <span style={{ fontSize: 8, color: 'rgba(245,158,11,0.7)', textAlign: 'center', lineHeight: 1.3, paddingInline: 4 }}>
                  Re-upload image
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            className={isGradient ? 'gradient-clip-text select-none' : 'whitespace-nowrap select-none'}
            style={textContentStyle}
          >
            {field.prefix}{displayValue}{field.suffix}
          </div>
        )}
      </div>

      {/* Selection handles — resize (4–8 handles) + rotation */}
      {isSelected && !field.locked && (
        <>
          {/* Rotation handle: circle above top-center with connecting stem.
              Positioned at top:0 then translated up by its own height so the
              stem bottom is flush with the field's top edge — this keeps the
              layout anchor inside the field (overflow-safe). */}
          {scaledHeight > hSize * 2 && (
            <div
              className="absolute pointer-events-none"
              style={{
                top: 0,
                left: '50%',
                transform: `translate(-50%, calc(-100% - 2px))`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                className="rounded-full pointer-events-auto hover:scale-125 transition-transform shadow-sm"
                style={{
                  width: hSize,
                  height: hSize,
                  backgroundColor: 'white',
                  border: `${Math.max(1, Math.round(2 * scale))}px solid var(--primary)`,
                  cursor: isRotating ? 'grabbing' : 'crosshair',
                  flexShrink: 0,
                }}
                onMouseDown={handleRotationStart}
                title="Drag to rotate"
              />
              <div style={{ width: 1, height: Math.max(8, Math.round(22 * scale)), backgroundColor: 'var(--primary)', opacity: 0.4 }} />
            </div>
          )}

          {/* Resize handles — all field types; text fields scale font size via resize logic.
              Outer div is a transparent 24px hit zone (centered on corner/edge via the same
              translate as before) so the click target is easy to hit on a trackpad. */}
          {RESIZE_HANDLES.map(({ id, cursor, style }) => (
            <div
              key={id}
              className="absolute group/handle"
              style={{
                width: 24,
                height: 24,
                cursor,
                ...style,
              }}
              onMouseDown={(e) => handleResizeStart(e, id)}
            >
              <div
                className="absolute rounded-sm shadow-sm group-hover/handle:scale-125 transition-transform"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: hSize,
                  height: hSize,
                  backgroundColor: 'white',
                  border: `${Math.max(1, Math.round(2 * scale))}px solid var(--primary)`,
                  pointerEvents: 'none',
                }}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
