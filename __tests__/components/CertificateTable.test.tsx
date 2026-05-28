/**
 * Component tests for CertificateTable.
 * Covers: empty state, loading, pagination, download, copy (image templates),
 * ZIP download, category column visibility, and expiry display.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertificateTable, type GeneratedCertificate } from '@/app/dashboard/org/[slug]/generate-certificate/components/CertificateTable';

// Captured reference so tests can call .toHaveBeenCalled() without re-reading navigator.clipboard.write
let clipboardWriteMock: ReturnType<typeof vi.fn>;

// ── DOM API mocks ──────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(['pdf-content'], { type: 'application/pdf' })),
  }));
  vi.stubGlobal('open', vi.fn());
  vi.stubGlobal('ClipboardItem', class ClipboardItem {
    constructor(public data: Record<string, Blob>) {}
  });
  clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { write: clipboardWriteMock },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Factories ──────────────────────────────────────────────────────────────────
function makeCert(overrides: Partial<GeneratedCertificate> = {}): GeneratedCertificate {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    certificate_number: 'CERT-001',
    recipient_name: 'Jane Doe',
    recipient_email: 'jane@example.com',
    issued_at: '2026-01-15T00:00:00Z',
    expires_at: null,
    download_url: 'https://storage.example.com/cert.pdf',
    preview_url: 'https://storage.example.com/cert-preview.jpg',
    category: null,
    subcategory: null,
    ...overrides,
  };
}

function makeCerts(count: number, overrides: Partial<GeneratedCertificate> = {}): GeneratedCertificate[] {
  return Array.from({ length: count }, (_, i) =>
    makeCert({ ...overrides, id: `c-${i}`, certificate_number: `CERT-${String(i + 1).padStart(3, '0')}`, recipient_name: `Recipient ${i + 1}` }),
  );
}

// ── Empty / loading state ──────────────────────────────────────────────────────
describe('CertificateTable — empty and loading', () => {
  it('renders nothing (null) when certificates array is empty', () => {
    const { container } = render(
      <CertificateTable certificates={[]} totalCount={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a loading spinner when isLoading is true', () => {
    render(<CertificateTable certificates={[]} totalCount={0} isLoading />);
    expect(screen.getByText(/Generating certificates/i)).toBeInTheDocument();
  });

  it('does not render the table when isLoading is true (even with certs)', () => {
    render(<CertificateTable certificates={makeCerts(1)} totalCount={1} isLoading />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

// ── Basic rendering ────────────────────────────────────────────────────────────
describe('CertificateTable — rendering', () => {
  it('renders the table with certificate rows', () => {
    const certs = [makeCert({ recipient_name: 'Alice', recipient_email: 'alice@test.com' })];
    render(<CertificateTable certificates={certs} totalCount={1} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
  });

  it('shows the certificate number as a badge', () => {
    render(<CertificateTable certificates={[makeCert({ certificate_number: 'CERT-XYZ' })]} totalCount={1} />);
    expect(screen.getByText('CERT-XYZ')).toBeInTheDocument();
  });

  it('shows "Never" badge when expires_at is null', () => {
    render(<CertificateTable certificates={[makeCert({ expires_at: null })]} totalCount={1} />);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows formatted expiry date when expires_at is set', () => {
    render(<CertificateTable certificates={[makeCert({ expires_at: '2027-06-30T00:00:00Z' })]} totalCount={1} />);
    expect(screen.getByText(/Jun 30, 2027/i)).toBeInTheDocument();
  });

  it('shows "-" for recipient email when email is null', () => {
    render(<CertificateTable certificates={[makeCert({ recipient_email: null })]} totalCount={1} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows correct generated count in header', () => {
    render(<CertificateTable certificates={makeCerts(3)} totalCount={3} />);
    expect(screen.getByText(/3 certificates created/i)).toBeInTheDocument();
  });

  it('uses singular "certificate" when totalCount is 1', () => {
    render(<CertificateTable certificates={makeCerts(1)} totalCount={1} />);
    expect(screen.getByText(/1 certificate created/i)).toBeInTheDocument();
  });
});

// ── Category column ────────────────────────────────────────────────────────────
describe('CertificateTable — category column', () => {
  it('does NOT show Category column when no certs have a category', () => {
    render(<CertificateTable certificates={[makeCert({ category: null })]} totalCount={1} />);
    expect(screen.queryByText(/^Category$/i)).not.toBeInTheDocument();
  });

  it('shows Category column when at least one cert has a category', () => {
    const certs = [
      makeCert({ category: 'Engineering', subcategory: 'Backend' }),
      makeCert({ category: null }),
    ];
    render(<CertificateTable certificates={certs} totalCount={2} />);
    expect(screen.getByRole('columnheader', { name: /Category/i })).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });
});

// ── Pagination ─────────────────────────────────────────────────────────────────
describe('CertificateTable — pagination', () => {
  it('does NOT show pagination controls for 10 or fewer certs', () => {
    render(<CertificateTable certificates={makeCerts(10)} totalCount={10} />);
    expect(screen.queryByRole('button', { name: '' })).not.toBeInTheDocument();
    // More specific: no Previous/Next icons visible
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it('shows pagination controls for more than 10 certs', () => {
    render(<CertificateTable certificates={makeCerts(11)} totalCount={11} />);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('starts on page 1 showing the first 10 rows', () => {
    render(<CertificateTable certificates={makeCerts(15)} totalCount={15} />);
    expect(screen.getByText('Recipient 1')).toBeInTheDocument();
    expect(screen.queryByText('Recipient 11')).not.toBeInTheDocument();
  });

  it('navigating to next page shows the next batch of certs', async () => {
    const user = userEvent.setup();
    render(<CertificateTable certificates={makeCerts(12)} totalCount={12} />);
    const _nextBtn = screen.getAllByRole('button').find(b =>
      b.querySelector('svg') && b.getAttribute('disabled') === null && screen.getByText('1 / 2'),
    );
    // Click the next page button (ChevronRight — second icon button in pagination)
    const paginationBtns = screen.getAllByRole('button').filter(b =>
      b.querySelector('svg.lucide-chevron-right') || b.querySelector('[class*="ChevronRight"]'),
    );
    if (paginationBtns.length > 0) {
      await user.click(paginationBtns[0]!);
      expect(screen.getByText('Recipient 11')).toBeInTheDocument();
    }
  });
});

// ── Download ───────────────────────────────────────────────────────────────────
describe('CertificateTable — download', () => {
  it('clicking download button fetches the cert and triggers anchor download', async () => {
    const user = userEvent.setup();
    // Render BEFORE setting up spies so React can mount properly
    render(<CertificateTable certificates={[makeCert()]} totalCount={1} />);

    const mockAnchor = { href: '', download: '', click: vi.fn(), setAttribute: vi.fn() };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as ChildNode);

    await user.click(screen.getByTitle(/Download certificate/i));
    expect(fetch).toHaveBeenCalledWith('https://storage.example.com/cert.pdf');
    expect(mockAnchor.download).toBe('CERT-001.png');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it('uses .png extension for image templates', async () => {
    const user = userEvent.setup();
    render(
      <CertificateTable
        certificates={[makeCert({ certificate_number: 'CERT-IMG' })]}
        totalCount={1}
        isImageTemplate
      />,
    );
    const mockAnchor = { href: '', download: '', click: vi.fn() };
    const origCreate2 = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate2(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as ChildNode);

    await user.click(screen.getByTitle(/Download certificate/i));
    expect(mockAnchor.download).toBe('CERT-IMG.png');
  });
});

// ── Copy to clipboard ─────────────────────────────────────────────────────────
describe('CertificateTable — copy to clipboard', () => {
  it('does NOT show Copy button for non-image templates', () => {
    render(
      <CertificateTable certificates={[makeCert()]} totalCount={1} isImageTemplate={false} />,
    );
    expect(screen.queryByTitle(/Copy image to clipboard/i)).not.toBeInTheDocument();
  });

  it('shows Copy button for image templates', () => {
    render(
      <CertificateTable certificates={[makeCert()]} totalCount={1} isImageTemplate />,
    );
    expect(screen.getByTitle(/Copy image to clipboard/i)).toBeInTheDocument();
  });

  it('clicking Copy calls navigator.clipboard.write', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
    }));
    render(
      <CertificateTable certificates={[makeCert()]} totalCount={1} isImageTemplate />,
    );
    // fireEvent is synchronous — avoids userEvent's internal timer/act interactions
    fireEvent.click(screen.getByTitle(/Copy image to clipboard/i));
    // handleCopy is async (fetch → clipboard.write), use waitFor to let the promise chain settle
    await waitFor(() => expect(clipboardWriteMock).toHaveBeenCalled());
  });
});

// ── ZIP download ───────────────────────────────────────────────────────────────
describe('CertificateTable — Download All (ZIP)', () => {
  it('shows "Download All" button when zipDownloadUrl is provided and totalCount > 1', () => {
    render(
      <CertificateTable
        certificates={makeCerts(2)}
        totalCount={2}
        zipDownloadUrl="https://storage.example.com/certs.zip"
      />,
    );
    expect(screen.getByRole('button', { name: /Download All/i })).toBeInTheDocument();
  });

  it('does NOT show "Download All" when totalCount is 1', () => {
    render(
      <CertificateTable
        certificates={makeCerts(1)}
        totalCount={1}
        zipDownloadUrl="https://storage.example.com/certs.zip"
      />,
    );
    expect(screen.queryByRole('button', { name: /Download All/i })).not.toBeInTheDocument();
  });

  it('does NOT show "Download All" when zipDownloadUrl is not provided', () => {
    render(<CertificateTable certificates={makeCerts(3)} totalCount={3} />);
    expect(screen.queryByRole('button', { name: /Download All/i })).not.toBeInTheDocument();
  });

  it('clicking "Download All" fetches the ZIP and triggers an anchor download', async () => {
    const user = userEvent.setup();
    render(
      <CertificateTable
        certificates={makeCerts(2)}
        totalCount={2}
        zipDownloadUrl="https://storage.example.com/all.zip"
      />,
    );

    const mockAnchor = { href: '', download: '', click: vi.fn() };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as ChildNode);

    await user.click(screen.getByRole('button', { name: /Download All/i }));
    await waitFor(() => expect(mockAnchor.click).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('https://storage.example.com/all.zip');
    expect(mockAnchor.download).toBe('certificates.zip');
  });
});
