export const runtime = 'edge';
import { NextResponse } from "next/server";

import {
  getServerRefreshToken,
  setServerAuthCookies,
  clearServerAuthCookies,
  sanitizeErrorMessage,
} from "@/lib/api/server";
import { RefreshResponseSchema } from "@/lib/api/schemas/auth";

import { BACKEND_PRIMARY_URL, BACKEND_FALLBACK_URL, isPreSendConnectionError } from "@/lib/config/env";

export async function POST() {
  try {
    const refreshToken = await getServerRefreshToken();

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: "No refresh token" },
        { status: 401 }
      );
    }

    const fetchOpts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    };

    let response: Response;
    try {
      response = await fetch(`${BACKEND_PRIMARY_URL}/auth/refresh`, fetchOpts);
    } catch (fetchError) {
      // Pre-send gate: never re-send a refresh that may already have been received
      // and rotated the token.
      if (isPreSendConnectionError(fetchError) && BACKEND_FALLBACK_URL) {
        console.warn(
          `[Refresh] Local backend unreachable, using Railway fallback: ${BACKEND_FALLBACK_URL}/auth/refresh`
        );
        response = await fetch(`${BACKEND_FALLBACK_URL}/auth/refresh`, fetchOpts);
      } else {
        throw fetchError;
      }
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      await clearServerAuthCookies();
      return NextResponse.json(
        { success: false, error: "Session expired" },
        { status: 401 }
      );
    }

    const validated = RefreshResponseSchema.parse(data.data);
    await setServerAuthCookies(validated.session);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Token refresh error:", error);
    await clearServerAuthCookies();

    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 401 }
    );
  }
}
