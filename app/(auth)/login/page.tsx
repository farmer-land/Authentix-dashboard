"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type LoginState } from "./actions";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
  const router = useRouter();

  // URL params let signup redirect directly to OTP step
  const urlStep = searchParams.get("otp") === "1" ? "otp" : "email";
  const urlEmail = searchParams.get("email") ?? "";

  // Action state takes precedence over URL params once the action has fired
  const step = state.step !== "email" || state.email ? state.step : urlStep;
  const activeEmail = state.email || urlEmail;

  // Store bridge_secret in sessionStorage exactly once when the action returns it.
  // The secret must not persist in React state beyond this effect.
  const bridgeSecretRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBridgeIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.bridge_secret) {
      sessionStorage.setItem("bridge_secret", state.bridge_secret);
      bridgeSecretRef.current = state.bridge_secret;
    }
  }, [state.bridge_secret]);

  // Cross-device polling: watch for magic link click on Device B
  useEffect(() => {
    const bridgeId = state.bridge_id;
    if (!bridgeId || step !== "otp") {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Don't restart polling if bridge_id hasn't changed
    if (bridgeId === prevBridgeIdRef.current) return;
    prevBridgeIdRef.current = bridgeId;

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    async function checkBridgeStatus() {
      const secret = sessionStorage.getItem("bridge_secret") || bridgeSecretRef.current;
      if (!secret || !bridgeId) return;

      try {
        const res = await fetch(
          `/api/proxy/auth/magic/status?bridge_id=${encodeURIComponent(bridgeId)}&secret=${encodeURIComponent(secret)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          success: boolean;
          data?: { status: string; email?: string; otp?: string };
        };
        const data = json.data;

        if (data?.status === "completed" && data.otp && data.email) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          sessionStorage.removeItem("bridge_secret");

          // Sign Device A in using the one-time OTP generated for it
          const supabase = createSupabaseBrowserClient();
          const { error } = await supabase.auth.verifyOtp({
            email: data.email,
            token: data.otp,
            type: "magiclink",
          });

          if (!error) {
            router.push("/dashboard");
          }
        }
      } catch {
        // Silently ignore poll errors — will retry on next interval
      }
    }

    pollIntervalRef.current = setInterval(checkBridgeStatus, 2000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [state.bridge_id, step, router]);

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

        {/* Cross-device waiting indicator — shown in OTP step when bridge is active */}
        {step === "otp" && state.bridge_id && (
          <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 flex items-start gap-3">
            <Smartphone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Sign in from another device</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click the magic link in your email on any device and this page will
                automatically sign you in.
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Waiting for link click…</span>
              </div>
            </div>
          </div>
        )}

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
