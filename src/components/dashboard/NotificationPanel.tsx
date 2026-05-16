'use client';

/**
 * NOTIFICATION PANEL
 *
 * Sidebar bell button + panel that appears OUTSIDE (to the right of) the sidebar.
 * Clicking a notification opens a centered detail modal.
 */

import { useState, useRef, useEffect } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  X,
  FileCheck,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { useJobNotifications, type BackgroundJob } from '@/lib/notifications/job-notifications';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// ── Detail Modal ───────────────────────────────────────────────────────────────

function JobDetailModal({
  job,
  allJobs,
  onClose,
  onClear,
  onSelect,
}: {
  job: BackgroundJob;
  allJobs: BackgroundJob[];
  onClose: () => void;
  onClear: (id: string) => void;
  onSelect: (job: BackgroundJob) => void;
}) {
  const isPending = job.status === 'queued' || job.status === 'running';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const otherJobs = allJobs.filter(j => j.id !== job.id);

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
              isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/30' :
              isFailed ? 'bg-destructive/10' :
              'bg-primary/10'
            )}>
              {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {isFailed && <AlertCircle className="w-4 h-4 text-destructive" />}
              {isPending && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{job.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(job.submittedAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Status */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/40 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
            <p className="text-sm font-medium">
              {isCompleted && (
                job.totalCertificates != null
                  ? `${job.totalCertificates.toLocaleString()} certificate${job.totalCertificates !== 1 ? 's' : ''} generated`
                  : 'Certificates ready'
              )}
              {isFailed && (job.error ?? 'Generation failed')}
              {isPending && (
                job.progress
                  ? `${job.progress.processed.toLocaleString()} / ${job.progress.total.toLocaleString()} certificates`
                  : job.status === 'running' ? 'Generating…' : 'Queued, waiting to start…'
              )}
            </p>
            {isPending && job.progress && (
              <div className="space-y-1">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round(job.progress.processed / job.progress.total * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  {Math.min(100, Math.round(job.progress.processed / job.progress.total * 100))}%
                </p>
              </div>
            )}
          </div>

          {/* Download */}
          {isCompleted && job.downloadUrl && (
            <a
              href={job.downloadUrl}
              download
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download ZIP
            </a>
          )}

          {/* Dismiss */}
          <button
            onClick={() => { onClear(job.id); onClose(); }}
            className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
          >
            Dismiss notification
          </button>
        </div>

        {/* Other notifications */}
        {otherJobs.length > 0 && (
          <div className="border-t border-border/60">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-5 pt-3 pb-2">
              Other notifications
            </p>
            <div className="max-h-40 overflow-y-auto divide-y divide-border/40">
              {otherJobs.map(j => {
                const jPending = j.status === 'queued' || j.status === 'running';
                const jCompleted = j.status === 'completed';
                const jFailed = j.status === 'failed';
                return (
                  <button
                    key={j.id}
                    onClick={() => onSelect(j)}
                    className="flex items-center gap-3 px-5 py-3 w-full text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="shrink-0">
                      {jCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      {jFailed && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                      {jPending && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
                    </div>
                    <p className="text-xs flex-1 truncate">{j.label}</p>
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Job item ──────────────────────────────────────────────────────────────────

function JobItem({
  job,
  onClear,
  onClick,
}: {
  job: BackgroundJob;
  onClear: (id: string) => void;
  onClick: (job: BackgroundJob) => void;
}) {
  const isPending = job.status === 'queued' || job.status === 'running';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group relative cursor-pointer"
      onClick={() => onClick(job)}
    >
      {/* Status icon */}
      <div className="shrink-0 mt-0.5">
        {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        {isFailed && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
        {isPending && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-5">
        <p className="text-xs font-medium truncate leading-tight">{job.label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
          {isCompleted &&
            (job.totalCertificates != null
              ? `${job.totalCertificates.toLocaleString()} certificate${job.totalCertificates !== 1 ? 's' : ''} ready`
              : 'Certificates ready')}
          {isFailed && (job.error ?? 'Generation failed')}
          {isPending && (
            job.progress
              ? `${job.progress.processed.toLocaleString()} / ${job.progress.total.toLocaleString()} certificates`
              : job.status === 'running' ? 'Generating…' : 'Queued…'
          )}
        </p>
        {isPending && job.progress && (
          <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round(job.progress.processed / job.progress.total * 100))}%` }}
            />
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {formatDistanceToNow(new Date(job.submittedAt), { addSuffix: true })}
        </p>
        {isCompleted && job.downloadUrl && (
          <span className="inline-flex items-center gap-1 text-[11px] text-primary mt-1.5 font-medium">
            <Download className="w-3 h-3" />
            Click to download
          </span>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onClear(job.id); }}
        className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
        aria-label="Dismiss notification"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NotificationPanel({
  expanded,
  onOpenChange,
}: {
  expanded: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const {
    jobs,
    unseenCount,
    markAllSeen,
    clearJob,
    clearFinished,
    clearAll,
    requestNotificationPermission,
    notificationPermission,
  } = useJobNotifications();

  const [open, setOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside both the button and the dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
    if (next) markAllSeen();
  };

  const handleClose = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  const pendingCount = jobs.filter(j => j.status === 'queued' || j.status === 'running').length;
  const hasBadge = unseenCount > 0 || pendingCount > 0;
  const badgeCount = unseenCount || pendingCount;

  return (
    <>
      <div className="relative" ref={panelRef}>
        {/* Bell button */}
        <button
          onClick={handleToggle}
          className={cn(
            'relative flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium w-full transition-colors',
            expanded ? 'px-3' : 'justify-center',
            open
              ? 'text-primary bg-primary/8'
              : 'text-muted-foreground hover:text-primary hover:bg-muted/50',
          )}
          aria-label="Notifications"
          aria-expanded={open}
        >
          <span className="relative shrink-0">
            {pendingCount > 0 ? (
              <BellRing className="h-4.5 w-4.5" />
            ) : (
              <Bell className="h-4.5 w-4.5" />
            )}
            {hasBadge && (
              <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 bg-destructive text-[9px] text-white font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </span>
          {expanded && <span>Notifications</span>}
        </button>
      </div>

      {/* Dropdown — rendered via portal-style fixed positioning outside the sidebar */}
      {open && (
        <div
          ref={dropdownRef}
          className="fixed bottom-auto top-16 left-14 w-72 rounded-xl border border-border bg-background shadow-xl z-100 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Notifications</span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  {pendingCount} running
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {notificationPermission === 'default' && (
                <button
                  onClick={() => requestNotificationPermission()}
                  className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  Enable alerts
                </button>
              )}
              {notificationPermission === 'denied' && (
                <span className="text-[10px] text-muted-foreground/50">Alerts blocked</span>
              )}
              <button
                onClick={handleClose}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close notifications"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Job list */}
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 py-10 text-muted-foreground">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <FileCheck className="w-5 h-5 opacity-40" />
              </div>
              <p className="text-xs text-center text-muted-foreground/70">
                No generation jobs yet.
                <br />
                Jobs appear here when you generate certificates.
              </p>
            </div>
          ) : (
            <>
              <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
                {jobs.map(job => (
                  <JobItem
                    key={job.id}
                    job={job}
                    onClear={clearJob}
                    onClick={(j) => { setSelectedJob(j); setOpen(false); }}
                  />
                ))}
              </div>
              {/* Footer actions */}
              <div className="flex items-center justify-end gap-3 px-4 py-2.5 border-t border-border/60">
                {jobs.some(j => j.status === 'completed' || j.status === 'failed') && (
                  <button
                    onClick={clearFinished}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear finished
                  </button>
                )}
                <button
                  onClick={clearAll}
                  className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear all
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Detail modal */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          allJobs={jobs}
          onClose={() => setSelectedJob(null)}
          onClear={(id) => { clearJob(id); setSelectedJob(null); }}
          onSelect={(j) => setSelectedJob(j)}
        />
      )}
    </>
  );
}
