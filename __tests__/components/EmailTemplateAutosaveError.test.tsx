/**
 * Email template editor — autosave failure handling (GARDEN-11)
 *
 * Before the fix, the autosave debounce's `catch` block just reset
 * `autoSaveStatus` back to "idle" — visually identical to the pre-edit,
 * nothing-changed-yet state. A user watching the header had no way to tell
 * "my edit auto-saved" from "my edit silently failed to save", so they could
 * navigate away believing their changes were persisted when they weren't.
 *
 * Covers:
 *  - a failed autosave produces a distinct, visible "Not saved" indicator
 *    (not the same "idle" state as before any edit)
 *  - a failed autosave also raises a toast.error with the failure reason
 *  - "idle" (nothing pending) and "error" (last save failed) are two
 *    different, distinguishable UI states — not the same DOM output
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  updateTemplate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  push: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'tpl-1' }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/org', () => ({
  useOrg: () => ({ orgPath: (p: string) => `/dashboard/org/acme${p}`, slug: 'acme' }),
}));

vi.mock('@/lib/hooks/queries/delivery', () => ({
  useDeliveryIntegrations: () => ({ integrations: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    delivery: {
      listTemplates: mocks.listTemplates,
      updateTemplate: mocks.updateTemplate,
      testSend: vi.fn(),
    },
  },
}));

// The block builder is a heavy dnd-kit canvas unrelated to autosave status —
// stub it down to the handful of pure helpers/components page.tsx actually
// calls, same pattern used by __tests__/components/EmailTemplateCardKeyboard.test.tsx.
vi.mock('@/app/dashboard/org/[slug]/email-templates/[id]/EmailBlockBuilder', () => ({
  EmailBlockBuilder: () => null,
  BlockPropertiesPanel: () => null,
  PaletteItemCard: () => null,
  blocksToHtml: () => '<html-stub>',
  extractEditorState: () => null,
  defaultBlock: (type: string) => ({ id: 'blk-1', type }),
  STARTER_BLOCKS: [],
  PALETTE: [],
  CERT_BLOCKS_PALETTE: [],
  applyPreviewMocks: (html: string) => html,
}));

import EmailTemplateEditorPage from '@/app/dashboard/org/[slug]/email-templates/[id]/page';

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    organization_id: 'org-1',
    channel: 'email' as const,
    name: 'Welcome Email',
    is_default: false,
    is_active: true,
    email_subject: 'Welcome aboard',
    body: '<p>Hello {{recipient_name}}</p>',
    variables: [],
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mocks.listTemplates.mockReset().mockResolvedValue([makeTemplate()]);
  mocks.updateTemplate.mockReset();
  mocks.toastError.mockClear();
  mocks.toastSuccess.mockClear();
  mocks.push.mockClear();
});

/** Loads the page and waits past the 500ms isInitialLoad window, so editing fields arms autosave. */
async function renderLoadedEditor() {
  render(<EmailTemplateEditorPage />);
  const nameInput = await screen.findByPlaceholderText('Template name');
  await new Promise(resolve => setTimeout(resolve, 600));
  return nameInput;
}

describe('Email template editor — autosave failure handling', () => {
  it('shows a distinct "error" indicator (not "idle") and a toast when autosave fails', async () => {
    mocks.updateTemplate.mockRejectedValue(new Error('network timeout'));
    const nameInput = await renderLoadedEditor();

    fireEvent.change(nameInput, { target: { value: 'Welcome Email v2' } });

    // Debounce is 4s — wait for the failed save's visible indicator.
    await waitFor(
      () => {
        expect(screen.getByText('Not saved')).toBeInTheDocument();
      },
      { timeout: 6000 },
    );

    expect(mocks.toastError).toHaveBeenCalledWith('Autosave failed: network timeout');
    // The "Saved" indicator must NOT be showing — this was not a successful save.
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  }, 10000);

  it('idle (no edits yet) and error (failed save) are distinguishable UI states', async () => {
    mocks.updateTemplate.mockRejectedValue(new Error('server unavailable'));
    const nameInput = await renderLoadedEditor();

    // Before any edit: neither the "Saved" text nor the destructive "Not saved"
    // indicator is present — this is the true idle state.
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Renamed' } });

    await waitFor(
      () => {
        expect(screen.getByText('Not saved')).toBeInTheDocument();
      },
      { timeout: 6000 },
    );

    // The failed-save state is now visibly different from the pre-edit idle
    // state (a titled, destructive-colored indicator), not silently reverted.
    const indicator = screen.getByText('Not saved');
    expect(indicator.closest('span')).toHaveAttribute(
      'title',
      'Autosave failed — your latest changes may not be saved',
    );
  }, 10000);
});
