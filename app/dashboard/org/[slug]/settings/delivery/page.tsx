"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

import {
  Mail, CheckCircle2, AlertCircle, Loader2, Plus, Trash2,
  Info, ArrowRight, Edit2, LayoutTemplate, Server, ExternalLink,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { api, type DeliveryIntegration, type DeliveryProviderType } from "@/lib/api/client";
import Link from "next/link";
import { useOrg } from "@/lib/org";
import { useDeliverySettingsState } from "./state/useDeliverySettingsState";

// ── Provider metadata ──────────────────────────────────────────────────────

const PROVIDERS: Array<{
  id: DeliveryProviderType;
  label: string;
  subtitle: string;
  logo: React.ReactNode;
}> = [
  {
    id: "resend",
    label: "Resend",
    subtitle: "Simple API, great deliverability",
    logo: <img src="/provider-logos/resend.svg" alt="Resend" width={22} height={22} className="shrink-0" />,
  },
  {
    id: "google_workspace",
    label: "Google Workspace",
    subtitle: "Gmail SMTP + App Password",
    logo: <img src="/provider-logos/gmail.svg" alt="Gmail" width={22} height={22} className="shrink-0" />,
  },
  {
    id: "microsoft_365",
    label: "Microsoft 365",
    subtitle: "Outlook SMTP + App Password",
    logo: <img src="/provider-logos/outlook.svg" alt="Outlook" width={22} height={22} className="shrink-0" />,
  },
  {
    id: "aws_ses",
    label: "AWS SES",
    subtitle: "High volume, low cost",
    logo: <img src="/provider-logos/aws-ses.svg" alt="AWS SES" width={22} height={22} className="shrink-0" />,
  },
  {
    id: "smtp",
    label: "Custom SMTP",
    subtitle: "Any SMTP-compatible server",
    logo: <Server className="w-5 h-5 text-blue-500 shrink-0" />,
  },
];

function providerMeta(provider: string) {
  return PROVIDERS.find(p => p.id === provider) ?? {
    id: provider,
    label: provider.toUpperCase(),
    subtitle: "",
    logo: <Server className="w-4 h-4 text-muted-foreground" />,
  };
}

// ── Setup guides ───────────────────────────────────────────────────────────

function SetupGuide({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[#3ECF8E]/30 bg-[#3ECF8E]/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <Info className="w-3.5 h-3.5 text-[#3ECF8E] shrink-0" />
        <span className="text-xs text-[#2aac76] font-medium flex-1">{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-[#3ECF8E]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#3ECF8E]" />}
      </button>
      {open && <div className="px-3 pb-3 border-t border-[#3ECF8E]/20">{children}</div>}
    </div>
  );
}

function ResendSetupSteps() {
  return (
    <SetupGuide title="How to set up Resend">
      <ol className="space-y-1.5 text-xs text-foreground/70 mt-2.5">
        {[
          <>Sign up at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-[#2aac76] underline"><strong>resend.com</strong></a> and go to <strong>API Keys</strong>.</>,
          <>Click <strong>Create API Key</strong> and copy it — you'll need it below.</>,
          <>In <strong>Domains</strong>, add and verify the domain you want to send from.</>,
          <>Use a <strong>From Email</strong> on that verified domain (e.g. <code className="bg-muted px-1 rounded">certificates@yourdomain.com</code>).</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-bold shrink-0 text-[#3ECF8E] w-4">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <a href="https://resend.com/docs/introduction" target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-[#2aac76] font-semibold hover:text-[#1a9f6a] underline underline-offset-2 mt-2.5">
        Resend Documentation <ExternalLink className="w-3 h-3" />
      </a>
    </SetupGuide>
  );
}

function GoogleWorkspaceSetupSteps() {
  return (
    <SetupGuide title="How to set up Google Workspace SMTP">
      <ol className="space-y-1.5 text-xs text-foreground/70 mt-2.5">
        {[
          <>Your Google account must have <strong>2-Step Verification enabled</strong>. Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="text-[#2aac76] underline"><strong>Google Account Security</strong></a> to enable it.</>,
          <>Once 2FA is on, visit <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-[#2aac76] underline"><strong>App Passwords</strong></a> in your Google account.</>,
          <>Choose <strong>Mail</strong> as the app and <strong>Other</strong> as the device — give it a name like "Authentix".</>,
          <>Google will show a <strong>16-character App Password</strong> — copy it. This is your SMTP password.</>,
          <>Use your Gmail address as the username and the App Password below.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-bold shrink-0 text-[#3ECF8E] w-4">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </SetupGuide>
  );
}

function Microsoft365SetupSteps() {
  return (
    <SetupGuide title="How to set up Microsoft 365 SMTP">
      <ol className="space-y-1.5 text-xs text-foreground/70 mt-2.5">
        {[
          <>For <strong>personal Outlook.com</strong>: go to <a href="https://account.live.com/proofs/manage" target="_blank" rel="noopener noreferrer" className="text-[#2aac76] underline"><strong>Microsoft Account Security</strong></a>, enable 2FA, then create an App Password under <strong>Advanced security options</strong>.</>,
          <>For <strong>Microsoft 365 / work accounts</strong>: your admin must allow SMTP AUTH in <strong>Microsoft 365 Admin Center → Settings → Mail flow</strong>.</>,
          <>Username = your full Outlook/M365 email. Password = App Password (or account password if SMTP AUTH is permitted).</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-bold shrink-0 text-[#3ECF8E] w-4">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <a href="https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040"
        target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-[#2aac76] font-semibold hover:text-[#1a9f6a] underline underline-offset-2 mt-2.5">
        Microsoft SMTP Documentation <ExternalLink className="w-3 h-3" />
      </a>
    </SetupGuide>
  );
}

function AwsSesSetupSteps() {
  return (
    <SetupGuide title="How to set up AWS SES">
      <ol className="space-y-1.5 text-xs text-foreground/70 mt-2.5">
        {[
          <>Sign in to <strong>AWS Management Console</strong> → <strong>IAM</strong> → create a user with <strong>AmazonSESFullAccess</strong> (or a scoped sending-only policy).</>,
          <>Under <strong>Security credentials</strong>, create an <strong>Access Key</strong> — copy both the Access Key ID and Secret Access Key.</>,
          <>In <strong>Amazon SES → Verified Identities</strong>, add and verify your sending domain or email address.</>,
          <>If your account is in <strong>SES Sandbox</strong>, request production access to send to unverified addresses.</>,
          <>Paste the Access Key ID and Secret Access Key below.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-bold shrink-0 text-[#3ECF8E] w-4">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <a href="https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html" target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-[#2aac76] font-semibold hover:text-[#1a9f6a] underline underline-offset-2 mt-2.5">
        AWS SES Documentation <ExternalLink className="w-3 h-3" />
      </a>
    </SetupGuide>
  );
}

// ── Integration form ───────────────────────────────────────────────────────

interface IntegrationFormData {
  provider: DeliveryProviderType;
  from_email: string;
  from_name: string;
  reply_to: string;
  display_name: string;
  is_default: boolean;
  // Resend
  resend_api_key?: string;
  // SMTP / Google Workspace / Microsoft 365
  smtp_host?: string;
  smtp_port?: number;
  smtp_secure?: boolean;
  smtp_user?: string;
  smtp_password?: string;
  // AWS SES
  aws_access_key_id?: string;
  aws_region?: string;
  aws_secret_access_key?: string;
}

interface IntegrationFormProps {
  initial?: Partial<DeliveryIntegration>;
  onSave: (data: IntegrationFormData) => Promise<void>;
  onCancel?: () => void;
  saving: boolean;
}

const SMTP_HOSTS: Record<string, { host: string; port: number; secure: boolean }> = {
  google_workspace: { host: "smtp.gmail.com",        port: 587, secure: false },
  microsoft_365:   { host: "smtp.office365.com",     port: 587, secure: false },
  smtp:            { host: "",                         port: 587, secure: false },
};

function IntegrationForm({ initial, onSave, onCancel, saving }: IntegrationFormProps) {
  const initialProvider = (initial?.provider as DeliveryProviderType) ?? "resend";
  const [provider, setProvider] = useState<DeliveryProviderType>(initialProvider);
  const [fromEmail, setFromEmail] = useState(initial?.from_email ?? "");
  const [fromName, setFromName] = useState(initial?.from_name ?? "");
  const [replyTo, setReplyTo] = useState(initial?.reply_to ?? "");
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "My Email");
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? true);

  // Resend
  const [resendApiKey, setResendApiKey] = useState("");

  // SMTP / Google Workspace / Microsoft 365
  const [smtpHost, setSmtpHost] = useState((initial as any)?.config?.smtp_host ?? "");
  const [smtpPort, setSmtpPort] = useState<number>((initial as any)?.config?.smtp_port ?? 587);
  const [smtpSecure, setSmtpSecure] = useState<boolean>((initial as any)?.config?.smtp_secure ?? false);
  const [smtpUser, setSmtpUser] = useState((initial as any)?.config?.smtp_user ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");

  // AWS SES
  const [awsAccessKeyId, setAwsAccessKeyId] = useState((initial as any)?.config?.aws_access_key_id ?? "");
  const [awsRegion, setAwsRegion] = useState((initial as any)?.config?.aws_region ?? "us-east-1");
  const [awsSecretKey, setAwsSecretKey] = useState("");

  // When switching provider, pre-fill SMTP coords for presets
  const handleProviderChange = (p: DeliveryProviderType) => {
    setProvider(p);
    if (p === "google_workspace" || p === "microsoft_365" || p === "smtp") {
      const preset = SMTP_HOSTS[p];
      if (!preset) return;
      if (preset.host) setSmtpHost(preset.host);
      setSmtpPort(preset.port);
      setSmtpSecure(preset.secure);
    }
  };

  const isValid = () => {
    if (!fromEmail) return false;
    if (provider === "resend") return !!resendApiKey || !!initial?.id;
    if (provider === "google_workspace" || provider === "microsoft_365")
      return !!smtpUser && (!!smtpPassword || !!initial?.id);
    if (provider === "smtp")
      return !!smtpHost && !!smtpUser && (!!smtpPassword || !!initial?.id);
    if (provider === "aws_ses")
      return !!awsAccessKeyId && (!!awsSecretKey || !!initial?.id);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      provider,
      from_email: fromEmail,
      from_name: fromName,
      reply_to: replyTo,
      display_name: displayName,
      is_default: isDefault,
      ...(provider === "resend" ? { resend_api_key: resendApiKey || undefined } : {}),
      ...(["smtp", "google_workspace", "microsoft_365"].includes(provider) ? {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_secure: smtpSecure,
        smtp_user: smtpUser,
        smtp_password: smtpPassword || undefined,
      } : {}),
      ...(provider === "aws_ses" ? {
        aws_access_key_id: awsAccessKeyId,
        aws_region: awsRegion,
        aws_secret_access_key: awsSecretKey || undefined,
      } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Provider picker */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Provider</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProviderChange(p.id)}
              className={`flex items-center gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${
                provider === p.id ? "border-[#3ECF8E] bg-[#3ECF8E]/5" : "border-border hover:border-border/80"
              }`}
            >
              {p.logo}
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate">{p.label}</p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{p.subtitle}</p>
              </div>
            </button>
          ))}
        </div>

        {provider === "resend" && <ResendSetupSteps />}
        {provider === "google_workspace" && <GoogleWorkspaceSetupSteps />}
        {provider === "microsoft_365" && <Microsoft365SetupSteps />}
        {provider === "aws_ses" && <AwsSesSetupSteps />}
      </div>

      <Separator />

      {/* Sender identity */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sender Identity</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="from_email">From Email <span className="text-destructive">*</span></Label>
            <Input id="from_email" type="email" placeholder="certificates@yourdomain.com"
              value={fromEmail} onChange={e => setFromEmail(e.target.value)} required />
            {provider === "resend" && <p className="text-xs text-muted-foreground">Must be on a domain verified in Resend</p>}
            {provider === "aws_ses" && <p className="text-xs text-muted-foreground">Must be verified in AWS SES</p>}
            {(provider === "google_workspace" || provider === "microsoft_365") &&
              <p className="text-xs text-muted-foreground">Should match your SMTP username</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from_name">Sender Name</Label>
            <Input id="from_name" placeholder="Your Organization"
              value={fromName} onChange={e => setFromName(e.target.value)} />
            <p className="text-xs text-muted-foreground">Shown as "From" in email clients</p>
          </div>
        </div>
      </div>

      {/* Resend config */}
      {provider === "resend" && (
        <>
          <Separator />
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resend Configuration</p>
            <div className="space-y-1.5">
              <Label htmlFor="resend_api_key">
                {initial?.id ? "API Key (leave blank to keep current)" : "API Key"} <span className="text-destructive">{!initial?.id && "*"}</span>
              </Label>
              <Input id="resend_api_key" type="password" placeholder={initial?.id ? "●●●●●●●●" : "re_xxxxxxxxxxxx"}
                value={resendApiKey} onChange={e => setResendApiKey(e.target.value)} required={!initial?.id} />
              <p className="text-xs text-muted-foreground">From Resend dashboard → API Keys</p>
            </div>
          </div>
        </>
      )}

      {/* Google Workspace / Microsoft 365 config */}
      {(provider === "google_workspace" || provider === "microsoft_365") && (
        <>
          <Separator />
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {provider === "google_workspace" ? "Google Workspace" : "Microsoft 365"} Configuration
            </p>
            <div className="rounded-lg bg-muted/30 border px-3 py-2 text-xs text-muted-foreground">
              SMTP server: <code className="bg-muted px-1 rounded">{provider === "google_workspace" ? "smtp.gmail.com:587" : "smtp.office365.com:587"}</code> (pre-configured)
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp_user">
                  {provider === "google_workspace" ? "Gmail Address" : "Outlook / M365 Email"} <span className="text-destructive">*</span>
                </Label>
                <Input id="smtp_user" type="email"
                  placeholder={provider === "google_workspace" ? "you@gmail.com" : "you@company.com"}
                  value={smtpUser} onChange={e => setSmtpUser(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp_password">
                  {initial?.id ? "App Password (leave blank to keep)" : "App Password"} <span className="text-destructive">{!initial?.id && "*"}</span>
                </Label>
                <Input id="smtp_password" type="password" placeholder={initial?.id ? "●●●●●●●●" : "16-character app password"}
                  value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} required={!initial?.id} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Custom SMTP config */}
      {provider === "smtp" && (
        <>
          <Separator />
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SMTP Configuration</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="smtp_host">SMTP Host <span className="text-destructive">*</span></Label>
                <Input id="smtp_host" placeholder="smtp.example.com"
                  value={smtpHost} onChange={e => setSmtpHost(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp_port">Port</Label>
                <Input id="smtp_port" type="number" placeholder="587"
                  value={smtpPort} onChange={e => setSmtpPort(Number(e.target.value))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp_user_custom">Username / Email <span className="text-destructive">*</span></Label>
                <Input id="smtp_user_custom" type="email" placeholder="you@example.com"
                  value={smtpUser} onChange={e => setSmtpUser(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp_password_custom">
                  {initial?.id ? "Password (leave blank to keep)" : "Password"} <span className="text-destructive">{!initial?.id && "*"}</span>
                </Label>
                <Input id="smtp_password_custom" type="password" placeholder={initial?.id ? "●●●●●●●●" : "SMTP password"}
                  value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} required={!initial?.id} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="smtp_secure" checked={smtpSecure} onCheckedChange={setSmtpSecure} />
              <Label htmlFor="smtp_secure" className="text-sm cursor-pointer">Use SSL/TLS (port 465)</Label>
            </div>
          </div>
        </>
      )}

      {/* AWS SES config */}
      {provider === "aws_ses" && (
        <>
          <Separator />
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AWS SES Configuration</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="aws_access_key_id">Access Key ID <span className="text-destructive">*</span></Label>
                <Input id="aws_access_key_id" placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={awsAccessKeyId} onChange={e => setAwsAccessKeyId(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aws_region">Region</Label>
                <Input id="aws_region" placeholder="us-east-1"
                  value={awsRegion} onChange={e => setAwsRegion(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aws_secret_access_key">
                {initial?.id ? "Secret Access Key (leave blank to keep)" : "Secret Access Key"} <span className="text-destructive">{!initial?.id && "*"}</span>
              </Label>
              <Input id="aws_secret_access_key" type="password"
                placeholder={initial?.id ? "●●●●●●●●" : "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}
                value={awsSecretKey} onChange={e => setAwsSecretKey(e.target.value)} required={!initial?.id} />
              <p className="text-xs text-muted-foreground">Stored encrypted in Vault — never exposed after saving</p>
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Display settings */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="reply_to">Reply-To Email</Label>
          <Input id="reply_to" type="email" placeholder="support@yourdomain.com"
            value={replyTo} onChange={e => setReplyTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="display_name">Display Name</Label>
          <Input id="display_name" placeholder="My Email"
            value={displayName} onChange={e => setDisplayName(e.target.value)} />
          <p className="text-xs text-muted-foreground">Internal label for this integration</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="is_default" checked={isDefault} onCheckedChange={setIsDefault} />
        <Label htmlFor="is_default" className="cursor-pointer">Set as default integration</Label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={saving || !isValid()} className="bg-[#3ECF8E] hover:bg-[#34b87a] text-white">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save Integration"}
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

// ── Integration card icon ──────────────────────────────────────────────────

function IntegrationProviderIcon({ integration }: { integration: DeliveryIntegration }) {
  const meta = providerMeta(integration.provider);
  return <>{meta.logo}</>;
}

// ── Main page ──────────────────────────────────────────────────────────────

const PLATFORM_DEFAULT_EMAIL = "info@digicertificates.in";

export default function EmailDeliverySettingsPage() {
  const { orgPath } = useOrg();
  const {
    loading,
    integrations,
    showAddForm,
    editingId,
    saving,
    togglingId,
    deletingId,
    error,
    setError,
    setShowAddForm,
    setEditingId,
    setSaving,
    setTogglingId,
    setDeletingId,
    onLoadSuccess,
    onLoadError,
    updateIntegrationActive,
  } = useDeliverySettingsState();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const list = await api.delivery.listIntegrations();
      onLoadSuccess(list);
    } catch (err: any) {
      onLoadError(err.message ?? "Failed to load integrations");
    }
  };

  const handleCreate = async (data: IntegrationFormData) => {
    setSaving(true);
    setError("");
    try {
      await api.delivery.createIntegration({
        channel: "email",
        provider: data.provider,
        display_name: data.display_name,
        from_email: data.from_email,
        from_name: data.from_name || undefined,
        reply_to: data.reply_to || undefined,
        is_default: data.is_default,
        is_active: true,
        ...(data.provider === "resend" ? { email_api_key: data.resend_api_key } : {}),
        ...(["smtp", "google_workspace", "microsoft_365"].includes(data.provider) ? {
          smtp_host: data.smtp_host,
          smtp_port: data.smtp_port,
          smtp_secure: data.smtp_secure,
          smtp_user: data.smtp_user,
          smtp_password: data.smtp_password,
        } : {}),
        ...(data.provider === "aws_ses" ? {
          aws_access_key_id: data.aws_access_key_id,
          aws_region: data.aws_region,
          aws_secret_access_key: data.aws_secret_access_key,
        } : {}),
      });
      setShowAddForm(false);
      toast.success("Integration saved");
      await load();
    } catch (err: any) {
      setError(err.message ?? "Failed to save integration");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, data: IntegrationFormData) => {
    setSaving(true);
    setError("");
    try {
      await api.delivery.updateIntegration(id, {
        display_name: data.display_name,
        from_email: data.from_email,
        from_name: data.from_name || undefined,
        reply_to: data.reply_to || undefined,
        is_default: data.is_default,
        ...(data.provider === "resend" ? { email_api_key: data.resend_api_key || undefined } : {}),
        ...(["smtp", "google_workspace", "microsoft_365"].includes(data.provider) ? {
          smtp_host: data.smtp_host,
          smtp_port: data.smtp_port,
          smtp_secure: data.smtp_secure,
          smtp_user: data.smtp_user,
          smtp_password: data.smtp_password || undefined,
        } : {}),
        ...(data.provider === "aws_ses" ? {
          aws_access_key_id: data.aws_access_key_id,
          aws_region: data.aws_region,
          aws_secret_access_key: data.aws_secret_access_key || undefined,
        } : {}),
      });
      setEditingId(null);
      toast.success("Integration updated");
      await load();
    } catch (err: any) {
      setError(err.message ?? "Failed to update integration");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    setTogglingId(id);
    try {
      await api.delivery.updateIntegration(id, { is_active: !currentActive });
      updateIntegrationActive(id, !currentActive);
      toast.success(currentActive ? "Integration disabled" : "Integration enabled");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delivery.deleteIntegration(id);
      toast.success("Integration removed");
      await load();
    } catch (err: any) {
      setError(err.message ?? "Failed to delete integration");
    } finally {
      setDeletingId(null);
    }
  };

  const activeDefault = integrations.find(i => i.is_default && i.is_active) ?? integrations.find(i => i.is_active);
  const hasActiveIntegration = integrations.filter(i => i.is_active).length > 0;
  const usingPlatformDefault = !hasActiveIntegration;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Delivery</h1>
        <p className="text-muted-foreground mt-1.5 text-base">
          Configure your email sender and manage delivery settings
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Your Email Integrations ─────────────────────────────────────────── */}
      <Card className={hasActiveIntegration ? "border-[#3ECF8E]/40 shadow-sm" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Your Email Integration</CardTitle>
              <CardDescription className="mt-0.5">
                {integrations.length === 0
                  ? "Connect Resend, Google Workspace, Microsoft 365, AWS SES, or custom SMTP."
                  : `${integrations.length} integration${integrations.length !== 1 ? "s" : ""} · ${activeDefault ? `Sending from ${activeDefault.from_email}` : "None active"}`}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={showAddForm ? "outline" : "default"}
              onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
              className={`gap-1.5 ${showAddForm ? "" : "bg-[#3ECF8E] hover:bg-[#34b87a] text-white"}`}
            >
              {showAddForm
                ? <><ChevronUp className="w-4 h-4" /> Collapse</>
                : <><Plus className="w-4 h-4" /> Add Integration</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <>
              {integrations.map(integration => (
                <div key={integration.id}>
                  {editingId === integration.id ? (
                    <Card className="p-5 border-[#3ECF8E]/30">
                      <p className="text-sm font-semibold mb-4">Edit Integration</p>
                      <IntegrationForm
                        initial={integration}
                        onSave={(data) => handleUpdate(integration.id, data)}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                      />
                    </Card>
                  ) : (
                    <div className={`rounded-lg border transition-colors ${integration.is_active ? "hover:bg-muted/10" : "bg-muted/20 opacity-70"}`}>
                      <div className="flex items-center gap-3 p-3.5">
                        <div className="p-2 rounded-full bg-background border shrink-0 flex items-center justify-center w-9 h-9">
                          <IntegrationProviderIcon integration={integration} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold truncate">{integration.display_name}</p>
                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide shrink-0">
                              {providerMeta(integration.provider).label}
                            </Badge>
                            {integration.is_default && integration.is_active && (
                              <Badge className="text-xs bg-[#3ECF8E]/10 border-[#3ECF8E]/30 text-[#3ECF8E] hover:bg-[#3ECF8E]/10 shrink-0">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                In Use
                              </Badge>
                            )}
                            {!integration.is_active && (
                              <Badge variant="secondary" className="text-xs shrink-0">Disabled</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {integration.from_name
                              ? `${integration.from_name} ‹${integration.from_email}›`
                              : integration.from_email}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch
                            checked={integration.is_active}
                            disabled={togglingId === integration.id}
                            onCheckedChange={() => handleToggleActive(integration.id, integration.is_active)}
                            className="data-[state=checked]:bg-[#3ECF8E] mr-1"
                          />
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs"
                            onClick={() => { setEditingId(integration.id); setShowAddForm(false); }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" disabled={deletingId === integration.id}
                            onClick={() => handleDelete(integration.id)}>
                            {deletingId === integration.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4 text-destructive" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {integrations.length === 0 && !showAddForm && (
                <div className="text-center py-8 text-muted-foreground">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No integrations yet.</p>
                  <p className="text-xs mt-0.5">Connect Resend, Google Workspace, Microsoft 365, AWS SES, or custom SMTP.</p>
                </div>
              )}

              {showAddForm && (
                <Card className="p-5 border-[#3ECF8E]/30 mt-2">
                  <p className="text-sm font-semibold mb-4">New Integration</p>
                  <IntegrationForm
                    onSave={handleCreate}
                    onCancel={() => setShowAddForm(false)}
                    saving={saving}
                  />
                </Card>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Authentix Default (fallback) ────────────────────────────────────── */}
      <Card className={usingPlatformDefault ? "border-[#3ECF8E]/40 shadow-sm" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${usingPlatformDefault ? "bg-[#3ECF8E]/10" : "bg-muted"}`}>
              <Mail className={`w-4 h-4 ${usingPlatformDefault ? "text-[#3ECF8E]" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base">Authentix Default Email</CardTitle>
                {usingPlatformDefault ? (
                  <Badge className="bg-[#3ECF8E]/10 text-[#3ECF8E] border-[#3ECF8E]/30 hover:bg-[#3ECF8E]/10 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Currently In Use
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Fallback Available</Badge>
                )}
              </div>
              <CardDescription className="mt-0.5 text-xs">
                {usingPlatformDefault
                  ? "Sending from Authentix's verified domain. Add your own integration above to send from your domain."
                  : "Your custom integration is active. Authentix default is available as a fallback if your integration is disabled."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg border bg-muted/20 p-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Sender Email</p>
              <p className="text-sm font-mono font-medium">{PLATFORM_DEFAULT_EMAIL}</p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">Managed by Authentix</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Templates shortcut */}
      <Card className="overflow-hidden">
        <div className="h-0.5 w-full bg-linear-to-r from-[#3ECF8E] to-[#4f46e5]" />
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#3ECF8E]/10 shrink-0">
              <LayoutTemplate className="w-4 h-4 text-[#3ECF8E]" />
            </div>
            <div>
              <CardTitle className="text-lg">Email Templates</CardTitle>
              <CardDescription className="mt-0.5">
                Design the email sent to recipients when their certificate is issued.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Link href={orgPath("/email-templates")}>
            <Button className="gap-2 bg-[#3ECF8E] hover:bg-[#34b87a] text-white">
              Manage Templates
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
