"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Login form state type
 */
export interface LoginState {
  error: string | null;
  success: boolean;
}

/**
 * Server Action for user login
 * Uses Supabase auth — session is managed via @supabase/ssr cookies
 */
export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  // Validate input
  if (!email || !password) {
    return {
      error: "Email and password are required",
      success: false,
    };
  }

  if (typeof email !== "string" || typeof password !== "string") {
    return {
      error: "Invalid input",
      success: false,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message, success: false };
  }

  redirect("/dashboard");
}
