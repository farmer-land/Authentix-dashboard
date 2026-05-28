"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import Image from "next/image";

type State = "loading" | "success" | "error";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [_redirectTo, setRedirectTo] = useState<string>("/dashboard");

  useEffect(() => {
    let cancelled = false;

    async function accept() {
      try {
        const result = await api.auth.acceptInvite();
        if (cancelled) return;
        setRedirectTo(result.redirect_to);
        setState("success");
        // Short pause so the user sees the success state before navigating
        setTimeout(() => { if (!cancelled) router.push(result.redirect_to); }, 1200);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to accept invite";
        setError(message);
        setState("error");
      }
    }

    void accept();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-95 text-center space-y-6">
        <div className="inline-flex items-center justify-center">
          <Image
            src="/brand/authentix-24-24.svg"
            width={48}
            height={48}
            alt="Authentix"
            priority
          />
        </div>

        {state === "loading" && (
          <div className="space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Accepting invite…</h1>
            <p className="text-sm text-muted-foreground">
              Setting up your account, just a moment.
            </p>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-3">
            <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
            <h1 className="text-xl font-semibold">You&apos;re in!</h1>
            <p className="text-sm text-muted-foreground">
              Redirecting you to your dashboard…
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">Invite could not be accepted</h1>
            {error && (
              <p className="text-sm text-muted-foreground">{error}</p>
            )}
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => router.push("/login")}>
                Go to login
              </Button>
              <Button onClick={() => { setState("loading"); setError(null); void window.location.reload(); }}>
                Try again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
