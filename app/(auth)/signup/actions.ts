"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignupStep = "details" | "usecase" | "otp";

export type UseCase = "certificates" | "campaigns" | "both";

export interface SignupState {
  error: string | null;
  fieldErrors: {
    email?: string;
    full_name?: string;
    company_name?: string;
    website_url?: string;
    token?: string;
  };
  success: boolean;
  step: SignupStep;
  email?: string;
  full_name?: string;
  company_name?: string;
  website_url?: string;
  use_case?: UseCase;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "mail.com", "protonmail.com",
  "zoho.com", "yandex.com", "gmx.com", "live.com", "msn.com",
]);

function getStep(formData: FormData): string {
  // Use the LAST "step" value so named submit buttons (resend, back)
  // override the hidden <input name="step"> that precedes them in the DOM.
  const all = formData.getAll("step") as string[];
  return all.at(-1) || "details";
}

export async function signupAction(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const step = getStep(formData);

  // ── "Back to details" — no validation, just re-show the form ────────────
  if (step === "back") {
    return {
      error: null,
      fieldErrors: {},
      success: false,
      step: "details",
      email: (formData.get("email") as string || "").trim().toLowerCase(),
      full_name: (formData.get("full_name") as string || "").trim(),
      company_name: (formData.get("company_name") as string || "").trim(),
      website_url: (formData.get("website_url") as string || "").trim(),
      use_case: (formData.get("use_case") as UseCase) || prevState.use_case || "both",
    };
  }

  // ── Step 1: Validate details ─────────────────────────────────────────────
  if (step === "details") {
    const email = ((formData.get("email") as string) || "").trim().toLowerCase();
    const fullName = ((formData.get("full_name") as string) || "").trim();
    const companyName = ((formData.get("company_name") as string) || "").trim();
    const websiteUrl = ((formData.get("website_url") as string) || "").trim();

    const fieldErrors: SignupState["fieldErrors"] = {};

    if (!email || !isValidEmail(email)) {
      fieldErrors.email = "Please enter a valid email address";
    } else {
      const domain = email.split("@")[1] ?? "";
      if (PERSONAL_DOMAINS.has(domain)) {
        fieldErrors.email = "Please use a work email — personal domains aren't supported";
      }
    }

    if (!fullName || fullName.length < 2) {
      fieldErrors.full_name = "Please enter your full name";
    }

    if (!companyName || companyName.length < 2) {
      fieldErrors.company_name = "Please enter your organization name";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { error: null, fieldErrors, success: false, step: "details", email, full_name: fullName, company_name: companyName, website_url: websiteUrl };
    }

    return {
      error: null, fieldErrors: {}, success: false,
      step: "usecase", email, full_name: fullName, company_name: companyName, website_url: websiteUrl,
    };
  }

  // ── Step 2: Send OTP ─────────────────────────────────────────────────────
  if (step === "usecase") {
    const email = ((formData.get("email") as string) || "").trim().toLowerCase();
    const fullName = ((formData.get("full_name") as string) || "").trim();
    const companyName = ((formData.get("company_name") as string) || "").trim();
    const websiteUrl = ((formData.get("website_url") as string) || "").trim();
    const useCase = (formData.get("use_case") as UseCase) || prevState.use_case || "both";

    if (!email) {
      return { error: "Session expired — please start over.", fieldErrors: {}, success: false, step: "details" };
    }

    const supabase = await createSupabaseServerClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: { full_name: fullName, company_name: companyName, use_case: useCase, website_url: websiteUrl || undefined },
        emailRedirectTo: `${appUrl}/auth/callback`,
      },
    });

    if (error) {
      return { error: error.message, fieldErrors: {}, success: false, step: "usecase", email, full_name: fullName, company_name: companyName, website_url: websiteUrl, use_case: useCase };
    }

    return {
      error: null, fieldErrors: {}, success: true,
      step: "otp", email, full_name: fullName, company_name: companyName, website_url: websiteUrl, use_case: useCase,
    };
  }

  // ── Step 3: Verify OTP ───────────────────────────────────────────────────
  if (step === "otp") {
    const email = ((formData.get("email") as string) || "").trim().toLowerCase();
    const token = ((formData.get("token") as string) || "").trim();

    if (!email) {
      return { error: "Session expired — please start over.", fieldErrors: {}, success: false, step: "details" };
    }

    if (!token || token.length < 6) {
      return { error: null, fieldErrors: { token: "Please enter the code from your email" }, success: false, step: "otp", email };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

    if (error) {
      return { error: null, fieldErrors: { token: "Invalid or expired code — check your email or request a new one" }, success: false, step: "otp", email };
    }

    redirect("/dashboard");
  }

  return { error: "Unknown error — please try again.", fieldErrors: {}, success: false, step: "details" };
}
