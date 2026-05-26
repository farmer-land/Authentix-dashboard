/**
 * ADMIN DOMAIN API
 *
 * Product-owner only endpoints. Calls fail with 403 for non-product-owner accounts.
 */

import { apiRequest } from "./core";

export interface AdminOrg {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  billing_status: string;
  trial_ends_at: string | null;
  plan_key: string | null;
  plan_name: string;
  certs_this_month: number;
  features: string[];
  created_at: string;
}

export const adminApi = {
  listOrganizations: async (): Promise<AdminOrg[]> => {
    const response = await apiRequest<AdminOrg[]>("/admin/organizations");
    return (response.data ?? []).map(o => ({ ...o, features: o.features ?? ['certs', 'cert_delivery_email'] }));
  },

  getOrgFeatures: async (id: string): Promise<{ id: string; slug: string; name: string; features: string[] }> => {
    const response = await apiRequest<{ id: string; slug: string; name: string; features: string[] }>(
      `/admin/organizations/${id}/features`,
    );
    return response.data!;
  },

  updateOrgFeatures: async (id: string, features: string[]): Promise<void> => {
    await apiRequest(`/admin/organizations/${id}/features`, {
      method: "PUT",
      body: JSON.stringify({ features }),
    });
  },
};
