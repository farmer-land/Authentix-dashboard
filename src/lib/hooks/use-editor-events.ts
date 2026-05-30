'use client';

/**
 * useEditorEvents
 *
 * Lightweight event tracking hook for the certificate editor lifecycle.
 * Events are batched and flushed every 5 seconds (or on page unload) to
 * minimise API calls. Errors are silently swallowed — tracking must never
 * block the UX.
 *
 * The collected data is used to train AI models on design patterns and
 * generation flows.
 */

import { useCallback, useEffect, useRef } from 'react';
import { editorEventsApi, type EditorEvent } from '@/lib/api/dashboard';

const FLUSH_INTERVAL_MS = 5_000;
const MAX_QUEUE_SIZE = 50;

export type EditorEventType =
  | 'session_start'
  | 'template_selected'
  | 'batch_selected'
  | 'field_added'
  | 'field_moved'
  | 'field_resized'
  | 'field_deleted'
  | 'field_style_changed'
  | 'step_changed'
  | 'templates_saved'
  | 'recipients_set'
  | 'generation_started'
  | 'generation_completed';

interface TrackOptions {
  templateId?: string | null;
  templateVersionId?: string | null;
  data?: Record<string, unknown>;
}

export function useEditorEvents() {
  const sessionId = useRef<string>(crypto.randomUUID());
  const queue = useRef<EditorEvent[]>([]);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(async () => {
    if (queue.current.length === 0) return;
    const batch = queue.current.splice(0, queue.current.length);
    try {
      await editorEventsApi.track(batch);
    } catch {
      // Non-fatal — tracking must never surface errors to the user
    }
  }, []);

  // Periodic flush
  useEffect(() => {
    flushTimer.current = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
      // Flush synchronously on unmount (best-effort, may not complete before page closes)
      void flush();
    };
  }, [flush]);

  // Flush on page hide (tab switch / close)
  useEffect(() => {
    const onHide = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flush]);

  const track = useCallback((
    eventType: EditorEventType,
    { templateId, templateVersionId, data }: TrackOptions = {},
  ) => {
    queue.current.push({
      session_id: sessionId.current,
      template_id: templateId ?? null,
      template_version_id: templateVersionId ?? null,
      event_type: eventType,
      event_data: data ?? {},
      ts: new Date().toISOString(),
    });
    // Auto-flush if queue grows large (prevents unbounded memory use during long sessions)
    if (queue.current.length >= MAX_QUEUE_SIZE) void flush();
  }, [flush]);

  return { track, sessionId: sessionId.current };
}
