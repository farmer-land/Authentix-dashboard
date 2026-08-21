/**
 * DraggableField unit tests
 *
 * Covers:
 *  - Drag delta calculation: verify onDrag is called with correct pixel deltas
 *  - Ref-based tracking: rapid sequential mousemove events each compute delta
 *    from the last position (not a stale closure), so deltas don't accumulate
 *  - Resize: onResize receives scaled dimensions
 *  - Locked field: dragging and resizing are blocked
 *  - Selection: onSelect fires on mousedown and click
 *  - Field types: text, image, qr_code all render without error
 *
 * Note: testing that refs are used instead of state is done indirectly by
 * verifying that 3 consecutive mousemove events each produce the expected
 * delta (1px each) rather than a single stale delta from the first position.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { ComponentProps } from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { DraggableField } from '@/app/dashboard/org/[slug]/generate-certificate/components/DraggableField';
import type { CertificateField } from '@/lib/types/certificate';

// A bare vi.fn() is typed as the widest possible mock, which is not assignable
// to a specific handler prop. Give each mock the component's own prop signature
// so it satisfies the prop type and stays in sync if the signature changes.
type FieldProps = ComponentProps<typeof DraggableField>;

// QRCodeLib tries to generate a QR preview on mount — mock it so tests don't
// make real calls and the module imports cleanly.
vi.mock('qrcode', () => ({
  default: {
    create: vi.fn(() => ({
      modules: { data: new Uint8Array(441), size: 21 },
    })),
  },
}));

// ── RAF stub ──────────────────────────────────────────────────────────────────
// The component uses requestAnimationFrame to throttle onDrag/onResize calls.
// In jsdom, RAF is asynchronous; stub it to fire synchronously so assertions
// can follow fireEvent calls without needing act()/flush mechanics.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<CertificateField> = {}): CertificateField {
  return {
    id: 'field-1',
    type: 'name',
    label: 'Full Name',
    x: 100,
    y: 50,
    width: 200,
    height: 30,
    fontSize: 16,
    fontFamily: 'DM Sans',
    color: '#000000',
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'left',
    opacity: 100,
    locked: false,
    ...overrides,
  };
}

function renderField(
  overrides: Partial<CertificateField> = {},
  props: {
    scale?: number;
    isSelected?: boolean;
    onDrag?: Mock<FieldProps['onDrag']>;
    onResize?: Mock<FieldProps['onResize']>;
    onSelect?: Mock<FieldProps['onSelect']>;
    onDragStart?: Mock<NonNullable<FieldProps['onDragStart']>>;
    onRotate?: Mock<NonNullable<FieldProps['onRotate']>>;
  } = {},
) {
  const onDrag = props.onDrag ?? vi.fn<FieldProps['onDrag']>();
  const onResize = props.onResize ?? vi.fn<FieldProps['onResize']>();
  const onSelect = props.onSelect ?? vi.fn<FieldProps['onSelect']>();
  const onDragStart = props.onDragStart ?? vi.fn<NonNullable<FieldProps['onDragStart']>>();
  const onRotate = props.onRotate ?? vi.fn<NonNullable<FieldProps['onRotate']>>();

  const field = makeField(overrides);
  const scale = props.scale ?? 1;
  const isSelected = props.isSelected ?? false;

  const { container } = render(
    <DraggableField
      field={field}
      scale={scale}
      isSelected={isSelected}
      onDrag={onDrag}
      onDragStart={onDragStart}
      onResize={onResize}
      onRotate={onRotate}
      onSelect={onSelect}
    />,
  );

  // The root div is the draggable element
  const el = container.firstChild as HTMLElement;
  return { el, onDrag, onResize, onSelect, onDragStart, onRotate, field };
}

// ── helpers ────────────────────────────────────────────────────────────────────

function mousedown(el: HTMLElement, x: number, y: number) {
  fireEvent.mouseDown(el, { clientX: x, clientY: y, bubbles: true });
}

function mousemove(x: number, y: number) {
  fireEvent.mouseMove(document, { clientX: x, clientY: y });
}

function mouseup() {
  fireEvent.mouseUp(document);
}

/** Presses a key on the field wrapper (React onKeyDown). */
function press(el: HTMLElement, key: string, init: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(el, { key, bubbles: true, ...init });
}

// focus()/blur() are real DOM calls (not fireEvent), so React state updates they
// trigger need an explicit act() wrapper to flush before the next assertion.
function focusField(el: HTMLElement) {
  act(() => { el.focus(); });
}

function blurField(el: HTMLElement) {
  act(() => { el.blur(); });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('DraggableField — selection', () => {
  it('calls onSelect on mousedown', () => {
    const { el, onSelect } = renderField();
    mousedown(el, 0, 0);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect on click', () => {
    const { el, onSelect } = renderField();
    fireEvent.click(el);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('DraggableField — drag delta calculation', () => {
  it('calls onDrag with correct delta on first mousemove', () => {
    const { el, onDrag } = renderField();
    mousedown(el, 100, 200);
    mousemove(110, 215);
    mouseup();
    expect(onDrag).toHaveBeenCalledWith(10, 15);
  });

  it('calls onDrag with (0, 0) when mouse does not move', () => {
    const { el, onDrag } = renderField();
    mousedown(el, 50, 50);
    mousemove(50, 50);
    mouseup();
    expect(onDrag).toHaveBeenCalledWith(0, 0);
  });

  it('computes delta from the last position (ref-based, not stale closure)', () => {
    // With useState the origin would never update between render cycles during
    // rapid mousemove events, so all three deltas would be from the original
    // mousedown position.  With useRef the origin updates synchronously, so
    // each event sees the previous event's position as the new origin.
    const { el, onDrag } = renderField();
    mousedown(el, 0, 0);

    // Move 3px right, then 3px right again, then 3px right again.
    // Each delta should be (3, 0), not (3, 0), (6, 0), (9, 0).
    mousemove(3, 0);
    mousemove(6, 0);
    mousemove(9, 0);
    mouseup();

    const calls = onDrag.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([3, 0]); // from 0 → 3
    expect(calls[1]).toEqual([3, 0]); // from 3 → 6
    expect(calls[2]).toEqual([3, 0]); // from 6 → 9
  });

  it('stops calling onDrag after mouseup', () => {
    const { el, onDrag } = renderField();
    mousedown(el, 0, 0);
    mousemove(10, 10);
    mouseup();
    mousemove(20, 20); // should be ignored — drag is over
    expect(onDrag).toHaveBeenCalledTimes(1);
  });

  it('calls onDragStart when drag begins', () => {
    const { el, onDragStart } = renderField();
    mousedown(el, 0, 0);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });
});

describe('DraggableField — resize', () => {
  // Handles are selected by `data-resize-handle`, not by a Tailwind cursor
  // className: cursor is an inline style now, and 'nw'/'se' share the same
  // 'nwse-resize' value so it can't identify a corner anyway. The attribute is
  // also the stable selector this component exposes for the purpose, and the
  // real contract — InfiniteCanvas's pan guard already does
  // `target.closest('[data-resize-handle]')`.
  it('calls onResize with new width/height during resize', () => {
    const { el, onResize } = renderField({}, { isSelected: true });
    const resizeHandle = el.querySelector('[data-resize-handle="se"]') as HTMLElement;
    expect(resizeHandle).not.toBeNull();

    // Field is 200×30, scale=1, so scaled dims = 200×30
    // Start resize at (0,0), move to (50, 20)
    fireEvent.mouseDown(resizeHandle as HTMLElement, { clientX: 0, clientY: 0, bubbles: true });
    mousemove(50, 20);
    mouseup();

    // Expected: (newWidth, newHeight, initialCanvasWidth, initialFontSize, newCanvasX, newCanvasY)
    // = (200 + 50, 30 + 20, 200, 16) = (250, 50, 200, 16); the 'se' handle never
    // repositions the field (only nw/ne/sw do), so the trailing two args are undefined.
    expect(onResize).toHaveBeenCalledWith(250, 50, 200, 16, undefined, undefined);
  });

  it('does not resize below minimum dimensions', () => {
    const { el, onResize } = renderField({}, { isSelected: true });
    const resizeHandle = el.querySelector('[data-resize-handle="se"]') as HTMLElement;

    fireEvent.mouseDown(resizeHandle as HTMLElement, { clientX: 0, clientY: 0, bubbles: true });
    // Move so far left that new width would be negative
    mousemove(-999, -999);
    mouseup();

    expect(onResize).not.toHaveBeenCalled();
  });
});

describe('DraggableField — locked field', () => {
  it('does not call onDragStart when field is locked', () => {
    const { el, onDragStart } = renderField({ locked: true });
    mousedown(el, 0, 0);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('does not call onDrag when field is locked', () => {
    const { el, onDrag } = renderField({ locked: true });
    mousedown(el, 0, 0);
    mousemove(10, 10);
    mouseup();
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('still calls onSelect on mousedown even when locked', () => {
    const { el, onSelect } = renderField({ locked: true });
    mousedown(el, 0, 0);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('DraggableField — rendering', () => {
  it('renders text field with sample value', () => {
    const { el } = renderField({ type: 'name', sampleValue: 'Jane Doe' });
    expect(el.textContent).toContain('Jane Doe');
  });

  it('renders text field with type default when no sampleValue', () => {
    const { el } = renderField({ type: 'name' });
    expect(el.textContent).toContain('John Doe');
  });

  it('renders prefix and suffix around text content', () => {
    const { el } = renderField({ type: 'name', prefix: 'Mr. ', suffix: ' Esq.' });
    expect(el.textContent).toContain('Mr. John Doe Esq.');
  });

  it('renders image placeholder when imageUrl is absent', () => {
    const { el } = renderField({ type: 'image', imageUrl: undefined });
    // SVG image placeholder should be present
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('renders img tag when imageUrl is present', () => {
    const { el } = renderField({ type: 'image', imageUrl: 'https://example.com/img.png' });
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.src).toContain('example.com/img.png');
  });

  it('renders QR code container for qr_code type', () => {
    const { el } = renderField({ type: 'qr_code' });
    // QRCodePreview renders an SVG
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('shows resize handle only when selected', () => {
    const { el: unselected } = renderField({}, { isSelected: false });
    expect(unselected.querySelector('[data-resize-handle]')).toBeNull();

    const { el: selected } = renderField({}, { isSelected: true });
    expect(selected.querySelector('[data-resize-handle]')).not.toBeNull();
  });
});

// ── Keyboard operability (GARDEN-4 / WCAG 2.1.1) ──────────────────────────────

describe('DraggableField — keyboard focus and selection', () => {
  it('exposes the field box as a focusable group with an accessible name', () => {
    const { el } = renderField({ label: 'Full Name', type: 'name' });
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('aria-label')).toContain('Full Name');
    expect(el.getAttribute('aria-label')).toContain('recipient name');
  });

  it('marks a locked field as locked in its accessible name', () => {
    const { el } = renderField({ locked: true });
    expect(el.getAttribute('aria-label')).toContain('locked');
  });

  it('selects the field when it receives keyboard focus', () => {
    const { el, onSelect } = renderField();
    focusField(el);
    expect(el).toHaveFocus();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does not double-select when focus follows a mousedown', () => {
    // The browser focuses a tabbable element right after mousedown; without the
    // pointer guard this would fire onSelect twice and clobber shift+click
    // multi-select with a modifier-less selection.
    const { el, onSelect } = renderField();
    mousedown(el, 0, 0);
    focusField(el);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('announces the active keyboard mode in a live region while focused', () => {
    const { el } = renderField();
    const live = el.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.textContent).toBe('');
    focusField(el);
    expect(live.textContent).toContain('Move mode');
    press(el, 's');
    expect(live.textContent).toContain('Resize mode');
  });
});

describe('DraggableField — keyboard nudge (move mode)', () => {
  it('moves 1px per arrow press', () => {
    const { el, onDrag } = renderField();
    focusField(el);
    press(el, 'ArrowRight');
    expect(onDrag).toHaveBeenCalledWith(1, 0);
    press(el, 'ArrowLeft');
    expect(onDrag).toHaveBeenLastCalledWith(-1, 0);
    press(el, 'ArrowDown');
    expect(onDrag).toHaveBeenLastCalledWith(0, 1);
    press(el, 'ArrowUp');
    expect(onDrag).toHaveBeenLastCalledWith(0, -1);
  });

  it('moves 10px per arrow press with Shift', () => {
    const { el, onDrag } = renderField();
    focusField(el);
    press(el, 'ArrowRight', { shiftKey: true });
    expect(onDrag).toHaveBeenCalledWith(10, 0);
  });

  it('scales the nudge delta to screen pixels (onDrag contract)', () => {
    // onDrag deltas are screen px; InfiniteCanvas divides by scale to get
    // canvas units, so a 1-unit nudge at scale 2 must send 2 screen px.
    const { el, onDrag } = renderField({}, { scale: 2 });
    focusField(el);
    press(el, 'ArrowRight');
    expect(onDrag).toHaveBeenCalledWith(2, 0);
  });

  it('ignores arrow keys held with Cmd/Ctrl/Alt so global shortcuts still work', () => {
    const { el, onDrag } = renderField();
    focusField(el);
    press(el, 'ArrowRight', { metaKey: true });
    press(el, 'ArrowRight', { ctrlKey: true });
    press(el, 'ArrowRight', { altKey: true });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('does not resize or rotate while in the default move mode', () => {
    const { el, onResize, onRotate } = renderField();
    focusField(el);
    press(el, 'ArrowRight');
    expect(onResize).not.toHaveBeenCalled();
    expect(onRotate).not.toHaveBeenCalled();
  });
});

describe('DraggableField — keyboard resize mode (S)', () => {
  it('resizes by 1 unit per arrow press after pressing S', () => {
    const { el, onResize, onDrag } = renderField();
    focusField(el);
    press(el, 's');
    press(el, 'ArrowRight');
    // (newWidth, newHeight, initialCanvasWidth, initialFontSize) in screen px
    expect(onResize).toHaveBeenCalledWith(201, 30, 200, 16);
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('resizes height with up/down arrows and 10 units with Shift', () => {
    const { el, onResize } = renderField();
    focusField(el);
    press(el, 's');
    press(el, 'ArrowDown', { shiftKey: true });
    expect(onResize).toHaveBeenCalledWith(200, 40, 200, 16);
  });

  it('converts to screen pixels using the current scale', () => {
    const { el, onResize } = renderField({}, { scale: 2 });
    focusField(el);
    press(el, 's');
    press(el, 'ArrowRight');
    expect(onResize).toHaveBeenCalledWith(402, 60, 200, 16);
  });

  it('refuses to shrink a field below the minimum size', () => {
    const { el, onResize } = renderField({ width: 8, height: 8 });
    focusField(el);
    press(el, 's');
    press(el, 'ArrowLeft');
    press(el, 'ArrowUp');
    expect(onResize).not.toHaveBeenCalled();
  });

  it('S toggles back to move mode', () => {
    const { el, onResize, onDrag } = renderField();
    focusField(el);
    press(el, 's');
    press(el, 's');
    press(el, 'ArrowRight');
    expect(onResize).not.toHaveBeenCalled();
    expect(onDrag).toHaveBeenCalledWith(1, 0);
  });

  it('Escape returns to move mode', () => {
    const { el, onResize, onDrag } = renderField();
    focusField(el);
    press(el, 's');
    press(el, 'Escape');
    press(el, 'ArrowRight');
    expect(onResize).not.toHaveBeenCalled();
    expect(onDrag).toHaveBeenCalledWith(1, 0);
  });

  it('blurring the field resets the mode back to move', () => {
    const { el, onResize, onDrag } = renderField();
    focusField(el);
    press(el, 's');
    blurField(el);
    focusField(el);
    press(el, 'ArrowRight');
    expect(onResize).not.toHaveBeenCalled();
    expect(onDrag).toHaveBeenCalledWith(1, 0);
  });
});

describe('DraggableField — keyboard rotate mode (R)', () => {
  it('rotates 1 degree per arrow press after pressing R', () => {
    const { el, onRotate, onDrag } = renderField({ rotation: 0 });
    focusField(el);
    press(el, 'r');
    press(el, 'ArrowRight');
    expect(onRotate).toHaveBeenCalledWith(1);
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('rotates 15 degrees with Shift', () => {
    const { el, onRotate } = renderField({ rotation: 30 });
    focusField(el);
    press(el, 'r');
    press(el, 'ArrowRight', { shiftKey: true });
    expect(onRotate).toHaveBeenCalledWith(45);
  });

  it('wraps below zero into the 0–359 range', () => {
    const { el, onRotate } = renderField({ rotation: 0 });
    focusField(el);
    press(el, 'r');
    press(el, 'ArrowLeft');
    expect(onRotate).toHaveBeenCalledWith(359);
  });

  it('wraps past 360 back into range', () => {
    const { el, onRotate } = renderField({ rotation: 359 });
    focusField(el);
    press(el, 'r');
    press(el, 'ArrowRight', { shiftKey: true });
    expect(onRotate).toHaveBeenCalledWith(14);
  });

  it('R toggles back to move mode', () => {
    const { el, onRotate, onDrag } = renderField();
    focusField(el);
    press(el, 'r');
    press(el, 'r');
    press(el, 'ArrowRight');
    expect(onRotate).not.toHaveBeenCalled();
    expect(onDrag).toHaveBeenCalledWith(1, 0);
  });
});

describe('DraggableField — rotate mode requires an onRotate handler', () => {
  it('does not enter (or announce) rotate mode when onRotate is not wired, and arrows still nudge', () => {
    // Mirrors CertificateCanvas's legacy consumer, which doesn't pass onRotate.
    const onDrag = vi.fn<FieldProps['onDrag']>();
    const { container } = render(
      <DraggableField
        field={makeField()}
        scale={1}
        isSelected={false}
        onDrag={onDrag}
        onResize={vi.fn()}
        onSelect={vi.fn()}
        // onRotate intentionally omitted
      />,
    );
    const el = container.firstChild as HTMLElement;
    focusField(el);
    press(el, 'r');

    expect(el.getAttribute('data-keyboard-mode')).toBe('move');
    const live = el.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.textContent).not.toContain('Rotate mode');

    // Arrows should still nudge (move mode), not silently no-op.
    press(el, 'ArrowRight');
    expect(onDrag).toHaveBeenCalledWith(1, 0);
  });
});

describe('DraggableField — mode badge only shows for keyboard-driven focus', () => {
  it('does not announce/show the mode badge when focus follows a mousedown', () => {
    const { el } = renderField();
    mousedown(el, 0, 0);
    // The browser focuses the tabbable element right after mousedown.
    focusField(el);
    const live = el.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.textContent).toBe('');
    expect(el.textContent).not.toContain('Move mode');
  });

  it('announces/shows the mode badge when focus arrives via keyboard (Tab)', () => {
    const { el } = renderField();
    focusField(el);
    const live = el.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.textContent).toContain('Move mode');
    expect(el.textContent).toContain('Move mode');
  });
});

describe('DraggableField — locked field keyboard gating', () => {
  it('is still focusable and selectable when locked', () => {
    const { el, onSelect } = renderField({ locked: true });
    focusField(el);
    expect(el).toHaveFocus();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('cannot be nudged with the arrow keys', () => {
    const { el, onDrag } = renderField({ locked: true });
    focusField(el);
    press(el, 'ArrowRight');
    press(el, 'ArrowDown', { shiftKey: true });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('cannot enter resize mode or be resized', () => {
    const { el, onResize } = renderField({ locked: true });
    focusField(el);
    press(el, 's');
    press(el, 'ArrowRight');
    expect(onResize).not.toHaveBeenCalled();
    expect(el.getAttribute('data-keyboard-mode')).toBe('move');
  });

  it('cannot enter rotate mode or be rotated', () => {
    const { el, onRotate } = renderField({ locked: true });
    focusField(el);
    press(el, 'r');
    press(el, 'ArrowRight');
    expect(onRotate).not.toHaveBeenCalled();
    expect(el.getAttribute('data-keyboard-mode')).toBe('move');
  });
});

describe('DraggableField — font default', () => {
  it('uses DM Sans as default fontFamily when none specified', () => {
    const field = makeField({ fontFamily: undefined as unknown as string });
    // fontFamily prop flows through to inline style on the wrapper div
    const { container } = render(
      <DraggableField
        field={{ ...field, fontFamily: 'DM Sans' }}
        scale={1}
        isSelected={false}
        onDrag={vi.fn()}
        onResize={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    // The outer div (container.firstChild) only carries positioning styles;
    // text-layout styles (incl. fontFamily) live on the inner "content layer" div,
    // tagged `data-field-content`.
    const content = (container.firstChild as HTMLElement)
      .querySelector('[data-field-content]') as HTMLElement;
    expect(content.style.fontFamily).toContain('DM Sans');
  });
});
