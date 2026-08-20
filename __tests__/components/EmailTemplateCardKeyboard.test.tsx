/**
 * Email template card — keyboard operability (GARDEN-5)
 *
 * WCAG 2.1.1 (Keyboard) + 4.1.2 (Name, Role, Value):
 * the primary "open/edit this template" target used to be a plain
 * `<div onClick>` with no role, no tabIndex and no key handling. It is now a
 * stretched, transparent `<button type="button">` layered over the card, so it
 * is reachable with Tab and activates with Enter/Space.
 *
 * Covers:
 *  - The card exposes a real button with an accessible name
 *  - Tab reaches it
 *  - Enter activates it with the same effect as a click (router.push to editor)
 *  - Space activates it with the same effect as a click
 *  - The nested per-card action buttons (Edit/Duplicate/Delete/Send) still work
 *
 * Note: jsdom has no layout engine, so the z-index layering that keeps the
 * action row clickable above the stretched button cannot be asserted here —
 * that part was verified by reading the stacking context (card is the nearest
 * positioned/transformed ancestor; overlay z-10 < action row z-20).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgProvider } from '@/lib/org';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  duplicate: vi.fn(),
  templates: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/hooks/queries/delivery', () => ({
  useDeliveryTemplates: () => ({
    templates: mocks.templates,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDeliveryIntegrations: () => ({ integrations: [], loading: false, error: null, refetch: vi.fn() }),
  useCreateDeliveryTemplate: () => ({ mutate: vi.fn(), isPending: false, error: null, variables: undefined }),
  useDeleteDeliveryTemplate: () => ({ mutate: vi.fn(), isPending: false, error: null, variables: undefined }),
  useDuplicateDeliveryTemplate: () => ({ mutate: mocks.duplicate, isPending: false, error: null, variables: undefined }),
}));

vi.mock('@/lib/hooks/queries/organizations', () => ({
  useOrganization: () => ({ organization: null, loading: false, error: null }),
}));

vi.mock('@/lib/api/client', () => ({
  api: { delivery: { importResendTemplates: vi.fn() } },
}));

// Heavy editor module (dnd-kit + colour picker) — the page only needs one helper.
vi.mock('@/app/dashboard/org/[slug]/email-templates/[id]/EmailBlockBuilder', () => ({
  replaceQrApiWithSvg: (html: string) => html,
}));

import EmailTemplatesPage from '@/app/dashboard/org/[slug]/email-templates/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** `isTemplateSaved` treats updated_at > created_at + 2min as "saved by the user". */
function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    organization_id: 'org-1',
    channel: 'email' as const,
    name: 'Welcome Email',
    is_default: false,
    is_active: true,
    email_subject: 'Welcome aboard',
    body: '',
    variables: [],
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <OrgProvider slug="acme">
      <EmailTemplatesPage />
    </OrgProvider>,
  );
}

beforeEach(() => {
  mocks.push.mockClear();
  mocks.duplicate.mockClear();
  mocks.templates = [makeTemplate()];
  window.localStorage.clear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Email template card — keyboard operability', () => {
  it('exposes the card as a button with an accessible name', () => {
    renderPage();
    const card = screen.getByRole('button', { name: 'Edit template: Welcome Email' });
    expect(card.tagName).toBe('BUTTON');
    expect(card).toHaveAttribute('type', 'button');
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = screen.getByRole('button', { name: 'Edit template: Welcome Email' });

    // Walk the tab order from the top of the document — the card must be in it.
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await user.tab();
      reached = document.activeElement === card;
    }
    expect(reached).toBe(true);
  });

  it('opens the template editor on Enter, same as a click', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = screen.getByRole('button', { name: 'Edit template: Welcome Email' });

    card.focus();
    await user.keyboard('{Enter}');

    expect(mocks.push).toHaveBeenCalledWith('/dashboard/org/acme/email-templates/tpl-1');
  });

  it('opens the template editor on Space, same as a click', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = screen.getByRole('button', { name: 'Edit template: Welcome Email' });

    card.focus();
    await user.keyboard('[Space]');

    expect(mocks.push).toHaveBeenCalledWith('/dashboard/org/acme/email-templates/tpl-1');
  });

  it('click on the card still opens the editor', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit template: Welcome Email' }));

    expect(mocks.push).toHaveBeenCalledWith('/dashboard/org/acme/email-templates/tpl-1');
  });

  it('keeps the nested card action buttons working', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTitle('Duplicate'));
    expect(mocks.duplicate).toHaveBeenCalled();
    // The stretched card button must not have fired as well.
    expect(mocks.push).not.toHaveBeenCalled();

    await user.click(screen.getByTitle('Send as campaign'));
    expect(mocks.push).toHaveBeenCalledWith('/dashboard/org/acme/broadcasts?fromTemplate=tpl-1');
  });
});
