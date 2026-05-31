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

export interface TemplateComponent {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  node: Record<string, unknown>;
  variants: Record<string, Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

export interface ActiveSession {
  session_id: string;
  user_id: string | null;
  version_id: string;
  started_at: string;
  last_seen: string;
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
   * Get template editor data (template + version + source file + fields + categories).
   */
  getEditorData: async (templateId: string) => {
    const response = await apiRequest<{
      template: {
        id: string;
        title: string;
        category_id: string;
        subcategory_id: string;
        category?: { id: string; name: string } | null;
        subcategory?: { id: string; name: string } | null;
      };
      categories: Array<{
        id: string;
        category_id: string;
        category_name: string;
        subcategory_id: string | null;
        subcategory_name: string | null;
        is_primary: boolean;
      }>;
      version: { id: string; version_number: number; status: string };
      source_file: {
        id: string;
        file_name: string;
        file_type: string;
        bucket?: string;
        path?: string;
        url?: string;
      } | null;
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
   * Get all category assignments for a template.
   */
  getTemplateCategories: async (templateId: string) => {
    const response = await apiRequest<{
      categories: Array<{
        id: string;
        category_id: string;
        category_name: string;
        subcategory_id: string | null;
        subcategory_name: string | null;
        is_primary: boolean;
      }>;
    }>(`/templates/${templateId}/categories`);
    return response.data!.categories;
  },

  /**
   * Replace all category assignments for a template.
   */
  setCategories: async (
    templateId: string,
    categories: Array<{ category_id: string; subcategory_id?: string | null; is_primary?: boolean }>,
  ) => {
    const response = await apiRequest<{
      categories: Array<{
        id: string;
        category_id: string;
        category_name: string;
        subcategory_id: string | null;
        subcategory_name: string | null;
        is_primary: boolean;
      }>;
    }>(`/templates/${templateId}/categories`, {
      method: "PUT",
      body: JSON.stringify({ categories }),
    });
    return response.data!.categories;
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
    onProgress?: (pct: number) => void,
  ): Promise<{
    id: string;
    title: string;
    category_id: string | null;
    subcategory_id: string | null;
    template_version_id?: string;
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

    // Use XHR instead of fetch — only XHR exposes upload progress events.
    let xhrStatus: number;
    let xhrText: string;
    let xhrContentType: string | null;
    try {
      ({ status: xhrStatus, responseText: xhrText, contentType: xhrContentType } =
        await new Promise<{ status: number; responseText: string; contentType: string | null }>(
          (resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.withCredentials = true;
            xhr.timeout = 120_000;
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable && onProgress)
                onProgress(Math.round((e.loaded / e.total) * 100));
            });
            xhr.addEventListener('load', () =>
              resolve({
                status: xhr.status,
                responseText: xhr.responseText,
                contentType: xhr.getResponseHeader('content-type'),
              }),
            );
            xhr.addEventListener('error', () =>
              reject(Object.assign(new Error('Network error'), { _kind: 'network' })),
            );
            xhr.addEventListener('timeout', () =>
              reject(Object.assign(new Error('timeout'), { _kind: 'timeout' })),
            );
            xhr.open('POST', `${API_BASE_URL}/templates`);
            xhr.send(formData);
          },
        ));
    } catch (error: unknown) {
      const e = error as { _kind?: string; message?: string };
      if (e._kind === 'timeout') {
        logger.warn("Upload request timeout", { fileName: file.name, fileSize: file.size });
        throw new ApiError(
          "TIMEOUT",
          "Upload is taking too long. The file might be too large or the server is slow. Please try again with a smaller file.",
          { fileName: file.name, fileSize: file.size },
        );
      }
      const errorMessage = error instanceof Error ? error.message : "Network error";
      logger.error("Network error during upload", { fileName: file.name, errorMessage });
      throw new ApiError("NETWORK_ERROR", `Failed to upload file: ${errorMessage}`, { fileName: file.name });
    }

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
      if (xhrContentType?.includes("application/json")) {
        data = JSON.parse(xhrText) as ApiResponse<CreateTemplateData>;
      } else {
        logger.error("Template upload: non-JSON response", {
          status: xhrStatus,
          contentType: xhrContentType,
          responseText: xhrText.substring(0, 500),
        });
        throw new ApiError("INVALID_RESPONSE", `Backend returned non-JSON response: ${xhrContentType}`, { status: xhrStatus });
      }
    } catch (parseError) {
      if (parseError instanceof ApiError) throw parseError;
      logger.error("Template upload: failed to parse response", {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        status: xhrStatus, contentType: xhrContentType,
      });
      throw new ApiError(
        "PARSE_ERROR",
        `Failed to parse backend response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        { status: xhrStatus },
      );
    }

    const httpOk = xhrStatus >= 200 && xhrStatus < 300;
    if (!httpOk || !data.success) {
      const { code: errorCode, message: errorMsg } = extractApiError(data.error, "Failed to create template");
      logger.error("Template creation failed", {
        status: xhrStatus, errorMsg, errorCode,
        title: params.title.trim(), fileName: file.name, fileSize: file.size,
      });
      throw new ApiError(errorCode, errorMsg);
    }

    // Backend returns { template: {...}, version: {...} } (nested), but callers expect
    // a flat { id, title, ... } shape. Normalize here so templateData.id is always valid.
    const raw = data.data! as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const nested = raw.template;
    return {
      id: nested?.id ?? raw.id,
      title: nested?.title ?? raw.title,
      category_id: nested?.category_id ?? raw.category_id ?? null,
      subcategory_id: nested?.subcategory_id ?? raw.subcategory_id ?? null,
      template_version_id: raw.version?.id ?? undefined,
      template: raw.template,
      version: raw.version,
      source_file: raw.source_file,
    };
  },

  update: async (
    id: string,
    updates: {
      name?: string;
      description?: string;
      fields?: unknown[];
      width?: number;
      height?: number;
      category_id?: string | null;
      subcategory_id?: string | null;
    },
  ) => {
    const response = await apiRequest(`/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
    return response.data!;
  },

  delete: async (id: string) => {
    const response = await apiRequest(`/templates/${id}`, { method: "DELETE" });
    return response.data;
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

  // ── Component library ────────────────────────────────────────────────────────

  listComponents: async (): Promise<{ items: TemplateComponent[]; total: number }> => {
    const response = await apiRequest<{ items: TemplateComponent[]; total: number }>(
      `/templates/components`,
    );
    return response.data!;
  },

  getComponent: async (id: string): Promise<TemplateComponent> => {
    const response = await apiRequest<TemplateComponent>(`/templates/components/${id}`);
    return response.data!;
  },

  createComponent: async (dto: {
    name: string;
    description?: string;
    node: Record<string, unknown>;
    variants?: Record<string, Record<string, unknown>>;
  }): Promise<TemplateComponent> => {
    const response = await apiRequest<TemplateComponent>(`/templates/components`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!;
  },

  updateComponent: async (
    id: string,
    dto: Partial<{ name: string; description: string; node: Record<string, unknown>; variants: Record<string, Record<string, unknown>> }>,
  ): Promise<TemplateComponent> => {
    const response = await apiRequest<TemplateComponent>(`/templates/components/${id}`, {
      method: "PUT",
      body: JSON.stringify(dto),
    });
    return response.data!;
  },

  deleteComponent: async (id: string): Promise<void> => {
    await apiRequest(`/templates/components/${id}`, { method: "DELETE" });
  },

  // ── Collaboration sessions ────────────────────────────────────────────────────

  registerSession: async (templateId: string, versionId: string, sessionId: string): Promise<void> => {
    await apiRequest(`/templates/${templateId}/versions/${versionId}/sessions`, {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  heartbeat: async (templateId: string, versionId: string, sessionId: string): Promise<void> => {
    await apiRequest(`/templates/${templateId}/versions/${versionId}/sessions/${sessionId}/heartbeat`, {
      method: "PUT",
      body: JSON.stringify({}),
    });
  },

  getActiveSessions: async (templateId: string, versionId: string): Promise<{ items: ActiveSession[]; total: number }> => {
    const response = await apiRequest<{ items: ActiveSession[]; total: number }>(
      `/templates/${templateId}/versions/${versionId}/sessions`,
    );
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
