"use client";

/**
 * MAGIC LINK CALLBACK — Device B handler
 *
 * This page handles magic link clicks for cross-device sign-in.
 * The magic link redirect_to is set to this URL with ?bridge_id=X embedded.
 *
 * Same-device flow:
 *   PKCE code exchange succeeds (code_verifier cookie present) → Device B signed in
 *   → calls backend to complete bridge so Device A polling succeeds too
 *   → redirects Device B to /dashboard
 *
 * Cross-device flow:
 *   PKCE code exchange fails (no code_verifier cookie) → Device B not yet signed in
 *   → calls backend to complete bridge (bridge_id proves email link was clicked)
 *   → shows "You've confirmed your identity. Return to your original device."
 *   → Device A polling detects completion and signs in automatically
 */

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Loader2, CheckCircle2, MonitorSmartphone } from "lucide-react";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type PageStatus =
  | "loading"
  | "same_device_ok"     // PKCE exchange worked — user is signed in on Device B
  | "cross_device_ok"    // Bridge completed — Device A will be signed in
  | "error";

async function completebridge(bridgeId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/proxy/auth/magic/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bridge_id: bridgeId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success: boolean; data?: { success: boolean } };
    return json.success;
  } catch {
    return false;
  }
}

function MagicCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const bridgeId = searchParams.get("bridge_id");
    const code = searchParams.get("code");

    async function handleCallback() {
      const supabase = createSupabaseBrowserClient();

      // Try PKCE exchange — works when magic link was clicked in the same browser
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && data.session) {
          // Same-device: user is signed in on this device.
          // Also complete the bridge so Device A (if polling) gets its OTP.
          if (bridgeId) {
            await completebridge(bridgeId);
          }
          setStatus("same_device_ok");
          setTimeout(() => router.push("/dashboard"), 800);
          return;
        }
      }

      // Cross-device: PKCE exchange failed or no code.
      // The bridge_id is enough proof that the magic link was clicked
      // (it was embedded in the link URL which only exists in the email).
      if (bridgeId) {
        const ok = await completebridge(bridgeId);
        if (ok) {
          setStatus("cross_device_ok");
        } else {
          setErrorMsg("This link may have already been used or has expired.");
          setStatus("error");
        }
        return;
      }

      // No bridge_id and no code — generic fallback to login
      setErrorMsg("Invalid magic link. Please request a new sign-in code.");
      setStatus("error");
    }

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="inline-flex items-center justify-center mb-2">
          <Image
            src="/brand/authentix-24-24.svg"
            width={40}
            height={40}
            alt="Authentix"
            priority
          />
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Verifying your link…</p>
          </>
        )}

        {status === "same_device_ok" && (
          <>
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h1 className="text-lg font-semibold">Signed in!</h1>
            <p className="text-sm text-muted-foreground">Redirecting you to the dashboard…</p>
          </>
        )}

        {status === "cross_device_ok" && (
          <>
            <MonitorSmartphone className="w-8 h-8 text-primary mx-auto" />
            <h1 className="text-lg font-semibold">Identity confirmed</h1>
            <p className="text-sm text-muted-foreground">
              Return to your original device — it will sign you in automatically.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              You can close this tab.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-left">
              <p className="font-semibold text-sm text-destructive">Link verification failed</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <a
              href="/login"
              className="inline-block text-sm text-primary hover:text-primary/80 font-medium mt-2"
            >
              Back to sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function MagicCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      }
    >
      <MagicCallbackContent />
    </Suspense>
  );
}
