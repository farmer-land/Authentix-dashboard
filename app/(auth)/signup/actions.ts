"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Signup form state type
 */
export interface SignupState {
  error: string | null;
  fieldErrors: {
    email?: string;
    password?: string;
    full_name?: string;
    company_name?: string;
  };
  success: boolean;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate password strength
 */
function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

/**
 * Server Action for user signup
 * Uses Supabase auth — passes metadata so the backend trigger can set up the org
 */
export async function signupAction(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const fullName = formData.get("full_name");
  const companyName = formData.get("company_name");

  const fieldErrors: SignupState["fieldErrors"] = {};

  // Validate email
  if (!email || typeof email !== "string") {
    fieldErrors.email = "Email is required";
  } else if (!isValidEmail(email)) {
    fieldErrors.email = "Please enter a valid email address";
  }

  // Validate password
  if (!password || typeof password !== "string") {
    fieldErrors.password = "Password is required";
  } else {
    const passwordError = validatePassword(password);
    if (passwordError) {
      fieldErrors.password = passwordError;
    }
  }

  // Validate full name
  if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
    fieldErrors.full_name = "Please enter your full name";
  }

  // Validate company name
  if (!companyName || typeof companyName !== "string" || companyName.trim().length < 2) {
    fieldErrors.company_name = "Please enter your company name";
  }

  // Return validation errors if any
  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Please fix the errors below",
      fieldErrors,
      success: false,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: (email as string).trim(),
    password: password as string,
    options: {
      data: {
        full_name: (fullName as string).trim(),
        company_name: (companyName as string).trim(),
      },
    },
  });

  if (error) {
    return {
      error: error.message,
      fieldErrors: {},
      success: false,
    };
  }

  // Redirect to verify-email page — Supabase sends the confirmation email
  const emailParam = encodeURIComponent((email as string).trim());
  redirect(`/signup/success?email=${emailParam}`);
}
