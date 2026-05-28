/**
 * ORGANIZATION DASHBOARD LAYOUT (Server Component)
 *
 * Fetches all session, profile, and org data in a single backend call.
 * Validates org access and redirects if unauthorized or unverified.
 * Passes pre-fetched data to the client-side DashboardShell.
 */

import { redirect } from "next/navigation";
import {
  isServerAuthenticated,
  serverApiRequest,
  ServerApiError,
} from "@/lib/api/server";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardLoadingScreen } from "@/components/dashboard/DashboardLoadingScreen";
import { getOrganizationLogoUrl } from "@/lib/utils/organization-logo";

interface OrgLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

interface AccessContextResponse {
  authenticated: boolean;
  email_verified: boolean;
  user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    billing_status: string | null;
    logo: { file_id: string; bucket: string; path: string } | null;
    logo_url: string | null;
  } | null;
  membership: {
    id: string;
    organization_id: string;
    role_key: string;
  } | null;
}

function _ProfileErrorScreen({
  errorCode,
  message,
}: {
  errorCode?: string;
  message?: string;
}) {
  if (errorCode === "AUTH_ERROR" || errorCode === "UNAUTHORIZED") {
    return null;
  }

  if (errorCode === "ORG_NOT_FOUND") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-4">
          <p className="text-destructive text-lg font-semibold">
            Organization not found
          </p>
          <p className="text-muted-foreground">
            Your account setup is incomplete. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-4">
        <p className="text-destructive text-lg font-semibold">
          {message || "Failed to load your workspace"}
        </p>
        <p className="text-muted-foreground">
          Please refresh the page to retry. If this persists, contact support.
        </p>
      </div>
    </div>
  );
}

export default async function OrgDashboardLayout({
  children,
  params,
}: OrgLayoutProps) {
  const { slug } = await params;

  // Backward compat: UUID slugs redirect to dashboard resolver
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_RE.test(slug)) {
    redirect("/dashboard");
  }

  // Quick JWT check before hitting the backend
  const isAuthenticated = await isServerAuthenticated();
  if (!isAuthenticated) {
    redirect("/login");
  }

  // Single call returns user + org + membership + email_verified
  let ctx: AccessContextResponse | null = null;
  let _ctxError: ServerApiError | null = null;

  try {
    const result = await serverApiRequest<AccessContextResponse>("/auth/access-context");
    ctx = result.data ?? null;
  } catch (error) {
    if (error instanceof ServerApiError) {
      _ctxError = error;
      if (error.status === 401 || error.code === "AUTH_ERROR" || error.code === "UNAUTHORIZED") {
        redirect("/login");
      }
    }
  }

  if (!ctx || !ctx.authenticated) {
    redirect("/login");
  }

  if (!ctx.email_verified) {
    redirect("/verify-email");
  }

  if (!ctx.organization || !ctx.membership) {
    return (
      <DashboardLoadingScreen
        message="Finalizing account setup"
        submessage="Your organization is being set up. Please wait..."
      />
    );
  }

  // Validate org access — redirect if URL param doesn't match actual org slug
  if (ctx.organization.slug !== slug) {
    redirect(`/dashboard/org/${ctx.organization.slug}`);
  }

  const userData = ctx.user
    ? {
        id: ctx.user.id,
        email: ctx.user.email,
        full_name: ctx.user.full_name,
      }
    : null;

  const organizationData = {
    name: ctx.organization.name,
    logo: getOrganizationLogoUrl(ctx.organization),
  };

  return (
    <DashboardShell
      slug={slug}
      initialUser={userData}
      initialOrganization={organizationData}
    >
      {children}
    </DashboardShell>
  );
}
