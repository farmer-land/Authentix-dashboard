/**
 * CERTIFICATES DOMAIN API
 *
 * Certificate listing, retrieval, generation, and download.
 */

import { apiRequest, buildQueryString, PaginatedResponse } from "./core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Certificate {
  id: string;
  organization_id: string;
  generation_job_id: string | null;
  template_id: string | null;
  template_version_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_data: Record<string, unknown> | null;
  certificate_number: string;
  issued_at: string;
  expires_at: string | null;
  status: "active" | "revoked" | "expired";
  revoked_at: string | null;
  revoked_reason: string | null;
  verification_path: string | null;
  qr_payload_url: string | null;
  created_at: string;
  // Computed/joined fields
  download_url: string | null;
  preview_url: string | null;
  category?: { id: string; name: string } | null;
  subcategory?: { id: string; name: string } | null;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const certificatesApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: "active" | "revoked" | "expired";
    category_id?: string;
    subcategory_id?: string;
    date_from?: string;
    date_to?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }): Promise<PaginatedResponse<Certificate>> => {
    const response = await apiRequest<PaginatedResponse<Certificate>>(
      `/certificates${buildQueryString({
        page: params?.page,
        limit: params?.limit,
        search: params?.search,
        status: params?.status,
        category_id: params?.category_id,
        subcategory_id: params?.subcategory_id,
        date_from: params?.date_from,
        date_to: params?.date_to,
        sort_by: params?.sort_by,
        sort_order: params?.sort_order,
      })}`,
    );
    return response.data!;
  },

  get: async (id: string): Promise<Certificate> => {
    const response = await apiRequest<Certificate>(`/certificates/${id}`);
    return response.data!;
  },

  generate: async (params: {
    template_id: string;
    data: Array<Record<string, unknown>>;
    field_mappings: Array<{ fieldId: string; columnName: string }>;
    options?: {
      includeQR?: boolean;
      fileName?: string;
      expiry_type?: "day" | "week" | "month" | "year" | "5_years" | "never" | "custom";
      custom_expiry_date?: string;
      issue_date?: string;
    };
  }): Promise<{
    job_id?: string;
    status: "completed" | "pending" | "processing" | "failed";
    download_url?: string;
    zip_download_url?: string;
    total_certificates: number;
    certificates: Array<{
      id: string;
      certificate_number: string;
      recipient_name: string;
      recipient_email: string | null;
      recipient_phone: string | null;
      issued_at: string;
      expires_at: string | null;
      download_url: string | null;
      preview_url: string | null;
    }>;
    error?: string;
  }> => {
    const response = await apiRequest<{
      job_id?: string;
      status: "completed" | "pending" | "processing" | "failed";
      download_url?: string;
      zip_download_url?: string;
      total_certificates: number;
      certificates: Array<{
        id: string;
        certificate_number: string;
        recipient_name: string;
        recipient_email: string | null;
        recipient_phone: string | null;
        issued_at: string;
        expires_at: string | null;
        download_url: string | null;
        preview_url: string | null;
      }>;
      error?: string;
    }>("/certificates/generate", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return response.data!;
  },

  /** Submit a batch generation job. Returns immediately with job_id — poll with pollJobStatus. */
  batchGenerate: async (params: {
    data?: Array<Record<string, unknown>>;
    import_id?: string;
    additional_rows?: Array<Record<string, unknown>>;
    options?: {
      includeQR?: boolean;
      fileName?: string;
      expiry_type?: "day" | "week" | "month" | "year" | "5_years" | "never" | "custom";
      custom_expiry_date?: string;
      issue_date?: string;
    };
    configs: Array<{
      template_id: string;
      field_mappings: Array<{ fieldId: string; columnName: string }>;
      label?: string;
    }>;
  }): Promise<{ job_id: string; status: string }> => {
    const response = await apiRequest<{ job_id: string; status: string }>(
      "/certificates/generation-jobs",
      { method: "POST", body: JSON.stringify(params) },
    );
    return response.data!;
  },

  /**
   * Poll a background job (certificate_generation or batch_certificate_generation).
   * Call repeatedly until status is 'completed' or 'failed'.
   * On 'completed', result contains the full generation output with certificates.
   */
  pollJobStatus: async (jobId: string): Promise<{
    id: string;
    type: string;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    result: {
      /** Real-time partial progress — present while status is queued/running */
      processed_so_far?: number;
      total?: number;
      total_certificates?: number;
      first_job_id?: string | null;
      last_download_url?: string | null;
      results?: Array<{
        label: string;
        count: number;
        job_id: string | null;
        certificates: Array<{
          id: string;
          certificate_number: string;
          recipient_name: string;
          recipient_email: string | null;
          recipient_phone: string | null;
          issued_at: string;
          expires_at: string | null;
          download_url: string | null;
          preview_url: string | null;
        }>;
        download_url: string | null;
      }>;
    } | null;
    error: string | null;
    queued_at: string;
    started_at: string | null;
    completed_at: string | null;
  }> => {
    const response = await apiRequest<{
      id: string;
      type: string;
      status: "queued" | "running" | "completed" | "failed" | "cancelled";
      result: Record<string, unknown> | null;
      error: string | null;
      queued_at: string;
      started_at: string | null;
      completed_at: string | null;
    }>(`/jobs/${jobId}`);
    return response.data! as any;
  },

  /**
   * Re-sign the ZIP export for a completed generation job.
   * Returns a fresh 7-day download URL and its ISO expiry timestamp.
   */
  refreshDownloadLink: async (certGenJobId: string): Promise<{ download_url: string; expires_at: string }> => {
    const response = await apiRequest<{ download_url: string; expires_at: string }>(
      `/certificates/generation-jobs/${certGenJobId}/refresh-download`,
      { method: 'POST' },
    );
    return response.data!;
  },

  /**
   * Per-recipient status for a completed generation job.
   * Returns failed_recipients (with error messages) and aggregate counts.
   */
  listJobRecipients: async (certGenJobId: string): Promise<{
    failed_recipients: Array<{
      recipient_id: string | null;
      recipient_name: string;
      recipient_email: string | null;
      error: string;
      index: number;
    }>;
    total_submitted: number;
    failed_count: number;
    succeeded_count: number;
  }> => {
    const response = await apiRequest<{
      failed_recipients: Array<{
        recipient_id: string | null;
        recipient_name: string;
        recipient_email: string | null;
        error: string;
        index: number;
      }>;
      total_submitted: number;
      failed_count: number;
      succeeded_count: number;
    }>(`/certificates/generation-jobs/${certGenJobId}/recipients`);
    return response.data!;
  },

  /**
   * Re-submit failed recipients from a completed generation job as a new batch job.
   * Returns the new background job_id to poll for completion.
   */
  retryFailedRecipients: async (certGenJobId: string): Promise<{ job_id: string; status: string; retry_count: number }> => {
    const response = await apiRequest<{ job_id: string; status: string; retry_count: number }>(
      `/certificates/generation-jobs/${certGenJobId}/retry-failed`,
      { method: 'POST' },
    );
    return response.data!;
  },

  getDownloadUrl: async (certificateId: string): Promise<{ url: string }> => {
    const response = await apiRequest<{ url: string }>(
      `/certificates/${certificateId}/download`,
    );
    return response.data!;
  },

  /**
   * Render a single certificate row in-memory on the server and return a data URL.
   * No DB writes or storage uploads — fast UI preview only.
   */
  previewRender: async (params: {
    template_id: string;
    row_data: Record<string, unknown>;
    field_mappings: Array<{ fieldId: string; columnName: string }>;
    options?: { includeQR?: boolean };
  }): Promise<{ mime_type: string; data_url: string }> => {
    const response = await apiRequest<{ mime_type: string; data_url: string }>(
      "/certificates/preview-render",
      { method: "POST", body: JSON.stringify(params) },
    );
    return response.data!;
  },
};
