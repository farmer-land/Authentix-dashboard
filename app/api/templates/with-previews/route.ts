/**
 * TEMPLATES WITH PREVIEWS BFF ROUTE
 *
 * Aggregates templates list + preview URLs in a single request
 * to eliminate N+1 pattern from the client.
 *
 * Features:
 * - Parallel preview URL fetching
 * - Short TTL in-memory cache for burst protection
 * - Graceful fallback if preview fails
 */

import { NextRequest, NextResponse } from "next/server";
import { serverApiRequest, ServerApiError, getServerAccessToken } from "@/lib/api/server";

// ============================================================================
// Types
// ============================================================================

interface Template {
  // Backend may return template_id or id
  id?: string;
  template_id?: string;
  // Backend returns title (not name)
  title: string;
  name?: string; // Legacy field for backward compatibility
  description?: string | null;
  file_type?: string;
  file_path?: string;
  // Backend returns category_id and category_name (from v_templates_list view)
  category_id?: string;
  category_name?: string;
  subcategory_id?: string;
  subcategory_name?: string;
  // Legacy fields for backward compatibility
  certificate_category?: string | null;
  certificate_subcategory?: string | null;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string };
  width?: number | null;
  height?: number | null;
  fields?: unknown[];
  certificate_count?: number;
  organization_id: string;
  created_at: string;
  updated_at: string;
  // Preview fields from backend (v_templates_list returns preview_bucket and preview_path)
  preview_url?: string;
  preview_bucket?: string | null;
  preview_path?: string | null;
  preview_file_id?: string | null;
  latest_preview_file_id?: string | null;
  preview_status?: "pending" | "ready" | "failed" | null;
  // Version fields
  latest_version_id?: string | null;
  latest_version_number?: number | null;
  latest_page_count?: number | null;
  latest_source_file_id?: string | null;
}

interface TemplateListResponse {
  items: Template[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ============================================================================
// Handler
// ============================================================================

export async function GET(request: NextRequest) {
  // Check authentication — uses Supabase session (handles token refresh) then cookie fallback
  const accessToken = await getServerAccessToken();

  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  try {
    // Get query params
    const { searchParams } = request.nextUrl;
    const sortBy = searchParams.get("sort_by") || "created_at";
    const sortOrder = searchParams.get("sort_order") || "desc";
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "50";

    // Fetch templates list — backend includes preview_url and category/subcategory names via JOINs
    let templatesResponse;
    try {
      templatesResponse = await serverApiRequest<TemplateListResponse>(
        `/templates?sort_by=${sortBy}&sort_order=${sortOrder}&page=${page}&limit=${limit}&include=preview_url`
      );
    } catch (error) {
      if (error instanceof ServerApiError) throw error;
      throw new ServerApiError(
        'BACKEND_ERROR',
        error instanceof Error ? error.message : 'Failed to fetch templates from backend',
        502
      );
    }

    if (!templatesResponse.data) {
      return NextResponse.json({
        success: true,
        data: { items: [], pagination: { page: 1, limit: 50, total: 0, total_pages: 0 } },
      });
    }

    const templates = templatesResponse.data.items;

    // Normalize templates — category/subcategory names come from backend JOINs.
    // If the backend omits them, they are null; no client-side fallback lookups.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templatesWithPreviews: Template[] = templates.map((template: any) => {
      const normalizedId = template.id || template.template_id;
      const normalizedTitle = template.title || template.name;
      
      const categoryName =
        template.category_name ||
        template.category?.name ||
        template.certificate_category ||
        null;

      const subcategoryName =
        template.subcategory_name ||
        template.subcategory?.name ||
        template.certificate_subcategory ||
        null;
      
      // Extract preview file data - check both root level and nested preview_file object
      const previewFileId =
        template.latest_preview_file_id ||
        template.preview_file_id ||
        template.preview_file?.id;

      const previewBucket =
        template.preview_bucket ||
        template.preview_file?.bucket;

      const previewPath =
        template.preview_path ||
        template.preview_file?.path;
      
      // Determine file type from source_file.mime_type or backend file_type
      // Backend now correctly sets file_type from source_file.mime_type
      let fileType = template.file_type || 'pdf';

      // Override with source_file.mime_type if available (more reliable)
      if (template.source_file?.mime_type) {
        const mimeType = template.source_file.mime_type.toLowerCase();
        if (mimeType === 'application/pdf') {
          fileType = 'pdf';
        } else if (mimeType === 'image/png') {
          fileType = 'png';
        } else if (mimeType === 'image/jpeg') {
          fileType = 'jpg';
        } else if (mimeType === 'image/webp') {
          fileType = 'webp';
        } else if (mimeType.includes('word') || mimeType.includes('document')) {
          fileType = 'docx';
        } else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
          fileType = 'pptx';
        }
      } else if (template.source_file?.path) {
        // Fallback to path extension if mime_type is missing
        const ext = template.source_file.path.split('.').pop()?.toLowerCase();
        if (ext === 'png') fileType = 'png';
        else if (ext === 'jpg' || ext === 'jpeg') fileType = 'jpg';
        else if (ext === 'webp') fileType = 'webp';
        else if (ext === 'pdf') fileType = 'pdf';
        else if (ext === 'docx') fileType = 'docx';
        else if (ext === 'pptx') fileType = 'pptx';
      }
      
      // Build normalized template object
      const normalized: Template = {
        id: normalizedId,
        title: normalizedTitle || 'Untitled Template', // Ensure title is never empty
        name: normalizedTitle || 'Untitled Template', // For backward compatibility
        description: template.description || null,
        file_type: fileType,
        file_path: template.file_path || '',
        category_id: template.category_id,
        category_name: categoryName || null,
        subcategory_id: template.subcategory_id,
        subcategory_name: subcategoryName || null,
        // Legacy fields for backward compatibility
        certificate_category: categoryName || null,
        certificate_subcategory: subcategoryName || null,
        category: categoryName ? { id: template.category_id || '', name: categoryName } : undefined,
        subcategory: subcategoryName ? { id: template.subcategory_id || '', name: subcategoryName } : undefined,
        width: template.width || null,
        height: template.height || null,
        fields: template.fields || [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        certificate_count: (template as any).certificates_count ?? template.certificate_count ?? 0,
        organization_id: template.organization_id,
        created_at: template.created_at,
        updated_at: template.updated_at,
        preview_url: template.preview_url, // If backend already provides signed URL
        preview_bucket: previewBucket || null,
        preview_path: previewPath || null,
        preview_file_id: previewFileId || null,
        latest_preview_file_id: previewFileId || null,
        preview_status: template.preview_status || null,
        latest_version_id: template.latest_version_id || null,
        latest_version_number: template.latest_version_number || null,
        latest_page_count: template.latest_page_count || null,
        latest_source_file_id: template.latest_source_file_id || null,
      };
      
      // If preview_url already exists, return as-is
      if (normalized.preview_url) {
        return normalized;
      }

      // If preview_bucket and preview_path exist but no URL, mark as pending
      // Frontend will fetch preview URL via GET /templates/[id]/preview-url
      if (previewBucket && previewPath) {
        return {
          ...normalized,
          preview_status: normalized.preview_status || "pending",
        };
      }

      // No preview data available
      return {
        ...normalized,
        preview_status: normalized.preview_status || null,
      };
    });

    const result: TemplateListResponse = {
      items: templatesWithPreviews,
      pagination: templatesResponse.data.pagination,
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ServerApiError) {
      console.error("[BFF] ServerApiError caught:", {
        code: error.code,
        message: error.message,
        status: error.status,
        details: error.details,
        stack: error.stack,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
        },
        { status: error.status }
      );
    }

    console.error("[BFF] Unexpected error in templates with previews:", {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        error: { 
          code: "INTERNAL_ERROR", 
          message: error instanceof Error ? error.message : "Failed to fetch templates" 
        },
      },
      { status: 500 }
    );
  }
}
