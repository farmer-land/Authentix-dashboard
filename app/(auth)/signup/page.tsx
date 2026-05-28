"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, Award, Mail, Zap, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signupAction, type SignupState, type UseCase } from "./actions";

// ── Submit button ──────────────────────────────────────────────────────────────

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
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
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

// ── Field: label above input, no floating labels ───────────────────────────────

function Field({
  id, label, type = "text", placeholder, defaultValue, error, autoFocus,
}: {
  id: string; label: string; type?: string; placeholder?: string;
  defaultValue?: string; error?: string; autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required
        autoFocus={autoFocus}
        className={`h-10 ${error ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && (
        <p id={`${id}-err`} className="text-xs text-destructive leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Website field with live favicon preview ────────────────────────────────────

function WebsiteFieldWithPreview({
  defaultValue,
  error,
}: {
  defaultValue?: string;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const url = new URL(value.startsWith("http") ? value : `https://${value}`);
        setFaviconUrl(`https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`);
      } catch {
        setFaviconUrl(null);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="website_url" className="text-sm font-medium leading-none">
        Website <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      <div className="flex items-center gap-2">
        {faviconUrl && (
          <img
            src={faviconUrl}
            alt=""
            className="w-6 h-6 rounded shrink-0 object-contain"
            onError={() => setFaviconUrl(null)}
          />
        )}
        <Input
          id="website_url"
          name="website_url"
          type="text"
          placeholder="https://yourcompany.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`h-10 flex-1 ${error ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "website_url-err" : undefined}
        />
      </div>
      {error && (
        <p id="website_url-err" className="text-xs text-destructive leading-snug">{error}</p>
      )}
    </div>
  );
}

// ── Use-case selection card ────────────────────────────────────────────────────

function UseCaseCard({
  value, icon: Icon, title, description, selected, onSelect,
}: {
  value: UseCase;
  icon: React.ElementType;
  title: string;
  description: string;
  selected: boolean;
  onSelect: (v: UseCase) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`w-full text-left rounded-xl border p-4 transition-all cursor-pointer ${
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg p-2 ${selected ? "bg-primary/10" : "bg-muted"}`}>
          <Icon className={`w-4 h-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
        </div>
        {selected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
      </div>
    </button>
  );
}

// ── Main content ───────────────────────────────────────────────────────────────

const initialState: SignupState = {
  error: null,
  fieldErrors: {},
  success: false,
  step: "details",
};

function SignupPageContent() {
  const [state, formAction] = useActionState(signupAction, initialState);
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") ?? "";

  const [selectedUseCase, setSelectedUseCase] = useState<UseCase>(
    state.use_case ?? "both",
  );

  const step = state.step ?? "details";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo + heading */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/brand/authentix-24-24.svg"
              width={44}
              height={44}
              alt="Authentix"
              priority
            />
          </div>

          {step === "details" && (
            <>
              <h1 className="text-2xl font-bold">Create your account</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                {prefillEmail
                  ? "No account found — sign up to get started"
                  : "Get started in minutes, no credit card needed"}
              </p>
            </>
          )}

          {step === "usecase" && (
            <>
              <h1 className="text-2xl font-bold">How will you use Authentix?</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                We&apos;ll tailor your experience to match
              </p>
            </>
          )}

          {step === "otp" && (
            <>
              <h1 className="text-2xl font-bold">Check your email</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                We sent a code to{" "}
                <span className="font-medium text-foreground">{state.email}</span>
              </p>
            </>
          )}
        </div>

        <Card className="p-6 shadow-sm">
          <form action={formAction} className="space-y-4">
            {/* Hidden state carried between steps */}
            <input type="hidden" name="step" value={step} />
            {step !== "details" && (
              <>
                <input type="hidden" name="email" value={state.email ?? ""} />
                <input type="hidden" name="full_name" value={state.full_name ?? ""} />
                <input type="hidden" name="company_name" value={state.company_name ?? ""} />
                <input type="hidden" name="website_url" value={state.website_url ?? ""} />
              </>
            )}

            {/* ── Step 1: Details ─────────────────────────────────────────── */}
            {step === "details" && (
              <div className="space-y-4">
                <Field
                  id="full_name"
                  label="Your full name"
                  placeholder="Jane Doe"
                  defaultValue={state.full_name ?? ""}
                  error={state.fieldErrors.full_name}
                  autoFocus
                />
                <Field
                  id="company_name"
                  label="Organization"
                  placeholder="Acme Corporation"
                  defaultValue={state.company_name ?? ""}
                  error={state.fieldErrors.company_name}
                />
                <WebsiteFieldWithPreview
                  defaultValue={state.website_url ?? ""}
                  error={state.fieldErrors.website_url}
                />
                <Field
                  id="email"
                  label="Work email"
                  type="email"
                  placeholder="name@company.com"
                  defaultValue={prefillEmail || (state.email ?? "")}
                  error={state.fieldErrors.email}
                />
                {state.error && (
                  <p className="text-xs text-destructive">{state.error}</p>
                )}
                <SubmitButton label="Continue" pendingLabel="Checking…" />
              </div>
            )}

            {/* ── Step 2: Use-case ──────────────────────────────────────────── */}
            {step === "usecase" && (
              <div className="space-y-3">
                <input type="hidden" name="use_case" value={selectedUseCase} />

                <UseCaseCard
                  value="certificates"
                  icon={Award}
                  title="Issue certificates"
                  description="Generate and send verifiable certificates to recipients"
                  selected={selectedUseCase === "certificates"}
                  onSelect={setSelectedUseCase}
                />
                <UseCaseCard
                  value="campaigns"
                  icon={Mail}
                  title="Email campaigns"
                  description="Send branded emails to your contacts at scale"
                  selected={selectedUseCase === "campaigns"}
                  onSelect={setSelectedUseCase}
                />
                <UseCaseCard
                  value="both"
                  icon={Zap}
                  title="Both"
                  description="Certificates and email campaigns together"
                  selected={selectedUseCase === "both"}
                  onSelect={setSelectedUseCase}
                />

                {state.error && (
                  <p className="text-xs text-destructive">{state.error}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    type="submit"
                    name="step"
                    value="back"
                    variant="outline"
                    className="h-10 px-3 shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex-1">
                    <SubmitButton label="Get started" pendingLabel="Sending code…" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: OTP ───────────────────────────────────────────────── */}
            {step === "otp" && (
              <div className="space-y-4">
                <input type="hidden" name="use_case" value={state.use_case ?? "both"} />
                <div className="space-y-1.5">
                  <Label htmlFor="token" className="text-sm font-medium leading-none">
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
                    autoFocus
                    autoComplete="one-time-code"
                    className={`h-10 text-center tracking-[0.4em] text-lg font-mono ${
                      state.fieldErrors.token ? "border-destructive" : ""
                    }`}
                  />
                  {state.fieldErrors.token ? (
                    <p className="text-xs text-destructive leading-snug">
                      {state.fieldErrors.token}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enter the 8-digit code from your email
                    </p>
                  )}
                </div>

                {state.error && (
                  <p className="text-xs text-destructive">{state.error}</p>
                )}

                <SubmitButton label="Create account" pendingLabel="Verifying…" />

                <div className="space-y-2">
                  <p className="text-center text-xs text-muted-foreground">
                    Didn&apos;t receive it?{" "}
                    <button
                      type="submit"
                      name="step"
                      value="usecase"
                      className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
                    >
                      Resend code
                    </button>
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.assign("/signup")}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mx-auto"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Use a different email
                  </button>
                </div>
              </div>
            )}
          </form>
        </Card>

        {/* Step progress dots */}
        <div className="flex justify-center gap-1.5 mt-4">
          {(["details", "usecase", "otp"] as const).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/25"
              }`}
            />
          ))}
        </div>

        {/* Footer links */}
        {step === "details" && (
          <p className="text-center text-sm text-muted-foreground mt-5">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:text-primary/80">
              Sign in
            </Link>
          </p>
        )}
        {step === "usecase" && (
          <p className="text-center text-xs text-muted-foreground mt-4 px-2">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="text-primary underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary underline underline-offset-2">
              Privacy Policy
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      }
    >
      <SignupPageContent />
    </Suspense>
  );
}
