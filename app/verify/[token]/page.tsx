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
  };
  preview_url?: string | null;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS = {
  valid: {
    Icon: ShieldCheck,
    StampIcon: CheckCircle2,
    label: 'Verified & Authentic',
    stampLabel: 'VERIFIED',
    description: 'This certificate is valid and authentically issued.',
    bgFrom: 'from-emerald-500/[0.06]',
    bgAccent: 'rgba(16,185,129,0.08)',
    ring: 'ring-emerald-200 dark:ring-emerald-800/60',
    iconGlow: 'shadow-emerald-500/30',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    badgeBg: 'bg-emerald-500',
    badgeText: 'text-white',
    stampBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-400',
    pulse: true,
    headerBg: 'bg-emerald-500/[0.06] dark:bg-emerald-500/[0.06]',
  },
  expired: {
    Icon: ShieldAlert,
    StampIcon: Clock,
    label: 'Expired',
    stampLabel: 'EXPIRED',
    description: 'This certificate was valid but has passed its expiry date.',
    bgFrom: 'from-amber-500/[0.06]',
    bgAccent: 'rgba(245,158,11,0.07)',
    ring: 'ring-amber-200 dark:ring-amber-800/60',
    iconGlow: 'shadow-amber-500/30',
    iconBg: 'bg-amber-50 dark:bg-amber-950/60',
    iconColor: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    stampBg: 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-400',
    pulse: false,
    headerBg: 'bg-amber-500/[0.05] dark:bg-amber-500/[0.05]',
  },
  revoked: {
    Icon: ShieldX,
    StampIcon: XCircle,
    label: 'Revoked',
    stampLabel: 'REVOKED',
    description: 'This certificate has been revoked by the issuing organization.',
    bgFrom: 'from-red-500/[0.06]',
    bgAccent: 'rgba(239,68,68,0.07)',
    ring: 'ring-red-200 dark:ring-red-800/60',
    iconGlow: 'shadow-red-500/30',
    iconBg: 'bg-red-50 dark:bg-red-950/60',
    iconColor: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-500',
    badgeText: 'text-white',
    stampBg: 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400',
    dot: 'bg-red-400',
    pulse: false,
    headerBg: 'bg-red-500/[0.05] dark:bg-red-500/[0.05]',
  },
  not_found: {
    Icon: XCircle,
    StampIcon: XCircle,
    label: 'Not Found',
    stampLabel: 'INVALID',
    description: 'No certificate matching this token was found.',
    bgFrom: 'from-gray-500/[0.04]',
    bgAccent: 'rgba(107,114,128,0.05)',
    ring: 'ring-gray-200 dark:ring-gray-800/60',
    iconGlow: 'shadow-gray-400/20',
    iconBg: 'bg-gray-50 dark:bg-gray-900/60',
    iconColor: 'text-gray-400 dark:text-gray-500',
    badgeBg: 'bg-gray-500',
    badgeText: 'text-white',
    stampBg: 'bg-gray-500/10 border-gray-400/30 text-gray-500 dark:text-gray-400',
    dot: 'bg-gray-400',
    pulse: false,
    headerBg: '',
  },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
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

  // Close share menu when clicking outside
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
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--verify-bg, #f5f6fa)' }}>
      <style>{`
        :root { --verify-bg: #f5f6fa; }
        @media (prefers-color-scheme: dark) { :root { --verify-bg: #0a0a0c; } }
        .dark { --verify-bg: #0a0a0c; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ringPulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:0;transform:scale(1.6)} }
        @keyframes chipIn { 0%{opacity:0;transform:translateY(-6px) scale(0.94)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes logoPulse { 0%,100%{filter:drop-shadow(0 0 4px rgba(62,207,142,0.4))} 50%{filter:drop-shadow(0 0 10px rgba(62,207,142,0.8))} }
        .fade-up { animation: fadeUp 0.4s ease-out both; }
        .fade-up-1 { animation-delay: 0.05s; }
        .fade-up-2 { animation-delay: 0.1s; }
        .fade-up-3 { animation-delay: 0.15s; }
        .ring-pulse { animation: ringPulse 2s ease-in-out infinite; }
        .chip-in { animation: chipIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
        .logo-pulse { animation: logoPulse 2.5s ease-in-out infinite; }
        .chip-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(62,207,142,0.25) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 2.4s linear infinite;
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className={cn(
        'sticky top-0 z-20 border-b border-black/[0.06] dark:border-white/[0.06]',
        'bg-white/85 dark:bg-[#111113]/85 backdrop-blur-lg',
      )}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="h-7 w-auto max-w-[120px] object-contain flex-shrink-0" />
            ) : (
              <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Award className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {org?.name ?? 'Certificate Verification'}
            </span>
          </div>
          {/* Status badge */}
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0',
            cfg.badgeBg, cfg.badgeText,
          )}>
            {cfg.pulse && (
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="ring-pulse absolute inline-flex h-full w-full rounded-full bg-white/60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
            )}
            {!cfg.pulse && <span className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />}
            {cfg.label}
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 lg:py-12">

        {cert ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start">

            {/* ── Left: Certificate Preview ──────────────────────────────── */}
            <div className="fade-up space-y-4">

              {/* Preview card */}
              <div className="group relative rounded-2xl overflow-hidden bg-white dark:bg-[#111113] shadow-xl shadow-black/[0.08] dark:shadow-black/30 ring-1 ring-black/[0.06] dark:ring-white/[0.06]">

                {/* Certificate image area */}
                <div className="relative bg-gray-50 dark:bg-black/20">
                  {result.preview_url ? (
                    <>
                      {!imageLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-black/20" style={{ aspectRatio: '1.5/1' }}>
                          <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                        </div>
                      )}
                      <img
                        src={result.preview_url}
                        alt="Certificate"
                        className={cn('w-full h-auto block transition-opacity duration-300', imageLoaded ? 'opacity-100' : 'opacity-0')}
                        onLoad={() => setImageLoaded(true)}
                      />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-300 dark:text-gray-700" style={{ aspectRatio: '1.5/1' }}>
                      <Award className="w-12 h-12" />
                      <p className="text-sm">Preview not available</p>
                    </div>
                  )}

                  {/* Authentix verified chip — top-left */}
                  {imageLoaded && result.preview_url && (
                    <div className="absolute top-4 left-4 chip-in pointer-events-none" style={{ animationDelay: '0.3s' }}>
                      <div className="relative flex items-center gap-2 px-3 py-2 rounded-2xl overflow-hidden"
                        style={{
                          background: 'rgba(0,0,0,0.55)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          border: '1px solid rgba(62,207,142,0.35)',
                          boxShadow: '0 2px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(62,207,142,0.1) inset',
                        }}
                      >
                        {/* Shimmer layer */}
                        <div className="chip-shimmer absolute inset-0 rounded-2xl" />
                        {/* Logo */}
                        <img
                          src="/brand/authentix-24-24.svg"
                          alt="Authentix"
                          className="w-5 h-5 shrink-0 logo-pulse relative z-10"
                          style={{ animationDelay: '0.5s' }}
                        />
                        {/* Text */}
                        <div className="relative z-10">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white leading-none">
                            Authentix
                          </p>
                          <p className={cn(
                            'text-[9px] font-semibold leading-none mt-0.5',
                            status === 'valid' ? 'text-emerald-400' :
                            status === 'expired' ? 'text-amber-400' :
                            status === 'revoked' ? 'text-red-400' : 'text-gray-400',
                          )}>
                            {status === 'valid' ? '✓ Verified' : status === 'expired' ? 'Expired' : status === 'revoked' ? 'Revoked' : 'Not Found'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action bar */}
                {result.preview_url && (
                  <div className="flex items-center gap-2 p-3 border-t border-black/[0.05] dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                    <a
                      href={result.preview_url}
                      download="certificate"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold transition-colors"
                      onClick={() => track('certificate_download', { format: 'png' })}
                    >
                      <Download className="w-4 h-4 flex-shrink-0" />
                      <span>Download Certificate</span>
                    </a>
                    {/* Share dropdown */}
                    <div className="relative" ref={shareMenuRef}>
                      <button
                        onClick={() => setShowShareMenu(v => !v)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-black/8 dark:border-white/8 hover:bg-gray-50 dark:hover:bg-white/4 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        <Share2 className="w-4 h-4 shrink-0" />
                        {copied ? 'Copied!' : 'Share'}
                      </button>
                      {showShareMenu && (
                        <div className="absolute right-0 bottom-full mb-2 w-52 rounded-xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1a1a1e] shadow-lg shadow-black/10 overflow-hidden z-10">
                          <button
                            onClick={handleLinkedInShare}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
                          >
                            <Linkedin className="w-4 h-4 text-[#0A66C2] shrink-0" />
                            Share on LinkedIn
                          </button>
                          <div className="h-px bg-black/6 dark:bg-white/6" />
                          <button
                            onClick={handleCopyLink}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
                          >
                            <Link className="w-4 h-4 text-gray-500 shrink-0" />
                            Copy verification link
                          </button>
                          {result.preview_url && (
                            <>
                              <div className="h-px bg-black/6 dark:bg-white/6" />
                              <a
                                href={result.preview_url}
                                download="certificate"
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => { setShowShareMenu(false); track('certificate_download', { format: 'png', from: 'share_menu' }); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
                              >
                                <Download className="w-4 h-4 text-gray-500 shrink-0" />
                                Download certificate image
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Organization card — shown below certificate on mobile, hidden on desktop (shown in sidebar) */}
              <div className="lg:hidden">
                <OrgCard org={org} />
              </div>
            </div>

            {/* ── Right: Info sidebar ────────────────────────────────────── */}
            <div className="space-y-4">

              {/* Status hero card */}
              <div className={cn(
                'fade-up fade-up-1 rounded-2xl overflow-hidden',
                'bg-white dark:bg-[#111113] shadow-md shadow-black/[0.06] dark:shadow-black/20',
                'ring-1', cfg.ring,
              )}>
                {/* Status section */}
                <div className={cn('p-5 pb-4 bg-gradient-to-b', cfg.bgFrom, 'to-transparent')}>
                  <div className="flex items-center gap-4">
                    {/* Icon with animated ring for valid */}
                    <div className="relative flex-shrink-0">
                      {cfg.pulse && (
                        <div className={cn('absolute inset-0 rounded-full ring-2', cfg.ring, 'ring-pulse')} />
                      )}
                      <div className={cn('relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg', cfg.iconBg, cfg.iconGlow)}>
                        <StatusIcon className={cn('w-7 h-7', cfg.iconColor)} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-0.5">
                        Verification Status
                      </p>
                      <h1 className={cn('text-xl font-bold leading-tight', cfg.iconColor)}>
                        {cfg.label}
                      </h1>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                        {cfg.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5 space-y-0 divide-y divide-black/[0.04] dark:divide-white/[0.04]">

                  {/* Recipient */}
                  <DetailRow
                    icon={User}
                    label="Recipient"
                    value={cert.recipient_name}
                    bold
                    large
                  />

                  {/* Certificate number */}
                  <DetailRow
                    icon={Hash}
                    label="Certificate No."
                    value={cert.certificate_number}
                    mono
                  />

                  {/* Category */}
                  {(cert.category_name || cert.subcategory_name) && (
                    <DetailRow
                      icon={Award}
                      label="Program"
                      value={cert.subcategory_name || cert.category_name}
                    />
                  )}

                  {/* Issued */}
                  <DetailRow
                    icon={Calendar}
                    label="Issued On"
                    value={fmt(cert.issued_at)}
                  />

                  {/* Expires */}
                  <DetailRow
                    icon={Clock}
                    label="Valid Until"
                    value={cert.expires_at ? fmt(cert.expires_at) : 'No expiry'}
                    muted={!cert.expires_at}
                  />

                  {/* Revoked info */}
                  {cert.revoked_at && (
                    <DetailRow
                      icon={XCircle}
                      label="Revoked On"
                      value={fmt(cert.revoked_at)}
                      danger
                    />
                  )}
                  {cert.revoked_reason && (
                    <DetailRow
                      icon={AlertTriangle}
                      label="Revocation Reason"
                      value={cert.revoked_reason}
                      danger
                    />
                  )}
                </div>
              </div>

              {/* Organization — desktop only */}
              <div className="hidden lg:block fade-up fade-up-2">
                <OrgCard org={org} />
              </div>

              {/* Trust indicator */}
              <div className="fade-up fade-up-3 rounded-2xl bg-white dark:bg-[#111113] ring-1 ring-black/[0.06] dark:ring-white/[0.06] p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex-shrink-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">Tamper-proof verification</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                      Verified against the live issuer database. Results reflect the current certificate status.
                    </p>
                    <p className="text-[10px] font-mono text-gray-300 dark:text-gray-600 mt-2 tabular-nums truncate">
                      ID: {token.slice(0, 20)}…
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Not found ─────────────────────────────────────────────────── */
          <div className="fade-up max-w-md mx-auto">
            <div className="rounded-2xl bg-white dark:bg-[#111113] ring-1 ring-black/[0.06] dark:ring-white/[0.06] shadow-lg overflow-hidden">
              <div className="p-10 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-800/80 flex items-center justify-center mx-auto mb-6">
                  <XCircle className="w-9 h-9 text-gray-300 dark:text-gray-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Certificate Not Found
                </h2>
                <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed max-w-xs mx-auto">
                  No certificate matches this verification link. The URL may be incorrect,
                  or the certificate may no longer exist.
                </p>
                <div className="mt-6 pt-6 border-t border-black/[0.05] dark:border-white/[0.05]">
                  <p className="text-xs text-gray-300 dark:text-gray-600 font-mono truncate">
                    Token: {token.slice(0, 24)}…
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="mt-auto py-6 border-t border-black/[0.05] dark:border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span>
              Secured by{' '}
              <span className="font-semibold text-gray-600 dark:text-gray-400">Authentix</span>
              {' '}— Digital Certificate Platform
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

// ── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
  muted,
  danger,
  bold,
  large,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  danger?: boolean;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-shrink-0 mt-0.5">
        <Icon className={cn('w-3.5 h-3.5', danger ? 'text-red-400' : 'text-gray-300 dark:text-gray-600')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">
          {label}
        </p>
        <p className={cn(
          'leading-snug break-words',
          large ? 'text-base' : 'text-sm',
          bold && 'font-bold',
          mono && 'font-mono text-xs',
          muted && 'text-gray-400 dark:text-gray-500',
          danger && 'text-red-600 dark:text-red-400 font-medium',
          !muted && !danger && 'text-gray-900 dark:text-white',
          !bold && 'font-medium',
        )}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ── Organization card ─────────────────────────────────────────────────────────

function OrgCard({ org }: { org: VerificationResult['organization'] }) {
  if (!org) return null;
  return (
    <div className="rounded-2xl bg-white dark:bg-[#111113] ring-1 ring-black/[0.06] dark:ring-white/[0.06] shadow-sm p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
        Issued by
      </p>
      <div className="flex items-center gap-3">
        {org.logo_url ? (
          <img
            src={org.logo_url}
            alt={org.name}
            className="h-12 w-12 rounded-xl object-contain border border-black/[0.06] dark:border-white/[0.06] bg-white p-1.5 flex-shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-5 w-5 text-gray-400" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{org.name}</p>
          {org.website_url ? (
            <a
              href={org.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 mt-0.5"
            >
              {org.website_url.replace(/^https?:\/\//, '')}
              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
            </a>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">Official Issuer</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--verify-bg, #f5f6fa)' }}>
      <div className="h-14 border-b border-black/[0.06] dark:border-white/[0.06] bg-white/85 dark:bg-[#111113]/85" />
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Preview skeleton */}
          <div className="rounded-2xl bg-white dark:bg-[#111113] shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.06] overflow-hidden">
            <div className="aspect-[1.4/1] bg-gray-100 dark:bg-gray-800/50 animate-pulse" />
            <div className="p-3 border-t border-black/[0.05] flex gap-2">
              <div className="flex-1 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              <div className="w-20 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              <div className="w-20 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            </div>
          </div>
          {/* Info skeleton */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-[#111113] shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.06] p-5 space-y-4">
              <div className="flex gap-4 pb-4 border-b border-black/[0.04]">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-2.5 w-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                  <div className="h-5 w-36 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                  <div className="h-2.5 w-48 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                </div>
              </div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3 py-1">
                  <div className="w-3.5 h-3.5 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse mt-2 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <div className="h-2 w-14 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                    <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#111113] ring-1 ring-black/[0.06] dark:ring-white/[0.06] p-4">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-28 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                  <div className="h-2.5 w-20 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────────

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--verify-bg, #f5f6fa)' }}>
      <div className="rounded-2xl bg-white dark:bg-[#111113] ring-1 ring-black/[0.06] dark:ring-white/[0.06] shadow-xl p-10 text-center max-w-sm w-full">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Verification Failed</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
