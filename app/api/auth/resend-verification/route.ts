import { NextRequest, NextResponse } from "next/server";
import {
  serverApiRequest,
  isServerAuthenticated,
  sanitizeErrorMessage,
  ServerApiError,
} from "@/lib/api/server";

export async function POST(_request: NextRequest) {
  try {
    // Check if user is authenticated
    const hasValidToken = await isServerAuthenticated();
    if (!hasValidToken) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Call backend to resend verification email
    await serverApiRequest("/auth/resend-verification", {
      method: "POST",
    });

    return NextResponse.json({
      success: true,
      data: { message: "Verification email sent" },
    });
  } catch (error) {
    console.error("[API] Resend verification error:", error);

    const status = error instanceof ServerApiError ? error.status : 500;
    const message = sanitizeErrorMessage(error);

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
