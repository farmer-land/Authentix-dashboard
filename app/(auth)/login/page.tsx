"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
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
      className="w-full h-10 bg-primary hover:bg-primary/90"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {step === "email" ? "Sending code..." : "Signing in..."}
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

  // URL params let signup redirect directly to OTP step
  const urlStep = searchParams.get("otp") === "1" ? "otp" : "email";
  const urlEmail = searchParams.get("email") ?? "";

  // Action state takes precedence over URL params once the action has fired
  const step = state.step !== "email" || state.email ? state.step : urlStep;
  const activeEmail = state.email || urlEmail;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-95">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/brand/authentix-24-24.svg"
              width={48}
              height={48}
              alt="Authentix"
              priority
            />
          </div>
          {step === "email" ? (
            <>
              <h1 className="text-2xl font-bold">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Enter your email to receive a sign-in code
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Check your email</h1>
              <p className="text-sm text-muted-foreground mt-2">
                We sent an 8-digit code to{" "}
                <span className="font-medium text-foreground">{activeEmail}</span>
              </p>
            </>
          )}
        </div>

        <Card className="p-8 shadow-sm">
          <form action={formAction} className="space-y-5">
            {/* Hidden step + email fields carry state between steps */}
            <input type="hidden" name="step" value={step} />
            {step === "otp" && (
              <input type="hidden" name="email" value={activeEmail} />
            )}

            {step === "email" ? (
              <div className="space-y-2">
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
                  className="h-10"
                  defaultValue={urlEmail}
                />
              </div>
            ) : (
              <div className="space-y-2">
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
                  className="h-10 text-center tracking-[0.4em] text-lg font-mono"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Enter the 8-digit code from your email
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
          <div className="space-y-3 mt-6">
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-medium text-primary hover:text-primary/80"
              >
                Sign up
              </Link>
            </p>
            <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>No password needed — we email you a sign-in code</span>
            </div>
          </div>
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
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
