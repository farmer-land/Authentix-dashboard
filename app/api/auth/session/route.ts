export const runtime = 'edge';
import { NextResponse } from "next/server";

import { serverApiRequest, isServerAuthenticated } from "@/lib/api/server";

interface SessionResponse {
  user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  valid: boolean;
}

export async function GET() {
  try {
    // Check if we have a valid token
    const hasValidToken = await isServerAuthenticated();

    if (!hasValidToken) {
      return NextResponse.json({
        success: true,
        data: {
          user: null,
          valid: false,
        },
      });
    }

    // Verify session with backend
    const result = await serverApiRequest<SessionResponse>("/auth/session");

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("[API] Session check error:", error);

    // Return invalid session rather than error
    return NextResponse.json({
      success: true,
      data: {
        user: null,
        valid: false,
      },
    });
  }
}
