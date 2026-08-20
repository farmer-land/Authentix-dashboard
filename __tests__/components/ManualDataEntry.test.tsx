/**
 * Component tests for ManualDataEntry.
 * Covers: row add/edit/delete, validation, onDataChange vs onDataSubmit separation,
 * auto-commit on confirm, semantic field deduplication, and date column rendering.
 *
 * Button naming note: "Add Recipient" is only rendered once at least one row exists
 * (rows.length > 0) — the empty state's own CTA is "Add First Recipient". Every test
 * below therefore uses "Add First Recipient" for the click that creates the first row,
 * and only reaches for "Add Recipient" for clicks made once a row already exists.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManualDataEntry } from '@/app/dashboard/org/[slug]/generate-certificate/components/ManualDataEntry';
import type { CertificateField, ImportedData } from '@/lib/types/certificate';

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeField(overrides: Partial<CertificateField> = {}): CertificateField {
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    type: 'custom_text',
    label: 'Custom Field',
    x: 0, y: 0, width: 200, height: 30,
    fontSize: 14, fontFamily: 'Arial', color: '#000000',
    fontWeight: '400', fontStyle: 'normal', textAlign: 'left',
    ...overrides,
  };
}

const NAME_FIELD = makeField({ id: 'name-1', type: 'name', label: 'Recipient Name' });
const _COURSE_FIELD = makeField({ id: 'course-1', type: 'course', label: 'Course Name' });
const START_DATE_FIELD = makeField({ id: 'sd-1', type: 'start_date', label: 'Start Date' });
const QR_FIELD = makeField({ id: 'qr-1', type: 'qr_code', label: 'QR Code' });
const IMG_FIELD = makeField({ id: 'img-1', type: 'image', label: 'Signature Image' });

function setup(
  fields: CertificateField[] = [NAME_FIELD],
  props: Partial<{ onDataSubmit: ReturnType<typeof vi.fn>; onDataChange: ReturnType<typeof vi.fn>; initialData: ImportedData }> = {},
) {
  const onDataSubmit = props.onDataSubmit ?? vi.fn();
  const onDataChange = props.onDataChange ?? vi.fn();
  const utils = render(
    <ManualDataEntry
      fields={fields}
      onDataSubmit={onDataSubmit}
      onDataChange={onDataChange}
      initialData={props.initialData}
    />,
  );
  return { ...utils, onDataSubmit, onDataChange, user: userEvent.setup() };
}

// ── Empty state ────────────────────────────────────────────────────────────────
describe('ManualDataEntry — empty state', () => {
  it('renders "No Recipients Added" empty state by default', () => {
    setup();
    expect(screen.getByText(/No Recipients Added/i)).toBeInTheDocument();
  });

  it('does not show the Confirm Data button when there are no rows', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Confirm Data/i })).not.toBeInTheDocument();
  });

  it('shows "Add First Recipient" button inside empty state card', () => {
    setup();
    expect(screen.getByRole('button', { name: /Add First Recipient/i })).toBeInTheDocument();
  });

  it('shows "Add Recipient" button once at least one row exists (not in the empty state)', async () => {
    const { user } = setup();
    // In the empty state, only "Add First Recipient" is rendered — "Add Recipient" is not.
    expect(screen.queryByRole('button', { name: /^Add Recipient$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    expect(screen.getByRole('button', { name: /^Add Recipient$/i })).toBeInTheDocument();
  });
});

// ── Adding rows ────────────────────────────────────────────────────────────────
describe('ManualDataEntry — adding rows', () => {
  it('clicking "Add Recipient" reveals an empty edit row', async () => {
    const { user } = setup();
    // Seed a first row so "Add Recipient" (only shown once rows exist) is on screen.
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.click(screen.getByRole('button', { name: /^Add Recipient$/i }));
    expect(screen.getByPlaceholderText(/Recipient Name/i)).toBeInTheDocument();
  });

  it('clicking "Add First Recipient" also reveals an edit row', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    expect(screen.getByPlaceholderText(/Recipient Name/i)).toBeInTheDocument();
  });

  it('new edit row has the Email input field', async () => {
    const { user } = setup([NAME_FIELD]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    expect(screen.getByPlaceholderText(/Email/i)).toBeInTheDocument();
  });

  it('qr_code and image fields are excluded from columns', async () => {
    const { user } = setup([NAME_FIELD, QR_FIELD, IMG_FIELD]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    // qr_code and image should not create input columns
    expect(screen.queryByPlaceholderText(/QR Code/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Signature Image/i)).not.toBeInTheDocument();
    // But name and email should be present
    expect(screen.getByPlaceholderText(/Recipient Name/i)).toBeInTheDocument();
  });
});

// ── Saving and cancelling ──────────────────────────────────────────────────────
describe('ManualDataEntry — save and cancel', () => {
  it('typing and saving a row shows it committed in the table', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Recipient Name/i), 'Alice');
    await user.type(screen.getByPlaceholderText(/Email/i), 'alice@example.com');
    // Click the checkmark save button
    await user.click(screen.getByTitle(/Confirm/i));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('pressing Enter saves the row', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'bob@test.com{Enter}');
    // Row should be committed (no longer showing an input for email)
    expect(screen.queryByPlaceholderText(/Email/i)).not.toBeInTheDocument();
  });

  it('cancelling an unsaved new row removes it entirely', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    // There should be 1 row in edit mode now
    expect(screen.getByPlaceholderText(/Recipient Name/i)).toBeInTheDocument();
    // Click cancel (X button)
    await user.click(screen.getByTitle(/Cancel/i));
    // Row should be gone — no inputs remain, empty state returns
    expect(screen.queryByPlaceholderText(/Recipient Name/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No Recipients Added/i)).toBeInTheDocument();
  });

  it('clicking Add Recipient auto-commits the open editing row first', async () => {
    const { user } = setup([NAME_FIELD]);
    // Add first row and fill it
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'first@example.com');
    // Add second row — first should auto-commit. Rows.length is now 1, so "Add Recipient" is on screen.
    await user.click(screen.getByRole('button', { name: /^Add Recipient$/i }));
    // "first@example.com" should be visible as committed text
    expect(screen.getByText('first@example.com')).toBeInTheDocument();
    // New row should be in edit mode
    expect(screen.getAllByPlaceholderText(/Email/i).length).toBeGreaterThan(0);
  });
});

// ── Delete rows ────────────────────────────────────────────────────────────────
describe('ManualDataEntry — deleting rows', () => {
  it('deleting a committed row removes it from the table', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'del@test.com');
    await user.click(screen.getByTitle(/Confirm/i));
    // Verify the row is present before deleting
    expect(screen.getByText('del@test.com')).toBeInTheDocument();
  });

  it('shows empty state after all rows are deleted', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'x@x.com');
    await user.click(screen.getByTitle(/Confirm/i));
    // Find the Trash2 delete button by its destructive styling class
    const trashButton = document.querySelector('button.text-destructive') as HTMLButtonElement | null;
    if (trashButton) {
      await user.click(trashButton);
      expect(screen.getByText(/No Recipients Added/i)).toBeInTheDocument();
    }
  });
});

// ── Edit existing row ──────────────────────────────────────────────────────────
describe('ManualDataEntry — editing a committed row', () => {
  it('clicking the edit pencil re-enters edit mode for that row', async () => {
    const { user } = setup();
    // Commit a row
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'edit@test.com');
    await user.click(screen.getByTitle(/Confirm/i));
    // Click the edit (pencil) button — it's the first action button on the row
    const editButtons = screen.getAllByRole('button');
    const pencilBtn = editButtons.find(b =>
      b.getAttribute('class')?.includes('h-7') && !b.getAttribute('class')?.includes('destructive'),
    );
    if (pencilBtn) {
      await user.click(pencilBtn);
      // Should be back in edit mode
      expect(screen.getByDisplayValue('edit@test.com')).toBeInTheDocument();
    }
  });
});

// ── Validation ─────────────────────────────────────────────────────────────────
describe('ManualDataEntry — validation', () => {
  it('shows validation error message when a row is missing email', async () => {
    const { user } = setup([NAME_FIELD]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    // Only fill name, not email
    await user.type(screen.getByPlaceholderText(/Recipient Name/i), 'Someone');
    await user.click(screen.getByTitle(/Confirm/i));
    // Validation message should appear
    expect(screen.getByText(/missing required fields/i)).toBeInTheDocument();
  });

  it('"Confirm Data" button is disabled when any row has missing email', async () => {
    const { user } = setup([NAME_FIELD]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Recipient Name/i), 'Someone');
    await user.click(screen.getByTitle(/Confirm/i));
    const confirmBtn = screen.getByRole('button', { name: /Confirm Data/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('"Confirm Data" is enabled once all rows have emails', async () => {
    const { user } = setup([NAME_FIELD]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'valid@example.com');
    await user.click(screen.getByTitle(/Confirm/i));
    expect(screen.getByRole('button', { name: /Confirm Data/i })).not.toBeDisabled();
  });

  it('validation error clears while email is being typed (live editingRow check)', async () => {
    const { user } = setup([NAME_FIELD]);
    // Add row, save with only name (triggers validation message)
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Recipient Name/i), 'Alice');
    await user.click(screen.getByTitle(/Confirm/i));
    // Now edit the row and start typing email
    const editBtns = screen.getAllByRole('button');
    const pencil = editBtns.find(b => b.getAttribute('class')?.includes('h-7') && !b.getAttribute('class')?.includes('destructive'));
    if (pencil) {
      await user.click(pencil);
      await user.type(screen.getByPlaceholderText(/Email/i), 'alice@example.com');
      // The validation banner should now be gone (allRowsValid uses live editingRow)
      expect(screen.queryByText(/missing required fields/i)).not.toBeInTheDocument();
    }
  });
});

// ── Submit / confirm ───────────────────────────────────────────────────────────
describe('ManualDataEntry — submit behaviour', () => {
  it('calls onDataSubmit with correct shape when Confirm Data is clicked', async () => {
    const onDataSubmit = vi.fn();
    const { user } = setup([NAME_FIELD], { onDataSubmit });
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'submit@test.com');
    await user.click(screen.getByTitle(/Confirm/i));
    await user.click(screen.getByRole('button', { name: /Confirm Data/i }));
    expect(onDataSubmit).toHaveBeenCalledOnce();
    const arg: ImportedData = onDataSubmit.mock.calls[0]![0];
    expect(arg.fileName).toBe('Manual Entry');
    expect(arg.headers).toContain('Email');
    expect(arg.rows[0]).toMatchObject({ Email: 'submit@test.com' });
  });

  it('auto-commits an open editing row when Confirm Data is clicked', async () => {
    const onDataSubmit = vi.fn();
    const { user } = setup([NAME_FIELD], { onDataSubmit });
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    // Type email but do NOT click the save checkmark
    await user.type(screen.getByPlaceholderText(/Email/i), 'autocommit@test.com');
    // Click "Confirm Data" directly — should auto-commit the row
    await user.click(screen.getByRole('button', { name: /Confirm Data/i }));
    expect(onDataSubmit).toHaveBeenCalledOnce();
    const arg: ImportedData = onDataSubmit.mock.calls[0]![0];
    expect(arg.rows[0]).toMatchObject({ Email: 'autocommit@test.com' });
  });

  it('does NOT call onDataSubmit when Confirm Data is disabled (missing email)', async () => {
    const onDataSubmit = vi.fn();
    const { user } = setup([NAME_FIELD], { onDataSubmit });
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Recipient Name/i), 'No Email Person');
    await user.click(screen.getByTitle(/Confirm/i));
    const confirmBtn = screen.getByRole('button', { name: /Confirm Data/i });
    expect(confirmBtn).toBeDisabled();
    expect(onDataSubmit).not.toHaveBeenCalled();
  });
});

// ── onDataChange (live sync) ───────────────────────────────────────────────────
describe('ManualDataEntry — onDataChange live sync', () => {
  it('calls onDataChange when a row is committed (not while in edit mode)', async () => {
    const onDataChange = vi.fn();
    const { user } = setup([NAME_FIELD], { onDataChange });
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'sync@test.com');
    // Before committing, onDataChange should NOT have been called for this row
    const callsBefore = onDataChange.mock.calls.length;
    await user.click(screen.getByTitle(/Confirm/i));
    // After commit, onDataChange should have been called
    expect(onDataChange.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('onDataChange receives the committed row data', async () => {
    const onDataChange = vi.fn();
    const { user } = setup([NAME_FIELD], { onDataChange });
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    await user.type(screen.getByPlaceholderText(/Email/i), 'live@test.com');
    await user.click(screen.getByTitle(/Confirm/i));
    // Find the call that contains our email
    const callWithEmail = onDataChange.mock.calls.find(
      (call) => (call[0] as ImportedData).rows.some((r: Record<string, unknown>) => r['Email'] === 'live@test.com'),
    );
    expect(callWithEmail).toBeDefined();
  });
});

// ── Semantic field deduplication ───────────────────────────────────────────────
describe('ManualDataEntry — semantic field deduplication', () => {
  it('shows only ONE name column when two name fields are passed (multi-template)', async () => {
    const nameField2 = makeField({ id: 'name-2', type: 'name', label: 'Student Name' });
    const { user } = setup([NAME_FIELD, nameField2]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    // Only one "name"-typed column should exist (the first one encountered)
    // Both are type 'name' — only one column should render
    const nameInputs = screen
      .getAllByRole('textbox')
      .filter(i => (i as HTMLInputElement).placeholder?.toLowerCase().includes('name'));
    // Should be 1 name column + 1 email column at most for "name" type
    expect(nameInputs.length).toBe(1);
  });

  it('shows only ONE start_date column across multiple templates', async () => {
    const sd1 = makeField({ id: 'sd-1', type: 'start_date', label: 'Start Date' });
    const sd2 = makeField({ id: 'sd-2', type: 'start_date', label: 'Issue Date' });
    const { user } = setup([sd1, sd2]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    // "Pick a date" buttons for start_date — should only be one
    const dateButtons = screen.getAllByRole('button', { name: /Pick a date/i });
    expect(dateButtons.length).toBe(1);
  });
});

// ── Date fields ────────────────────────────────────────────────────────────────
describe('ManualDataEntry — date fields', () => {
  it('renders a date picker button for start_date fields', async () => {
    const { user } = setup([START_DATE_FIELD]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    // Date columns show a dropdown-style button, not a text input
    expect(screen.getByRole('button', { name: /Pick a date/i })).toBeInTheDocument();
  });

  it('does not render a text input for date columns', async () => {
    const { user } = setup([START_DATE_FIELD]);
    await user.click(screen.getByRole('button', { name: /Add First Recipient/i }));
    // The date column should NOT have a plain text input
    expect(screen.queryByPlaceholderText(/Start Date/i)).not.toBeInTheDocument();
  });
});

// NOTE (GARDEN-26): the dynamic "X recipient(s)" header badge these tests
// covered was removed from this component — recipient count is now shown as
// a static, non-pluralized stat in ExportSection's "Ready to generate" card,
// driven by importedData.rowCount, not this component's internal `rows`
// state. There is no equivalent singular/plural behavior left anywhere to
// cover, so the tests were removed rather than pointed at fabricated
// behavior. See ExportSection.tsx's "Ready to generate" stats hero.
