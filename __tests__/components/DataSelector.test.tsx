/**
 * DataSelector component tests
 *
 * Covers the complete file-upload flow:
 *   drop file → api.imports.create → poll until completed → getData → onDataImport
 *
 * Also covers: rejected files, failed jobs, timeout, empty files, load-saved-import.
 *
 * All network calls are mocked via vi.mock('@/lib/api/client').
 * The onDrop handler is captured from the react-dropzone mock so tests can
 * trigger file drops without simulating complex DOM drag-and-drop events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { ImportJob } from '@/lib/api/imports';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  api: {
    imports: {
      create: vi.fn(),
      get: vi.fn(),
      getData: vi.fn(),
      list: vi.fn(),
    },
  },
}));

// Capture the onDrop callback from useDropzone so tests can invoke it directly.
// This avoids having to simulate complex browser drag-and-drop DOM events.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedOnDrop: (accepted: File[], rejected: any[]) => void = () => {};

vi.mock('react-dropzone', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useDropzone: ({ onDrop }: { onDrop: (accepted: File[], rejected: any[]) => void }) => {
    capturedOnDrop = onDrop;
    return {
      getRootProps: () => ({ 'data-testid': 'dropzone' }),
      getInputProps: () => ({ 'data-testid': 'file-input' }),
      isDragActive: false,
    };
  },
}));

vi.mock('@/lib/utils/dynamic-imports', () => ({
  getXlsx: vi.fn(),
}));

// Use full absolute paths — relative paths resolve from the test file's directory,
// not from the component's directory, so './DataPreview' would miss the real module.
vi.mock(
  '@/app/dashboard/org/[slug]/generate-certificate/components/DataPreview',
  () => ({
    DataPreview: ({ headers, rows }: { headers: string[]; rows: unknown[] }) => (
      <div data-testid="data-preview">
        <span data-testid="header-count">{headers.length}</span>
        <span data-testid="row-count">{rows.length}</span>
      </div>
    ),
  }),
);

vi.mock(
  '@/app/dashboard/org/[slug]/generate-certificate/components/ManualDataEntry',
  () => ({
    ManualDataEntry: () => <div data-testid="manual-entry" />,
  }),
);

import { DataSelector } from '@/app/dashboard/org/[slug]/generate-certificate/components/DataSelector';
import { api } from '@/lib/api/client';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeImportJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: 'import-1',
    organization_id: 'org-1',
    file_name: 'recipients.csv',
    file_type: 'csv',
    file_size: 1024,
    status: 'completed',
    total_rows: 3,
    reusable: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePreviewResult(rows: Record<string, unknown>[] = [{ Name: 'Alice', Email: 'alice@test.com' }]) {
  return {
    items: rows,
    pagination: { page: 1, limit: 10, total: rows.length, total_pages: 1 },
  };
}

function makeCsvFile(name = 'data.csv', content = 'Name,Email\nAlice,alice@test.com') {
  return new File([content], name, { type: 'text/csv' });
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    fields: [],
    savedImports: [],
    importedData: null,
    fieldMappings: [],
    onDataImport: vi.fn(),
    onMappingChange: vi.fn(),
    onLoadImport: vi.fn(),
    onContinueToGenerate: vi.fn(),
    ...overrides,
  };
}

/**
 * Trigger a file drop through the captured useDropzone onDrop callback, then
 * confirm the "name this import" step that now gates the actual upload.
 *
 * Dropping a file no longer uploads immediately — DataSelector.tsx's `onDrop`
 * just stashes the file(s) into `pendingFiles`/`pendingName` (pre-filled with
 * the file's own name, minus extension) and shows a naming prompt; the real
 * `api.imports.create()` call only happens once the user confirms via the
 * "Upload" button (or Enter), from `handleStartUpload`.
 */
async function dropFile(file: File) {
  await act(async () => {
    capturedOnDrop([file], []);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DataSelector — upload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders upload zone when no data is imported', () => {
    render(<DataSelector {...defaultProps()} />);
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
  });

  it('calls api.imports.create with the dropped file', async () => {
    vi.mocked(api.imports.create).mockResolvedValue([makeImportJob({ status: 'completed' })]);
    vi.mocked(api.imports.getData).mockResolvedValue(makePreviewResult());

    render(<DataSelector {...defaultProps()} />);

    const file = makeCsvFile();
    await dropFile(file);

    // DataSelector.tsx's "name this import" step sends the (editable) import
    // name — defaulted to the filename minus extension via `stripExt()` — as
    // `file_name`, not the raw `file.name` with its extension.
    expect(api.imports.create).toHaveBeenCalledWith(file, { file_name: 'data' });
  });

  it('calls onDataImport with correct data after successful upload', async () => {
    const onDataImport = vi.fn();
    const rows = [{ Name: 'Alice' }, { Name: 'Bob' }];

    vi.mocked(api.imports.create).mockResolvedValue([makeImportJob({ status: 'completed', total_rows: 2 })]);
    vi.mocked(api.imports.getData).mockResolvedValue(makePreviewResult(rows));

    render(<DataSelector {...defaultProps({ onDataImport })} />);
    await dropFile(makeCsvFile());

    // fileName reflects the (editable, extension-stripped) import name too —
    // see the api.imports.create assertion above.
    expect(onDataImport).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'data',
        headers: ['Name'],
        importId: 'import-1',
        rowCount: 2,
      }),
    );
  });

  it('polls api.imports.get until status is completed', async () => {
    const onDataImport = vi.fn();

    vi.mocked(api.imports.create).mockResolvedValue([makeImportJob({ status: 'queued' })]);
    vi.mocked(api.imports.get)
      .mockResolvedValueOnce(makeImportJob({ status: 'processing' }))
      .mockResolvedValueOnce(makeImportJob({ status: 'completed' }));
    vi.mocked(api.imports.getData).mockResolvedValue(makePreviewResult());

    render(<DataSelector {...defaultProps({ onDataImport })} />);

    // Drop stashes the file behind the "name this import" prompt — confirm it
    // to actually kick off the upload (see the `dropFile` helper's comment above).
    await act(async () => {
      capturedOnDrop([makeCsvFile()], []);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    });

    // Advance fake timers to drive the polling loop forward.
    // Each poll iteration awaits a 2-second setTimeout; advancing by 5 s covers 2 polls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(api.imports.get).toHaveBeenCalledTimes(2);
    expect(onDataImport).toHaveBeenCalled();
  });

  it('preserves importId in the ImportedData passed to onDataImport', async () => {
    const onDataImport = vi.fn();

    vi.mocked(api.imports.create).mockResolvedValue(
      [makeImportJob({ status: 'completed', id: 'import-xyz', total_rows: 1 })],
    );
    vi.mocked(api.imports.getData).mockResolvedValue(makePreviewResult([{ Name: 'Test' }]));

    render(<DataSelector {...defaultProps({ onDataImport })} />);
    await dropFile(makeCsvFile());

    // importId must survive — ExportSection uses it as import_id in the generation API call
    expect(onDataImport).toHaveBeenCalledWith(
      expect.objectContaining({ importId: 'import-xyz' }),
    );
  });
});

describe('DataSelector — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "invalid file" error when a non-spreadsheet is rejected', async () => {
    render(<DataSelector {...defaultProps()} />);

    await act(async () => {
      capturedOnDrop([], [{ file: makeCsvFile(), errors: [{ code: 'file-invalid-type', message: 'bad type' }] }]);
    });

    expect(screen.getByText(/Invalid file\. Please upload a \.csv/i)).toBeInTheDocument();
  });

  it('shows "file too large" error when file exceeds size limit', async () => {
    render(<DataSelector {...defaultProps()} />);

    await act(async () => {
      capturedOnDrop([], [{ file: makeCsvFile(), errors: [{ code: 'file-too-large', message: 'too big' }] }]);
    });

    expect(screen.getByText(/exceeds the 10 MB limit/i)).toBeInTheDocument();
  });

  it('shows upload error when api.imports.create throws', async () => {
    vi.mocked(api.imports.create).mockRejectedValue(new Error('Network error'));

    render(<DataSelector {...defaultProps()} />);
    await dropFile(makeCsvFile());

    expect(screen.getByText(/Failed to upload "data\.csv"/i)).toBeInTheDocument();
  });

  it('shows job error message when import job status is failed', async () => {
    vi.mocked(api.imports.create).mockResolvedValue(
      [makeImportJob({ status: 'failed', error_message: 'Unsupported file format' })],
    );

    render(<DataSelector {...defaultProps()} />);
    await dropFile(makeCsvFile());

    expect(screen.getByText(/Unsupported file format/i)).toBeInTheDocument();
  });

  it('shows timeout error when import job never reaches completed within 120 s', async () => {
    vi.mocked(api.imports.create).mockResolvedValue([makeImportJob({ status: 'queued' })]);
    vi.mocked(api.imports.get).mockResolvedValue(makeImportJob({ status: 'processing' }));

    render(<DataSelector {...defaultProps()} />);

    // Drop stashes the file behind the "name this import" prompt — confirm it
    // to actually kick off the upload (see the `dropFile` helper's comment above).
    await act(async () => {
      capturedOnDrop([makeCsvFile()], []);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    });

    // Advance past the 120-second deadline
    await act(async () => {
      await vi.advanceTimersByTimeAsync(121_000);
    });

    expect(screen.getByText(/"data\.csv" timed out/i)).toBeInTheDocument();
  });

  it('shows "empty file" error when the import returns no data rows', async () => {
    vi.mocked(api.imports.create).mockResolvedValue([makeImportJob({ status: 'completed', total_rows: 0 })]);
    vi.mocked(api.imports.getData).mockResolvedValue(makePreviewResult([]));

    render(<DataSelector {...defaultProps()} />);
    await dropFile(makeCsvFile());

    expect(screen.getByText(/"data\.csv" is empty or has no data rows/i)).toBeInTheDocument();
  });
});

describe('DataSelector — saved imports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders file names for each saved import', () => {
    const savedImports = [
      makeImportJob({ id: 'i1', file_name: 'batch1.csv', total_rows: 5 }),
      makeImportJob({ id: 'i2', file_name: 'batch2.xlsx', total_rows: 20 }),
    ];

    render(<DataSelector {...defaultProps({ savedImports })} />);

    // DataSelector.tsx renders saved-import names via `stripExt()` — the file
    // extension is stripped for display (both the "top" card and the "older
    // uploads" list use `stripExt(importJob.file_name)`), so "batch1.csv" and
    // "batch2.xlsx" appear as "batch1" and "batch2" in the DOM.
    expect(screen.getByText('batch1')).toBeInTheDocument();
    expect(screen.getByText('batch2')).toBeInTheDocument();
  });

  it('calls onLoadImport with the correct import ID when a saved import card is clicked', async () => {
    const onLoadImport = vi.fn().mockResolvedValue(undefined);
    const savedImports = [makeImportJob({ id: 'saved-import-1', file_name: 'batch.csv', total_rows: 10 })];

    render(<DataSelector {...defaultProps({ savedImports, onLoadImport })} />);

    // A single saved import renders as the "top" card, which is not itself
    // clickable — it exposes an explicit "Use this" button that triggers
    // onLoadImport (there's no `cursor-pointer` wrapper to click on anymore).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
    });

    expect(onLoadImport).toHaveBeenCalledWith('saved-import-1');
  });
});
