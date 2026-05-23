"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signupAction, type SignupState } from "./actions";

function SubmitButton() {
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
          Creating account...
        </>
      ) : (
        "Create account"
      )}
    </Button>
  );
}

function FormField({
  id,
  label,
  type = "text",
  placeholder,
  defaultValue,
  error,
  required = false,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        className={`h-10 ${error ? "border-destructive" : ""}`}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const initialState: SignupState = {
  error: null,
  fieldErrors: {},
  success: false,
};

function SignupPageContent() {
  const [state, formAction] = useActionState(signupAction, initialState);
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") ?? "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-95">
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
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {prefillEmail
              ? "No account found — sign up to get started"
              : "Get started with certificate management"}
          </p>
        </div>

        <Card className="p-8 shadow-sm">
          <form action={formAction} className="space-y-4">
            <FormField
              id="full_name"
              label="Full name"
              placeholder="Jane Doe"
              required
              error={state.fieldErrors.full_name}
            />

            <FormField
              id="company_name"
              label="Company name"
              placeholder="Acme Corporation"
              required
              error={state.fieldErrors.company_name}
            />

            <FormField
              id="email"
              label="Work email"
              type="email"
              placeholder="name@company.com"
              defaultValue={prefillEmail}
              required
              error={state.fieldErrors.email}
              hint="Personal email domains (gmail, yahoo, etc.) are not allowed"
            />

            {state.error && (
              <div
                className="bg-destructive/10 border border-destructive/50 text-destructive px-4 py-3 rounded-lg text-sm"
                role="alert"
              >
                {state.error}
              </div>
            )}

            <SubmitButton />

            <p className="text-xs text-center text-muted-foreground pt-2">
              By signing up, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:text-primary/80">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-primary hover:text-primary/80">
                Privacy Policy
              </Link>
            </p>
          </form>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:text-primary/80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupPageContent />
    </Suspense>
  );
}
