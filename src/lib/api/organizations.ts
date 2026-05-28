/**
 * ORGANIZATIONS DOMAIN API
 *
 * Organization profile management and API settings.
 */

import { apiRequest, ApiError, ApiResponse, extractApiError, API_BASE_URL } from "./core";
import type { Organization } from "@/lib/types/organization";

export { Organization };

export const organizationsApi = {
  get: async () => {
    const response = await apiRequest<Organization>("/organizations/me");
    return response.data!;
  },

  update: async (
    data: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      website?: string | null;
      industry?: string | null;
      industry_id?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
      postal_code?: string | null;
      gst_number?: string | null;
      cin_number?: string | null;
      billing_email?: string | null;
      billing_currency?: string | null;
      billing_address?: string | null;
      billing_city?: string | null;
      billing_state?: string | null;
      billing_country?: string | null;
      billing_postal_code?: string | null;
      verification_message?: string | null;
      certificate_prefix?: string;
      certificate_number_format?: string;
    },
    logoFile?: File,
  ): Promise<Organization> => {
    if (logoFile) {
      const formData = new FormData();
      formData.append("metadata", JSON.stringify(data));
      formData.append("file", logoFile);

      // Explicitly attach the session token so the proxy doesn't have to fall
      // back to cookie extraction (which is unreliable for multipart requests).
      let accessToken: string | undefined;
      try {
        const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token ?? undefined;
      } catch { /* non-browser context */ }

      const response = await fetch(`${API_BASE_URL}/organizations/me`, {
        method: "PUT",
        body: formData,
        credentials: "include",
        headers: accessToken ? { "X-Supabase-Token": accessToken } : undefined,
      });

      const result = (await response.json()) as ApiResponse<Organization>;
      if (!response.ok || !result.success) {
        const { code, message: errorMsg } = extractApiError(
          result.error,
          "Failed to update organization",
        );
        throw new ApiError(code, errorMsg);
      }

      return result.data!;
    } else {
      const response = await apiRequest<Organization>("/organizations/me", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return response.data!;
    }
  },

  getAPISettings: async () => {
    const response = await apiRequest<{
      application_id: string;
      api_enabled: boolean;
      api_key_exists: boolean;
      api_key_created_at: string | null;
      api_key_last_rotated_at: string | null;
    }>("/organizations/me/api-settings");
    return response.data!;
  },

  updateAPIEnabled: async (enabled: boolean) => {
    const response = await apiRequest("/organizations/me/api-settings", {
      method: "PUT",
      body: JSON.stringify({ api_enabled: enabled }),
    });
    return response.data!;
  },

  bootstrapIdentity: async () => {
    const response = await apiRequest<{
      application_id: string;
      api_key: string;
    }>("/organizations/me/bootstrap-identity", { method: "POST" });
    return response.data!;
  },

  updateFeatures: async (features: string[]): Promise<void> => {
    await apiRequest("/organizations/me/features", {
      method: "PUT",
      body: JSON.stringify({ features }),
    });
  },

  rotateAPIKey: async () => {
    const response = await apiRequest<{
      application_id: string;
      api_key: string;
    }>("/organizations/me/rotate-api-key", { method: "POST" });
    return response.data!;
  },
};
