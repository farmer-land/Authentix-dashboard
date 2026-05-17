"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileCheck,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink,
  MoreHorizontal,
  QrCode,
  Mail,
  Phone,
  Calendar,
  X,
  SlidersHorizontal,
  Loader2,
} from "lucide-react";
import { type Certificate } from "@/lib/api/client";
import { useCertificates } from "@/lib/hooks/queries/certificates";
import { useCatalogCategories, useCatalogSubcategories } from "@/lib/hooks/queries/catalog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

interface FilterState {
  search: string;
  status: string;
  category: string;
  subcategory: string;
  dateFrom: string;
  dateTo: string;
}

const initialFilters: FilterState = {
  search: "",
  status: "",
  category: "",
  subcategory: "",
  dateFrom: "",
  dateTo: "",
};

export default function CertificatesPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(initialFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [previewCertificate, setPreviewCertificate] = useState<Certificate | null>(null);
  const [exporting, setExporting] = useState(false);

  const { certificates, pagination, loading, refetch } = useCertificates({
    page,
    limit: 20,
    search: appliedFilters.search || undefined,
    status: (appliedFilters.status || undefined) as 'active' | 'revoked' | 'expired' | undefined,
    category_id: appliedFilters.category || undefined,
    subcategory_id: appliedFilters.subcategory || undefined,
    date_from: appliedFilters.dateFrom || undefined,
    date_to: appliedFilters.dateTo || undefined,
    sort_by: "created_at",
    sort_order: "desc",
  });

  const totalPages = pagination?.total_pages ?? 1;
  const totalItems = pagination?.total ?? 0;

  const { groups: categoryGroups } = useCatalogCategories();
  const categories = categoryGroups.flatMap(g => g.items).map(c => ({ id: c.id, name: c.name }));

  const { subcategories: subcatItems } = useCatalogSubcategories(filters.category || null);
  const subcategories = subcatItems.map(s => ({ id: s.id, name: s.name }));

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
    setPage(1);
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedFilters(prev => ({ ...prev, search: filters.search }));
    setPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setFilters(prev => ({ ...prev, category: value, subcategory: "" }));
  };

  const handleDownload = async (certificate: Certificate) => {
    const url = certificate.download_url;
    if (!url) {
      toast.error("Download URL not available for this certificate");
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${certificate.certificate_number}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast.error(`Failed to download: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  const handleExportAll = async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading("Preparing export…");
    try {
      // Fetch all pages up to 2000 certificates (reasonable export limit)
      const limit = 200;
      let offset = 0;
      const all: Certificate[] = [];
      while (true) {
        const result = await api.certificates.list({
          page: Math.floor(offset / limit) + 1,
          limit,
          search: appliedFilters.search || undefined,
          status: (appliedFilters.status || undefined) as 'active' | 'revoked' | 'expired' | undefined,
          category_id: appliedFilters.category || undefined,
          subcategory_id: appliedFilters.subcategory || undefined,
          date_from: appliedFilters.dateFrom || undefined,
          date_to: appliedFilters.dateTo || undefined,
          sort_by: "created_at",
          sort_order: "desc",
        });
        all.push(...result.items);
        if (all.length >= result.pagination.total || all.length >= 2000) break;
        offset += limit;
      }
      // Build CSV
      const headers = ["Certificate #", "Recipient Name", "Email", "Phone", "Category", "Subcategory", "Status", "Issue Date", "Expiry Date", "Verification URL"];
      const rows = all.map(c => [
        c.certificate_number,
        c.recipient_name,
        c.recipient_email ?? "",
        c.recipient_phone ?? "",
        c.category?.name ?? "",
        c.subcategory?.name ?? "",
        c.status,
        format(new Date(c.issued_at), "yyyy-MM-dd"),
        c.expires_at ? format(new Date(c.expires_at), "yyyy-MM-dd") : "",
        c.qr_payload_url ?? c.verification_path ?? "",
      ]);
      const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificates-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} certificates`, { id: toastId });
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: Certificate["status"]) => {
    const variants: Record<Certificate["status"], { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: "Active" },
      revoked: { variant: "destructive", label: "Revoked" },
      expired: { variant: "secondary", label: "Expired" },
    };
    const config = variants[status] || variants.active;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const hasActiveFilters = Object.values(appliedFilters).some(v => v !== "");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Certificates</h1>
          <p className="text-muted-foreground mt-1.5 text-base">
            View and manage all issued certificates
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button className="gap-2" onClick={handleExportAll} disabled={exporting}>
            {exporting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export All"}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="p-4 border border-border bg-card/60">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearchSubmit} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, email, phone, or certificate number..."
              className="pl-10 h-10"
              value={filters.search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </form>
          <div className="flex gap-2">
            <Button
              variant={hasActiveFilters ? "default" : "outline"}
              className="gap-2"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {Object.values(appliedFilters).filter(v => v !== "").length}
                </Badge>
              )}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="icon" onClick={handleClearFilters}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={filters.category}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Subcategory</label>
              <Select
                value={filters.subcategory}
                onValueChange={(value) => setFilters(prev => ({ ...prev, subcategory: value }))}
                disabled={!filters.category}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All subcategories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All subcategories</SelectItem>
                  {subcategories.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Issue Date From</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Issue Date To</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex justify-end items-end">
              <Button onClick={handleApplyFilters}>Apply Filters</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Results Summary */}
      {!loading && (
        <div className="text-sm text-muted-foreground">
          Showing {certificates.length} of {totalItems} certificates
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : certificates.length === 0 ? (
        <Card className="border-2 border-dashed border-border bg-card/40">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center mb-6">
              <FileCheck className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No certificates found</h3>
            <p className="text-muted-foreground text-center max-w-md mb-8 leading-relaxed">
              {hasActiveFilters
                ? "No certificates match your current filters. Try adjusting your search criteria."
                : "Certificates will appear here after you generate them using the certificate generator."}
            </p>
            {hasActiveFilters ? (
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : (
              <Button asChild>
                <a href="generate-certificate">Generate Certificates</a>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Recipient</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Certificate #</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Issue Date</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expiry</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((cert) => (
                  <tr key={cert.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{cert.recipient_name}</p>
                        {cert.subcategory?.name && (
                          <p className="text-xs text-muted-foreground">{cert.subcategory.name}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {cert.recipient_email && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {cert.recipient_email}
                          </span>
                        )}
                        {cert.recipient_phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {cert.recipient_phone}
                          </span>
                        )}
                        {!cert.recipient_email && !cert.recipient_phone && (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {cert.certificate_number}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {cert.category?.name && (
                          <Badge variant="outline" className="text-xs w-fit">
                            {cert.category.name}
                          </Badge>
                        )}
                        {cert.subcategory?.name && (
                          <span className="text-xs text-muted-foreground">
                            {cert.subcategory.name}
                          </span>
                        )}
                        {!cert.category?.name && (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{format(new Date(cert.issued_at), "MMM d, yyyy")}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {cert.expires_at ? (
                        <span className={cn(
                          "text-sm",
                          new Date(cert.expires_at) < new Date() && "text-destructive"
                        )}>
                          {format(new Date(cert.expires_at), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(cert.status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreviewCertificate(cert)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownload(cert)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          {(cert.qr_payload_url || cert.verification_path) && (
                            <DropdownMenuItem
                              onClick={() => window.open(cert.qr_payload_url ?? cert.verification_path!, "_blank")}
                            >
                              <QrCode className="h-4 w-4 mr-2" />
                              Verify Link
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              const url = cert.qr_payload_url ?? cert.verification_path;
                              if (url) window.open(url, "_blank");
                            }}
                            disabled={!cert.qr_payload_url && !cert.verification_path}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Public Page
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Certificate Preview Dialog */}
      <Dialog open={!!previewCertificate} onOpenChange={() => setPreviewCertificate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Certificate Preview</DialogTitle>
          </DialogHeader>
          {previewCertificate && (
            <div className="space-y-4">
              {/* Preview Image */}
              {previewCertificate.preview_url ? (
                <div className="border rounded-lg overflow-hidden bg-muted">
                  <img
                    src={previewCertificate.preview_url}
                    alt="Certificate preview"
                    className="w-full h-auto"
                  />
                </div>
              ) : (
                <div className="border rounded-lg p-8 bg-muted text-center">
                  <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Preview not available</p>
                </div>
              )}

              {/* Certificate Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Recipient</p>
                  <p className="font-medium">{previewCertificate.recipient_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Certificate Number</p>
                  <p className="font-medium font-mono">{previewCertificate.certificate_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Issue Date</p>
                  <p className="font-medium">
                    {format(new Date(previewCertificate.issued_at), "MMMM d, yyyy")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expiry Date</p>
                  <p className="font-medium">
                    {previewCertificate.expires_at
                      ? format(new Date(previewCertificate.expires_at), "MMMM d, yyyy")
                      : "Never"}
                  </p>
                </div>
                {previewCertificate.recipient_email && (
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium">{previewCertificate.recipient_email}</p>
                  </div>
                )}
                {previewCertificate.recipient_phone && (
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{previewCertificate.recipient_phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(previewCertificate.status)}</div>
                </div>
                <div>
                  <p className="text-muted-foreground">Verification Link</p>
                  <p className="font-medium font-mono text-xs break-all">{previewCertificate.qr_payload_url ?? previewCertificate.verification_path ?? '-'}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => handleDownload(previewCertificate)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { const url = previewCertificate.qr_payload_url ?? previewCertificate.verification_path; if (url) window.open(url, "_blank"); }}
                  disabled={!previewCertificate.qr_payload_url && !previewCertificate.verification_path}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Public Page
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
