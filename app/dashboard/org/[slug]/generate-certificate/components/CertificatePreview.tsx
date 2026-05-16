'use client';

import { useRef, useEffect, useState } from 'react';
import { CertificateField, CertificateTemplate } from '@/lib/types/certificate';
import { QRPreview } from './QRPreview';

interface CertificatePreviewProps {
  template: CertificateTemplate;
  fields: CertificateField[];
  currentPage: number; // 0-indexed (matches page.tsx state)
}

export function CertificatePreview({ template, fields, currentPage }: CertificatePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Load Google Fonts for all unique font families used in fields
  useEffect(() => {
    const families = [...new Set(fields.map(f => f.fontFamily).filter(Boolean))];
    families.forEach(family => {
      const id = `gf-preview-${family.replace(/\s+/g, '-')}`;
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap`;
      document.head.appendChild(link);
    });
  }, [fields]);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const { clientWidth: cw, clientHeight: ch } = el;
      const pad = 48;
      const s = Math.min(
        (cw - pad * 2) / template.pdfWidth,
        (ch - pad * 2) / template.pdfHeight,
      );
      setScale(Math.max(0.05, Math.min(3, s)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [template.pdfWidth, template.pdfHeight]);

  const canvasW = template.pdfWidth * scale;
  const canvasH = template.pdfHeight * scale;
  const pageFields = fields.filter(f => (f.pageNumber ?? 0) === currentPage);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden"
      style={{
        backgroundColor: 'var(--canvas-bg)',
        backgroundImage: 'radial-gradient(circle, var(--canvas-dot) 1.5px, transparent 1.5px)',
        backgroundSize: '24px 24px',
      }}
    >
      <div
        className="relative"
        style={{
          width: canvasW,
          height: canvasH,
          boxShadow: '0 8px 40px 0 rgba(0,0,0,0.45)',
          borderRadius: '2px',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {/* Template background */}
        <img
          src={template.fileUrl}
          alt="Certificate preview"
          style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
          draggable={false}
        />

        {/* Fields rendered cleanly — no borders, no handles */}
        {pageFields.map(field => {
          const sx = field.x * scale;
          const sy = field.y * scale;
          const sw = field.width * scale;
          const sh = field.height * scale;
          const sf = field.fontSize * scale;
          const TYPE_SAMPLE_DEFAULTS: Record<string, string> = {
            name: 'John Doe', course: 'Web Development Fundamentals',
            start_date: 'January 15, 2026', end_date: 'March 15, 2026', custom_text: 'Custom Value',
          };
          const displayValue = field.sampleValue || TYPE_SAMPLE_DEFAULTS[field.type] || field.label;

          if (field.type === 'qr_code') {
            return (
              <div
                key={field.id}
                className="absolute"
                style={{ left: sx, top: sy, width: sw, height: sh, opacity: (field.opacity ?? 100) / 100 }}
              >
                <QRPreview
                  style={field.qrStyle ?? 'standard'}
                  color={field.color ?? '#000000'}
                  transparent={field.qrTransparentBg ?? false}
                  logoUrl={field.qrStyle === 'logo' ? (field.qrLogoUrl ?? null) : null}
                />
              </div>
            );
          }

          if (field.type === 'image') {
            if (!field.imageUrl) return null;
            return (
              <div
                key={field.id}
                className="absolute overflow-hidden"
                style={{
                  left: sx,
                  top: sy,
                  width: sw,
                  height: sh,
                  opacity: (field.opacity ?? 100) / 100,
                  borderRadius: field.cornerRadius ? `${field.cornerRadius * scale}px` : undefined,
                }}
              >
                <img
                  src={field.imageUrl}
                  alt={field.label}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  draggable={false}
                />
              </div>
            );
          }

          const isGradient = field.colorMode === 'linear' || field.colorMode === 'radial';
          const gradientBg = isGradient
            ? field.colorMode === 'linear'
              ? `linear-gradient(${field.gradientAngle ?? 90}deg, ${field.gradientStartColor ?? field.color}, ${field.gradientEndColor ?? '#ffffff'})`
              : `radial-gradient(circle, ${field.gradientStartColor ?? field.color}, ${field.gradientEndColor ?? '#ffffff'})`
            : undefined;

          return (
            <div
              key={field.id}
              className="absolute"
              style={{
                left: sx,
                top: sy,
                width: sw,
                height: sh,
                fontSize: sf,
                fontFamily: field.fontFamily,
                color: field.color,
                fontWeight: field.fontWeight,
                fontStyle: field.fontStyle,
                textAlign: field.textAlign,
                padding: '4px 8px',
                backgroundColor: field.backgroundColor || undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  field.textAlign === 'center'
                    ? 'center'
                    : field.textAlign === 'right'
                    ? 'flex-end'
                    : 'flex-start',
              }}
            >
              <div
                className={isGradient ? 'gradient-clip-text w-full' : 'truncate w-full'}
                style={{
                  lineHeight: field.lineHeight ?? 1.2,
                  letterSpacing: field.letterSpacing ? `${field.letterSpacing * scale}px` : undefined,
                  opacity: (field.opacity ?? 100) / 100,
                  textTransform: (field.textTransform ?? 'none') as React.CSSProperties['textTransform'],
                  textDecoration: field.textDecoration && field.textDecoration !== 'none' ? field.textDecoration : undefined,
                  textShadow: field.textShadow
                    ? `${field.textShadow.offsetX}px ${field.textShadow.offsetY}px ${field.textShadow.blur}px ${field.textShadow.color}`
                    : undefined,
                  ...(isGradient ? { background: gradientBg } : {}),
                }}
              >
                {field.prefix}{displayValue}{field.suffix}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scale indicator */}
      <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground/40 select-none pointer-events-none">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
