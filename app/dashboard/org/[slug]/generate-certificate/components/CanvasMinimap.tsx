'use client';

import { useRef, useState, useCallback } from 'react';
import { CertificateField } from '@/lib/types/certificate';
import { X } from 'lucide-react';

interface CanvasMinimapProps {
  canvasWidth: number;
  canvasHeight: number;
  viewportX: number;
  viewportY: number;
  viewportWidth: number;
  viewportHeight: number;
  fields: CertificateField[];
  onViewportChange: (x: number, y: number) => void;
  templateUrl?: string;
  templateType?: 'image';
}

const MINIMAP_WIDTH = 150;

export function CanvasMinimap({
  canvasWidth,
  canvasHeight,
  viewportX,
  viewportY,
  viewportWidth,
  viewportHeight,
  fields,
  onViewportChange,
  templateUrl,
  templateType,
}: CanvasMinimapProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const minimapRef = useRef<HTMLDivElement>(null);

  // Calculate minimap dimensions maintaining aspect ratio
  const aspectRatio = canvasHeight / canvasWidth;
  const minimapHeight = MINIMAP_WIDTH * aspectRatio;
  const minimapScale = MINIMAP_WIDTH / canvasWidth;

  // Viewport rect in minimap coordinates
  const vpX = Math.max(0, viewportX * minimapScale);
  const vpY = Math.max(0, viewportY * minimapScale);
  const vpW = Math.min(MINIMAP_WIDTH - vpX, viewportWidth * minimapScale);
  const vpH = Math.min(minimapHeight - vpY, viewportHeight * minimapScale);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate new viewport center position
    const x = (e.clientX - rect.left) / minimapScale - viewportWidth / 2;
    const y = (e.clientY - rect.top) / minimapScale - viewportHeight / 2;
    onViewportChange(Math.max(0, x), Math.max(0, y));
  }, [minimapScale, viewportWidth, viewportHeight, onViewportChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / minimapScale - viewportWidth / 2;
    const y = (e.clientY - rect.top) / minimapScale - viewportHeight / 2;
    onViewportChange(Math.max(0, x), Math.max(0, y));
  }, [isDragging, minimapScale, viewportWidth, viewportHeight, onViewportChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (isCollapsed) {
    return (
      <button
        className="absolute bottom-16 left-4 z-40 p-2 bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg hover:bg-muted/50 transition-colors"
        onClick={() => setIsCollapsed(false)}
        title="Show Minimap"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="7" y="7" width="6" height="6" rx="1" className="fill-primary/20" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-16 left-4 z-40 bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg overflow-hidden"
      style={{ width: MINIMAP_WIDTH + 2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
        <span className="text-[10px] font-medium text-muted-foreground">Overview</span>
        <button
          className="p-0.5 hover:bg-muted rounded transition-colors"
          onClick={() => setIsCollapsed(true)}
          title="Hide Minimap"
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Minimap Canvas */}
      <div
        ref={minimapRef}
        className="relative cursor-crosshair bg-white"
        style={{ width: MINIMAP_WIDTH, height: minimapHeight }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Template Background */}
        {templateUrl && templateType === 'image' ? (
          <img
            src={templateUrl}
            alt="Template preview"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-muted/30 to-muted/50" />
        )}

        {/* Fields (as dots/rectangles) */}
        {fields.map((field) => (
          <div
            key={field.id}
            className="absolute bg-primary/60 rounded-[1px]"
            style={{
              left: field.x * minimapScale,
              top: field.y * minimapScale,
              width: Math.max(2, field.width * minimapScale),
              height: Math.max(2, field.height * minimapScale),
            }}
          />
        ))}

        {/* Viewport Rectangle */}
        <div
          className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
          style={{
            left: vpX,
            top: vpY,
            width: Math.max(10, vpW),
            height: Math.max(10, vpH),
          }}
        />
      </div>
    </div>
  );
}
