import { NextResponse } from "next/server";
import { serverApiRequest, isServerAuthenticated } from "@/lib/api/server";

interface ResolveDashboardResponse {
  redirect_to: string | null;
  setup_state: "ready" | "needs_bootstrap";
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; organization_id: string; role_id: string } | null;
}

export async function POST() {
  try {
    const hasValidToken = await isServerAuthenticated();

    if (!hasValidToken) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const result = await serverApiRequest<ResolveDashboardResponse>("/auth/resolve-dashboard", {
      method: "POST",
    });

    // Auto-bootstrap: user authenticated but has no org (signup bootstrap didn't run).
    // Try once before surfacing the error to the frontend.
    if (result.data?.setup_state === "needs_bootstrap") {
      try {
        await serverApiRequest("/auth/bootstrap", { method: "POST" });
        const retryResult = await serverApiRequest<ResolveDashboardResponse>("/auth/resolve-dashboard", {
          method: "POST",
        });
        return NextResponse.json({ success: true, data: retryResult.data });
      } catch {
        // Bootstrap failed — let the frontend show the error
      }
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("[API] resolve-dashboard error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to resolve dashboard" },
      { status: 500 },
    );
  }
}
