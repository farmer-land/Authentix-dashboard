/**
 * Regression test for GARDEN-27's primary bug: app/(auth)/signup/actions.ts
 * called `supabase.auth.signInWithOtp` with `emailRedirectTo` set, which makes
 * Supabase send a magic LINK — but the UI's next step ("otp") shows a 6-digit
 * CODE entry screen and verifies via `verifyOtp`. Users got a link that
 * didn't match the screen asking them to type a code.
 *
 * This test locks in that the "usecase" step's `signInWithOtp` call no longer
 * passes `emailRedirectTo`, so Supabase issues a code instead of a link.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type SignInWithOtpResult = { data: object; error: { message: string } | null };

const signInWithOtp = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<SignInWithOtpResult>>(() =>
    Promise.resolve({ data: {}, error: null })
  )
);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({ auth: { signInWithOtp } })
  ),
}));

import { signupAction, type SignupState } from "@/app/(auth)/signup/actions";

const baseState: SignupState = {
  error: null,
  fieldErrors: {},
  success: false,
  step: "usecase",
  email: "jane@acme.com",
  full_name: "Jane Doe",
  company_name: "Acme Corp",
  website_url: "",
  use_case: "both",
};

function usecaseFormData() {
  const fd = new FormData();
  fd.set("step", "usecase");
  fd.set("email", "jane@acme.com");
  fd.set("full_name", "Jane Doe");
  fd.set("company_name", "Acme Corp");
  fd.set("website_url", "");
  fd.set("use_case", "both");
  return fd;
}

beforeEach(() => {
  signInWithOtp.mockClear();
});

describe("signupAction — GARDEN-27 magic-link/OTP mismatch", () => {
  it("sends the OTP without emailRedirectTo so Supabase issues a code, not a link", async () => {
    const result = await signupAction(baseState, usecaseFormData());

    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    const [{ options }] = signInWithOtp.mock.calls[0] as unknown as [
      { email: string; options: Record<string, unknown> }
    ];

    expect(options).not.toHaveProperty("emailRedirectTo");
    expect(options.shouldCreateUser).toBe(true);

    // Step still advances to the code-entry screen the UI actually shows.
    expect(result.step).toBe("otp");
    expect(result.success).toBe(true);
  });

  it("surfaces the Supabase error instead of silently advancing to the otp step", async () => {
    signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { message: "Email rate limit exceeded" },
    });

    const result = await signupAction(baseState, usecaseFormData());

    expect(result.step).toBe("usecase");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Email rate limit exceeded");
  });
});
