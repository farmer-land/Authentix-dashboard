/**
 * IMPORTS DOMAIN API
 *
 * Import job management: file uploads, data retrieval, download.
 */

import { apiRequest, ApiError, ApiResponse, PaginatedResponse, extractApiError, buildQueryString, API_BASE_URL } from "./core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportJob {
  id: string;
  organization_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  certificate_category?: string;
  certificate_subcategory?: string;
  certificate_template_id?: string;
  reusable: boolean;
  status: "queued" | "pending" | "processing" | "completed" | "failed";
  total_rows?: number;
  mapping?: Record<string, string>;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const importsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }): Promise<PaginatedResponse<ImportJob>> => {
    const response = await apiRequest<PaginatedResponse<ImportJob>>(
      `/import-jobs${buildQueryString({
        page: params?.page,
        limit: params?.limit,
        sort_by: params?.sort_by,
        sort_order: params?.sort_order,
      })}`,
    );
    return response.data!;
  },

  get: async (id: string): Promise<ImportJob> => {
    const response = await apiRequest<ImportJob>(`/import-jobs/${id}`);
    return response.data!;
  },

  create: async (
    file: File,
    metadata: {
      file_name: string;
      certificate_category?: string;
      certificate_subcategory?: string;
      certificate_template_id?: string;
      reusable?: boolean;
    },
  ): Promise<ImportJob[]> => {
    const formData = new FormData();
    // metadata MUST come before file: @fastify/multipart only captures non-file
    // fields that appear before the first file part in the stream.
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/import-jobs`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    const data = (await response.json()) as ApiResponse<{ jobs: ImportJob[] }>;
    if (!response.ok || !data.success) {
      const { code, message: errorMsg } = extractApiError(data.error, "Failed to create import job");
      throw new ApiError(code, errorMsg);
    }

    return data.data!.jobs;
  },

  exportCsv: async (id: string): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/import-jobs/${id}/export-csv`, {
      credentials: "include",
    });
    if (!response.ok) throw new ApiError("INTERNAL_ERROR", "Failed to export CSV");
    return response.blob();
  },

  getData: async (id: string, params?: { page?: number; limit?: number }) => {
    const response = await apiRequest<PaginatedResponse<unknown>>(
      `/import-jobs/${id}/data${buildQueryString({ page: params?.page, limit: params?.limit })}`,
    );
    return response.data!;
  },

  getDownloadUrl: async (id: string) => {
    const response = await apiRequest<{ download_url: string }>(`/import-jobs/${id}/download`);
    return response.data!.download_url;
  },
};
