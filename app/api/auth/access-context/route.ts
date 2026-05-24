export const runtime = 'edge';
import { NextResponse } from "next/server";

import { serverApiRequest, isServerAuthenticated } from "@/lib/api/server";
import { AccessContextResponseSchema } from "@/lib/api/schemas/auth";

export async function GET() {
  try {
    const hasValidToken = await isServerAuthenticated();

    if (!hasValidToken) {
      return NextResponse.json({
        success: true,
        data: { authenticated: false, email_verified: false, user: null, organization: null, membership: null },
      });
    }

    const result = await serverApiRequest("/auth/access-context");
    const validated = AccessContextResponseSchema.parse(result.data);

    return NextResponse.json({ success: true, data: validated });
  } catch (error) {
    console.error("[API] access-context error:", error);
    return NextResponse.json({
      success: true,
      data: { authenticated: false, email_verified: false, user: null, organization: null, membership: null },
    });
  }
}
