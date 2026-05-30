'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HelpCircle, AlignLeft, AlignCenter, AlignRight, Italic, Underline, Strikethrough,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  BringToFront, SendToBack, Magnet, Maximize2, Lock, RefreshCw, X,
} from 'lucide-react';

// Right panel is always: right-5 (20px) + w-80 (320px) = 340px from screen right
// We position the popover so its right edge is 12px clear of the panel's left edge
const PANEL_RIGHT_OFFSET = 340 + 12; // px from screen right
const POPOVER_WIDTH = 300;

interface Props {
  fieldType?: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-foreground leading-snug">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function TextRow({ label, symbol, desc }: { label: string; symbol: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[11px] font-bold text-foreground/70">{symbol}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-foreground leading-snug">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

const isTextField = (t?: string) =>
  !t || ['name', 'text', 'date', 'custom', 'title', 'subtitle', 'email', 'phone'].includes(t);

export function FieldPropertiesGuide({ fieldType }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.top });
    setOpen(v => !v);
  };

  const isText = isTextField(fieldType);
  const isQR = fieldType === 'qr_code';

  const popover = open ? (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: pos.top,
        right: PANEL_RIGHT_OFFSET,
        width: POPOVER_WIDTH,
        zIndex: 9999,
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
      }}
      className="bg-card border border-border rounded-xl shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
        <div>
          <p className="text-xs font-semibold text-foreground">Properties Guide</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {fieldType ? `${fieldType.replace('_', ' ')} field` : 'Field'} controls reference
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground/50 hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* Align to Canvas — always shown */}
        <Section title="Align to canvas">
          <Row icon={<AlignHorizontalJustifyStart className="w-3.5 h-3.5 text-foreground/70" />} label="Align left" desc="Snap left edge to canvas left" />
          <Row icon={<AlignHorizontalJustifyCenter className="w-3.5 h-3.5 text-foreground/70" />} label="Center horizontal" desc="Center field across canvas width" />
          <Row icon={<AlignHorizontalJustifyEnd className="w-3.5 h-3.5 text-foreground/70" />} label="Align right" desc="Snap right edge to canvas right" />
          <Row icon={<AlignVerticalJustifyStart className="w-3.5 h-3.5 text-foreground/70" />} label="Align top" desc="Snap top edge to canvas top" />
          <Row icon={<AlignVerticalJustifyCenter className="w-3.5 h-3.5 text-foreground/70" />} label="Center vertical" desc="Center field across canvas height" />
          <Row icon={<AlignVerticalJustifyEnd className="w-3.5 h-3.5 text-foreground/70" />} label="Align bottom" desc="Snap bottom edge to canvas bottom" />
        </Section>

        {/* Arrange — always shown */}
        <Section title="Layer order">
          <Row icon={<BringToFront className="w-3.5 h-3.5 text-foreground/70" />} label="Bring forward" desc="Move this field one layer up (in front of others)" />
          <Row icon={<SendToBack className="w-3.5 h-3.5 text-foreground/70" />} label="Send backward" desc="Move this field one layer down (behind others)" />
          <Row icon={<Lock className="w-3.5 h-3.5 text-foreground/70" />} label="Lock / Unlock" desc="Prevent accidental drag or resize of this field" />
        </Section>

        {/* Text fields only */}
        {isText && (
          <>
            <Section title="Text alignment">
              <Row icon={<AlignLeft className="w-3.5 h-3.5 text-foreground/70" />} label="Left" desc="Align text to the left edge of the field" />
              <Row icon={<AlignCenter className="w-3.5 h-3.5 text-foreground/70" />} label="Center" desc="Center text within the field" />
              <Row icon={<AlignRight className="w-3.5 h-3.5 text-foreground/70" />} label="Right" desc="Align text to the right edge of the field" />
            </Section>

            <Section title="Typography">
              <TextRow symbol="B" label="Bold" desc="Increase font weight to bold" />
              <Row icon={<Italic className="w-3.5 h-3.5 text-foreground/70" />} label="Italic" desc="Slant text to the right" />
              <Row icon={<Underline className="w-3.5 h-3.5 text-foreground/70" />} label="Underline" desc="Draw a line below the text" />
              <Row icon={<Strikethrough className="w-3.5 h-3.5 text-foreground/70" />} label="Strikethrough" desc="Draw a line through the middle of the text" />
            </Section>

            <Section title="Color modes">
              <TextRow symbol="■" label="Solid" desc="Flat single color fill" />
              <TextRow symbol="▦" label="Linear gradient" desc="Color transitions along a straight line at a chosen angle" />
              <TextRow symbol="◎" label="Radial gradient" desc="Color radiates outward from the center of the field" />
            </Section>
          </>
        )}

        {/* QR code only */}
        {isQR && (
          <Section title="QR code options">
            <TextRow symbol="▣" label="Module style" desc="Shape of each QR dot — square, rounded, dots, and more" />
            <TextRow symbol="◧" label="Finder / Eye" desc="The three corner squares scanners use to locate and orient the code" />
            <TextRow symbol="L·M·Q·H" label="Error correction" desc="L = 7%, M = 15%, Q = 25%, H = 30% — higher = more resilient but denser" />
            <TextRow symbol="□" label="Quiet zone" desc="White border around the QR code (0–10 tiles)" />
          </Section>
        )}

        {/* Canvas toolbar — always shown */}
        <Section title="Canvas toolbar">
          <Row icon={<Magnet className="w-3.5 h-3.5 text-foreground/70" />} label="Snap to grid" desc="Fields snap to grid lines while dragging" />
          <Row icon={<Maximize2 className="w-3.5 h-3.5 text-foreground/70" />} label="Fit to screen" desc="Zoom out to show the full template" />
          <Row icon={<RefreshCw className="w-3.5 h-3.5 text-foreground/70" />} label="Reset rotation" desc="Reset field rotation back to 0°" />
        </Section>

      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleClick}
        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
        title="Panel guide"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {typeof window !== 'undefined' && createPortal(popover, document.body)}
    </>
  );
}
