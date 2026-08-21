/**
 * NotificationPanel — JobDetailModal Radix Dialog migration (GARDEN-6)
 *
 * Covers the accessibility contract the migration is supposed to deliver for
 * the hand-rolled `fixed inset-0` modal it replaced:
 *  - role="dialog" + aria-modal="true" + aria-labelledby pointing at a real
 *    title element (was a plain <div>, no ARIA semantics at all).
 *  - Focus is trapped inside the dialog while open (Tab doesn't escape it).
 *  - Escape closes it (was a manual document keydown listener before).
 *  - The close button now has a non-empty accessible name (was an icon-only
 *    button with no aria-label).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { NotificationPanel } from '@/components/dashboard/NotificationPanel';
import type { BackgroundJob } from '@/lib/notifications/job-notifications';

// Returns every element inside `container` that is actually reachable via Tab
// (has a non-negative tabIndex and isn't disabled/hidden). Used to drive
// Radix's own focus-wrap logic explicitly, since jsdom doesn't implement
// native browser Tab traversal between intermediate elements — only Radix's
// own edge-wrap handling (Tab from the last element / Shift+Tab from the
// first) runs as JS we can trigger deterministically.
function getTabbable(container: Element): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]'),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}

const jobs: BackgroundJob[] = [
  {
    id: 'job-1',
    label: 'Certificates for Batch 1',
    submittedAt: new Date().toISOString(),
    status: 'completed',
    totalCertificates: 42,
    downloadUrl: 'https://example.com/batch1.zip',
    seen: true,
  },
  {
    id: 'job-2',
    label: 'Certificates for Batch 2',
    submittedAt: new Date().toISOString(),
    status: 'running',
    seen: true,
  },
];

vi.mock('@/lib/notifications/job-notifications', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notifications/job-notifications')>(
    '@/lib/notifications/job-notifications',
  );
  return {
    ...actual,
    useJobNotifications: () => ({
      jobs,
      unseenCount: 0,
      markAllSeen: vi.fn(),
      clearJob: vi.fn(),
      clearFinished: vi.fn(),
      clearAll: vi.fn(),
      requestNotificationPermission: vi.fn(),
      notificationPermission: 'default',
    }),
  };
});

// Open the dropdown then click the first job row to open JobDetailModal.
function openJobDetailModal() {
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
  fireEvent.click(screen.getByText('Certificates for Batch 1'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationPanel — JobDetailModal (Radix Dialog)', () => {
  it('exposes correct dialog ARIA semantics', () => {
    render(<NotificationPanel expanded={false} />);
    openJobDetailModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).not.toBeNull();
    expect(titleEl).toHaveTextContent('Certificates for Batch 1');
  });

  it('gives the close button a real accessible name', () => {
    render(<NotificationPanel expanded={false} />);
    openJobDetailModal();

    const dialog = screen.getByRole('dialog');
    const closeBtn = within(dialog).getByRole('button', { name: 'Close job details' });
    expect(closeBtn).toBeInTheDocument();
  });

  it('traps focus inside the dialog while open (wraps at both edges)', () => {
    render(<NotificationPanel expanded={false} />);
    openJobDetailModal();

    const dialog = screen.getByRole('dialog');
    // Radix moves focus into the dialog content on open.
    expect(dialog.contains(document.activeElement)).toBe(true);

    const tabbable = getTabbable(dialog);
    // Sanity check on the fixture: this dialog has multiple focusable
    // elements (close button + dismiss notification), so the wrap-around
    // case is actually exercised, not vacuously true with a single element.
    expect(tabbable.length).toBeGreaterThan(1);
    const first = tabbable[0]!;
    const last = tabbable[tabbable.length - 1]!;

    // Forward-Tab from the last tabbable element wraps to the first — this
    // is the exact edge case Radix's FocusScope implements in JS (jsdom has
    // no native Tab traversal to fall back on, so this is the real trap
    // behavior, not an artifact of the test).
    act(() => { last.focus(); });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first tabbable element wraps to the last.
    act(() => { first.focus(); });
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Never escapes to something outside the dialog (e.g. body).
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', () => {
    render(<NotificationPanel expanded={false} />);
    openJobDetailModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the close button is clicked', () => {
    render(<NotificationPanel expanded={false} />);
    openJobDetailModal();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close job details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores focus to the bell button on close', async () => {
    render(<NotificationPanel expanded={false} />);
    const bell = screen.getByRole('button', { name: 'Notifications' });
    openJobDetailModal();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close job details' }));

    // Radix's FocusScope defers the actual restore-focus call to a
    // setTimeout(0) on unmount (see @radix-ui/react-focus-scope), so it
    // doesn't happen synchronously inside the click's act() batch.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    // The row that was actually clicked to open this modal lives inside the
    // dropdown, which unmounts in the same render as the modal — so there is
    // no still-present trigger for Radix's default restore-to-trigger to
    // target. The bell button (wired via `triggerRef`) is the persistent,
    // meaningful anchor for this flow instead.
    expect(document.activeElement).toBe(bell);
  });

  it('switches to another job via the "Other notifications" list without losing dialog semantics', () => {
    render(<NotificationPanel expanded={false} />);
    openJobDetailModal();

    fireEvent.click(screen.getByText('Certificates for Batch 2'));

    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).toHaveTextContent('Certificates for Batch 2');
  });
});
