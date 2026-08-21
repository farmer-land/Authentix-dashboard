/**
 * Billing page - PlanFeaturesModal (Dialog) and DeleteAccountDialog
 * (AlertDialog) Radix migration (GARDEN-6).
 *
 * Both are mounted directly (they are exported from page.tsx specifically
 * for this) rather than through the full BillingPage, to avoid dragging in
 * useBillingOverview/useOrganization/useUserProfile data-fetching just to
 * exercise two self-contained dialog components.
 *
 * Covers:
 *  - role="dialog" / role="alertdialog" + aria-modal="true" + aria-labelledby
 *    pointing at a real title (both were hand-rolled `fixed inset-0` divs
 *    with zero ARIA semantics before).
 *  - DeleteAccountDialog close X now has aria-label (was a bare icon button
 *    with no accessible name at all - the ticket's explicit callout).
 *  - Focus trap (wrap at both edges) and Escape-to-close.
 *  - Focus restoration to the trigger button that opened each dialog.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { createRef, useState } from 'react';
import {
  PlanFeaturesModal,
  DeleteAccountDialog,
} from '@/app/dashboard/org/[slug]/billing/page';

function getTabbable(container: Element): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]'),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}

async function flushRadixUnmountTimer() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('PlanFeaturesModal (Radix Dialog)', () => {
  it('exposes correct dialog ARIA semantics', () => {
    render(<PlanFeaturesModal open onClose={vi.fn()} activePlan="Farm" />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)).toHaveTextContent('Plan comparison');
  });

  it('closes on Escape and calls onClose', () => {
    const onClose = vi.fn();
    render(<PlanFeaturesModal open onClose={onClose} activePlan="Farm" />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the footer "Got it" button is clicked', () => {
    const onClose = vi.fn();
    render(<PlanFeaturesModal open onClose={onClose} activePlan="Farm" />);
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus and wraps at both edges', () => {
    render(<PlanFeaturesModal open onClose={vi.fn()} activePlan="Farm" />);
    const dialog = screen.getByRole('dialog');
    const tabbable = getTabbable(dialog);
    expect(tabbable.length).toBeGreaterThan(1);
    const first = tabbable[0] as HTMLElement;
    const last = tabbable[tabbable.length - 1] as HTMLElement;

    act(() => { last.focus(); });
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    act(() => { first.focus(); });
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the trigger button on close', async () => {
    const triggerRef = createRef<HTMLButtonElement>();
    // `open` must actually flip to false on close (wired through real
    // state, not a hardcoded `open` literal) — otherwise Radix's Presence
    // never unmounts Content and onCloseAutoFocus never fires. Confirmed by
    // running this test with a hardcoded `open` first: it failed with focus
    // left on the just-clicked Close button, because the dialog never
    // actually closed.
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <div>
          <button ref={triggerRef}>What is included</button>
          <PlanFeaturesModal open={open} onClose={() => setOpen(false)} activePlan="Farm" triggerRef={triggerRef} />
        </div>
      );
    }
    render(<Harness />);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await flushRadixUnmountTimer();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(triggerRef.current);
  });
});

describe('DeleteAccountDialog (Radix AlertDialog)', () => {
  const baseProps = {
    orgName: 'Acme University',
    totalOutstanding: 0,
    onConfirm: vi.fn().mockResolvedValue(undefined),
  };

  it('exposes correct alertdialog ARIA semantics', () => {
    render(<DeleteAccountDialog {...baseProps} onCancel={vi.fn()} />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)).toHaveTextContent('Delete account');
  });

  it('gives the close X button a real accessible name (was empty before)', () => {
    render(<DeleteAccountDialog {...baseProps} onCancel={vi.fn()} />);

    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByRole('button', { name: 'Close delete account dialog' }),
    ).toBeInTheDocument();
  });

  it('closes on Escape and calls onCancel', () => {
    const onCancel = vi.fn();
    render(<DeleteAccountDialog {...baseProps} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on outside click - AlertDialog requires an explicit choice', () => {
    const onCancel = vi.fn();
    render(<DeleteAccountDialog {...baseProps} onCancel={onCancel} />);

    const openEls = Array.from(document.querySelectorAll('[data-state="open"]'));
    const overlay = openEls.find((el) => el.getAttribute('role') !== 'alertdialog') as HTMLElement;
    expect(overlay).toBeTruthy();

    fireEvent.pointerDown(overlay);
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('traps focus and wraps at both edges (warning step)', () => {
    render(<DeleteAccountDialog {...baseProps} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('alertdialog');
    const tabbable = getTabbable(dialog);
    expect(tabbable.length).toBeGreaterThan(1);
    const first = tabbable[0] as HTMLElement;
    const last = tabbable[tabbable.length - 1] as HTMLElement;

    act(() => { last.focus(); });
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    act(() => { first.focus(); });
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the trigger button on close', async () => {
    const triggerRef = createRef<HTMLButtonElement>();
    // Mirrors how BillingPage actually renders this: `{deleteOpen &&
    // <DeleteAccountDialog .../>}` — the component itself always passes a
    // literal `open` to <AlertDialog>, so the *parent* unmounting it on
    // cancel is what makes Radix's Presence actually close and fire
    // onCloseAutoFocus.
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <div>
          <button ref={triggerRef}>Request deletion</button>
          {open && (
            <DeleteAccountDialog {...baseProps} onCancel={() => setOpen(false)} triggerRef={triggerRef} />
          )}
        </div>
      );
    }
    render(<Harness />);

    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await flushRadixUnmountTimer();

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(triggerRef.current);
  });

  it('walks warning to confirm step and requires typing delete before the destructive button enables', () => {
    render(<DeleteAccountDialog {...baseProps} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'I understand, continue' }));

    const deleteBtn = screen.getByRole('button', { name: 'Delete account' });
    expect(deleteBtn).toBeDisabled();

    const input = screen.getByPlaceholderText('delete');
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(deleteBtn).not.toBeDisabled();
  });

  it('blocks deletion and shows the outstanding-balance state when totalOutstanding is greater than zero', () => {
    render(<DeleteAccountDialog {...baseProps} totalOutstanding={500} onCancel={vi.fn()} />);

    expect(screen.getByText(/Outstanding balance/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I understand, continue' })).not.toBeInTheDocument();
  });
});
