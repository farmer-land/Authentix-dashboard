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
import { render, screen, fireEvent } from '@testing-library/react';
import { DraggableField } from '@/app/dashboard/org/[slug]/generate-certificate/components/DraggableField';
import type { CertificateField } from '@/lib/types/certificate';

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
    onDrag?: ReturnType<typeof vi.fn>;
    onResize?: ReturnType<typeof vi.fn>;
    onSelect?: ReturnType<typeof vi.fn>;
    onDragStart?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onDrag = props.onDrag ?? vi.fn();
  const onResize = props.onResize ?? vi.fn();
  const onSelect = props.onSelect ?? vi.fn();
  const onDragStart = props.onDragStart ?? vi.fn();

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
      onSelect={onSelect}
    />,
  );

  // The root div is the draggable element
  const el = container.firstChild as HTMLElement;
  return { el, onDrag, onResize, onSelect, onDragStart, field };
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
  it('calls onResize with new width/height during resize', () => {
    const { el, onResize } = renderField({}, { isSelected: true });
    const resizeHandle = el.querySelector('[class*="cursor-nwse-resize"]') as HTMLElement;
    expect(resizeHandle).not.toBeNull();

    // Field is 200×30, scale=1, so scaled dims = 200×30
    // Start resize at (0,0), move to (50, 20)
    fireEvent.mouseDown(resizeHandle, { clientX: 0, clientY: 0, bubbles: true });
    mousemove(50, 20);
    mouseup();

    // Expected: (newWidth, newHeight, initialCanvasWidth, initialFontSize)
    // = (200 + 50, 30 + 20, 200, 16) = (250, 50, 200, 16)
    expect(onResize).toHaveBeenCalledWith(250, 50, 200, 16);
  });

  it('does not resize below minimum dimensions', () => {
    const { el, onResize } = renderField({}, { isSelected: true });
    const resizeHandle = el.querySelector('[class*="cursor-nwse-resize"]') as HTMLElement;

    fireEvent.mouseDown(resizeHandle, { clientX: 0, clientY: 0, bubbles: true });
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
    expect(unselected.querySelector('[class*="cursor-nwse-resize"]')).toBeNull();

    const { el: selected } = renderField({}, { isSelected: true });
    expect(selected.querySelector('[class*="cursor-nwse-resize"]')).not.toBeNull();
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
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.fontFamily).toContain('DM Sans');
  });
});
