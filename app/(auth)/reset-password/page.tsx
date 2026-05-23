"use client";

import { useActionState, Suspense, useState, useCallback } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" className="w-full h-10 bg-primary hover:bg-primary/90" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Updating...
        </>
      ) : (
        "Set new password"
      )}
    </Button>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);

      const formData = new FormData(e.currentTarget);
      const password = formData.get("password");
      const confirm = formData.get("confirm");

      if (!password || typeof password !== "string" || password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match");
        return;
      }

      setPending(true);
      try {
        const supabase = createSupabaseBrowserClient();

        // Exchange PKCE code for session first
        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
        if (sessionError) {
          setError(sessionError.message || "Invalid reset link. Please request a new one.");
          return;
        }

        // Update password
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
          setError(updateError.message || "Failed to update password. Please try again.");
          return;
        }

        router.push("/login?reset=1");
      } catch {
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setPending(false);
      }
    },
    [code, router]
  );

  if (!code) {
    return (
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <p className="font-medium">Invalid reset link</p>
          <p className="text-sm text-muted-foreground mt-1">
            This link is missing a reset code. Please request a new one.
          </p>
        </div>
        <Link href="/forgot-password">
          <Button variant="outline" className="w-full mt-2">Request new link</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium">New password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="At least 8 characters"
            required
            minLength={8}
            className="h-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm" className="text-sm font-medium">Confirm password</Label>
        <div className="relative">
          <Input
            id="confirm"
            name="confirm"
            type={showConfirm ? "text" : "password"}
            placeholder="Repeat your new password"
            required
            className="h-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="bg-destructive/10 border border-destructive/50 text-destructive px-4 py-3 rounded-lg text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      <SubmitButton pending={pending} />
    </form>
  );
}

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <Image src="/brand/authentix-24-24.svg" width={48} height={48} alt="Authentix" priority />
          </div>
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-sm text-muted-foreground mt-2">Choose a strong password for your account.</p>
        </div>

        <Card className="p-8 shadow-sm">
          <Suspense fallback={<div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}>
            <ResetPasswordContent />
          </Suspense>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          <Link href="/login" className="font-medium text-primary hover:text-primary/80">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
