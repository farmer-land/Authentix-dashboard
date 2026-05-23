/**
 * AUTH DOMAIN API
 *
 * All authentication-related API calls.
 * Auth endpoints use Next.js Route Handlers (/api/auth/*).
 */

import { apiRequest, authApiRequest } from "./core";

export const authApi = {
  logout: async () => {
    return authApiRequest<void>("/auth/logout", { method: "POST" });
  },

  bootstrap: async () => {
    const response = await apiRequest<{
      organization: { id: string; name?: string; slug?: string; logo?: string | null };
      membership?: { id: string; role?: string };
    }>("/auth/bootstrap", { method: "POST" });
    return response.data!;
  },

  getSession: async () => {
    return authApiRequest<{
      user: { id: string; email: string; full_name: string | null } | null;
      valid: boolean;
    }>("/auth/session");
  },

  /**
   * Get current authenticated user info including email verification status.
   * @param email Optional email parameter for cross-device verification checks.
   */
  me: async (email?: string) => {
    const url = email ? `/auth/me?email=${encodeURIComponent(email)}` : "/auth/me";
    const response = await apiRequest<{
      authenticated: boolean;
      user: {
        id: string;
        email: string;
        email_verified: boolean;
        full_name: string | null;
      } | null;
      organization?: { id: string; name: string } | null;
    }>(url);
    return response.data!;
  },

  /**
   * Check verification status by email (cookie-independent).
   */
  checkVerificationStatus: async (email: string) => {
    const response = await apiRequest<{
      verified: boolean;
      email?: string;
      user_id?: string;
    }>(`/auth/verification-status?email=${encodeURIComponent(email)}`);
    return response.data!;
  },

  resendVerification: async () => {
    return authApiRequest<void>("/auth/resend-verification", { method: "POST" });
  },

  refresh: async () => {
    return authApiRequest<void>("/auth/refresh", { method: "POST" });
  },

  resolveDashboard: async (): Promise<{
    redirect_to: string | null;
    setup_state: "ready" | "needs_bootstrap";
    organization: { id: string; name: string; slug: string } | null;
    membership: { id: string; organization_id: string; role_id: string } | null;
  }> => {
    const response = await apiRequest<{
      redirect_to: string | null;
      setup_state: "ready" | "needs_bootstrap";
      organization: { id: string; name: string; slug: string } | null;
      membership: { id: string; organization_id: string; role_id: string } | null;
    }>("/auth/resolve-dashboard", { method: "POST" });
    return response.data!;
  },

  inviteMember: async (email: string, role_key: "admin" | "member") => {
    const response = await apiRequest<{ message: string }>("/auth/invite", {
      method: "POST",
      body: JSON.stringify({ email, role_key }),
    });
    return response.data!;
  },

  acceptInvite: async () => {
    const response = await apiRequest<{ redirect_to: string }>("/auth/accept-invite", {
      method: "POST",
    });
    return response.data!;
  },
};
