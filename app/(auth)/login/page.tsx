"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type LoginState } from "./actions";
import Image from "next/image";

function SubmitButton({ step }: { step: "email" | "otp" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full h-11 rounded-lg bg-primary hover:bg-primary/90 font-medium"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {step === "email" ? "Sending code…" : "Signing in…"}
        </>
      ) : step === "email" ? (
        "Send code"
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

const initialState: LoginState = {
  error: null,
  success: false,
  step: "email",
  email: "",
};

function LoginPageContent() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();

  const urlStep = searchParams.get("otp") === "1" ? "otp" : "email";
  const urlEmail = searchParams.get("email") ?? "";
  // Set by app/(auth)/auth/callback/route.ts — see GARDEN-27.
  const urlError = searchParams.get("error");
  const urlNotice = searchParams.get("notice");

  const step = state.step !== "email" || state.email ? state.step : urlStep;
  const activeEmail = state.email || urlEmail;

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-background">
      {/* 2026 ambient backdrop — soft brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-2xl rounded-full bg-[#3ECF8E]/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background" />
      </div>

      <div className="relative w-full max-w-100">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center mb-5 h-14 w-14 rounded-2xl border bg-card shadow-sm">
            <Image
              src="/brand/authentix-24-24.svg"
              width={32}
              height={32}
              alt="Authentix"
              priority
            />
          </div>
          {step === "email" ? (
            <>
              <h1 className="text-[28px] font-bold tracking-tight leading-tight">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Enter your email to receive a secure sign-in code
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[28px] font-bold tracking-tight leading-tight">Check your email</h1>
              <p className="text-sm text-muted-foreground mt-2">
                We sent an 8-digit code to{" "}
                <span className="font-medium text-foreground">{activeEmail}</span>
              </p>
            </>
          )}
        </div>

        {urlNotice === "link_already_used" && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg bg-muted border border-border px-4 py-3 text-sm text-foreground"
            role="status"
          >
            This link was already used or has expired. If you already
            finished signing up, just sign in below — otherwise request a new
            code.
          </div>
        )}

        {urlError === "auth_failed" && (
          <div
            className="mb-4 bg-destructive/10 border border-destructive/50 text-destructive px-4 py-3 rounded-lg text-sm"
            role="alert"
          >
            We couldn&apos;t sign you in from that link. Please sign in again
            below.
          </div>
        )}

        <Card className="p-7 sm:p-8 shadow-xl shadow-black/5 border-border/60 rounded-2xl backdrop-blur-sm bg-card/80">
          <form action={formAction} className="space-y-5">
            <input type="hidden" name="step" value={step} />
            {step === "otp" && (
              <input type="hidden" name="email" value={activeEmail} />
            )}

            {step === "email" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Work email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                  autoFocus
                  className="h-11 rounded-lg"
                  defaultValue={urlEmail}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="token" className="text-sm font-medium">
                  Sign-in code
                </Label>
                <Input
                  id="token"
                  name="token"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  placeholder="00000000"
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  className="h-12 rounded-lg text-center tracking-[0.4em] text-lg font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the 8-digit code from your email
                </p>
              </div>
            )}

            {/* Code-sent confirmation (shown after resend) */}
            {step === "otp" && state.codeSent && !state.error && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Code sent — check your inbox
                </p>
              </div>
            )}

            {state.error && (
              <div
                className="bg-destructive/10 border border-destructive/50 text-destructive px-4 py-3 rounded-lg text-sm"
                role="alert"
              >
                {state.error}
              </div>
            )}

            <SubmitButton step={step} />

            {step === "otp" && (
              <div className="space-y-3">
                <p className="text-center text-xs text-muted-foreground">
                  Didn&apos;t receive it? Check your spam folder or{" "}
                  <button
                    type="submit"
                    name="step"
                    value="email"
                    className="text-primary hover:text-primary/80 font-medium underline underline-offset-2 cursor-pointer"
                  >
                    send a new code
                  </button>
                </p>
                <button
                  type="button"
                  onClick={() => window.location.assign("/login")}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mx-auto"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Use a different email
                </button>
              </div>
            )}
          </form>
        </Card>

        {step === "email" && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-primary hover:text-primary/80">
              Sign up
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="w-full max-w-95">
            <div className="text-center space-y-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
