"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BACKEND_PRIMARY_URL } from "@/lib/config/env";

export interface LoginState {
  error: string | null;
  success: boolean;
  step: "email" | "otp";
  email: string;
  /** Cross-device bridge session ID (public — safe to expose) */
  bridge_id?: string;
  /** Cross-device bridge secret (one-time — client must move to sessionStorage) */
  bridge_secret?: string;
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "mail.com", "protonmail.com",
  "zoho.com", "yandex.com", "gmx.com", "live.com", "msn.com",
]);

function isPersonalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return PERSONAL_DOMAINS.has(domain);
}

/**
 * Initiate a cross-device bridge session before sending the magic link.
 * Returns { bridge_id, bridge_secret } or null on failure (graceful degradation).
 */
async function initiateBridgeSession(
  email: string,
): Promise<{ bridge_id: string; bridge_secret: string } | null> {
  try {
    const res = await fetch(`${BACKEND_PRIMARY_URL}/auth/magic/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success: boolean; data?: { bridge_id: string; bridge_secret: string } };
    return json.success && json.data ? json.data : null;
  } catch {
    return null;
  }
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  // Use the last "step" value — a submit button's value comes after hidden fields
  // in form data order, so the "send a new code" button (value="email") wins over
  // the hidden <input name="step" value="otp">.
  const stepValues = formData.getAll("step") as string[];
  const step = stepValues.at(-1) || "email";
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();

  if (!email) {
    return { error: "Email is required", success: false, step: "email", email: "" };
  }

  const supabase = await createSupabaseServerClient();

  if (step === "email") {
    if (isPersonalEmail(email)) {
      return {
        error: "Personal email addresses aren't supported. Please use your work email.",
        success: false,
        step: "email",
        email,
      };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Create the cross-device bridge session before sending the OTP.
    // If this fails we still send the OTP — user can enter the code manually.
    const bridge = await initiateBridgeSession(email);

    // Embed bridge_id in the magic link redirect URL so Device B lands on our handler.
    const magicCallbackUrl = bridge
      ? `${appUrl}/auth/magic-callback?bridge_id=${encodeURIComponent(bridge.bridge_id)}`
      : `${appUrl}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: magicCallbackUrl,
      },
    });

    if (error) {
      // Supabase returns an error when the user doesn't exist and shouldCreateUser is false.
      // Send them to signup with their email pre-filled.
      redirect(`/signup?email=${encodeURIComponent(email)}`);
    }

    return {
      error: null,
      success: true,
      step: "otp",
      email,
      ...(bridge && { bridge_id: bridge.bridge_id, bridge_secret: bridge.bridge_secret }),
    };
  }

  // OTP verification step
  const token = ((formData.get("token") as string) || "").trim();
  if (!token || token.length < 8) {
    return { error: "Please enter the 8-digit code from your email", success: false, step: "otp", email };
  }

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    return { error: "Invalid or expired code — check your email or request a new one", success: false, step: "otp", email };
  }

  redirect("/dashboard");
}
