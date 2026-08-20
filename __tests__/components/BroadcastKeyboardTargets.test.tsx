/**
 * Broadcast wizard — keyboard operability of the primary click targets (GARDEN-5)
 *
 * WCAG 2.1.1 (Keyboard) + 4.1.2 (Name, Role, Value). Three targets used to be
 * plain `<div onClick>` elements with no role, tabIndex or key handling:
 *
 *  1. Template picker cards      -> now `<button type="button" aria-pressed>`
 *  2. "Design from scratch" tile -> now `<button type="button">`
 *  3. Contact-selection rows     -> now `<button type="button" role="checkbox"
 *                                        aria-checked>` (native Enter/Space
 *                                        activation, no hand-rolled key handler)
 *
 * Covers: Tab reaches each control, Enter/Space have the same effect as a
 * click, and the contact row's `aria-checked` tracks selection state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgProvider } from '@/lib/org';

const mocks = vi.hoisted(() => ({
  templates: [] as unknown[],
  contacts: [] as unknown[],
  contactTotal: 0,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/hooks/queries/delivery', () => ({
  useEmailBroadcasts: () => ({ broadcasts: [], loading: false, error: null, refetch: vi.fn() }),
  useCreateBroadcast: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null }),
  useDeleteBroadcast: () => ({ mutate: vi.fn(), isPending: false, error: null, variables: undefined }),
  useDeliveryIntegrations: () => ({ integrations: [], loading: false, error: null, refetch: vi.fn() }),
  useEmailContacts: () => ({
    contacts: mocks.contacts,
    total: mocks.contactTotal,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDeliveryTemplates: () => ({ templates: mocks.templates, loading: false, error: null, refetch: vi.fn() }),
  useEmailSegments: () => ({ segments: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/lib/api/client', () => ({
  api: { delivery: { sendBroadcast: vi.fn() } },
}));

vi.mock('@e965/xlsx', () => ({ read: vi.fn(), utils: { sheet_to_json: vi.fn() } }));

vi.mock('@/app/dashboard/org/[slug]/broadcasts/EmailEditor', () => ({
  EmailEditor: () => <div data-testid="email-editor" />,
}));

import { BroadcastsContent } from '@/app/dashboard/org/[slug]/broadcasts/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    organization_id: 'org-1',
    channel: 'email' as const,
    name: 'Spring Newsletter',
    is_default: false,
    is_active: true,
    email_subject: 'Spring news',
    body: '<p>Hello {{first_name}}</p>',
    variables: ['first_name'],
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    organization_id: 'org-1',
    email: 'ravi@example.com',
    first_name: 'Ravi',
    last_name: 'Kumar',
    unsubscribed: false,
    custom_properties: {},
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderBroadcasts(props: { initialTemplateId?: string; initialSourceRef?: string } = {}) {
  return render(
    <OrgProvider slug="acme">
      <BroadcastsContent {...props} />
    </OrgProvider>,
  );
}

/**
 * The wizard jumps straight to the Recipients step in "contacts" mode when it is
 * opened from the contacts page with both a template and a source ref.
 */
const CONTACTS_ENTRY = { initialTemplateId: 'tpl-1', initialSourceRef: 'import-abc' };

/** Opens the wizard at the Compose step (where the template picker lives). */
async function openWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /new campaign/i }));
}

beforeEach(() => {
  mocks.templates = [makeTemplate()];
  mocks.contacts = [makeContact(), makeContact({ id: 'contact-2', email: 'priya@example.com', first_name: 'Priya' })];
  mocks.contactTotal = 2;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

// ── 1. Template picker cards ──────────────────────────────────────────────────

describe('Broadcast wizard — template picker cards', () => {
  it('renders each template card as a button that reports its selected state', async () => {
    const user = userEvent.setup();
    renderBroadcasts();
    await openWizard(user);

    const card = screen.getByRole('button', { name: /Spring Newsletter/ });
    expect(card.tagName).toBe('BUTTON');
    expect(card).toHaveAttribute('type', 'button');
    expect(card).toHaveAttribute('aria-pressed', 'false');
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    renderBroadcasts();
    await openWizard(user);

    const card = screen.getByRole('button', { name: /Spring Newsletter/ });
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await user.tab();
      reached = document.activeElement === card;
    }
    expect(reached).toBe(true);
  });

  it('selects the template on Enter, same as a click', async () => {
    const user = userEvent.setup();
    renderBroadcasts();
    await openWizard(user);

    const card = screen.getByRole('button', { name: /Spring Newsletter/ });
    card.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: /Spring Newsletter/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects the template on Space, same as a click', async () => {
    const user = userEvent.setup();
    renderBroadcasts();
    await openWizard(user);

    const card = screen.getByRole('button', { name: /Spring Newsletter/ });
    card.focus();
    await user.keyboard('[Space]');

    expect(screen.getByRole('button', { name: /Spring Newsletter/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('selecting by click behaves identically', async () => {
    const user = userEvent.setup();
    renderBroadcasts();
    await openWizard(user);

    await user.click(screen.getByRole('button', { name: /Spring Newsletter/ }));

    expect(screen.getByRole('button', { name: /Spring Newsletter/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

// ── 2. "Design from scratch" tile ─────────────────────────────────────────────

describe('Broadcast wizard — "Design from scratch" tile', () => {
  it('is a button with an accessible name', async () => {
    const user = userEvent.setup();
    renderBroadcasts();
    await openWizard(user);

    const tile = screen.getByRole('button', { name: 'Design from scratch' });
    expect(tile.tagName).toBe('BUTTON');
    expect(tile).toHaveAttribute('type', 'button');
  });

  it('opens the email editor on Enter, same as a click', async () => {
    const user = userEvent.setup();
    renderBroadcasts();
    await openWizard(user);

    screen.getByRole('button', { name: 'Design from scratch' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('email-editor')).toBeInTheDocument();
  });

  it('opens the email editor on Space, same as a click', async () => {
    const user = userEvent.setup();
    renderBroadcasts();
    await openWizard(user);

    screen.getByRole('button', { name: 'Design from scratch' }).focus();
    await user.keyboard('[Space]');

    expect(screen.getByTestId('email-editor')).toBeInTheDocument();
  });
});

// ── 3. Contact-selection rows ─────────────────────────────────────────────────

describe('Broadcast wizard — contact-selection rows', () => {
  it('exposes each row as an unchecked checkbox', () => {
    renderBroadcasts(CONTACTS_ENTRY);

    const rows = screen.getAllByRole('checkbox');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveAttribute('aria-checked', 'false');
    }
    expect(rows[0]).toHaveAccessibleName(/ravi@example\.com/);
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    renderBroadcasts(CONTACTS_ENTRY);

    const row = screen.getAllByRole('checkbox')[0]!;
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await user.tab();
      reached = document.activeElement === row;
    }
    expect(reached).toBe(true);
  });

  it('toggles selection on Space and reflects it in aria-checked', async () => {
    const user = userEvent.setup();
    renderBroadcasts(CONTACTS_ENTRY);

    screen.getAllByRole('checkbox')[0]!.focus();
    await user.keyboard('[Space]');

    expect(screen.getAllByRole('checkbox')[0]!).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('checkbox')[1]!).toHaveAttribute('aria-checked', 'false');
    // Both the counter above the list and the footer summary say "1 selected".
    expect(screen.getAllByText('1 selected').length).toBeGreaterThan(0);

    // Pressing again deselects — same toggle as clicking twice.
    screen.getAllByRole('checkbox')[0]!.focus();
    await user.keyboard('[Space]');
    expect(screen.getAllByRole('checkbox')[0]!).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles selection on Enter', async () => {
    const user = userEvent.setup();
    renderBroadcasts(CONTACTS_ENTRY);

    screen.getAllByRole('checkbox')[1]!.focus();
    await user.keyboard('{Enter}');

    expect(screen.getAllByRole('checkbox')[1]!).toHaveAttribute('aria-checked', 'true');
    // Both the counter above the list and the footer summary say "1 selected".
    expect(screen.getAllByText('1 selected').length).toBeGreaterThan(0);
  });

  it('keeps click selection behaviour unchanged', async () => {
    const user = userEvent.setup();
    renderBroadcasts(CONTACTS_ENTRY);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(screen.getAllByRole('checkbox')[1]!);

    expect(screen.getAllByText('2 selected').length).toBeGreaterThan(0);
  });
});
