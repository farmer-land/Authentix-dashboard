'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { track } from '@vercel/analytics';
import { useParams } from 'next/navigation';
import {
  XCircle, AlertTriangle, Calendar, User, Building2, Award,
  ExternalLink, Download, Share2, Clock, ShieldCheck, ShieldX,
  ShieldAlert, Hash, CheckCircle2, Loader2, RefreshCw, Link, Linkedin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerificationResult {
  valid: boolean;
  result: 'valid' | 'expired' | 'revoked' | 'not_found';
  message: string;
  certificate?: {
    id: string;
    certificate_number: string;
    recipient_name: string;
    recipient_email: string | null;
    category_name: string;
    subcategory_name: string;
    issued_at: string;
    expires_at: string | null;
    status: string;
    revoked_at?: string | null;
    revoked_reason?: string | null;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    website_url: string | null;
    verification_message: string | null;
  };
  preview_url?: string | null;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS = {
  valid: {
    Icon: ShieldCheck,
    label: 'Verified & Authentic',
    description: 'This certificate is valid and authentically issued.',
    accent: '#10b981',
    accentLight: 'rgba(16,185,129,0.08)',
    accentBorder: 'rgba(16,185,129,0.2)',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    badgeBg: 'bg-emerald-500',
    pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    pulse: true,
  },
  expired: {
    Icon: ShieldAlert,
    label: 'Expired',
    description: 'This certificate was valid but has passed its expiry date.',
    accent: '#f59e0b',
    accentLight: 'rgba(245,158,11,0.07)',
    accentBorder: 'rgba(245,158,11,0.2)',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    textColor: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-500',
    pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    pulse: false,
  },
  revoked: {
    Icon: ShieldX,
    label: 'Revoked',
    description: 'This certificate has been revoked by the issuing organization.',
    accent: '#ef4444',
    accentLight: 'rgba(239,68,68,0.07)',
    accentBorder: 'rgba(239,68,68,0.2)',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    textColor: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-500',
    pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
    pulse: false,
  },
  not_found: {
    Icon: XCircle,
    label: 'Not Found',
    description: 'No certificate matching this token was found.',
    accent: '#6b7280',
    accentLight: 'rgba(107,114,128,0.05)',
    accentBorder: 'rgba(107,114,128,0.15)',
    iconBg: 'bg-gray-500/10',
    iconColor: 'text-gray-400',
    textColor: 'text-gray-500',
    badgeBg: 'bg-gray-500',
    pill: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border border-gray-500/20',
    pulse: false,
  },
} as const;

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Achievement text builder ──────────────────────────────────────────────────

function buildAchievementText(
  recipientName: string,
  subcategoryName: string,
  categoryName: string,
  orgName: string | undefined,
): string {
  const program = subcategoryName || categoryName;
  const issuer = orgName || 'the issuing organization';

  const sentence1 = program
    ? `This is to certify that ${recipientName} has successfully completed the ${program} program, demonstrating the knowledge, skills, and dedication required to earn this credential.`
    : `This is to certify that ${recipientName} has met all the requirements and demonstrated the skills necessary to earn this credential.`;

  const sentence2 = `${issuer} proudly recognizes this achievement as a reflection of ${recipientName}'s commitment to professional growth and continuous learning.`;

  return `${sentence1}\n${sentence2}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/proxy/verification/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (data.success && data.data) {
          setResult(data.data);
          track('certificate_verified', { result: data.data.result });
        } else {
          setResult({ valid: false, result: 'not_found', message: data.error?.message ?? 'Certificate not found' });
        }
      } catch {
        setError('Unable to verify. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setShowShareMenu(false);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleLinkedInShare = useCallback(() => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
    setShowShareMenu(false);
    track('certificate_share', { platform: 'linkedin' });
  }, []);

  useEffect(() => {
    if (!showShareMenu) return;
    const handler = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showShareMenu]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorPage message={error} />;
  if (!result) return null;

  const status = result.result;
  const cfg = STATUS[status];
  const cert = result.certificate;
  const org = result.organization;
  const StatusIcon = cfg.Icon;

  return (
    <div className="min-h-screen" style={{ background: 'var(--vbg, #f4f5f7)' }}>
      <style>{`
        :root { --vbg: #f4f5f7; }
        @media (prefers-color-scheme: dark) { :root { --vbg: #0c0c0f; } }
        .dark { --vbg: #0c0c0f; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes pulse-ring { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:0;transform:scale(1.5)} }
        @keyframes logoGlow { 0%,100%{filter:drop-shadow(0 0 6px rgba(62,207,142,0.5))} 50%{filter:drop-shadow(0 0 14px rgba(62,207,142,0.9))} }
        .anim-up { animation: fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .anim-up-1 { animation-delay: 0.05s; }
        .anim-up-2 { animation-delay: 0.12s; }
        .anim-up-3 { animation-delay: 0.2s; }
        .anim-in { animation: fadeIn 0.4s ease both; }
        .pulse-ring { animation: pulse-ring 2s ease-in-out infinite; }
        .logo-glow { animation: logoGlow 2.8s ease-in-out infinite; }
      `}</style>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-black/6 dark:border-white/6 bg-white/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Org */}
          <div className="flex items-center gap-2.5 min-w-0">
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="h-7 w-auto max-w-25 object-contain shrink-0" />
            ) : (
              <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Award className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {org?.name ?? 'Certificate Verification'}
            </span>
          </div>
          {/* Status pill */}
          {cert && (
            <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0', cfg.pill)}>
              {cfg.pulse && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="pulse-ring absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: cfg.accent }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: cfg.accent }} />
                </span>
              )}
              {cfg.label}
            </div>
          )}
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-5">

        {cert ? (
          <>
            {/* ── Certificate image card (CLEAN — no overlays) ────────── */}
            <div className="anim-up rounded-2xl overflow-hidden bg-white dark:bg-[#111115] shadow-2xl shadow-black/10 dark:shadow-black/40 ring-1 ring-black/6 dark:ring-white/5">
              {result.preview_url ? (
                <div className="relative">
                  {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-black/20" style={{ aspectRatio: '1.5/1' }}>
                      <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                    </div>
                  )}
                  <img
                    src={result.preview_url}
                    alt="Certificate"
                    className={cn('w-full h-auto block transition-opacity duration-500', imageLoaded ? 'opacity-100' : 'opacity-0')}
                    onLoad={() => setImageLoaded(true)}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-gray-300 dark:text-gray-700" style={{ aspectRatio: '1.5/1' }}>
                  <Award className="w-14 h-14" />
                  <p className="text-sm">Preview not available</p>
                </div>
              )}
            </div>

            {/* ── Credential identity card ──────────────────────────────── */}
            <div className="anim-up anim-up-1 rounded-2xl overflow-hidden bg-white dark:bg-[#111115] shadow-md shadow-black/6 dark:shadow-black/20 ring-1 ring-black/6 dark:ring-white/5">

              {/* Status accent bar */}
              <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${cfg.accent}, ${cfg.accent}88)` }} />

              <div className="p-6 space-y-5">

                {/* Top row: Authentix badge + status label */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-white/5 border border-gray-200/70 dark:border-white/8 shrink-0">
                    <img src="/brand/authentix-24-24.svg" alt="Authentix" className="w-3.5 h-3.5 logo-glow opacity-80" />
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 tracking-wide">Authentix</span>
                  </div>
                  <div className={cn('flex items-center gap-1.5 text-xs font-semibold shrink-0', cfg.textColor)}>
                    <div className={cn('p-1 rounded-md', cfg.iconBg)}>
                      <StatusIcon className={cn('w-3.5 h-3.5', cfg.iconColor)} />
                    </div>
                    {cfg.label}
                  </div>
                </div>

                {/* Recipient name + category */}
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight wrap-break-word">
                    {cert.recipient_name}
                  </h1>
                  {(cert.category_name || cert.subcategory_name) && (
                    <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
                      {cert.subcategory_name
                        ? `${cert.category_name} · ${cert.subcategory_name}`
                        : cert.category_name}
                    </p>
                  )}
                </div>

                {/* Achievement statement — custom from settings or auto-generated default */}
                <div className="border-l-2 pl-3 space-y-1.5" style={{ borderColor: cfg.accent }}>
                  {(org?.verification_message
                    ? org.verification_message
                        .replace(/\{\{name\}\}/g, cert.recipient_name)
                        .replace(/\{\{category\}\}/g, cert.subcategory_name || cert.category_name || '')
                    : buildAchievementText(cert.recipient_name, cert.subcategory_name, cert.category_name, org?.name)
                  ).split('\n').map((line, i) => (
                    <p key={i} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{line}</p>
                  ))}
                </div>

                {/* Issuing org */}
                {org && (
                  <div className="flex items-center gap-3 py-3 border-t border-b border-black/5 dark:border-white/5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">Issued by</p>
                    <div className="flex items-center gap-2 min-w-0">
                      {org.logo_url ? (
                        <img src={org.logo_url} alt={org.name} className="h-6 w-auto max-w-15 object-contain shrink-0" />
                      ) : (
                        <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                      )}
                      {org.website_url ? (
                        <a href={org.website_url} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-semibold text-gray-900 dark:text-white hover:underline flex items-center gap-1 truncate">
                          {org.name}
                          <ExternalLink className="w-3 h-3 shrink-0 text-gray-400" />
                        </a>
                      ) : (
                        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{org.name}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Issued
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{fmt(cert.issued_at)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Valid Until
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {cert.expires_at ? fmt(cert.expires_at) : <span className="text-gray-400 dark:text-gray-500">No expiry</span>}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1">
                      <Hash className="w-3 h-3" /> Certificate #
                    </p>
                    <p className="text-xs font-mono font-medium text-gray-900 dark:text-white break-all">{cert.certificate_number}</p>
                  </div>
                </div>

                {/* Revocation info */}
                {cert.revoked_at && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 space-y-1">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" /> Revoked on {fmtShort(cert.revoked_at)}
                    </p>
                    {cert.revoked_reason && (
                      <p className="text-xs text-red-500 dark:text-red-400/70">{cert.revoked_reason}</p>
                    )}
                  </div>
                )}

                {/* Status description */}
                <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{cfg.description}</p>
              </div>
            </div>

            {/* ── Action bar ───────────────────────────────────────────── */}
            {result.preview_url && (
              <div className="anim-up anim-up-2 flex items-center gap-2.5">
                <a
                  href={result.preview_url}
                  download="certificate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold transition-colors shadow-sm"
                  onClick={() => track('certificate_download', { format: 'png' })}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  Download Certificate
                </a>
                {/* Share */}
                <div className="relative" ref={shareMenuRef}>
                  <button
                    onClick={() => setShowShareMenu(v => !v)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#111115] hover:bg-gray-50 dark:hover:bg-white/4 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                  >
                    <Share2 className="w-4 h-4 shrink-0" />
                    {copied ? 'Copied!' : 'Share'}
                  </button>
                  {showShareMenu && (
                    <div className="absolute right-0 bottom-full mb-2 w-52 rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1a1a1f] shadow-xl shadow-black/10 overflow-hidden z-20">
                      <button onClick={handleLinkedInShare} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <Linkedin className="w-4 h-4 text-[#0A66C2] shrink-0" /> Share on LinkedIn
                      </button>
                      <div className="h-px bg-black/6 dark:bg-white/6" />
                      <button onClick={handleCopyLink} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <Link className="w-4 h-4 text-gray-400 shrink-0" /> Copy verification link
                      </button>
                      <div className="h-px bg-black/6 dark:bg-white/6" />
                      <a
                        href={result.preview_url}
                        download="certificate"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => { setShowShareMenu(false); track('certificate_download', { format: 'png', from: 'share_menu' }); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <Download className="w-4 h-4 text-gray-400 shrink-0" /> Download image
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Authentix trust mark ─────────────────────────────────── */}
            <div className="anim-up anim-up-3 flex flex-col items-center gap-1.5 py-4">
              <img
                src="/brand/authentix-24-24.svg"
                alt="Authentix"
                className="w-7 h-7 logo-glow"
              />
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 tracking-wide text-center">
                Verified against the live issuer database
              </p>
              <p className="text-[10px] font-mono text-gray-300 dark:text-gray-600 text-center">
                {token}
              </p>
            </div>
          </>
        ) : (
          /* ── Not found ─────────────────────────────────────────────── */
          <div className="anim-up mt-8">
            <div className="rounded-2xl bg-white dark:bg-[#111115] ring-1 ring-black/6 dark:ring-white/5 shadow-lg overflow-hidden">
              <div className="h-1 w-full bg-gray-200 dark:bg-gray-800" />
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800/80 flex items-center justify-center mx-auto mb-5">
                  <XCircle className="w-7 h-7 text-gray-300 dark:text-gray-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Certificate Not Found</h2>
                <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed max-w-xs mx-auto">
                  No certificate matches this verification link. The URL may be incorrect or the certificate may no longer exist.
                </p>
                <div className="mt-6 pt-5 border-t border-black/5 dark:border-white/5 flex items-center justify-center gap-2">
                  <img src="/brand/authentix-24-24.svg" alt="Authentix" className="w-4 h-4 opacity-40" />
                  <p className="text-xs text-gray-300 dark:text-gray-600 font-mono truncate">
                    {token.slice(0, 24)}…
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-black/5 dark:border-white/5 py-5">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src="/brand/authentix-24-24.svg" alt="Authentix" className="w-4 h-4 opacity-60" />
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Powered by <span className="font-semibold text-gray-500 dark:text-gray-400">Authentix</span>
            </span>
          </div>
          {cert && (
            <p className="text-[11px] text-gray-300 dark:text-gray-600 font-mono">
              Verified {fmtShort(new Date().toISOString())}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--vbg, #f4f5f7)' }}>
      <div className="h-14 border-b border-black/6 dark:border-white/6 bg-white/80 dark:bg-[#0c0c0f]/80" />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {/* Certificate skeleton */}
        <div className="rounded-2xl bg-white dark:bg-[#111115] shadow-xl ring-1 ring-black/6 dark:ring-white/5 overflow-hidden">
          <div className="aspect-[1.4/1] bg-gray-100 dark:bg-gray-800/50 animate-pulse" />
        </div>
        {/* Info skeleton */}
        <div className="rounded-2xl bg-white dark:bg-[#111115] shadow-md ring-1 ring-black/6 dark:ring-white/5 overflow-hidden">
          <div className="h-1 bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
              <div className="h-7 w-56 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
              <div className="h-4 w-40 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-1.5">
                  <div className="h-2 w-10 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                  <div className="h-4 w-20 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Button skeletons */}
        <div className="flex gap-2.5">
          <div className="flex-1 h-12 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="w-28 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────────

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--vbg, #f4f5f7)' }}>
      <div className="rounded-2xl bg-white dark:bg-[#111115] ring-1 ring-black/6 dark:ring-white/5 shadow-xl p-10 text-center max-w-sm w-full">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Verification Failed</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
