"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dashboard resolver — calls /api/auth/me and redirects to the user's org.
 * Bootstrap and org setup are backend responsibilities; if org is missing,
 * we surface an error instead of attempting to create it here.
 */
export default function DashboardResolver() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    async function resolveOrg() {
      try {
        const res = await fetch("/api/auth/resolve-dashboard", {
          method: "POST",
          credentials: "include",
        });

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        if (!res.ok) {
          router.replace("/login");
          return;
        }

        const { data } = await res.json() as {
          data?: {
            redirect_to: string | null;
            setup_state: "ready" | "needs_bootstrap";
            organization: { id: string; name: string; slug: string } | null;
          };
        };

        if (!data) {
          router.replace("/login");
          return;
        }

        if (data.setup_state === "needs_bootstrap") {
          setError("We couldn't finish setting up your account. Try again or sign in with a different email.");
          return;
        }

        // Honour any saved redirect path (e.g. from a protected-route cookie)
        const redirectPath = document.cookie
          .split("; ")
          .find((row) => row.startsWith("redirect_path="))
          ?.split("=")[1];
        document.cookie = "redirect_path=; path=/; max-age=0";

        const baseTarget = data.redirect_to ?? `/dashboard/org/${data.organization?.slug ?? data.organization?.id}`;
        const suffix = redirectPath ? redirectPath.replace(/^\/dashboard\/org\/[^/]+/, "") : "";
        router.replace(`${baseTarget}${suffix}`);
      } catch {
        router.replace("/login");
      }
    }
    resolveOrg();
  }, [router, retryCount]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Account setup incomplete</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <div className="flex flex-col gap-2 pt-4">
            <button
              onClick={() => { setError(null); setRetryCount((c) => c + 1); }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
                window.location.assign("/login");
              }}
              className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="fixed top-0 left-0 z-40 h-screen w-14 bg-card border-r">
          <div className="flex flex-col h-full">
            <div className="h-16 flex items-center justify-center border-b">
              <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
            </div>
            <nav className="flex-1 p-2 space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 w-full rounded-lg bg-muted animate-pulse" />
              ))}
            </nav>
            <div className="p-2 border-t space-y-1">
              <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
              <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
            </div>
          </div>
        </aside>
        <div className="pl-14 flex-1">
          <header className="h-16 bg-card border-b sticky top-0 z-30">
            <div className="h-full px-6 flex items-center justify-between">
              <div className="h-6 w-48 bg-muted animate-pulse rounded" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
              </div>
            </div>
          </header>
          <main className="p-6">
            <div className="max-w-[1400px] mx-auto space-y-8">
              <div className="space-y-2">
                <div className="h-8 w-64 bg-muted animate-pulse rounded" />
                <div className="h-4 w-96 bg-muted animate-pulse rounded" />
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="h-11 w-11 rounded-xl bg-muted animate-pulse" />
                      <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
                    </div>
                    <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                    <div className="h-9 w-20 bg-muted animate-pulse rounded" />
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
