"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
  success: boolean;
  step: "email" | "otp";
  email: string;
  codeSent?: boolean;
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${appUrl}/auth/callback`,
      },
    });

    if (error) {
      redirect(`/signup?email=${encodeURIComponent(email)}`);
    }

    return { error: null, success: true, step: "otp", email, codeSent: true };
  }

  // OTP verification
  const token = ((formData.get("token") as string) || "").trim();
  if (!token || token.length < 6) {
    return { error: "Please enter the code from your email", success: false, step: "otp", email };
  }

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    return { error: "Invalid or expired code — check your email or request a new one", success: false, step: "otp", email };
  }

  redirect("/dashboard");
}
