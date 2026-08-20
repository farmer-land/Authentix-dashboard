'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const SECTIONS = [
  {
    title: 'Fields',
    shortcuts: [
      { keys: ['Delete', 'Backspace'], label: 'Delete selected field' },
      { keys: [`${mod}`, 'C'], label: 'Copy field' },
      { keys: [`${mod}`, 'V'], label: 'Paste field (offset +20px)' },
      { keys: [`${mod}`, 'D'], label: 'Duplicate field' },
    ],
  },
  {
    // GARDEN-4: keyboard-only path for select / move / resize / rotate.
    // Arrow keys change meaning with the active mode (S / R / M or Esc).
    title: 'Field — keyboard',
    shortcuts: [
      { keys: ['Tab'], label: 'Focus next field (selects it)' },
      { keys: ['⇧', 'Tab'], label: 'Focus previous field' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move field by 1px' },
      { keys: ['⇧', '↑↓←→'], label: 'Move field by 10px' },
      { keys: ['S'], label: 'Resize mode (arrows resize)' },
      { keys: ['R'], label: 'Rotate mode (arrows rotate 1° / ⇧ 15°)' },
      { keys: ['M', 'Esc'], label: 'Back to move mode' },
    ],
  },
  {
    title: 'Canvas',
    shortcuts: [
      { keys: ['Space', '+ drag'], label: 'Pan canvas' },
      { keys: [`${mod}`, '='], label: 'Zoom in' },
      { keys: [`${mod}`, '−'], label: 'Zoom out' },
      { keys: [`${mod}`, '0'], label: 'Fit to screen' },
      { keys: ['Scroll'], label: 'Pan up / down' },
      { keys: [`${mod}`, 'Scroll'], label: 'Zoom in / out' },
    ],
  },
  {
    title: 'History',
    shortcuts: [
      { keys: [`${mod}`, 'Z'], label: 'Undo' },
      { keys: [`${mod}`, '⇧', 'Z'], label: 'Redo' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], label: 'Show this help' },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcuts({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-1">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {section.title}
              </p>
              <ul className="space-y-1.5">
                {section.shortcuts.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-foreground/80">{s.label}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {s.keys.map((k, ki) => (
                        k.startsWith('+') || k === '/' ? (
                          <span key={ki} className="text-[10px] text-muted-foreground px-0.5">{k}</span>
                        ) : (
                          <kbd key={ki} className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border border-border/60 rounded text-foreground/70">
                            {k}
                          </kbd>
                        )
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
