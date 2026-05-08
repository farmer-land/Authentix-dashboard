'use client';

/**
 * JOB NOTIFICATION CONTEXT
 *
 * Tracks background certificate generation jobs globally — persisted in
 * localStorage so state survives in-app navigation.
 *
 * Polling runs every 5 s for any queued/running job.  On completion,
 * a browser notification fires (if the user granted permission).
 *
 * Usage:
 *   1. Wrap the app in <JobNotificationProvider>.
 *   2. Call addJob(jobId, label) immediately after batchGenerate() returns.
 *   3. The bell badge and dropdown update automatically.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { api, ApiError } from '@/lib/api/client';
import { useOrgSlug } from '@/lib/org';

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BackgroundJob {
  id: string;
  label: string;
  submittedAt: string;
  status: JobStatus;
  totalCertificates?: number;
  downloadUrl?: string;
  error?: string;
  seen: boolean;
  /** Chunked progress — present while the job is still running large batches */
  progress?: { processed: number; total: number };
}

interface JobNotificationContextValue {
  jobs: BackgroundJob[];
  unseenCount: number;
  addJob: (jobId: string, label: string) => void;
  markAllSeen: () => void;
  clearJob: (jobId: string) => void;
  clearFinished: () => void;
  clearAll: () => void;
  requestNotificationPermission: () => Promise<boolean>;
  notificationPermission: NotificationPermission | 'unsupported';
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const STUCK_JOB_MS = 2 * 60 * 60 * 1000; // 2 hours — auto-expire queued jobs that never started
const POLL_INTERVAL_MS = 5000;

function storageKey(slug: string) {
  return `authentix_bg_jobs:${slug}`;
}

function loadJobs(slug: string): BackgroundJob[] {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BackgroundJob[];
    const ageCutoff = Date.now() - MAX_AGE_MS;
    const stuckCutoff = Date.now() - STUCK_JOB_MS;
    return parsed
      .filter(j => new Date(j.submittedAt).getTime() > ageCutoff)
      .map(j => {
        // Auto-expire jobs stuck queued/running for >2hrs — they'll never complete
        if (
          (j.status === 'queued' || j.status === 'running') &&
          new Date(j.submittedAt).getTime() < stuckCutoff
        ) {
          return { ...j, status: 'failed' as JobStatus, error: 'Job timed out — please try again.' };
        }
        return j;
      });
  } catch {
    return [];
  }
}

function saveJobs(slug: string, jobs: BackgroundJob[]) {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(jobs));
  } catch { /* localStorage unavailable */ }
}

// ── Context ───────────────────────────────────────────────────────────────────

const JobNotificationContext = createContext<JobNotificationContextValue | null>(null);

export function JobNotificationProvider({ children }: { children: React.ReactNode }) {
  const slug = useOrgSlug();
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');

  // Keep a stable ref so the polling interval always sees current state
  const jobsRef = useRef<BackgroundJob[]>([]);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  // Track open SSE connections per job id
  const sseRefs = useRef<Map<string, EventSource>>(new Map());

  // ── Hydrate from localStorage on mount (scoped to this org slug) ────────────
  useEffect(() => {
    setJobs(loadJobs(slug));
    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission('unsupported');
    }
  }, [slug]);

  // ── Persist whenever jobs change ────────────────────────────────────────────
  useEffect(() => {
    saveJobs(slug, jobs);
  }, [slug, jobs]);

  // ── Polling loop — runs once, reads jobsRef each tick ───────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      const pending = jobsRef.current.filter(
        j => j.status === 'queued' || j.status === 'running',
      );
      if (pending.length === 0) return;

      await Promise.allSettled(
        pending.map(async job => {
          try {
            const status = await api.certificates.pollJobStatus(job.id);

            // Always extract partial progress even while still running
            const rawResult = status.result as Record<string, unknown> | undefined;
            const partialProcessed = rawResult?.processed_so_far as number | undefined;
            const partialTotal = rawResult?.total as number | undefined;
            if (
              (status.status === 'queued' || status.status === 'running') &&
              partialProcessed !== undefined &&
              partialTotal !== undefined
            ) {
              setJobs(prev =>
                prev.map(j =>
                  j.id === job.id
                    ? { ...j, progress: { processed: partialProcessed, total: partialTotal } }
                    : j,
                ),
              );
              return;
            }

            if (status.status !== 'completed' && status.status !== 'failed') return;

            const totalCerts =
              status.result?.total_certificates ??
              status.result?.results?.reduce((s: number, r: Record<string, unknown>) => s + ((r.count as number) ?? 0), 0);
            const downloadUrl =
              status.result?.last_download_url ??
              status.result?.results?.[0]?.download_url ??
              undefined;

            setJobs(prev =>
              prev.map(j => {
                if (j.id !== job.id) return j;
                return {
                  ...j,
                  status: status.status as JobStatus,
                  totalCertificates: typeof totalCerts === 'number' ? totalCerts : undefined,
                  downloadUrl: downloadUrl ?? undefined,
                  error: status.error ?? undefined,
                  progress: undefined,
                  seen: false,
                };
              }),
            );

            // Fire browser notification
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              if (status.status === 'completed') {
                const count = typeof totalCerts === 'number' ? totalCerts : null;
                new Notification('Certificates Ready!', {
                  body: count
                    ? `${count} certificate${count !== 1 ? 's are' : ' is'} ready to download.`
                    : 'Your certificates are ready to download.',
                  icon: '/favicon.ico',
                  tag: `job-${job.id}`,
                });
              } else {
                new Notification('Generation Failed', {
                  body: status.error ?? 'Certificate generation failed. Please try again.',
                  icon: '/favicon.ico',
                  tag: `job-${job.id}`,
                });
              }
            }
          } catch (err) {
            // On session expiry, mark the job failed so polling stops instead of
            // hammering the backend with 401s every 5 seconds indefinitely.
            if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
              setJobs(prev =>
                prev.map(j =>
                  j.id === job.id
                    ? { ...j, status: 'failed' as JobStatus, error: 'Session expired — please refresh and sign in again.' }
                    : j,
                ),
              );
            }
            // All other errors are silently ignored — job will be retried next tick
          }
        }),
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []); // intentionally empty — reads jobsRef, not jobs

  // ── SSE connections — real-time updates (polling above is the fallback) ───────
  useEffect(() => {
    const pending = jobs.filter(j => j.status === 'queued' || j.status === 'running');
    const sses = sseRefs.current;

    // Open a connection for every new pending job
    for (const job of pending) {
      if (sses.has(job.id)) continue;

      const es = new EventSource(`/api/proxy/jobs/${job.id}/events`);
      sses.set(job.id, es);

      es.addEventListener('job_update', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as {
            status: string;
            result?: Record<string, unknown> | null;
            error?: string | null;
          };

          // Partial progress while still running
          const raw = data.result as Record<string, unknown> | undefined;
          const partialProcessed = raw?.processed_so_far as number | undefined;
          const partialTotal = raw?.total as number | undefined;
          if (
            (data.status === 'queued' || data.status === 'running') &&
            partialProcessed !== undefined && partialTotal !== undefined
          ) {
            setJobs(prev => prev.map(j =>
              j.id === job.id ? { ...j, progress: { processed: partialProcessed, total: partialTotal } } : j,
            ));
            return;
          }

          if (data.status !== 'completed' && data.status !== 'failed') return;

          const result = data.result as Record<string, unknown> | undefined;
          const totalCerts =
            result?.total_certificates ??
            (result?.results as Array<Record<string, unknown>> | undefined)?.reduce((s: number, r) => s + ((r.count as number) ?? 0), 0);
          const downloadUrl =
            (result?.last_download_url as string | undefined) ??
            ((result?.results as Array<Record<string, unknown>> | undefined)?.[0]?.download_url as string | undefined) ??
            undefined;

          setJobs(prev => prev.map(j => {
            if (j.id !== job.id) return j;
            return {
              ...j,
              status: data.status as JobStatus,
              totalCertificates: typeof totalCerts === 'number' ? totalCerts : undefined,
              downloadUrl: downloadUrl ?? undefined,
              error: data.error ?? undefined,
              progress: undefined,
              seen: false,
            };
          }));

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            if (data.status === 'completed') {
              const count = typeof totalCerts === 'number' ? totalCerts : null;
              new Notification('Certificates Ready!', {
                body: count
                  ? `${count} certificate${count !== 1 ? 's are' : ' is'} ready to download.`
                  : 'Your certificates are ready to download.',
                icon: '/favicon.ico',
                tag: `job-${job.id}`,
              });
            } else {
              new Notification('Generation Failed', {
                body: data.error ?? 'Certificate generation failed. Please try again.',
                icon: '/favicon.ico',
                tag: `job-${job.id}`,
              });
            }
          }
        } catch { /* ignore parse errors */ }
      });

      // SSE failed — close cleanly; the polling loop handles the rest
      es.onerror = () => { es.close(); sses.delete(job.id); };
    }

    // Close connections for jobs that are no longer pending
    for (const [jobId, es] of [...sses.entries()]) {
      const job = jobs.find(j => j.id === jobId);
      if (!job || job.status === 'completed' || job.status === 'failed') {
        es.close();
        sses.delete(jobId);
      }
    }
  }, [jobs]);

  // Cleanup all SSE connections on unmount
  useEffect(() => {
    const sses = sseRefs.current;
    return () => { for (const es of sses.values()) es.close(); sses.clear(); };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const addJob = useCallback((jobId: string, label: string) => {
    const newJob: BackgroundJob = {
      id: jobId,
      label,
      submittedAt: new Date().toISOString(),
      status: 'queued',
      seen: false,
    };
    setJobs(prev => [newJob, ...prev.filter(j => j.id !== jobId)]);
  }, []);

  const markAllSeen = useCallback(() => {
    setJobs(prev => prev.map(j => ({ ...j, seen: true })));
  }, []);

  const clearJob = useCallback((jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status === 'queued' || j.status === 'running'));
  }, []);

  const clearAll = useCallback(() => {
    setJobs([]);
  }, []);

  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (typeof Notification === 'undefined') return false;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission === 'granted';
  }, []);

  // Count jobs that the user hasn't seen yet (all statuses)
  const unseenCount = jobs.filter(j => !j.seen).length;

  return (
    <JobNotificationContext.Provider
      value={{
        jobs,
        unseenCount,
        addJob,
        markAllSeen,
        clearJob,
        clearFinished,
        clearAll,
        requestNotificationPermission,
        notificationPermission,
      }}
    >
      {children}
    </JobNotificationContext.Provider>
  );
}

export function useJobNotifications() {
  const ctx = useContext(JobNotificationContext);
  if (!ctx) throw new Error('useJobNotifications must be used inside JobNotificationProvider');
  return ctx;
}
