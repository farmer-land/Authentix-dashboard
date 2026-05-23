"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ForgotPasswordState {
  error: string | null;
  success: boolean;
}

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = formData.get("email");

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return { error: "Please enter a valid email address", success: false };
  }

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reset-password`,
    });
    // Always succeed to prevent email enumeration
    return { error: null, success: true };
  } catch {
    // Always succeed to prevent email enumeration
    return { error: null, success: true };
  }
}
