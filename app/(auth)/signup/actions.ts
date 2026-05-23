"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/auth/turnstile";

export interface SignupState {
  error: string | null;
  fieldErrors: {
    email?: string;
    full_name?: string;
    company_name?: string;
  };
  success: boolean;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "mail.com", "protonmail.com",
  "zoho.com", "yandex.com", "gmx.com", "live.com", "msn.com",
]);

export async function signupAction(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const fullName = ((formData.get("full_name") as string) || "").trim();
  const companyName = ((formData.get("company_name") as string) || "").trim();

  const fieldErrors: SignupState["fieldErrors"] = {};

  if (!email || !isValidEmail(email)) {
    fieldErrors.email = "Please enter a valid email address";
  } else {
    const domain = email.split("@")[1] ?? "";
    if (PERSONAL_DOMAINS.has(domain)) {
      fieldErrors.email = "Personal email domains (gmail, yahoo, etc.) are not allowed — use a work email";
    }
  }

  if (!fullName || fullName.length < 2) {
    fieldErrors.full_name = "Please enter your full name";
  }

  if (!companyName || companyName.length < 2) {
    fieldErrors.company_name = "Please enter your company name";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the errors below", fieldErrors, success: false };
  }

  const human = await verifyTurnstile(formData);
  if (!human) {
    return { error: "Challenge failed — please try again.", fieldErrors: {}, success: false };
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { full_name: fullName, company_name: companyName },
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message, fieldErrors: {}, success: false };
  }

  // Redirect to login at OTP step — the code was just sent to their email
  const emailParam = encodeURIComponent(email);
  redirect(`/login?otp=1&email=${emailParam}`);
}
