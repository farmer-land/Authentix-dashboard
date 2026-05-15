/**
 * VERIFICATION DOMAIN API
 *
 * Public certificate verification + authenticated verification events.
 */

import { ApiError, ApiResponse, extractApiError, API_BASE_URL, apiRequest, buildQueryString, PaginatedResponse } from "./core";

export interface VerificationEvent {
  id: string;
  result: "valid" | "invalid" | "expired" | "revoked" | "not_found";
  scanned_at: string;
  user_agent: string | null;
  ip_hash: string | null;
  certificates: {
    id: string;
    recipient_name: string;
    recipient_email: string | null;
    certificate_number: string;
  } | null;
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

  listEvents: async (params?: {
    page?: number;
    limit?: number;
    result?: "valid" | "invalid" | "expired" | "revoked" | "not_found";
  }): Promise<{ events: VerificationEvent[]; pagination: { page: number; limit: number; total: number; total_pages: number } }> => {
    const response = await apiRequest<{ events: VerificationEvent[]; pagination: { page: number; limit: number; total: number; total_pages: number } }>(
      `/verification/events${buildQueryString({ page: params?.page, limit: params?.limit, result: params?.result })}`
    );
    return response.data!;
  },
};
