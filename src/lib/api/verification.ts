/**
 * VERIFICATION DOMAIN API
 *
 * Public certificate verification + authenticated verification events.
 */

import { ApiError, ApiResponse, extractApiError, API_BASE_URL, apiRequest, buildQueryString } from "./core";

export interface VerificationEvent {
  id: string;
  result: "valid" | "invalid" | "expired" | "revoked" | "not_found";
  scanned_at: string;
  user_agent: string | null;
  ip_hash: string | null;
  ip_partial: string | null;
  referrer: string | null;
  geo_country: string | null;
  geo_city: string | null;
  device_type: "mobile" | "desktop" | "tablet" | "bot" | null;
  certificates: {
    id: string;
    recipient_name: string;
    recipient_email: string | null;
    certificate_number: string;
  } | null;
}

export interface CertificateVerificationSummary {
  certificate_id: string;
  recipient_name: string;
  recipient_email: string | null;
  certificate_number: string;
  issued_at: string;
  total_count: number;
  last_verified_at: string;
  valid_count: number;
  invalid_count: number;
  expired_count: number;
  revoked_count: number;
  not_found_count: number;
}

export interface VerificationPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export const verificationApi = {
  verify: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/verification/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = (await response.json()) as ApiResponse;
    if (!response.ok || !data.success) {
      const { code, message: errorMsg } = extractApiError(data.error, "Verification failed");
      throw new ApiError(code, errorMsg);
    }

    return data.data!;
  },

  /** Paginated certificate summary — one row per certificate, ordered by most-recently verified. */
  getCertificateSummary: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ items: CertificateVerificationSummary[]; pagination: VerificationPagination }> => {
    const res = await apiRequest<{ items: CertificateVerificationSummary[]; pagination: VerificationPagination }>(
      `/verification/certificate-summary${buildQueryString({ page: params?.page, limit: params?.limit, search: params?.search })}`
    );
    return res.data!;
  },

  /** Flat event list — optionally filtered by certificate_id for the inner accordion table. */
  listEvents: async (params?: {
    page?: number;
    limit?: number;
    result?: "valid" | "invalid" | "expired" | "revoked" | "not_found";
    certificate_id?: string;
  }): Promise<{ events: VerificationEvent[]; pagination: VerificationPagination }> => {
    const res = await apiRequest<{ events: VerificationEvent[]; pagination: VerificationPagination }>(
      `/verification/events${buildQueryString({
        page: params?.page,
        limit: params?.limit,
        result: params?.result,
        certificate_id: params?.certificate_id,
      })}`
    );
    return res.data!;
  },
};
