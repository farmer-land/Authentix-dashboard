'use client';

'use client';

import { useRef, useEffect, useState } from 'react';
import { CertificateField } from '@/lib/types/certificate';
import { DraggableField } from './DraggableField';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';

interface CertificateCanvasProps {
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
}

export function CertificateCanvas({
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
}: CertificateCanvasProps) {
  /* State for Infinite Canvas */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isDragging, setIsDragging] = useState(false); 
  
  /* Draggable Toolbar State */
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const toolbarDragStart = useRef({ x: 0, y: 0 });

  /* Template Resize State */
  const [isResizingTemplate, setIsResizingTemplate] = useState(false);
  const resizeCorner = useRef<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const templateResizeStart = useRef({ x: 0, y: 0 });
  const initialTemplateDims = useRef({ w: 0, h: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [canvasWidth, setCanvasWidth] = useState(600);
  // Keep a ref to the latest fields so handleFieldDrag never reads a stale closure snapshot
  const fieldsRef = useRef(fields);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);

  // Global events for Toolbar Dragging & Template Resizing
  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      // Toolbar Drag
      if (isDraggingToolbar) {
        setToolbarPos({
          x: e.clientX - toolbarDragStart.current.x,
          y: e.clientY - toolbarDragStart.current.y
        });
      }
      
      // Template Resize from any corner
      if (isResizingTemplate && onTemplateResize && resizeCorner.current) {
        const deltaX = (e.clientX - templateResizeStart.current.x) / scale; 
        const deltaY = (e.clientY - templateResizeStart.current.y) / scale;
        
        let newWidth = initialTemplateDims.current.w;
        let newHeight = initialTemplateDims.current.h;
        
        // Calculate new dimensions based on corner
        switch (resizeCorner.current) {
          case 'se': // Bottom-right: increase width and height
            newWidth = initialTemplateDims.current.w + deltaX;
            newHeight = initialTemplateDims.current.h + deltaY;
            break;
          case 'sw': // Bottom-left: decrease width, increase height
            newWidth = initialTemplateDims.current.w - deltaX;
            newHeight = initialTemplateDims.current.h + deltaY;
            break;
          case 'ne': // Top-right: increase width, decrease height
            newWidth = initialTemplateDims.current.w + deltaX;
            newHeight = initialTemplateDims.current.h - deltaY;
            break;
          case 'nw': // Top-left: decrease width and height
            newWidth = initialTemplateDims.current.w - deltaX;
            newHeight = initialTemplateDims.current.h - deltaY;
            break;
        }
        
        // Ensure minimum size
        newWidth = Math.max(100, newWidth);
        newHeight = Math.max(100, newHeight);
        
        onTemplateResize(newWidth, newHeight);
      }
    };
    
    const handleGlobalUp = () => {
        setIsDraggingToolbar(false);
        setIsResizingTemplate(false);
        resizeCorner.current = null;
    };

    if (isDraggingToolbar || isResizingTemplate) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [isDraggingToolbar, isResizingTemplate, scale, onTemplateResize]);

  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.stopPropagation();
    setIsDraggingToolbar(true);
    toolbarDragStart.current = { 
        x: e.clientX - toolbarPos.x, 
        y: e.clientY - toolbarPos.y 
    };
  };

  const handleTemplateResizeStart = (e: React.MouseEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
     e.stopPropagation();
     e.preventDefault(); 
     setIsResizingTemplate(true);
     resizeCorner.current = corner;
     templateResizeStart.current = { x: e.clientX, y: e.clientY };
     initialTemplateDims.current = { w: pdfWidth, h: pdfHeight };
  };

  // Update canvas width based on scale (Legacy logic maintained for now as per plan)
  useEffect(() => {
    setCanvasWidth(pdfWidth * scale);
  }, [pdfWidth, scale]);
  
  const handleFieldDrag = (id: string, deltaX: number, deltaY: number) => {
    const field = fieldsRef.current.find(f => f.id === id);
    if (field) {
      onFieldUpdate(id, {
        x: field.x + deltaX / scale,
        y: field.y + deltaY / scale,
      });
    }
  };

  const handleFieldResize = (id: string, width: number, height: number) => {
    const field = fieldsRef.current.find(f => f.id === id);
    if (field) {
      onFieldUpdate(id, {
        width: width / scale,
        height: height / scale,
      });
    }
  };

  // Track Space key for panning mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false); 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Keep scale/onScaleChange in a ref so the wheel handler never needs to be recreated
  const scaleRef = useRef(scale);
  const onScaleChangeRef = useRef(onScaleChange);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { onScaleChangeRef.current = onScaleChange; }, [onScaleChange]);

  // Non-passive wheel handler — must use addEventListener to allow preventDefault on trackpad
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaMode === 0
          ? 1 - e.deltaY * 0.004
          : 1 - e.deltaY * 0.05;
        const newScale = Math.min(5, Math.max(0.1, scaleRef.current * zoomFactor));
        onScaleChangeRef.current(newScale);
      } else {
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []); // register once on mount

  // Mouse Drag Handlers for Panning - allow left click on empty canvas area
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start panning if clicking on a field or control element
    const target = e.target as HTMLElement;
    if (target.closest('[data-field]') || target.closest('button') || target.closest('[data-resize-handle]')) {
      return;
    }
    
    // Allow panning with left mouse button on empty canvas, or middle button, or space+left
    // Trackpads use button 0 (left click)
    if (e.button === 1 || e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      // Store initial position for trackpad compatibility
      const panStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      panStartRef.current = panStart;
    }
  };

  // Global mouse move handler for panning (works better with trackpads)
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        e.preventDefault();
        const deltaX = e.clientX - panStartRef.current.x;
        const deltaY = e.clientY - panStartRef.current.y;
        const newPanX = panStartRef.current.panX + deltaX;
        const newPanY = panStartRef.current.panY + deltaY;
        
        setPan({
          x: newPanX,
          y: newPanY,
        });
      }
    };

    const handleGlobalMouseUp = () => {
      setIsPanning(false);
      setIsResizingTemplate(false);
    };

    if (isPanning) {
      window.addEventListener('mousemove', handleGlobalMouseMove, { passive: false });
      window.addEventListener('mouseup', handleGlobalMouseUp);
      window.addEventListener('mouseleave', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mouseleave', handleGlobalMouseUp);
    };
  }, [isPanning]);

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsResizingTemplate(false);
  };

  // Zoom Controls
  const handleZoomIn = () => onScaleChange(Math.min(5, scale + 0.1));
  const handleZoomOut = () => onScaleChange(Math.max(0.1, scale - 0.1));
  
  const handleFitToWidth = () => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 96; // margin
      onScaleChange(containerWidth / pdfWidth);
      setPan({ x: 0, y: 0 }); // Reset pan on fit
    }
  };

  const handleReset = () => {
      onScaleChange(0.5);
      setPan({ x: 0, y: 0 });
  }

  // Calculate cursor style
  const cursorStyle = isPanning ? 'grabbing' : isSpacePressed ? 'grab' : 'default';

  const visibleFields = fields.filter(f => !hiddenFields.has(f.id));

  return (
    <div
        className="relative w-full h-full bg-background overflow-hidden flex items-center justify-center select-none"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        ref={containerRef}
        style={{ cursor: cursorStyle }}
    >
      {/* Zoom Controls - Draggable */}
      <div 
        className="absolute top-4 right-4 z-50 flex gap-2 bg-background/90 backdrop-blur shadow-sm p-1.5 rounded-lg cursor-move"
        style={{ transform: `translate(${toolbarPos.x}px, ${toolbarPos.y}px)` }}
        onMouseDown={handleToolbarMouseDown}
      >
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs font-medium w-12 flex items-center justify-center select-none">
          {Math.round(scale * 100)}%
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <div className="w-px h-4 bg-border my-auto mx-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFitToWidth} title="Fit to width">
          <Maximize className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset} title="Reset to 50%">
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Infinite Canvas Content Wrapper */}
      <div 
        className="relative origin-center"
        style={{ 
          width: canvasWidth, 
          height: canvasWidth * (pdfHeight / pdfWidth),
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          willChange: isPanning || isResizingTemplate ? 'transform' : 'auto',
        }}
        data-field="canvas"
      >
          {/* Template Background - fills container exactly */}
          <img
            src={fileUrl}
            alt="Certificate template"
            className="absolute inset-0 select-none pointer-events-none"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              objectPosition: 'center'
            }}
            draggable={false}
          />
          
          {/* Border overlay that sticks to template edges */}
          <div 
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              border: '1.8px solid #3fcf8e',
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          />

          {/* Fields Overlay — overflow-visible so resize handles aren't clipped */}
          <div className="absolute inset-0 overflow-visible">
            {visibleFields.map((field) => (
              <div key={field.id} data-field="true">
              <DraggableField
                field={field}
                scale={scale} // Scale passed down for drag math
                isSelected={selectedFieldId === field.id}
                onDrag={(deltaX, deltaY) => handleFieldDrag(field.id, deltaX, deltaY)}
                onResize={(width, height) => handleFieldResize(field.id, width, height)}
                onSelect={(e) => {
                    e.stopPropagation(); // Prevent canvas pan start
                    onFieldSelect(field.id);
                }}
              />
              </div>
            ))}
          </div>

          {/* Resize Handles - All 4 Corners */}
          {onTemplateResize && (
            <>
              {/* Top-left */}
              <div
                className="absolute -left-1.5 -top-1.5 w-3 h-3 border border-white cursor-nwse-resize hover:scale-125 transition-transform z-50 rounded-sm"
                style={{ backgroundColor: '#3fcf8e' }}
                data-resize-handle="true"
                onMouseDown={(e) => handleTemplateResizeStart(e, 'nw')}
              />
              {/* Top-right */}
              <div
                className="absolute -right-1.5 -top-1.5 w-3 h-3 border border-white cursor-nesw-resize hover:scale-125 transition-transform z-50 rounded-sm"
                style={{ backgroundColor: '#3fcf8e' }}
                data-resize-handle="true"
                onMouseDown={(e) => handleTemplateResizeStart(e, 'ne')}
              />
              {/* Bottom-left */}
              <div
                className="absolute -left-1.5 -bottom-1.5 w-3 h-3 border border-white cursor-nesw-resize hover:scale-125 transition-transform z-50 rounded-sm"
                style={{ backgroundColor: '#3fcf8e' }}
                data-resize-handle="true"
                onMouseDown={(e) => handleTemplateResizeStart(e, 'sw')}
              />
              {/* Bottom-right */}
              <div
                className="absolute -right-1.5 -bottom-1.5 w-3 h-3 border border-white cursor-nwse-resize hover:scale-125 transition-transform z-50 rounded-sm"
                style={{ backgroundColor: '#3fcf8e' }}
                data-resize-handle="true"
                onMouseDown={(e) => handleTemplateResizeStart(e, 'se')}
              />
            </>
          )}
          
      </div>

      {/* Info Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 text-[10px] text-muted-foreground bg-background/90 backdrop-blur border px-3 py-1 rounded-full shadow-sm select-none pointer-events-none">
        {Math.round(pdfWidth)} × {Math.round(pdfHeight)}px • {fields.length} field{fields.length !== 1 ? 's' : ''} ({hiddenFields.size} hidden)
      </div>
    </div>
  );

}
