/**
 * TEMPLATES DOMAIN API
 *
 * Template management: listing, creation, editing, preview, and recent usage.
 */

import { logger } from "@/lib/logger";
import { apiRequest, ApiError, ApiResponse, PaginatedResponse, extractApiError, API_BASE_URL } from "./core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TemplateField {
  id: string;
  field_key: string;
  label: string;
  type: string;
  page_number: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  style: Record<string, unknown> | null;
}

export interface RecentGeneratedTemplate {
  template_id: string;
  template_title: string;
  template_version_id: string | null;
  preview_url: string | null;
  last_generated_at: string;
  certificates_count: number;
  category_name: string | null;
  subcategory_name: string | null;
  fields: TemplateField[];
}

export interface InProgressTemplate {
  template_id: string;
  template_title: string;
  template_version_id: string | null;
  preview_url: string | null;
  last_modified_at: string;
  category_name: string | null;
  subcategory_name: string | null;
  fields: TemplateField[];
}

// ── API ───────────────────────────────────────────────────────────────────────

export const templatesApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.sort_by) qs.set("sort_by", params.sort_by);
    if (params?.sort_order) qs.set("sort_order", params.sort_order);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    const response = await apiRequest<PaginatedResponse<unknown>>(`/templates${query}`);
    return response.data!;
  },

  get: async (id: string) => {
    const response = await apiRequest(`/templates/${id}`);
    return response.data!;
  },

  /**
   * Get template editor data (template + version + source file + fields).
   */
  getEditorData: async (templateId: string) => {
    const response = await apiRequest<{
      template: {
        id: string;
        title: string;
        category_id: string;
        subcategory_id: string;
        category?: { id: string; name: string };
        subcategory?: { id: string; name: string };
      };
      version: { id: string; version_number: number; status: string };
      source_file: {
        id: string;
        file_name: string;
        file_type: string;
        bucket?: string;
        path?: string;
        url?: string;
      };
      fields: Array<{
        id: string;
        field_key: string;
        label: string;
        type: string;
        page_number: number;
        x: number;
        y: number;
        width: number;
        height: number;
        style?: Record<string, unknown>;
        required?: boolean;
      }>;
    }>(`/templates/${templateId}/editor`);
    return response.data!;
  },

  /**
   * Save template version fields (replace semantics).
   */
  saveFields: async (
    templateId: string,
    versionId: string,
    fields: Array<{
      field_key: string;
      label: string;
      type: string;
      page_number: number;
      x: number;
      y: number;
      width?: number;
      height?: number;
      style?: Record<string, unknown>;
      required?: boolean;
    }>,
  ) => {
    const response = await apiRequest<{
      fields: Array<{
        id: string;
        field_key: string;
        label: string;
        type: string;
        page_number: number;
        x: number;
        y: number;
        width: number;
        height: number;
        style?: Record<string, unknown>;
        required?: boolean;
      }>;
    }>(`/templates/${templateId}/versions/${versionId}/fields`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
    return response.data!;
  },

  /**
   * Upload a canvas asset (logo, stamp, image field, QR logo) to storage.
   * Returns a permanent signed URL that the backend can fetch during certificate generation.
   */
  uploadAsset: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${API_BASE_URL}/templates/assets/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const json = (await response.json()) as ApiResponse<{ url: string }>;
      if (!response.ok || !json.data?.url) {
        const msg =
          typeof json.error === "object" ? json.error?.message : json.error ?? "Upload failed";
        throw new ApiError("UPLOAD_ERROR", msg ?? "Upload failed", {});
      }
      return json.data.url;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  },

  /**
   * Create a new certificate template.
   * Frontend sends ONLY metadata and file blob — backend handles storage path generation.
   */
  create: async (
    file: File,
    params: { title: string; category_id?: string; subcategory_id?: string },
  ): Promise<{
    id: string;
    title: string;
    category_id: string | null;
    subcategory_id: string | null;
    template?: { id: string; title: string; status: string };
    version?: { id: string; version_number: number };
    source_file?: { id: string; file_name: string; file_type: string };
  }> => {
    if (!params.title || !params.title.trim()) {
      throw new ApiError("VALIDATION_ERROR", "Title is required");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", params.title.trim());
    if (params.category_id) formData.append("category_id", params.category_id);
    if (params.subcategory_id) formData.append("subcategory_id", params.subcategory_id);

    const uploadController = new AbortController();
    const uploadTimeoutId = setTimeout(() => {
      logger.warn("Upload request timeout, aborting", { fileName: file.name, fileSize: file.size });
      uploadController.abort();
    }, 120000);

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/templates`, {
        method: "POST",
        body: formData,
        credentials: "include",
        signal: uploadController.signal,
      });
      clearTimeout(uploadTimeoutId);
    } catch (error) {
      clearTimeout(uploadTimeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        logger.error("Upload timed out", { fileName: file.name, fileSize: file.size });
        throw new ApiError(
          "TIMEOUT",
          "Upload is taking too long. The file might be too large or the server is slow. Please try again with a smaller file.",
          { fileName: file.name, fileSize: file.size },
        );
      }
      const errorMessage = error instanceof Error ? error.message : "Network error";
      logger.error("Network error during upload", { fileName: file.name, errorMessage });
      throw new ApiError(
        "NETWORK_ERROR",
        `Failed to upload file: ${errorMessage}`,
        { fileName: file.name },
      );
    }

    const responseContentType = response.headers.get("content-type");

    type CreateTemplateData = {
      id: string;
      title: string;
      category_id: string;
      subcategory_id: string;
      template?: { id: string; title: string; status: string };
      version?: { id: string; version_number: number };
      source_file?: { id: string; file_name: string; file_type: string };
    };

    let data: ApiResponse<CreateTemplateData>;

    try {
      if (responseContentType?.includes("application/json")) {
        data = (await response.json()) as ApiResponse<CreateTemplateData>;
      } else {
        const text = await response.text();
        logger.error("Template upload: non-JSON response", {
          status: response.status,
          contentType: responseContentType,
          responseText: text.substring(0, 500),
        });
        throw new ApiError(
          "INVALID_RESPONSE",
          `Backend returned non-JSON response: ${responseContentType}`,
          { status: response.status },
        );
      }
    } catch (parseError) {
      if (parseError instanceof ApiError) throw parseError;
      logger.error("Template upload: failed to parse response", {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        status: response.status,
        contentType: responseContentType,
      });
      throw new ApiError(
        "PARSE_ERROR",
        `Failed to parse backend response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        { status: response.status },
      );
    }

    if (!response.ok || !data.success) {
      const { code: errorCode, message: errorMsg } = extractApiError(
        data.error,
        "Failed to create template",
      );
      logger.error("Template creation failed", {
        status: response.status,
        errorMsg,
        errorCode,
        title: params.title.trim(),
        fileName: file.name,
        fileSize: file.size,
      });
      throw new ApiError(errorCode, errorMsg);
    }

    return data.data!;
  },

  update: async (
    id: string,
    updates: {
      name?: string;
      description?: string;
      fields?: unknown[];
      width?: number;
      height?: number;
    },
  ) => {
    const response = await apiRequest(`/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
    return response.data!;
  },

  delete: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const data = (await response.json()) as ApiResponse<unknown>;

    if (!response.ok || !data.success) {
      const { code: errorCode, message: errorMessage } = extractApiError(
        data.error,
        "Failed to delete template",
      );
      throw new ApiError(errorCode, errorMessage);
    }

    return data.data!;
  },

  getPreviewUrl: async (id: string) => {
    const response = await apiRequest<{ url: string }>(`/templates/${id}/preview-url`);
    return response.data!.url;
  },

  generatePreview: async (templateId: string, versionId: string) => {
    const response = await apiRequest<{ url?: string; status: string }>(
      `/templates/${templateId}/versions/${versionId}/preview`,
      { method: "POST" },
    );
    return response.data!;
  },

  getCategories: async () => {
    const response = await apiRequest<{
      categories: string[];
      categoryMap: Record<string, string[]>;
      industry: string | null;
    }>("/templates/categories");
    return response.data!;
  },

  /**
   * Get recent template usage for the current user.
   * Returns recently generated templates and in-progress designs.
   */
  getRecentUsage: async (limit?: number) => {
    const queryParams = limit ? `?limit=${limit}` : "";
    const response = await apiRequest<{
      recent_generated: RecentGeneratedTemplate[];
      in_progress: InProgressTemplate[];
    }>(`/templates/recent-usage${queryParams}`);
    return response.data!;
  },

  /**
   * Save in-progress design for a template.
   */
  saveProgress: async (
    templateId: string,
    fieldSnapshot: Array<Record<string, unknown>>,
    templateVersionId?: string,
  ) => {
    const response = await apiRequest<{ id: string; saved: boolean }>(
      `/templates/${templateId}/save-progress`,
      {
        method: "POST",
        body: JSON.stringify({
          template_version_id: templateVersionId,
          field_snapshot: fieldSnapshot,
        }),
      },
    );
    return response.data!;
  },
};
