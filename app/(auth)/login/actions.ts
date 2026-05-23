"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
  success: boolean;
  step: "email" | "otp";
  email: string;
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
    // Send OTP — always return success to prevent email enumeration
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    return { error: null, success: true, step: "otp", email };
  }

  // OTP verification step
  const token = ((formData.get("token") as string) || "").trim();
  if (!token || token.length < 6) {
    return { error: "Please enter the 6-digit code from your email", success: false, step: "otp", email };
  }

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    return { error: "Invalid or expired code — check your email or request a new one", success: false, step: "otp", email };
  }

  redirect("/dashboard");
}
