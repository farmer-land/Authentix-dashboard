'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Download,
  Eye,
  FileArchive,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  Mail,
  Clock,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GeneratedCertificate {
  id: string;
  certificate_number: string;
  recipient_name: string;
  recipient_email: string | null;
  issued_at: string;
  expires_at: string | null;
  download_url: string | null;
  preview_url: string | null;
  category?: string | null;
  subcategory?: string | null;
  /** Linked recipient_id for matching delivery status */
  recipient_id?: string | null;
}

interface CertificateTableProps {
  certificates: GeneratedCertificate[];
  zipDownloadUrl?: string | null;
  totalCount: number;
  isLoading?: boolean;
  className?: string;
  /** true for image templates — enables PNG download filename + Copy to Clipboard */
  isImageTemplate?: boolean;
  /** keyed by recipient_id → delivery status ('queued'|'sent'|'delivered'|'failed') */
  emailStatuses?: Record<string, string>;
}

const PAGE_SIZE = 10;

/** Render any image (including AVIF) onto a canvas and export as a PNG Blob. */
async function toPngBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  const srcBlob = await response.blob();
  if (srcBlob.type === 'image/png') return srcBlob;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(srcBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(objectUrl); return reject(new Error('No canvas context')); }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

function EmailStatusBadge({ status }: { status: string }) {
  if (status === 'sent' || status === 'delivered') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {status === 'delivered' ? 'Delivered' : 'Sent'}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <XCircle className="w-3.5 h-3.5" />
        Failed
      </span>
    );
  }
  if (status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        Queued
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Mail className="w-3.5 h-3.5" />
      {status}
    </span>
  );
}

export function CertificateTable({
  certificates,
  zipDownloadUrl,
  totalCount,
  isLoading,
  className,
  isImageTemplate = false,
  emailStatuses,
}: CertificateTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const totalPages = Math.ceil(certificates.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedCertificates = certificates.slice(startIndex, endIndex);

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleDownload = async (cert: GeneratedCertificate) => {
    if (!cert.download_url) return;
    setDownloadingId(cert.id);
    try {
      // Must fetch → blob → object URL to force download for cross-origin Supabase signed URLs.
      // The `download` attribute is ignored by browsers for cross-origin URLs.
      const response = await fetch(cert.download_url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${cert.certificate_number}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopy = async (cert: GeneratedCertificate) => {
    const url = cert.download_url || cert.preview_url;
    if (!url) return;

    setCopyingId(cert.id);
    try {
      const pngBlob = await toPngBlob(url);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob }),
      ]);
      setCopiedId(cert.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    } finally {
      setCopyingId(null);
    }
  };

  const handlePreview = (cert: GeneratedCertificate) => {
    if (!cert.preview_url) return;
    setPreviewingId(cert.id);
    window.open(cert.preview_url, '_blank');
    setTimeout(() => setPreviewingId(null), 500);
  };

  const handleDownloadAll = () => {
    if (!zipDownloadUrl) return;
    window.open(zipDownloadUrl, '_blank');
  };

  if (isLoading) {
    return (
      <Card className={cn("p-8", className)}>
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Generating certificates...</p>
        </div>
      </Card>
    );
  }

  if (certificates.length === 0) {
    return null;
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <div>
            <h3 className="font-semibold text-sm">Generated Certificates</h3>
            <p className="text-xs text-muted-foreground">
              {totalCount} certificate{totalCount !== 1 ? 's' : ''} created successfully
            </p>
          </div>
        </div>

        {zipDownloadUrl && totalCount > 1 && (
          <Button onClick={handleDownloadAll} variant="outline" size="sm" className="gap-2">
            <FileArchive className="w-4 h-4" />
            Download All (ZIP)
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="w-12 px-4 py-3 text-left font-medium text-muted-foreground">#</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Recipient</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Certificate #</th>
              {paginatedCertificates.some(c => c.category) && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
              )}
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Issue Date</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expiry</th>
              {emailStatuses && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              )}
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCertificates.map((cert, index) => (
              <tr key={cert.id} className="border-b hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-muted-foreground">
                  {startIndex + index + 1}
                </td>
                <td className="px-4 py-3 font-medium">{cert.recipient_name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {cert.recipient_email || '-'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="font-mono text-xs">
                    {cert.certificate_number}
                  </Badge>
                </td>
                {paginatedCertificates.some(c => c.category) && (
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      {cert.category && (
                        <Badge variant="secondary" className="text-xs w-fit">{cert.category}</Badge>
                      )}
                      {cert.subcategory && (
                        <span className="text-xs text-muted-foreground">{cert.subcategory}</span>
                      )}
                    </div>
                  </td>
                )}
                <td className="px-4 py-3">{formatDate(cert.issued_at)}</td>
                <td className="px-4 py-3">
                  {cert.expires_at ? (
                    <span>{formatDate(cert.expires_at)}</span>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Never
                    </Badge>
                  )}
                </td>
                {emailStatuses && (
                  <td className="px-4 py-3">
                    {cert.recipient_email && emailStatuses[cert.recipient_email]
                      ? <EmailStatusBadge status={emailStatuses[cert.recipient_email]!} />
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                )}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {cert.preview_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handlePreview(cert)}
                        disabled={previewingId === cert.id}
                        title="Preview certificate"
                      >
                        {previewingId === cert.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    {/* Copy to clipboard — image templates only */}
                    {isImageTemplate && (cert.download_url || cert.preview_url) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCopy(cert)}
                        disabled={copyingId === cert.id}
                        title="Copy image to clipboard"
                      >
                        {copyingId === cert.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : copiedId === cert.id ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    {cert.download_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDownload(cert)}
                        disabled={downloadingId === cert.id}
                        title="Download certificate"
                      >
                        {downloadingId === cert.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Download className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, certificates.length)} of{' '}
            {certificates.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium px-2">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
