/**
 * GENERATE CERTIFICATE — SERVICE LAYER
 *
 * Wraps all API calls for the certificate generation flow.
 * Components and hooks should call these functions instead of
 * calling `api.*` directly, so API contracts are centralised here.
 *
 * All functions return ApiResult<T> so callers handle ok/error
 * without try/catch boilerplate.
 */

import { api } from "@/lib/api/client";
import { ok, fromThrown, type ApiResult } from "@/lib/api/result";
import { logger } from "@/lib/logger";
import type { CertificateTemplate } from "@/lib/types/certificate";

const svcLogger = logger.child({ service: "generateCertificate" });

// ── Template operations ───────────────────────────────────────────────────────

export interface TemplateListItem extends CertificateTemplate {
  preview_url?: string;
}

/**
 * Load all templates and attach signed preview URLs in parallel.
 * Falls back gracefully when a preview URL is unavailable.
 */
export async function loadTemplates(): Promise<ApiResult<TemplateListItem[]>> {
  try {
    const response = await api.templates.list({ sort_by: "created_at", sort_order: "desc" });
    const items = (response.items ?? []) as CertificateTemplate[];

    const withPreviews = await Promise.all(
      items.map(async (tmpl) => {
        if (!tmpl.id) return tmpl as TemplateListItem;
        try {
          const previewUrl = await api.templates.getPreviewUrl(tmpl.id);
          return { ...tmpl, preview_url: previewUrl } as TemplateListItem;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          svcLogger.warn("Preview unavailable for template", { templateId: tmpl.id, reason: msg });
          return tmpl as TemplateListItem;
        }
      }),
    );

    svcLogger.debug("Templates loaded", { count: withPreviews.length });
    return ok(withPreviews);
  } catch (e) {
    return fromThrown(e, "Failed to load templates");
  }
}

/**
 * Load recent usage (generated + in-progress) for the template selector.
 */
export async function loadRecentUsage(limit = 10): Promise<
  ApiResult<{ recent_generated: unknown[]; in_progress: unknown[] }>
> {
  try {
    const result = await api.templates.getRecentUsage(limit);
    return ok({
      recent_generated: result.recent_generated ?? [],
      in_progress: result.in_progress ?? [],
    });
  } catch (e) {
    svcLogger.warn("Failed to load recent usage", { error: e instanceof Error ? e.message : String(e) });
    return ok({ recent_generated: [], in_progress: [] }); // non-fatal: degrade gracefully
  }
}

/**
 * Load the editor data (fields, version info) for a given template.
 */
export async function loadTemplateEditorData(templateId: string): Promise<ApiResult<{
  fields: unknown[];
  versionId: string | null;
}>> {
  try {
    const data = await api.templates.getEditorData(templateId);
    return ok({
      fields: data.fields ?? [],
      versionId: data.version?.id ?? null,
    });
  } catch (e) {
    return fromThrown(e, "Failed to load template editor data");
  }
}

/**
 * Save field layout for a template version.
 */
export async function saveTemplateFields(
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
): Promise<ApiResult<void>> {
  try {
    await api.templates.saveFields(templateId, versionId, fields);
    return ok(undefined);
  } catch (e) {
    return fromThrown(e, "Failed to save fields");
  }
}

/**
 * Delete a template. Returns ok(true) on success.
 */
export async function deleteTemplate(templateId: string): Promise<ApiResult<boolean>> {
  try {
    await api.templates.delete(templateId);
    svcLogger.info("Template deleted", { templateId });
    return ok(true);
  } catch (e) {
    return fromThrown(e, "Failed to delete template");
  }
}

// ── Import operations ─────────────────────────────────────────────────────────

/**
 * Load recent import jobs for the data selector.
 */
export async function loadSavedImports(limit = 10): Promise<ApiResult<unknown[]>> {
  try {
    const response = await api.imports.list({ sort_by: "created_at", sort_order: "desc", limit });
    return ok(response.items ?? []);
  } catch (e) {
    svcLogger.warn("Failed to load imports", { error: e instanceof Error ? e.message : String(e) });
    return ok([]); // non-fatal
  }
}

// ── Certificate generation ────────────────────────────────────────────────────

/**
 * Trigger certificate generation for a template.
 */
export async function generateCertificates(payload: {
  templateId: string;
  fieldMappings: Array<{ fieldId: string; columnName: string }>;
  data: Array<Record<string, unknown>>;
  options?: {
    includeQR?: boolean;
    expiry_type?: "day" | "week" | "month" | "year" | "5_years" | "never" | "custom";
    custom_expiry_date?: string;
    issue_date?: string;
  };
}): Promise<ApiResult<{ jobId: string | undefined; status: string; totalCertificates: number }>> {
  try {
    const result = await api.certificates.generate({
      template_id: payload.templateId,
      data: payload.data,
      field_mappings: payload.fieldMappings,
      options: payload.options,
    });
    return ok({
      jobId: result.job_id,
      status: result.status,
      totalCertificates: result.total_certificates,
    });
  } catch (e) {
    return fromThrown(e, "Certificate generation failed");
  }
}
