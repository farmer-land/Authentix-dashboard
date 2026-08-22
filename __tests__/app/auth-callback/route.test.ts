/**
 * Regression tests for GARDEN-27's secondary bug: app/(auth)/auth/callback/route.ts
 * used to redirect to /login?error=auth_failed on ANY PKCE exchange failure,
 * including a harmless reused/expired one-time code — which is exactly what
 * happened when a user clicked an old magic-link email a second time after
 * already completing sign-in. That made a working signup look broken.
 *
 * These tests exercise the route handler directly against a mocked
 * `@supabase/ssr` client so we control exactly which error code
 * `exchangeCodeForSession` returns, without hitting a real Supabase project.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mutable per-test so each test controls what exchangeCodeForSession resolves to.
const exchangeState = vi.hoisted(() => ({
  result: { data: { session: null, user: null }, error: null } as {
    data: { session: unknown; user: unknown };
    error: { code?: string; message: string } | null;
  },
}));

const exchangeCodeForSession = vi.hoisted(() => vi.fn(() => Promise.resolve(exchangeState.result)));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { exchangeCodeForSession },
  })),
}));

import { GET } from "@/app/(auth)/auth/callback/route";

function makeRequest(query: string) {
  return new NextRequest(`https://app.example.com/auth/callback${query}`, {
    headers: { cookie: "" },
  });
}

function locationOf(response: Response): string {
  const loc = response.headers.get("location");
  if (!loc) throw new Error("Redirect response had no Location header");
  return loc;
}

beforeEach(() => {
  exchangeCodeForSession.mockClear();
  exchangeState.result = { data: { session: null, user: null }, error: null };
});

describe("auth callback route — GARDEN-27 reused/expired code handling", () => {
  it("redirects a reused one-time code (flow_state_not_found) to a benign notice, not auth_failed", async () => {
    exchangeState.result = {
      data: { session: null, user: null },
      error: { code: "flow_state_not_found", message: "Invalid flow state, no valid flow state found." },
    };

    const response = await GET(makeRequest("?code=already-used-code"));
    const location = locationOf(response);

    expect(location).toContain("/login?notice=link_already_used");
    expect(location).not.toContain("error=auth_failed");
  });

  it("redirects an expired one-time code (flow_state_expired) to the same benign notice", async () => {
    exchangeState.result = {
      data: { session: null, user: null },
      error: { code: "flow_state_expired", message: "Flow state expired." },
    };

    const response = await GET(makeRequest("?code=expired-code"));
    const location = locationOf(response);

    expect(location).toContain("/login?notice=link_already_used");
    expect(location).not.toContain("error=auth_failed");
  });

  it("still redirects a genuine exchange failure to error=auth_failed", async () => {
    exchangeState.result = {
      data: { session: null, user: null },
      error: { code: "bad_code_verifier", message: "Code verifier does not match." },
    };

    const response = await GET(makeRequest("?code=malformed-code"));
    const location = locationOf(response);

    expect(location).toContain("/login?error=auth_failed");
    expect(location).not.toContain("notice=link_already_used");
  });

  it("still redirects to auth_failed when no session is returned even without an error code", async () => {
    // Belt-and-braces case already covered before this fix: no error object at
    // all, but Supabase also didn't return a session.
    exchangeState.result = { data: { session: null, user: null }, error: null };

    const response = await GET(makeRequest("?code=no-session-code"));
    const location = locationOf(response);

    expect(location).toContain("/login?error=auth_failed");
  });

  it("redirects to auth_failed when the callback has no code at all (unchanged behavior)", async () => {
    const response = await GET(makeRequest(""));
    const location = locationOf(response);

    expect(location).toContain("/login?error=auth_failed");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
