"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
  success: boolean;
  step: "email" | "otp";
  email: string;
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

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const step = (formData.get("step") as string) || "email";
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

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error) {
      // Supabase returns an error when the user doesn't exist and shouldCreateUser is false.
      // Send them to signup with their email pre-filled.
      redirect(`/signup?email=${encodeURIComponent(email)}`);
    }

    return { error: null, success: true, step: "otp", email };
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
