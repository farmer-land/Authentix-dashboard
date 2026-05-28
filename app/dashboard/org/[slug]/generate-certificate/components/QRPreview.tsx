'use client';

import { useState, useEffect } from 'react';
import QRCodeLib from 'qrcode';

export type QRStyle = 'standard' | 'rounded' | 'dots' | 'classy' | 'extra-rounded' | 'classy-rounded' | 'logo';

function isFinderModule(row: number, col: number, size: number): boolean {
  if (row <= 6 && col <= 6) return true;
  if (row <= 6 && col >= size - 7) return true;
  if (row >= size - 7 && col <= 6) return true;
  return false;
}

/**
 * Renders a styled QR code preview using the real qrcode package.
 * Used in both DraggableField (canvas) and CertificatePreview (preview panel).
 */
export function QRPreview({
  style = 'standard',
  color = '#000000',
  transparent = false,
  logoUrl = null,
}: {
  style?: QRStyle;
  color?: string;
  transparent?: boolean;
  logoUrl?: string | null;
}) {
  const [modules, setModules] = useState<{ data: Uint8Array; size: number } | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const qr = (QRCodeLib as any).create('https://authentix.app/verify/sample', {
        errorCorrectionLevel: style === 'logo' ? 'H' : 'M',
      });
      setModules({ data: qr.modules.data as Uint8Array, size: qr.modules.size as number });
    } catch {
      // no-op
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
  const pad = 2;
  const viewSize = size + pad * 2;
  const bg = transparent ? 'transparent' : 'white';
  const finderBg = transparent ? 'white' : bg;

  const logoRegionStart = Math.floor(size * 0.35);
  const logoRegionEnd = Math.ceil(size * 0.65);

  const elements: React.ReactNode[] = [];

  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    const row = Math.floor(i / size);
    const col = i % size;
    const x = col + pad;
    const y = row + pad;
    const isFinder = isFinderModule(row, col, size);

    if (style === 'logo' &&
        row >= logoRegionStart && row <= logoRegionEnd &&
        col >= logoRegionStart && col <= logoRegionEnd &&
        !isFinder) continue;

    if (style === 'dots' && !isFinder) {
      elements.push(<circle key={i} cx={x + 0.5} cy={y + 0.5} r="0.42" fill={color} />);
    } else if ((style === 'rounded' || style === 'classy') && !isFinder) {
      elements.push(<rect key={i} x={x + 0.08} y={y + 0.08} width="0.84" height="0.84" rx="0.25" fill={color} />);
    } else if (isFinder && (style === 'rounded' || style === 'classy')) {
      // drawn separately via styledFinder
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
      {(style === 'rounded' || style === 'classy') && (
        <>
          {styledFinder(0, 0)}
          {styledFinder(size - 7, 0)}
          {styledFinder(0, size - 7)}
        </>
      )}
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
