"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function VerifyEmailPage() {
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState("");

  const handleResend = async () => {
    setResending(true);
    setResendSuccess(false);
    setResendError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email;
      if (!email) {
        setResendError("Could not determine your email address. Please sign in again.");
        return;
      }
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setResendSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to resend verification email";
      setResendError(message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/brand/authentix-24-24.svg"
              width={48}
              height={48}
              alt="Authentix"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold">Verify your email</h1>
          <p className="text-sm text-muted-foreground mt-2">
            We sent a verification link to your email address
          </p>
        </div>

        {/* Card */}
        <Card className="p-8 shadow-sm">
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                Click the verification link in the email we sent to complete your account setup.
                If you don&apos;t see it, check your spam folder.
              </p>
            </div>

            {resendSuccess && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Verification email sent! Please check your inbox.
                </AlertDescription>
              </Alert>
            )}

            {resendError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{resendError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <Button
                onClick={handleResend}
                disabled={resending || resendSuccess}
                className="w-full"
                variant={resendSuccess ? "outline" : "default"}
              >
                {resending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : resendSuccess ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Email sent
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Resend verification email
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Already verified?{" "}
                <Link
                  href="/login"
                  className="font-medium text-primary hover:text-primary/80"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
