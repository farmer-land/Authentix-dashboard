'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { toast } from 'sonner';
import { useGenerateCertificateState } from './state/useGenerateCertificateState';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useOrgSlug } from '@/lib/org';
import { useOrganization } from '@/lib/hooks/queries/organizations';
import { CertificateField, CertificateTemplate, ImportedData, FieldMapping, FIELD_TYPE_CONFIG, FieldType } from '@/lib/types/certificate';
import { api, ApiError } from '@/lib/api/client';
import type { CertificateConfig } from './components/ExportSection';
import {
  Image as ImageIcon, FileText,
  CheckCircle2, Layers, Palette, Database, Wand2,
  X, Eye, ChevronRight,
  SlidersHorizontal, Maximize2,
  User, BookOpen, Calendar, Type, QrCode, AlertTriangle, RefreshCw,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TemplateBreadcrumb } from './components/TemplateBreadcrumb';
import { useEditorEvents } from '@/lib/hooks/use-editor-events';
import { FieldPropertiesGuide } from './components/FieldPropertiesGuide';

// Heavy components lazy-loaded to reduce initial bundle and speed up first render
const DesignLoadingOverlay = dynamic(() => import('./components/DesignLoadingOverlay').then(m => ({ default: m.DesignLoadingOverlay })), { ssr: false });
const CertificateCanvas  = dynamic(() => import('./components/CertificateCanvas').then(m => ({ default: m.CertificateCanvas })),  { ssr: false });
const InfiniteCanvas     = dynamic(() => import('./components/InfiniteCanvas').then(m => ({ default: m.InfiniteCanvas })),     { ssr: false });
const RightPanel         = dynamic(() => import('./components/RightPanel').then(m => ({ default: m.RightPanel })),         { ssr: false });
const TemplateSelector   = dynamic(() => import('./components/TemplateSelector').then(m => ({ default: m.TemplateSelector })),   { ssr: false });
const AssetLibrary       = dynamic(() => import('./components/AssetLibrary').then(m => ({ default: m.AssetLibrary })),       { ssr: false });
const DataSelector       = dynamic(() => import('./components/DataSelector').then(m => ({ default: m.DataSelector })),       { ssr: false });
const FieldTypeSelector  = dynamic(() => import('./components/FieldTypeSelector').then(m => ({ default: m.FieldTypeSelector })),  { ssr: false });
const FieldLayersList    = dynamic(() => import('./components/FieldLayersList').then(m => ({ default: m.FieldLayersList })),    { ssr: false });
const ExportSection      = dynamic(() => import('./components/ExportSection').then(m => ({ default: m.ExportSection })),      { ssr: false });
const CertificatePreview   = dynamic(() => import('./components/CertificatePreview').then(m => ({ default: m.CertificatePreview })),   { ssr: false });
const NotAvailableOverlay  = dynamic(() => import('./components/NotAvailableOverlay').then(m => ({ default: m.NotAvailableOverlay })),  { ssr: false });

// Module-level flag: survives client-side Next.js navigation (module cache), but is
// reset to false on a hard page reload (module re-evaluated). When the component
// unmounts due to client-side nav, cleanup sets this to true. On the next mount we
// know it was a client-side nav back (not a reload) and should show the resume banner
// instead of auto-restoring.
let gencertWasClientSideUnmounted = false;

// Generation counter: increments on unmount. loadSavedData captures the gen at
// call time and bails if it changed — prevents stale async results from rapid
// nav-away-and-back from clobbering fresh state on the new mount.
let loadSavedDataGen = 0;

export default function GenerateCertificatePage() {
  // Get query parameters
  const searchParams = useSearchParams();
  const templateIdFromUrl = searchParams.get('template');
  const importIdFromUrl = searchParams.get('import');
  const sourceRefFromUrl = searchParams.get('source_ref');
  const pathname = usePathname();
  const router = useRouter();
  const orgSlug = useOrgSlug();

  // Always up-to-date ref for currentStep — used in realtime callbacks to avoid stale closures
  const currentStepRef = useRef<string>('template');
  // Prevents the URL-param auto-select from re-firing when user deliberately goes back to template chooser
  const skipAutoSelectRef = useRef(false);
  // Tracks whether we've already loaded the ?import= param so we don't reload it repeatedly
  const importUrlLoadedRef = useRef(false);
  // Tracks whether we've already loaded the ?source_ref= param (contacts from delivery)
  const sourceRefLoadedRef = useRef(false);
  // Tracks whether we've pushed a history entry for the design step (for browser-back interception)
  const designHistoryPushedRef = useRef(false);
  // Always-fresh ref for loadSavedData so realtime callbacks never capture a stale version
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadSavedDataRef = useRef<(isInitialMount?: boolean) => Promise<void>>(null as any);

  const {
    template, savedTemplates, templateVersionId,
    fields, selectedFieldId, hiddenFields,
    importedData, savedImports, fieldMappings, additionalCertConfigs,
    templateMode, templateConfigs, activeTemplateIndex,
    recentGenerated, inProgressTemplates, recentLoading,
    canvasScale, currentStep, isTemplateLoading, activeTab, useInfiniteCanvas, libraryAssets,
    snapToGrid, fitTrigger,
    leftPanelVisible, leftPanelPos, rightPanelVisible,
    previewOpen, templateMeta,
    stepperExpanded,
    canUndo, canRedo, saveStatus, showNavGuard,
    setCurrentStep, setTemplate, setSavedTemplates, setIsTemplateLoading,
    setTemplateMeta, setPdfFile, setTemplateVersionId,
    setTemplateMode, setTemplateConfigs, setActiveTemplateIndex,
    setFields, setSelectedFieldId, setHiddenFields,
    setImportedData, setSavedImports, setFieldMappings, setAdditionalCertConfigs,
    setRecentGenerated, setInProgressTemplates, setRecentLoading,
    setCanUndo, setCanRedo, setSaveStatus,
    setCanvasScale, setActiveTab,
    setSnapToGrid, setFitTrigger,
    setLeftPanelVisible, setLeftPanelPos, setRightPanelVisible, setStepperExpanded,
    setPanelReady, setPreviewOpen, setLibraryAssets, setShowNavGuard,
  } = useGenerateCertificateState(templateIdFromUrl);

  const { organization } = useOrganization();
  const { track: trackEvent } = useEditorEvents();

  // Track session start once on mount
  useEffect(() => {
    trackEvent('session_start');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark when this component unmounts due to client-side navigation so the next
  // mount (navigate-back) knows to show the resume banner instead of auto-restoring.
  // Also increment the generation counter to invalidate any in-flight loadSavedData calls.
  useEffect(() => {
    // Do NOT reset the flag here — loadSavedData reads it first, then resets it.
    return () => { gencertWasClientSideUnmounted = true; loadSavedDataGen++; };
  }, []);

  // Track step navigation
  const prevStepRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevStepRef.current !== null && prevStepRef.current !== currentStep) {
      trackEvent('step_changed', {
        templateId: template?.id,
        templateVersionId: templateVersionId ?? undefined,
        data: { from: prevStepRef.current, to: currentStep },
      });
    }
    prevStepRef.current = currentStep;
    currentStepRef.current = currentStep;
    // When the user returns to the template chooser, clear any pending remote-change banner
    // and silently refresh so they always see fresh data
    if (currentStep === 'template') {
      setHasRemoteChanges(false);
    }
    // Immediately clear the design loading overlay when leaving the design step so it
    // never bleeds through onto the data/export views.
    if (currentStep !== 'design') {
      if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); overlayTimerRef.current = null; }
      setShowDesignOverlay(false);
    }
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed org logo as the first logo asset when the page loads and org logo is available
  useEffect(() => {
    const url = organization?.logo_url;
    if (!url) return;
    setLibraryAssets(prev => {
      if (prev.some(a => a.id === '__org_logo__')) return prev;
      return [{ id: '__org_logo__', name: (organization?.name ?? 'Org') + ' Logo', url, type: 'logo' as const }, ...prev];
    });
  }, [organization?.logo_url, organization?.name, setLibraryAssets]);

  // Manual entries appended after the uploaded file rows during generation
  const [additionalRows, setAdditionalRows] = useState<Record<string, unknown>[]>([]);
  // True when the active template was uploaded without a category — show a soft prompt in design view
  const [templateNeedsCategory, setTemplateNeedsCategory] = useState(false);
  // True until the first loadSavedData() completes — prevents step-1 skeleton flash on reload
  const [pageInitializing, setPageInitializing] = useState(true);
  // Set to true by realtime when template table changes while user is away from template chooser
  const [hasRemoteChanges, setHasRemoteChanges] = useState(false);

  // Design loading overlay: stay visible for at least 2.5 s after isTemplateLoading goes true,
  // ensuring the template image and all fields are fully rendered before the overlay disappears.
  const [showDesignOverlay, setShowDesignOverlay] = useState(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayStartRef = useRef<number>(0);
  useEffect(() => {
    if (isTemplateLoading) {
      if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); overlayTimerRef.current = null; }
      overlayStartRef.current = Date.now();
      setShowDesignOverlay(true);
    } else if (showDesignOverlay) {
      const elapsed = Date.now() - overlayStartRef.current;
      const remaining = Math.max(0, 2500 - elapsed);
      overlayTimerRef.current = setTimeout(() => setShowDesignOverlay(false), remaining);
    }
    return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTemplateLoading]);
  // Data-fields panel state
  const [addMoreOpen, setAddMoreOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);

  // Pending session restore — set when a saved session is found on load.
  // Null means no session to restore (or user dismissed it).
  const [pendingResumeSession, setPendingResumeSession] = useState<{
    templateId: string;
    templateName: string;
    fields: CertificateField[];
    canvasScale?: number;
    templateVersionId: string | null;
    currentStep: string | null;
    previewOpen?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    importedDataMeta: any;
    fieldMappings: FieldMapping[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additionalCertConfigs?: any[];
    // When true the session was found in sessionStorage (same-tab reload) and the
    // step is data/export — skip the banner and restore immediately.
    autoResume?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvedTemplates?: any[];
    categoryColor?: string | null;
    subcategoryColor?: string | null;
  } | null>(null);

  // Tracks previous field IDs so we can detect when field composition changes
  const prevFieldIdsRef = useRef<string>('');

  // Set to true when a resumed session's templateVersionId differs from the current DB version,
  // meaning the template image may have changed and field positions could be off.
  const [versionChangedWarning, setVersionChangedWarning] = useState(false);

  // Labels of image/QR-logo fields whose blob URLs were stripped on session restore.
  // Blob URLs are ephemeral and die when the page unloads — these images need re-uploading.
  const [imageLostFields, setImageLostFields] = useState<string[]>([]);

  // Timestamp of the most recent successful DB save — drives "Saved X min ago" indicator.
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Holds the latest doSave fn so the manual Save button can bypass the 1s debounce.
  const saveNowRef = useRef<(() => Promise<void>) | null>(null);

  // Written by handleTemplateSelect after fetching editor data so handleResumeSession
  // can compare session version vs current version without an extra API call.
  const lastLoadedVersionIdRef = useRef<string | null>(null);

  // Cancellation ref for parallel multi-select loads
  const multiSelectRequestRef = useRef(0);

  const leftPanelDragOrigin = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // True after the user makes any field edit; prevents autosave from firing on initial load
  // and ensures deleting all fields saves an empty list (not skipped by fields.length === 0).
  const fieldsDirtyRef = useRef(false);

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const historyRef = useRef<CertificateField[][]>([]);
  const futureRef  = useRef<CertificateField[][]>([]);
  // Groups rapid property edits into one history entry per quiet window (500ms)
  const updateGroupRef = useRef<{ fieldId: string | null; pushed: boolean; timer: ReturnType<typeof setTimeout> | null }>({ fieldId: null, pushed: false, timer: null });

  const pushToHistory = useCallback((snapshot: CertificateField[]) => {
    historyRef.current = [...historyRef.current.slice(-49), snapshot];
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1] ?? [];
    futureRef.current = [fields, ...futureRef.current.slice(0, 49)];
    historyRef.current = historyRef.current.slice(0, -1);
    setFields(prev);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[0] ?? [];
    historyRef.current = [...historyRef.current, fields];
    futureRef.current = futureRef.current.slice(1);
    setFields(next);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  // ⌘Z / Ctrl+Z → undo, ⌘⇧Z / Ctrl+Y / Ctrl+Shift+Z → redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  // Template resize tracking — used to scale fields proportionally
  const templateResizeOrigin = useRef<{ w: number; h: number; fields: CertificateField[] }>({ w: 0, h: 0, fields: [] });

  // Race-condition guard: cancel stale handleTemplateSelect calls
  const selectRequestRef = useRef(0);
  const isResumingRef = useRef(false);
  // Captures the fields that were just loaded by handleTemplateSelect so that
  // handleResumeSession can auto-map without relying on stale React state.
  const loadedFieldsRef = useRef<CertificateField[]>([]);

  // ── Session persistence ────────────────────────────────────────────────────
  // NOTE: We intentionally do NOT clear sessionStorage on unmount.
  // On a same-tab reload (F5/Cmd+R), React's cleanup fires before the new page
  // reads the session — clearing here would wipe it, causing the step to fall back
  // to 'data' via the localStorage path regardless of where the user actually was.
  // Sessions are cleared explicitly in the right places:
  //   - line below (currentStep === 'template' branch) when user resets to chooser
  //   - resume banner dismiss handler when user explicitly declines restore
  //   - template-not-found guard when the template was deleted

  // Track whether initial mount has passed so we don't wipe the session on first render.
  const sessionInitRef = useRef(false);

  useEffect(() => {
    if (template?.id && (currentStep === 'design' || currentStep === 'data' || currentStep === 'export')) {
      sessionInitRef.current = true; // session is now actively managed
      // Persist to sessionStorage for quick same-tab restore
      try {
        const importedDataMeta = importedData ? {
          fileName: importedData.fileName,
          headers: importedData.headers,
          rowCount: importedData.rowCount,
          importId: importedData.importId,
          importIds: importedData.importIds,
          // For manual entries (no server-backed importId), save the rows directly so
          // they survive a same-tab reload without requiring the user to re-enter data.
          rows: !importedData.importId ? importedData.rows : undefined,
        } : null;
        // Serialize additionalCertConfigs — strip blob: image URLs (ephemeral) just like fields.
        const persistedAdditionalConfigs = additionalCertConfigs.map(cfg => ({
          ...cfg,
          fields: cfg.fields.map(f => ({
            ...f,
            imageUrl: f.imageUrl?.startsWith('blob:') ? undefined : f.imageUrl,
            qrLogoUrl: f.qrLogoUrl?.startsWith('blob:') ? undefined : f.qrLogoUrl,
          })),
        }));
        sessionStorage.setItem(`gencert_session:${orgSlug}`, JSON.stringify({
          templateId: template.id,
          fields,
          canvasScale,
          templateVersionId,
          currentStep,
          previewOpen,
          importedDataMeta,
          fieldMappings,
          additionalCertConfigs: persistedAdditionalConfigs,
          categoryColor: templateMeta.categoryColor ?? null,
          subcategoryColor: templateMeta.subcategoryColor ?? null,
          savedAt: Date.now(),
        }));
      } catch { /* quota exceeded */ }
      // Persist template ID to localStorage so it survives browser close / system shutdown.
      try {
        localStorage.setItem(`gencert_last_template_id:${orgSlug}`, template.id);
      } catch { /* storage unavailable */ }
      // Persist import draft to localStorage so the import can be re-fetched from the server
      // after a browser close. Only saved when there's a server-backed importId to restore from.
      try {
        if (importedData?.importId) {
          localStorage.setItem(`gencert_draft:${orgSlug}`, JSON.stringify({
            templateId: template.id,
            importId: importedData.importId,
            importIds: importedData.importIds ?? [importedData.importId],
            fieldMappings,
            fileName: importedData.fileName,
            headers: importedData.headers,
            rowCount: importedData.rowCount,
            savedAt: Date.now(),
          }));
        }
      } catch { /* quota */ }
    } else if (currentStep === 'template' && sessionInitRef.current) {
      // Only clear when the user deliberately navigates back to template selection,
      // not on the initial mount where currentStep starts as 'template'.
      sessionStorage.removeItem(`gencert_session:${orgSlug}`);
      try { localStorage.removeItem(`gencert_draft:${orgSlug}`); } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, template?.id, fields, canvasScale, templateVersionId, previewOpen, importedData, fieldMappings, additionalCertConfigs, templateMeta]);

  // Re-run auto-mapping whenever the field composition changes (IDs added/removed).
  // Preserves mappings the user already set; only adds mappings for new fields and
  // removes stale entries for deleted fields.
  useEffect(() => {
    const currentIds = fields.map(f => f.id).sort().join(',');
    if (prevFieldIdsRef.current && prevFieldIdsRef.current !== currentIds && importedData) {
      const allFields = templateMode === 'multi' && templateConfigs.length > 0
        ? templateConfigs.map((c, i) => i === activeTemplateIndex ? fields : c.fields).flat()
        : fields;
      const currentFieldIdSet = new Set(allFields.map(f => f.id));
      // Keep valid existing mappings; drop stale ones (for deleted fields)
      const validExisting = fieldMappings.filter(m => currentFieldIdSet.has(m.fieldId));
      const alreadyMappedIds = new Set(validExisting.map(m => m.fieldId));
      // Auto-map only newly added fields that have no mapping yet
      const unmapped = allFields.filter(
        f => f.type !== 'qr_code' && f.type !== 'image' && !alreadyMappedIds.has(f.id)
      );
      const newMappings = autoMapColumns(unmapped, importedData.headers);
      setFieldMappings([...validExisting, ...newMappings]);
    }
    prevFieldIdsRef.current = currentIds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  // Reset right-panel position when a new template is loaded or preview opens/closes
  useEffect(() => {
    setPanelReady(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, previewOpen]);

  // ── Auto-load ?import=ID when template is ready ───────────────────────────────
  // Triggered once per page load: when a template finishes loading AND an import
  // ID was passed in the URL (e.g. from the Imports page "Generate" button).
  useEffect(() => {
    if (
      importIdFromUrl &&
      !importUrlLoadedRef.current &&
      template?.id &&
      !isTemplateLoading &&
      !importedData
    ) {
      importUrlLoadedRef.current = true;
      handleLoadImport(importIdFromUrl).catch(() => {
        // Silent — DataSelector will show the empty upload state as fallback
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importIdFromUrl, template?.id, isTemplateLoading, importedData]);

  // ── Auto-load ?source_ref= contacts when template is ready ──────────────────
  // Contacts were imported from the Contacts page — fetch them by source_ref and
  // silently pre-populate the data step. We stay on 'design' so the user can
  // review / edit the template before moving to field mapping.
  useEffect(() => {
    if (
      sourceRefFromUrl &&
      !sourceRefLoadedRef.current &&
      !importIdFromUrl &&
      template?.id &&
      !isTemplateLoading &&
      !importedData
    ) {
      sourceRefLoadedRef.current = true;
      api.delivery.listContacts({ source_ref: sourceRefFromUrl, limit: 500 }).then(({ contacts }) => {
        if (contacts.length === 0) return;

        // Flatten contact records into plain row objects
        const rows = contacts.map((c) => {
          const props = (c.custom_properties as Record<string, unknown>) ?? {};
          return {
            email: c.email ?? '',
            first_name: c.first_name ?? '',
            last_name: c.last_name ?? '',
            ...Object.fromEntries(Object.entries(props).map(([k, v]) => [k, String(v ?? '')])),
          } as unknown as Record<string, string>;
        });
        const headers = Object.keys(rows[0]!);

        handleDataImport({
          fileName: 'Contacts import',
          headers,
          rows,
          rowCount: rows.length,
          importId: undefined,
          importIds: [],
        });

        // Stay on the current step — contacts are pre-loaded in the background.
        // The user can review the template design first, then navigate to Data.
        toast.success(`${rows.length.toLocaleString()} contacts pre-loaded`, {
          description: 'When you\'re ready, go to the Data step to map fields and generate.',
        });
      }).catch(() => {
        // Silent — DataSelector will show the empty upload state as fallback
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceRefFromUrl, template?.id, isTemplateLoading, importedData]);

  // ── Refresh guard: design step with no template → go back to template chooser ──
  useEffect(() => {
    if (currentStep === 'design' && !template && !isTemplateLoading && !templateIdFromUrl) {
      setCurrentStep('template');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, template, isTemplateLoading, templateIdFromUrl]);

  // ── Browser-back interception ───────────────────────────────────────────────
  // Push a history entry when entering the design step so the back button stays
  // inside this page (template chooser) instead of leaving to the analytics page.
  useEffect(() => {
    if (currentStep === 'design' && !designHistoryPushedRef.current) {
      designHistoryPushedRef.current = true;
      history.pushState({ gencertStep: 'design' }, '');
    }
    if (currentStep === 'template') {
      designHistoryPushedRef.current = false;
    }
  }, [currentStep]);

  useEffect(() => {
    const onPopState = () => {
      if (currentStep === 'design') {
        if (fields.length > 0) {
          // Show nav guard and re-push so pressing back again doesn't escape the app
          setShowNavGuard(true);
          history.pushState({ gencertStep: 'design' }, '');
        } else {
          skipAutoSelectRef.current = true;
          selectRequestRef.current++;
          setTemplate(null);
          setFields([]);
          setSelectedFieldId(null);
          setPanelReady(false);
          router.replace(pathname);
          setCurrentStep('template');
        }
      } else if (currentStep === 'data') {
        setCurrentStep('design');
        setFitTrigger(t => t + 1);
        history.pushState({ gencertStep: 'design' }, '');
      } else if (currentStep === 'export') {
        setCurrentStep('data');
        history.pushState({ gencertStep: 'data' }, '');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, fields.length, pathname]);

  // Load saved templates and imports
  useEffect(() => {
    // Read and consume the client-side-nav flag BEFORE any async work so no
    // other effect can reset it underneath us. This is the only safe read point.
    const wasClientSideNavBack = gencertWasClientSideUnmounted;
    gencertWasClientSideUnmounted = false; // consumed — reset for the next unmount cycle

    // Use a window-level flag (survives HMR module re-evaluation, unlike module-level variables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isInitialMount = !(window as any).__gencertInitialLoadDone;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__gencertInitialLoadDone = true;
    loadSavedData(isInitialMount, wasClientSideNavBack);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: watch certificate_templates table for remote changes
  useEffect(() => {
    if (!organization?.id) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`cert-templates:${organization.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'certificate_templates',
          filter: `organization_id=eq.${organization.id}`,
        },
        () => {
          // If on template chooser, silently refresh list; elsewhere show CTA
          if (currentStepRef.current === 'template') {
            loadSavedDataRef.current?.(false);
          } else {
            setHasRemoteChanges(true);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const loadSavedData = async (_isInitialMount = false, isClientSideNavBack = false) => {
    // Capture generation at call time — if this component unmounts while we're async,
    // the gen will have incremented and we bail before touching any state.
    const gen = loadSavedDataGen;
    try {
      // Load templates and recent usage in parallel
      const [templatesResponse, recentUsageResponse] = await Promise.all([
        api.templates.list({ sort_by: 'created_at', sort_order: 'desc' }),
        api.templates.getRecentUsage(10).catch((error) => {
          console.warn('[Generate] Error loading recent usage:', error);
          return { recent_generated: [], in_progress: [] };
        }),
      ]);

      const templatesData = templatesResponse.items || [];

      // Get preview URLs for templates (with graceful error handling)
      const templatesWithSignedUrls = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        templatesData.map(async (template: any) => {
          if (template.id) {
            try {
              const previewUrl = await api.templates.getPreviewUrl(template.id);
              return { ...template, preview_url: previewUrl };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
              // Gracefully handle missing preview - template can still be used
              console.warn('[Generate] Preview not available for template:', template.id, error?.message || error);
              // Return template without preview_url - it will use source file as fallback
              return template;
            }
          }
          return template;
        })
      );

      // Bail if component unmounted while we were fetching
      if (gen !== loadSavedDataGen) return;

      console.log('[Generate] Templates with signed URLs:', templatesWithSignedUrls.length);
      setSavedTemplates(templatesWithSignedUrls);

      // Set recent usage data
      setRecentGenerated(recentUsageResponse.recent_generated || []);
      setInProgressTemplates(recentUsageResponse.in_progress || []);
      setRecentLoading(false);
      console.log('[Generate] Recent usage loaded:', {
        generated: recentUsageResponse.recent_generated?.length || 0,
        inProgress: recentUsageResponse.in_progress?.length || 0,
      });

      // Load imports (remove status filter - backend handles filtering)
      try {
      const importsResponse = await api.imports.list({ sort_by: 'created_at', sort_order: 'desc', limit: 5 });
      setSavedImports(importsResponse.items || []);
      } catch (error) {
        console.warn('[Generate] Error loading imports:', error);
        // Continue without imports - user can still proceed
        setSavedImports([]);
      }

      // ── Restore last design session ──────────────────────────────────────────
      // Prefer sessionStorage (has full field snapshot for same-tab refresh).
      // Fall back to localStorage (survives browser close / system shutdown).
      // In both cases fields are also in the DB via autosave, so loading from DB
      // is the ground-truth restore path.
      if (!new URLSearchParams(window.location.search).get('template')) {
        // Session expiry thresholds
        const SESSION_TTL_MS = 30 * 60 * 1000;  // 30 min — sessionStorage
        const DRAFT_TTL_MS   =  8 * 60 * 60 * 1000; // 8 h — localStorage draft

        // isClientSideNavBack is passed from the effect that read gencertWasClientSideUnmounted
        // before any other effect could reset it. This correctly distinguishes a client-side
        // nav-back (Settings → Playground) from a true browser reload (F5/Cmd+R).
        const navEntry = (performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined);
        const isPageReload = !isClientSideNavBack && navEntry?.type === 'reload';

        let templateIdToRestore: string | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sessionFields: any[] | null = null;
        let sessionScale: number | undefined;
        let sessionVersionId: string | null = null;
        let sessionStep: string | null = null;
        let sessionImportMeta: { fileName: string; headers: string[]; rowCount: number; importId?: string; importIds?: string[]; rows?: Record<string, unknown>[] } | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sessionFieldMappings: any[] | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sessionAdditionalCertConfigs: any[] | null = null;
        let sessionCategoryColor: string | null = null;
        let sessionSubcategoryColor: string | null = null;
        // True when the session came from sessionStorage (not localStorage draft)
        let restoredFromSessionStorage = false;

        try {
          const saved = sessionStorage.getItem(`gencert_session:${orgSlug}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            // Expire old sessions so stale state isn't silently restored after a long break
            const sessionAge = parsed.savedAt ? Date.now() - (parsed.savedAt as number) : 0;
            if (sessionAge > SESSION_TTL_MS) {
              sessionStorage.removeItem(`gencert_session:${orgSlug}`);
            } else {
              templateIdToRestore = parsed.templateId ?? null;
              sessionFields = parsed.fields ?? null;
              sessionScale = parsed.canvasScale;
              sessionVersionId = parsed.templateVersionId ?? null;
              sessionStep = parsed.currentStep ?? null;
              sessionImportMeta = parsed.importedDataMeta ?? null;
              sessionFieldMappings = parsed.fieldMappings ?? null;
              sessionAdditionalCertConfigs = parsed.additionalCertConfigs ?? null;
              sessionCategoryColor = parsed.categoryColor ?? null;
              sessionSubcategoryColor = parsed.subcategoryColor ?? null;
              restoredFromSessionStorage = true;
            }
          }
        } catch {
          sessionStorage.removeItem(`gencert_session:${orgSlug}`);
        }

        // localStorage fallback: recover the import after a browser close.
        // sessionStorage is cleared on browser close; localStorage persists.
        // Fields are recovered from the DB (via autosave) — we only need the importId.
        // Always show a banner for localStorage restores (user must confirm).
        if (!templateIdToRestore) {
          try {
            const draftStr = localStorage.getItem(`gencert_draft:${orgSlug}`);
            if (draftStr) {
              const draft = JSON.parse(draftStr);
              const draftAge = draft.savedAt ? Date.now() - (draft.savedAt as number) : 0;
              if (draftAge > DRAFT_TTL_MS) {
                localStorage.removeItem(`gencert_draft:${orgSlug}`);
              } else if (draft.templateId && draft.importId) {
                templateIdToRestore = draft.templateId;
                sessionImportMeta = {
                  fileName: draft.fileName ?? 'Previous import',
                  headers: draft.headers ?? [],
                  rowCount: draft.rowCount ?? 0,
                  importId: draft.importId,
                  importIds: draft.importIds ?? [draft.importId],
                };
                sessionFieldMappings = draft.fieldMappings ?? null;
                sessionStep = 'data'; // jump directly to data step on restore
              }
            }
          } catch {
            try { localStorage.removeItem(`gencert_draft:${orgSlug}`); } catch { /* ignore */ }
          }
        }

        if (templateIdToRestore) {
          // Guard: if the template no longer exists (deleted), discard the stale session.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const templateObj = templatesWithSignedUrls.find((t: any) => t.id === templateIdToRestore);
          if (!templateObj) {
            sessionStorage.removeItem(`gencert_session:${orgSlug}`);
            try { localStorage.removeItem(`gencert_last_template_id:${orgSlug}`); } catch { /* ignore */ }
            try { localStorage.removeItem(`gencert_draft:${orgSlug}`); } catch { /* ignore */ }
          } else try {
            // autoResume: skip the banner and restore directly when the user reloaded the
            // page (F5/Cmd+R) with a fresh sessionStorage session — so they land back on
            // the exact step they were on. For client-side navigation back (switching
            // sections and returning), always show the banner so the user can choose.
            // localStorage drafts always show the banner regardless of reload.
            const autoResume = isPageReload && restoredFromSessionStorage;
            setPendingResumeSession({
              templateId: templateIdToRestore!,
              templateName: templateObj.title || templateObj.name || 'Previous session',
              fields: sessionFields ?? [],
              canvasScale: sessionScale,
              templateVersionId: sessionVersionId,
              currentStep: sessionStep,
              importedDataMeta: sessionImportMeta,
              fieldMappings: sessionFieldMappings ?? [],
              additionalCertConfigs: sessionAdditionalCertConfigs ?? undefined,
              autoResume,
              resolvedTemplates: templatesWithSignedUrls,
              categoryColor: sessionCategoryColor,
              subcategoryColor: sessionSubcategoryColor,
            });
          } catch {
            setIsTemplateLoading(false);
            setCurrentStep('template');
          }
        }
      }
    } catch (error) {
      console.error('[Generate] Error loading saved data:', error);
      setRecentLoading(false);
    } finally {
      setPageInitializing(false);
    }
  };
  // Keep ref always pointing to the latest version (for realtime callbacks)
  loadSavedDataRef.current = loadSavedData;

  // Auto-select template from URL parameter
  useEffect(() => {
    // Skip if the user deliberately navigated back to the template chooser
    if (skipAutoSelectRef.current) {
      skipAutoSelectRef.current = false;
      return;
    }
    if (templateIdFromUrl && savedTemplates.length > 0 && !template) {
      const templateToSelect = savedTemplates.find((t) => t.id === templateIdFromUrl);
      if (templateToSelect) {
        handleTemplateSelectSafe(templateToSelect);
      } else {
        // Template not found — reset so the user sees the chooser instead of eternal skeleton
        setIsTemplateLoading(false);
        setCurrentStep('template');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateIdFromUrl, savedTemplates, template]);

  // Handler for selecting a recent template (with or without loading fields)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRecentTemplateSelect = async (recentTemplate: any, loadFields: boolean) => {
    // Find the corresponding saved template
    let templateToSelect = savedTemplates.find((t) => t.id === recentTemplate.template_id);

    // If not found in saved templates, create a minimal template object from recent data
    if (!templateToSelect) {
      templateToSelect = {
        id: recentTemplate.template_id,
        name: recentTemplate.template_title,
        preview_url: recentTemplate.preview_url,
        category_name: recentTemplate.category_name,
        subcategory_name: recentTemplate.subcategory_name,
      };
    }

    // Load the template
    await handleTemplateSelectSafe(templateToSelect);

    // If loadFields is true and we have fields from recent usage, use them
    if (loadFields && recentTemplate.fields && recentTemplate.fields.length > 0) {
      const mappedFields = recentTemplate.fields.map(mapDbFieldToFrontend);
      setFields(mappedFields);
    }

    // If it's in-progress, set the version ID
    if (recentTemplate.template_version_id) {
      setTemplateVersionId(recentTemplate.template_version_id);
    }
  };

  // Handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleTemplateSelect = async (selectedTemplate: any) => {
    // Increment request ID — any previous in-flight call will see a stale ID and bail out
    const requestId = ++selectRequestRef.current;

    // Navigate to design immediately so the user isn't stuck on the template chooser
    // while API calls load the template data. Suppressed during auto-resume (isResumingRef)
    // so the session's saved step is applied directly without visible intermediate transitions.
    // IMPORTANT: setShowDesignOverlay must fire in the same React batch as setCurrentStep
    // so the overlay is already present on the very first design-step render (no 1-frame flash).
    if (!isResumingRef.current) {
      setShowDesignOverlay(true);
      overlayStartRef.current = Date.now();
      setCurrentStep('design');
    }
    setIsTemplateLoading(true);

    // Reset state for new template to prevent stale data
    fieldsDirtyRef.current = false;
    setTemplate(null);
    setFields([]);
    setSelectedFieldId(null);
    setTemplateVersionId(null);
    // Clear import data and mappings — old field IDs won't match the new template.
    // Skip during session resume, which restores compatible state from the same template.
    if (!isResumingRef.current) {
      setImportedData(null);
      setFieldMappings([]);
    }

    let fileUrl = selectedTemplate.preview_url;

    // Get editor data to access source_file with mime_type
    let editorData = null;
    if (selectedTemplate.id) {
      try {
        editorData = await api.templates.getEditorData(selectedTemplate.id);
        // Use source_file URL if available, otherwise get preview URL
        if (editorData.source_file?.url) {
          fileUrl = editorData.source_file.url;
        } else {
          try {
          const previewUrl = await api.templates.getPreviewUrl(selectedTemplate.id);
          fileUrl = previewUrl;
          } catch (previewError) {
            console.warn('Preview URL not available, will use source file:', previewError);
            // Continue - will use source file from editor data
          }
        }
      } catch (error) {
        console.warn('Error fetching template editor data:', error);
        // Fallback to preview URL if available
        if (selectedTemplate.preview_url) {
          fileUrl = selectedTemplate.preview_url;
        } else {
        try {
          const previewUrl = await api.templates.getPreviewUrl(selectedTemplate.id);
          fileUrl = previewUrl;
        } catch (previewError) {
            console.warn('Preview URL not available:', previewError);
            // Continue without preview - user will need to upload or select different template
          }
        }
      }
    }

    let pdfWidth = selectedTemplate.width;
    let pdfHeight = selectedTemplate.height;

    // If dimensions are missing, calculate them
    if (!pdfWidth || !pdfHeight) {
        if (!fileUrl) {
            // No file URL available, use defaults
            pdfWidth = 800;
            pdfHeight = 600;
        } else
        try {
            console.log("Template missing dimensions, calculating...");
            const response = await fetch(fileUrl);
            const blob = await response.blob();

            const img = new Image();
            const objectUrl = URL.createObjectURL(blob);
            await new Promise((resolve, reject) => {
              img.onload = () => { pdfWidth = img.naturalWidth; pdfHeight = img.naturalHeight; resolve(true); };
              img.onerror = reject;
              img.src = objectUrl;
            });
            URL.revokeObjectURL(objectUrl);

            // Note: Dimensions are not stored on template in new schema
            // They're calculated from the source file when needed
            // We skip the update to avoid errors

        } catch (e) {
            console.error("Failed to extract dimensions", e);
            pdfWidth = 800;
            pdfHeight = 600;
        }
    }

    const fileType = 'image';

    // Store version ID for autosave; expose via ref for session restore comparison.
    // Fall back to template_version_id from the template list if getEditorData failed
    // (e.g. source_file missing but version exists) so saves are never silently skipped.
    const resolvedVersionId =
      editorData?.version?.id ?? selectedTemplate.template_version_id ?? null;
    if (resolvedVersionId) {
      setTemplateVersionId(resolvedVersionId);
      lastLoadedVersionIdRef.current = resolvedVersionId;
    } else {
      lastLoadedVersionIdRef.current = null;
    }

    // Map backend fields from DB — always use editorData (authoritative).
    // Never fall back to selectedTemplate.fields: it may contain stale or pre-seeded data
    // in an incompatible format, causing ghost/duplicate fields in the layers panel.
    const mappedFields = (editorData?.fields ?? []).map(mapDbFieldToFrontend);

    // If the user already clicked a different template, discard this result
    if (selectRequestRef.current !== requestId) { setIsTemplateLoading(false); return; }

    setTemplate({
      id: selectedTemplate.id,
      templateName: selectedTemplate.title || selectedTemplate.name,
      fileUrl,
      fileType,
      pdfWidth: pdfWidth || 800,
      pdfHeight: pdfHeight || 600,
      fields: mappedFields,
    });
    const editorCategories = editorData?.categories ?? [];
    const primaryCat = editorCategories.find((c: { is_primary: boolean }) => c.is_primary) ?? editorCategories[0];
    setTemplateMeta({
      category: selectedTemplate.category_name || primaryCat?.category_name || editorData?.template?.category?.name || '',
      subcategory: selectedTemplate.subcategory_name || primaryCat?.subcategory_name || editorData?.template?.subcategory?.name || '',
      categoryId: selectedTemplate.category_id || primaryCat?.category_id || editorData?.template?.category_id || undefined,
      subcategoryId: selectedTemplate.subcategory_id || primaryCat?.subcategory_id || editorData?.template?.subcategory_id || undefined,
      categories: editorCategories.map((c: { id: string; category_id: string; category_name: string; subcategory_id: string | null; subcategory_name: string | null; is_primary: boolean }) => ({
        id: c.id,
        categoryId: c.category_id,
        categoryName: c.category_name,
        subcategoryId: c.subcategory_id,
        subcategoryName: c.subcategory_name,
        isPrimary: c.is_primary,
      })),
    });
    setFields(mappedFields);
    loadedFieldsRef.current = mappedFields;
    setIsTemplateLoading(false);
    // Fit new template to canvas — but not during session restore (which restores a saved scale).
    if (!isResumingRef.current) {
      setFitTrigger(t => t + 1);
    }

    trackEvent('template_selected', {
      templateId: selectedTemplate.id,
      templateVersionId: resolvedVersionId ?? undefined,
      data: {
        template_name: selectedTemplate.title || selectedTemplate.name,
        existing_fields: mappedFields.length,
      },
    });
  };

  // Safety net: if handleTemplateSelect ever throws without resetting isTemplateLoading,
  // the user would be stuck on the skeleton forever. This wrapper ensures cleanup always happens.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleTemplateSelectSafe = async (selectedTemplate: any) => {
    try {
      await handleTemplateSelect(selectedTemplate);
    } catch (err) {
      console.error('[Generate] handleTemplateSelect failed:', err);
      setIsTemplateLoading(false);
      setCurrentStep('template');
      throw err;
    }
  };

  // Load one template's data (fields + file URL + correct dimensions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadTemplateData = async (t: any): Promise<{ template: CertificateTemplate; fields: CertificateField[]; versionId: string | null }> => {
    try {
      const editorData = await api.templates.getEditorData(t.id);
      let fileUrl: string = editorData?.source_file?.url || t.preview_url || '';
      const fileType = 'image';
      const mappedFields: CertificateField[] = (editorData?.fields ?? []).map(mapDbFieldToFrontend);

      let pdfWidth: number = t.width || 0;
      let pdfHeight: number = t.height || 0;

      if ((!pdfWidth || !pdfHeight) && fileUrl) {
        try {
          const response = await fetch(fileUrl);
          const blob = await response.blob();
          const img = new Image();
          const objectUrl = URL.createObjectURL(blob);
          await new Promise((resolve) => {
            img.onload = () => { pdfWidth = img.naturalWidth; pdfHeight = img.naturalHeight; URL.revokeObjectURL(objectUrl); resolve(true); };
            img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(false); };
            img.src = objectUrl;
          });
        } catch {
          pdfWidth = pdfWidth || 794;
          pdfHeight = pdfHeight || 1123;
        }
      }

      const tmpl: CertificateTemplate = {
        id: t.id,
        templateName: t.title || t.name,
        fileUrl,
        fileType,
        pdfWidth: pdfWidth || 794,
        pdfHeight: pdfHeight || 1123,
        fields: mappedFields,
      };
      return { template: tmpl, fields: mappedFields, versionId: editorData?.version?.id || null };
    } catch {
      return {
        template: {
          id: t.id,
          templateName: t.title || t.name,
          fileUrl: t.preview_url || '',
          fileType: 'image' as const,
          pdfWidth: t.width || 794,
          pdfHeight: t.height || 1123,
          fields: [],
        },
        fields: [],
        versionId: null,
      };
    }
  };

  // Resume a pending session that was found in sessionStorage on load.
  const handleResumeSession = async () => {
    if (!pendingResumeSession) return;
    const session = pendingResumeSession;
    setPendingResumeSession(null);

    // Prefer resolvedTemplates (fresh from API, set at session-detect time) to avoid
    // stale-state reads when auto-resuming before the first savedTemplates re-render.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templatePool: any[] = session.resolvedTemplates ?? savedTemplates;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateObj = templatePool.find((t: any) => t.id === session.templateId);
    if (!templateObj) return;

    lastLoadedVersionIdRef.current = null;
    isResumingRef.current = true;
    await handleTemplateSelectSafe(templateObj);
    isResumingRef.current = false;
    const currentVersionId = lastLoadedVersionIdRef.current;

    // Restore category/subcategory colors — handleTemplateSelectSafe sets templateMeta without
    // colors, so we patch them back in here using the session-persisted values.
    if (session.categoryColor != null || session.subcategoryColor != null) {
      setTemplateMeta({
        category: templateObj.category_name || templateObj.certificate_category || '',
        subcategory: templateObj.subcategory_name || templateObj.certificate_subcategory || '',
        categoryId: templateObj.category_id || undefined,
        subcategoryId: templateObj.subcategory_id || undefined,
        categoryColor: session.categoryColor ?? null,
        subcategoryColor: session.subcategoryColor ?? null,
      });
    }

    // Detect template image change: if both versions are known and differ, warn the user.
    // Field positions are pixel-absolute, so a different image (possibly different dimensions)
    // means every field could be misaligned.
    const versionMismatch =
      session.templateVersionId !== null &&
      currentVersionId !== null &&
      session.templateVersionId !== currentVersionId;
    if (versionMismatch) setVersionChangedWarning(true);

    // Do NOT restore the stale session version — handleTemplateSelect already set the correct
    // current version from the DB. Fall back to session version only if the DB fetch failed.
    if (!currentVersionId && session.templateVersionId) {
      setTemplateVersionId(session.templateVersionId);
    }

    if (session.fields.length > 0) {
      const lostLabels: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sanitized = session.fields.map((f: any) => {
        const imageLost = f.imageUrl?.startsWith('blob:');
        const qrLogoLost = f.qrLogoUrl?.startsWith('blob:');
        if (imageLost || qrLogoLost) lostLabels.push(f.label || 'Unnamed field');
        return {
          ...f,
          imageUrl: imageLost ? undefined : f.imageUrl,
          qrLogoUrl: qrLogoLost ? undefined : f.qrLogoUrl,
        };
      });
      setFields(sanitized);
      if (lostLabels.length > 0) setImageLostFields(lostLabels);
    }
    if (session.canvasScale) setCanvasScale(session.canvasScale);

    const meta = session.importedDataMeta;
    let importDataRestored = false;
    if (meta?.importId) {
      // Server-backed import — re-fetch from the API so rows are always fresh.
      try {
        const [importJob, dataPage] = await Promise.all([
          api.imports.get(meta.importId),
          api.imports.getData(meta.importId, { limit: 2000 }),
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = ((dataPage.items ?? []) as Array<{ row_index: number; data: Record<string, any> }>).map((r: any) => r.data ?? r);
        setImportedData({
          fileName: importJob.file_name ?? meta.fileName,
          headers: meta.headers,
          rows,
          rowCount: importJob.total_rows ?? meta.rowCount,
          importId: meta.importId,
          importIds: meta.importIds ?? [meta.importId],
        });
        importDataRestored = true;
      } catch {
        setImportedData({ fileName: meta.fileName, headers: meta.headers, rows: [], rowCount: meta.rowCount, importId: meta.importId, importIds: meta.importIds });
        importDataRestored = true;
      }
    } else if (meta?.rows && meta.rows.length > 0) {
      // Manual entry — rows were saved directly to sessionStorage on persist.
      setImportedData({
        fileName: meta.fileName,
        headers: meta.headers,
        rows: meta.rows as Record<string, unknown>[],
        rowCount: meta.rowCount,
        importId: undefined,
        importIds: [],
      });
      importDataRestored = true;
    }

    // Restore field mappings after importedData is set.
    // If the session has no saved mappings (e.g. user uploaded but hadn't mapped yet),
    // auto-map using the freshly-loaded fields — `loadedFieldsRef` holds the real field
    // objects from handleTemplateSelect, bypassing the stale React state closure.
    if (session.fieldMappings.length > 0) {
      setFieldMappings(session.fieldMappings);
    } else if (meta?.headers && loadedFieldsRef.current.length > 0) {
      const autoMapped = autoMapColumns(loadedFieldsRef.current, meta.headers);
      if (autoMapped.length > 0) setFieldMappings(autoMapped);
    }

    // Restore additional certificate configs (extra templates added in step 4).
    if (session.additionalCertConfigs && session.additionalCertConfigs.length > 0) {
      setAdditionalCertConfigs(session.additionalCertConfigs);
    }

    // Navigate to the saved step (design / data / export).
    // If no step was saved, fall through to design.
    // If export had no import data, fall back to data.
    const savedStep = session.currentStep;
    const targetStep =
      savedStep === 'export' && !importDataRestored ? 'data'
      : savedStep === 'data' ? 'data'
      : savedStep === 'design' ? 'design'
      : 'design'; // null / 'template' / anything else → open on design canvas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCurrentStep(targetStep as any);
    if (targetStep === 'design') {
      setFitTrigger(t => t + 1);
      if (session.previewOpen) setPreviewOpen(true);
    }
  };

  // Auto-resume: when the session came from a same-tab reload on the data/export step,
  // skip the banner and restore immediately so the user lands back where they were.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (pendingResumeSession?.autoResume) handleResumeSession(); }, [pendingResumeSession?.autoResume]);

  // Multi-mode: load all selected templates in parallel, navigate to design
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelectMultipleTemplates = async (selectedTemplates: any[]) => {
    if (selectedTemplates.length === 0) return;
    const requestId = ++multiSelectRequestRef.current;

    // Reset canvas state
    setTemplate(null);
    setFields([]);
    setSelectedFieldId(null);
    setTemplateVersionId(null);
    setActiveTemplateIndex(0);
    setTemplateConfigs([]);

    const results = await Promise.all(selectedTemplates.map(t => loadTemplateData(t)));

    // If user cancelled (switched back to single mode or re-triggered), bail out
    if (multiSelectRequestRef.current !== requestId) return;

    setTemplateConfigs(results);
    setActiveTemplateIndex(0);
    const first = results[0]!;
    setTemplate(first.template);
    setFields(first.fields);
    setTemplateVersionId(first.versionId);
    setTemplateMeta({ category: '', subcategory: '' });
    setCurrentStep('design');
    historyRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    trackEvent('batch_selected', {
      data: {
        template_count: results.length,
        template_ids: results.map(r => r.template.id),
      },
    });
  };

  // Multi-mode: switch the active template in the design canvas
  const handleSwitchActiveTemplate = (index: number) => {
    if (index === activeTemplateIndex) return;

    // Save current canvas fields + undo/redo history back to backing store
    setTemplateConfigs(prev => {
      const updated = [...prev];
      if (updated[activeTemplateIndex]) {
        updated[activeTemplateIndex] = {
          ...updated[activeTemplateIndex],
          fields,
          history: [...historyRef.current],
          future: [...futureRef.current],
        };
      }
      return updated;
    });

    const cfg = templateConfigs[index];
    if (!cfg) return;

    // Load the new template into canvas
    setTemplate(cfg.template);
    setFields(cfg.fields);
    setTemplateVersionId(cfg.versionId);
    setActiveTemplateIndex(index);
    setSelectedFieldId(null);
    setRightPanelVisible(false);
    // Fit the new template to screen (different dimensions = wrong scale otherwise)
    setFitTrigger(t => t + 1);
    // Restore this template's own undo/redo history
    historyRef.current = cfg.history ?? [];
    futureRef.current = cfg.future ?? [];
    setCanUndo((cfg.history?.length ?? 0) > 0);
    setCanRedo((cfg.future?.length ?? 0) > 0);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNewTemplateUpload = async (file: File, width: number, height: number, saveTemplate: boolean, templateName?: string, categoryId?: string, subcategoryId?: string, onProgress?: (pct: number) => void, navigateToDesign = true): Promise<any> => {
    const fileType = 'image';
    const baseName = templateName || file.name.replace(/\.(jpe?g|png|webp|avif)$/i, '');
    const existingNames = savedTemplates.map(t => t.title?.toLowerCase() ?? '');
    let finalTemplateName = baseName;
    if (existingNames.includes(baseName.toLowerCase())) {
      const stripped = baseName.replace(/\s*\(\d+\)$/, '');
      let n = 2;
      while (existingNames.includes(`${stripped} (${n})`.toLowerCase())) n++;
      finalTemplateName = `${stripped} (${n})`;
    }

    // ── Multi mode: save + return template for carousel selection, never navigate ──
    if (templateMode === 'multi') {
      try {
        const templateData = await api.templates.create(file, {
          title: finalTemplateName.trim(),
          category_id: categoryId,
          subcategory_id: subcategoryId,
        }, onProgress);
        // Try to attach a preview URL so the carousel card shows the thumbnail
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let withPreview: any = templateData;
        try {
          const previewUrl = await api.templates.getPreviewUrl(templateData.id);
          withPreview = { ...templateData, preview_url: previewUrl };
        } catch { /* preview not critical */ }
        setSavedTemplates(prev => [withPreview, ...prev]);
        return withPreview;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error('Error saving template in multi mode:', error);
        return null;
      }
    }

    // ── Save-only path: upload to library but stay on template selection ─────
    if (!navigateToDesign) {
      const templateData = await api.templates.create(file, {
        title: finalTemplateName.trim(),
        category_id: categoryId,
        subcategory_id: subcategoryId,
      }, onProgress);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let withPreview: any = templateData;
      try {
        const previewUrl = await api.templates.getPreviewUrl(templateData.id);
        withPreview = { ...templateData, preview_url: previewUrl };
      } catch { /* preview not critical */ }
      setSavedTemplates(prev => [withPreview, ...prev]);
      return withPreview;
    }

    // ── Single mode: open design canvas immediately ───────────────────────────
    const newTemplate: CertificateTemplate = {
      templateName: finalTemplateName,
      fileUrl: URL.createObjectURL(file),
      fileType,
      pdfWidth: width,
      pdfHeight: height,
      fields: [],
    };

    setTemplate(newTemplate);
    setPdfFile(file);
    setFields([]);
    setSelectedFieldId(null);
    setCurrentStep('design');
    setTemplateNeedsCategory(!categoryId);

    if (saveTemplate) {
      try {
        const templateData = await api.templates.create(file, {
          title: finalTemplateName.trim(),
          category_id: categoryId,
          subcategory_id: subcategoryId,
        }, onProgress);
        setSavedTemplates((prev) => [templateData, ...prev]);
        // Fetch preview URL in background so the card shows a thumbnail when the user navigates back
        if (templateData.id) {
          api.templates.getPreviewUrl(templateData.id).then(previewUrl => {
            setSavedTemplates(prev => prev.map(t => t.id === templateData.id ? { ...t, preview_url: previewUrl } : t));
          }).catch(() => { /* preview not critical */ });
        }
        const versionId = templateData.template_version_id ?? templateData.version?.id;
        if (versionId) setTemplateVersionId(versionId);
        setTemplate((prev) => prev ? { ...prev, id: templateData.id } : null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error('Error saving template:', error);
        // Clear the unsaved template so the user isn't stuck with a templateless state.
        // Navigate back to template selection so they can re-upload.
        setTemplate(null);
        setFields([]);
        setCurrentStep('template');
        if (error?.message?.includes('Bucket not found') || error?.message?.includes('bucket') || error?.statusCode === 404) {
          toast.error('Storage Bucket Error', {
            description: `The storage bucket "authentix" might not exist or you don't have access. Check that the bucket exists in Supabase Storage, storage policies allow uploads, and your user has organization_id set. (${error?.message})`,
          });
        } else {
          toast.error('Failed to save template — please re-upload', {
            description: error?.message || 'Unknown error',
          });
        }
      }
    }
    return null;
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await api.templates.delete(templateId);
    } catch (err) {
      // If the backend says the template doesn't exist it's already gone — remove
      // it from the list anyway so the UI stays consistent.
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        setSavedTemplates(prev => prev.filter(t => t.id !== templateId));
        return;
      }
      throw err;
    }
    setSavedTemplates(prev => prev.filter(t => t.id !== templateId));

    // If this was the template saved in the design session, clear it so the
    // generate page doesn't auto-restore a ghost template on next visit.
    try {
      const saved = sessionStorage.getItem(`gencert_session:${orgSlug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.templateId === templateId) {
          sessionStorage.removeItem(`gencert_session:${orgSlug}`);
        }
      }
    } catch { /* ignore */ }
    try {
      if (localStorage.getItem(`gencert_last_template_id:${orgSlug}`) === templateId) {
        localStorage.removeItem(`gencert_last_template_id:${orgSlug}`);
      }
    } catch { /* ignore */ }
  };

  const makeUniqueLabel = (base: string, currentFields: CertificateField[], excludeId?: string): string => {
    const others = currentFields.filter(f => f.id !== excludeId).map(f => f.label.toLowerCase());
    if (!others.includes(base.toLowerCase())) return base;
    const stripped = base.replace(/\s*\(\d+\)$/, '');
    let n = 2;
    while (others.includes(`${stripped} (${n})`.toLowerCase())) n++;
    return `${stripped} (${n})`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FIELD_ICONS: Partial<Record<FieldType, any>> = {
    name: User,
    course: BookOpen,
    date: Calendar,
    start_date: Calendar,
    end_date: Calendar,
    custom_text: Type,
    qr_code: QrCode,
    image: ImageIcon,
  };

  const headerToFieldType = (header: string): FieldType => {
    const h = header.toLowerCase().replace(/[\s-]+/g, '_');
    if (['recipient_name', 'full_name', 'name', 'first_name', 'last_name'].includes(h)) return 'name';
    if (['course', 'course_name', 'program', 'programme', 'subject'].includes(h)) return 'course';
    if (['date', 'issued_on', 'completion_date', 'award_date'].includes(h)) return 'date';
    if (['start_date', 'issue_date', 'from_date'].includes(h)) return 'start_date';
    if (['end_date', 'expiry', 'expiry_date', 'valid_until', 'to_date'].includes(h)) return 'end_date';
    if (['credential_id', 'cert_id', 'certificate_id', 'cert_number'].includes(h)) return 'credential_id';
    if (['organization', 'org', 'institution', 'company'].includes(h)) return 'organization';
    if (['grade', 'score', 'marks', 'percentage'].includes(h)) return 'grade';
    if (['level', 'achievement_level', 'tier'].includes(h)) return 'level';
    if (['duration', 'hours', 'duration_hours', 'total_hours'].includes(h)) return 'duration';
    if (['issuer', 'instructor', 'trainer', 'facilitator'].includes(h)) return 'issuer';
    if (['place', 'venue', 'location', 'city', 'town'].includes(h)) return 'place';
    return 'custom_text';
  };

  const handleAddDataFields = (headers: string[]) => {
    if (!template) return;
    pushToHistory(fields);
    const REF_WIDTH = 595;
    const REF_HEIGHT = 842;
    const wScale = template.pdfWidth > 0 ? template.pdfWidth / REF_WIDTH : 1;
    const hScale = template.pdfHeight > 0 ? template.pdfHeight / REF_HEIGHT : 1;
    const newFields: CertificateField[] = [];
    let nextY = template.pdfHeight * 0.35;
    for (const header of headers) {
      const fieldType = headerToFieldType(header);
      const config = FIELD_TYPE_CONFIG[fieldType];
      const scaledWidth = Math.round(config.defaultWidth * wScale);
      const scaledHeight = Math.round(config.defaultHeight * hScale);
      const x = (template.pdfWidth - scaledWidth) / 2;
      const rawLabel = header.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const field: CertificateField = {
        id: crypto.randomUUID(),
        type: fieldType,
        label: makeUniqueLabel(rawLabel, [...fields, ...newFields]),
        x,
        y: nextY,
        width: scaledWidth,
        height: scaledHeight,
        fontSize: fieldType === 'qr_code' ? 0 : Math.max(12, Math.round(24 * hScale)),
        fontFamily: 'DM Sans',
        color: '#000000',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'center',
        sampleValue: rawLabel,
      };
      if (fieldType === 'date' || fieldType === 'start_date' || fieldType === 'end_date') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (field as any).dateFormat = 'MMMM dd, yyyy';
      }
      newFields.push(field);
      nextY += scaledHeight + Math.round(16 * hScale);
    }
    setFields(prev => [...prev, ...newFields]);
    setLayersOpen(true);
  };

  const handleAddField = (field: CertificateField) => {
    fieldsDirtyRef.current = true;
    pushToHistory(fields);
    setFields((prev) => {
      const uniqueLabel = makeUniqueLabel(field.label, prev);
      return [...prev, { ...field, label: uniqueLabel }];
    });
    setSelectedFieldId(field.id);
    setRightPanelVisible(true);
    trackEvent('field_added', {
      templateId: template?.id,
      templateVersionId: templateVersionId ?? undefined,
      data: { field_type: field.type, field_count: fields.length + 1 },
    });
  };

  const handleUpdateField = useCallback((fieldId: string, updates: Partial<CertificateField>) => {
    fieldsDirtyRef.current = true;
    const ref = updateGroupRef.current;
    if (ref.fieldId !== fieldId || !ref.pushed) {
      // New field or first edit after quiet window — snapshot before applying
      pushToHistory(fields);
      if (ref.timer) clearTimeout(ref.timer);
      ref.fieldId = fieldId;
      ref.pushed = true;
      ref.timer = setTimeout(() => { ref.pushed = false; ref.timer = null; }, 500);
      // Track the first update in each interaction group (avoids flooding on drag)
      const updateKeys = Object.keys(updates);
      const isMove = updateKeys.some(k => k === 'x' || k === 'y') && !updateKeys.some(k => k === 'width' || k === 'height');
      const isResize = updateKeys.some(k => k === 'width' || k === 'height');
      const eventType = isMove ? 'field_moved' : isResize ? 'field_resized' : 'field_style_changed';
      const field = fields.find(f => f.id === fieldId);
      trackEvent(eventType, {
        templateId: template?.id,
        templateVersionId: templateVersionId ?? undefined,
        data: { field_type: field?.type, updated_keys: updateKeys },
      });
    }
    setFields((prev) =>
      prev.map((field) => (field.id === fieldId ? { ...field, ...updates } : field))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, pushToHistory]);

  const handleDeleteField = (fieldId: string) => {
    fieldsDirtyRef.current = true;
    pushToHistory(fields);
    const deletedField = fields.find(f => f.id === fieldId);
    setFields((prev) => prev.filter((field) => field.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
    trackEvent('field_deleted', {
      templateId: template?.id,
      templateVersionId: templateVersionId ?? undefined,
      data: { field_type: deletedField?.type, field_count: fields.length - 1 },
    });
  };

  const handleFieldsDelete = (fieldIds: string[]) => {
    fieldsDirtyRef.current = true;
    pushToHistory(fields);
    const idSet = new Set(fieldIds);
    setFields((prev) => prev.filter((f) => !idSet.has(f.id)));
    if (selectedFieldId && idSet.has(selectedFieldId)) setSelectedFieldId(null);
  };

  const handleFieldDuplicate = (field: CertificateField) => {
    fieldsDirtyRef.current = true;
    pushToHistory(fields);
    const newId = crypto.randomUUID();
    setFields((prev) => {
      const uniqueLabel = makeUniqueLabel(field.label, prev);
      return [...prev, { ...field, id: newId, label: uniqueLabel }];
    });
    setSelectedFieldId(newId);
  };

  const handleFieldReorder = (fieldId: string, direction: 'front' | 'back') => {
    pushToHistory(fields);
    setFields((prev) => {
      const idx = prev.findIndex(f => f.id === fieldId);
      if (idx < 0) return prev;
      const maxZ = Math.max(...prev.map(f => f.zIndex ?? 0));
      const minZ = Math.min(...prev.map(f => f.zIndex ?? 0));
      return prev.map(f =>
        f.id === fieldId
          ? { ...f, zIndex: direction === 'front' ? maxZ + 1 : minZ - 1 }
          : f
      );
    });
  };

  const handleFieldLock = (fieldId: string, locked: boolean) => {
    setFields((prev) => prev.map(f => f.id === fieldId ? { ...f, locked } : f));
  };

  const handleFieldRename = (fieldId: string, label: string) => {
    setFields((prev) => {
      const uniqueLabel = makeUniqueLabel(label, prev, fieldId);
      return prev.map(f => f.id === fieldId ? { ...f, label: uniqueLabel } : f);
    });
  };

  const handleFieldLayerReorder = (orderedIds: string[]) => {
    pushToHistory(fields);
    setFields((prev) => {
      const map = new Map(prev.map(f => [f.id, f]));
      return orderedIds.map(id => map.get(id)).filter(Boolean) as CertificateField[];
    });
  };

  // Snapshot current fields before a drag (called by DraggableField onDragStart)
  const handleFieldDragStart = useCallback(() => {
    pushToHistory(fields);
    // Mark the active field as "already pushed" so handleUpdateField doesn't
    // double-push during the drag mousemove sequence
    const ref = updateGroupRef.current;
    if (ref.timer) clearTimeout(ref.timer);
    ref.fieldId = selectedFieldId;
    ref.pushed = true;
    ref.timer = setTimeout(() => { ref.pushed = false; ref.timer = null; }, 500);
  }, [fields, pushToHistory, selectedFieldId]);

  const handleFieldSelect = (fieldId: string) => {
    if (previewOpen) return;
    setSelectedFieldId(fieldId);
    setRightPanelVisible(true);
  };

  const handleTemplateResizeStart = (width: number, height: number) => {
    templateResizeOrigin.current = { w: width, h: height, fields: [...fields] };
  };

  const handleTemplateResize = (width: number, height: number) => {
    const { w: ow, h: oh, fields: origFields } = templateResizeOrigin.current;
    if (ow > 0 && oh > 0 && origFields.length > 0) {
      const sx = width / ow;
      const sy = height / oh;
      const sf = Math.sqrt(sx * sy);
      setFields(origFields.map(f => ({
        ...f,
        x: f.x * sx,
        y: f.y * sy,
        width: f.width * sx,
        height: f.height * sy,
        fontSize: Math.round(f.fontSize * sf),
      })));
    }
    setTemplate(prev => prev ? { ...prev, pdfWidth: width, pdfHeight: height } : null);
  };

  // Handles file-picker image add: optimistic blob preview + background upload + URL swap
  const handleAddImageFile = async (file: File) => {
    const blobUrl = URL.createObjectURL(file);
    handleAddAssetField(blobUrl, file.name);
    try {
      const permanentUrl = await api.templates.uploadAsset(file);
      URL.revokeObjectURL(blobUrl);
      // Swap the blob URL to permanent in the existing field
      handleAddAssetField(permanentUrl, file.name, undefined, undefined, blobUrl);
    } catch (err) {
      console.error('[page] Image upload failed, blob URL kept for session:', err);
    }
  };

  const handleAddAssetField = (url: string, name: string, x?: number, y?: number, replaceBlobUrl?: string) => {
    // If replaceBlobUrl is set, this is an upload-complete signal — swap the URL in the existing field
    if (replaceBlobUrl) {
      setFields(prev => prev.map(f =>
        f.type === 'image' && f.imageUrl === replaceBlobUrl ? { ...f, imageUrl: url } : f
      ));
      return;
    }
    const defaultSize = template
      ? Math.max(200, Math.round(Math.min(template.pdfWidth, template.pdfHeight) * 0.25))
      : 200;
    const newField: CertificateField = {
      id: crypto.randomUUID(),
      type: 'image',
      label: name,
      imageUrl: url,
      x: x !== undefined ? x - defaultSize / 2 : (template ? (template.pdfWidth - defaultSize) / 2 : 100),
      y: y !== undefined ? y - defaultSize / 2 : (template ? (template.pdfHeight - defaultSize) / 2 : 100),
      width: defaultSize,
      height: defaultSize,
      fontSize: 0,
      fontFamily: 'Arial',
      color: '#000000',
      fontWeight: '400',
      fontStyle: 'normal',
      textAlign: 'left',
      opacity: 100,
      cornerRadius: 0,
    };
    handleAddField(newField);
  };

  // Note: Dimensions are not stored on template in new schema
  // They're calculated from the source file when needed
  // Removed autosave for dimensions

  // Autosave fields to certificate_template_fields table
  useEffect(() => {
    const templateId = template?.id;
    const versionId = templateVersionId;

    if (!templateId || !versionId || !fieldsDirtyRef.current) return;

    setSaveStatus('saving');

    const doSave = async () => {
      // Track field_keys to ensure uniqueness
      const usedFieldKeys = new Set<string>();
      
      // Map frontend fields to backend format
      let fieldsToSave: Array<{
        field_key: string;
        label: string;
        type: string;
        page_number: number;
        x: number;
        y: number;
        width?: number;
        height?: number;
        style?: Record<string, unknown>;
        required: boolean;
      }> = [];

      try {
        fieldsToSave = fields.map((field, index) => {
          // Generate field_key from field id or label (sanitize to lowercase alphanumeric with underscores)
          // Must be 2-64 characters, lowercase alphanumeric with underscores only
          let fieldKey = field.id
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
          
          // If field_key is empty or too short, use label or generate one
          if (!fieldKey || fieldKey.length < 2) {
            const labelBasedKey = (field.label || field.type || `field_${index}`)
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '');
            fieldKey = labelBasedKey.length >= 2 ? labelBasedKey : `field_${String(index).padStart(2, '0')}`;
          }
          
          // Ensure it's at least 2 characters and max 64
          if (fieldKey.length < 2) {
            fieldKey = `field_${String(index).padStart(2, '0')}`;
          }
          if (fieldKey.length > 64) {
            fieldKey = fieldKey.substring(0, 64);
          }

          // Final validation: ensure field_key matches regex: lowercase alphanumeric with underscores only
          if (!/^[a-z0-9_]+$/.test(fieldKey)) {
            // Fallback: generate a safe field_key
            fieldKey = `field_${String(index).padStart(2, '0')}`;
          }

          // Ensure field_key is unique (backend requires unique field_keys)
          let uniqueFieldKey = fieldKey;
          let suffix = 1;
          while (usedFieldKeys.has(uniqueFieldKey)) {
            uniqueFieldKey = `${fieldKey}_${suffix}`;
            suffix++;
            // Ensure it doesn't exceed 64 characters
            if (uniqueFieldKey.length > 64) {
              uniqueFieldKey = `${fieldKey.substring(0, 60)}_${suffix}`;
            }
          }
          usedFieldKeys.add(uniqueFieldKey);
          fieldKey = uniqueFieldKey;

          // Map frontend type to backend type
          const backendType = mapFrontendTypeToBackend(field.type);

          // Ensure label is at least 2 characters and max 80 (schema requirement)
          let label = (field.label || field.type || 'Field').trim();
          if (label.length < 2) {
            label = `Field ${index + 1}`;
          }
          if (label.length > 80) {
            label = label.substring(0, 80);
          }

          // Build style object - include original field ID for mapping
          const style: Record<string, unknown> = {
            fontSize: field.fontSize || 16,
            fontFamily: field.fontFamily || 'DM Sans',
            color: field.color || '#000000',
            fontWeight: field.fontWeight || '400',
            fontStyle: field.fontStyle || 'normal',
            textAlign: field.textAlign || 'left',
            originalFieldId: field.id, // Store original ID for field mapping
            fieldType: field.type, // Preserve exact frontend type (e.g. 'name' vs 'custom_text')
          };

          if (field.dateFormat) style.dateFormat = field.dateFormat;
          if (field.prefix) style.prefix = field.prefix;
          if (field.suffix) style.suffix = field.suffix;

          // Extended style properties for faithful PDF/image rendering
          if (field.opacity !== undefined && field.opacity !== 100) style.opacity = field.opacity;
          if (field.letterSpacing) style.letterSpacing = field.letterSpacing;
          if (field.lineHeight) style.lineHeight = field.lineHeight;
          if (field.textTransform && field.textTransform !== 'none') style.textTransform = field.textTransform;
          if (field.textShadow) style.textShadow = field.textShadow;
          if (field.colorMode && field.colorMode !== 'solid') {
            style.colorMode = field.colorMode;
            if (field.gradientStartColor) style.gradientStartColor = field.gradientStartColor;
            if (field.gradientEndColor) style.gradientEndColor = field.gradientEndColor;
            if (field.gradientAngle !== undefined) style.gradientAngle = field.gradientAngle;
          }
          if (field.type === 'qr_code') {
            if (field.qrStyle) style.qrStyle = field.qrStyle;
            if (field.qrTransparentBg !== undefined) style.qrTransparentBg = field.qrTransparentBg;
            // blob: URLs are ephemeral — never persist them; they become dead after page unload
            if (field.qrLogoUrl && !field.qrLogoUrl.startsWith('blob:')) style.qrLogoUrl = field.qrLogoUrl;
          }
          if (field.type === 'image') {
            if (field.cornerRadius !== undefined) style.cornerRadius = field.cornerRadius;
            // blob: URLs are ephemeral — never persist them; they become dead after page unload
            if (field.imageUrl && !field.imageUrl.startsWith('blob:')) style.imageUrl = field.imageUrl;
          }

          // Text background styling — saved so the generator can apply matching offsets.
          // bgPaddingH/V always saved (even at defaults) so generator uses the correct value.
          if (field.type !== 'image' && field.type !== 'qr_code') {
            style.bgPaddingH = field.bgPaddingH ?? 8;
            style.bgPaddingV = field.bgPaddingV ?? 4;
            if (field.backgroundColor) style.backgroundColor = field.backgroundColor;
            if (field.bgCornerRadius !== undefined) style.bgCornerRadius = field.bgCornerRadius;
          }

          // Calculate width and height - ensure they're positive numbers
          // Provide defaults to ensure fields are always valid
          const width = field.width && field.width > 0 ? field.width : 200;
          const height = field.height && field.height > 0 ? field.height : 30;

          const fieldData: {
            field_key: string;
            label: string;
            type: string;
            page_number: number;
            x: number;
            y: number;
            width: number;
            height: number;
            style?: Record<string, unknown>;
            required: boolean;
          } = {
            field_key: fieldKey,
            label: label,
            type: backendType,
            page_number: 1,
            x: Math.max(0, field.x || 0),
            y: Math.max(0, field.y || 0),
            width: width,
            height: height,
            required: false,
          };

          // Include style if it has content
          if (Object.keys(style).length > 0) {
            fieldData.style = style;
          }

          return fieldData;
        });

        // Filter out any invalid fields before sending
        fieldsToSave = fieldsToSave.filter(field => {
          // Ensure field_key is valid
          if (!field.field_key || field.field_key.length < 2 || field.field_key.length > 64) {
            console.warn('[Generate] Skipping invalid field (invalid field_key):', field);
            return false;
          }
          // Ensure label is valid
          if (!field.label || field.label.length < 2 || field.label.length > 80) {
            console.warn('[Generate] Skipping invalid field (invalid label):', field);
            return false;
          }
          // Ensure type is valid
          if (!['text', 'date', 'qrcode', 'custom', 'image'].includes(field.type)) {
            console.warn('[Generate] Skipping invalid field (invalid type):', field);
            return false;
          }
          return true;
        });

        // Don't send if no valid fields
        if (fieldsToSave.length === 0) {
          console.log('[Generate] No valid fields to save, skipping autosave');
          return;
        }

        // Log the data we're about to send for debugging
        console.log('[Generate] Attempting to save fields:', {
          templateId,
          versionId,
          fieldsCount: fieldsToSave.length,
          fieldsPreview: fieldsToSave.slice(0, 2).map(f => ({
            field_key: f.field_key,
            label: f.label,
            type: f.type,
            page_number: f.page_number,
            x: f.x,
            y: f.y,
            hasWidth: f.width !== undefined,
            hasHeight: f.height !== undefined,
            hasStyle: f.style !== undefined,
          })),
        });

        await api.templates.saveFields(templateId, versionId, fieldsToSave);
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        trackEvent('templates_saved', {
          templateId,
          templateVersionId: versionId,
          data: { field_count: fieldsToSave.length },
        });
        console.log('[Generate] Fields auto-saved to certificate_template_fields', {
          templateId,
          versionId,
          fieldsCount: fieldsToSave.length,
        });
      } catch (e: unknown) {
        // Log error details for debugging
        const errorMessage = e instanceof Error ? e.message : String(e);
        const errorCode = e && typeof e === 'object' && 'code' in e ? (e.code as string) : 'UNKNOWN';
        
        // Only log if it's not a network error (network errors are expected if backend is down)
        const isNetworkError = errorCode === 'NETWORK_ERROR';
        setSaveStatus(isNetworkError ? 'idle' : 'error');
        if (saveStatus === 'error') setTimeout(() => setSaveStatus('idle'), 3000);
        if (!isNetworkError) {
          console.warn('[Generate] Failed to autosave fields (non-fatal):', {
            error: errorMessage,
            code: errorCode,
            templateId,
            versionId,
            fieldsCount: fieldsToSave.length,
            fieldsPreview: fieldsToSave.slice(0, 2).map(f => ({
              field_key: f.field_key,
              label: f.label,
              type: f.type,
            })),
            fullError: e,
          });
        }
      }
    };

    saveNowRef.current = doSave;
    const timeoutId = setTimeout(doSave, 1000); // Debounce: wait 1 second after last change

    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, template?.id, templateVersionId]);

  // Flush any pending save immediately when the component unmounts (e.g. user navigates away
  // before the 1-second debounce fires). saveNowRef always holds the latest doSave closure.
  useEffect(() => {
    return () => { saveNowRef.current?.(); };
  }, []);

  const handleToggleVisibility = (fieldId: string) => {
    setHiddenFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  };

  const handleDataImport = (data: ImportedData | null) => {
    setAdditionalRows([]);
    if (!data) {
      // Clear the localStorage draft so the import isn't offered on next visit
      try { localStorage.removeItem(`gencert_draft:${orgSlug}`); } catch { /* ignore */ }
    }
    if (data) {
      // In multi mode, auto-map for ALL templates' fields
      const allFields = templateMode === 'multi' && templateConfigs.length > 0
        ? templateConfigs.map((c, i) => i === activeTemplateIndex ? fields : c.fields).flat()
        : fields;
      // Sort headers to match semantic field order (name → course → dates → email → phone → custom)
      const sortedData: ImportedData = { ...data, headers: sortHeadersByFieldOrder(data.headers, allFields) };
      setImportedData(sortedData);
      const autoMappings = autoMapColumns(allFields, sortedData.headers);
      setFieldMappings(autoMappings);

      // Re-auto-map additional cert configs so their mappings stay current
      if (additionalCertConfigs.length > 0) {
        setAdditionalCertConfigs(
          additionalCertConfigs.map(cfg => ({
            ...cfg,
            fieldMappings: autoMapColumns(cfg.fields, sortedData.headers),
          }))
        );
      }
    } else {
      setImportedData(null);
      setFieldMappings([]);
    }
  };

  const handleContinueToGenerate = () => {
    if (!template?.id) {
      toast.error('Template is still saving — please wait a moment before continuing');
      return;
    }
    if (importedData) {
      trackEvent('recipients_set', {
        templateId: template.id,
        templateVersionId: templateVersionId ?? undefined,
        data: { row_count: importedData.rowCount, mapped_fields: fieldMappings.length },
      });
      setCurrentStep('export');
    }
  };

  const handleLoadImport = async (importId: string) => {
    try {
      // Fetch metadata and normalized rows from the backend — no client-side file parsing.
      const [importJob, dataPage] = await Promise.all([
        api.imports.get(importId),
        api.imports.getData(importId, { limit: 2000 }),
      ]);

      // Backend returns { row_index, data: {...} } — extract the inner data object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawItems = dataPage.items as Array<{ row_index: number; data: Record<string, any> }>;
      const rows = rawItems.map(r => r.data ?? r);
      if (rows.length === 0) throw new Error('The import file is empty or has no data.');

      const headers = Object.keys(rows[0]!);

      // All fields across the active template(s)
      const allFields = templateMode === 'multi' && templateConfigs.length > 0
        ? templateConfigs.map((c, i) => i === activeTemplateIndex ? fields : c.fields).flat()
        : fields;
      const currentFieldIds = new Set(allFields.map(f => f.id));

      // Smart re-mapping: start from the saved mapping, but only for fields that
      // still exist in the current template design. Then auto-map any new or
      // renamed fields the saved mapping doesn't cover.
      let resolvedMappings: FieldMapping[];
      if (importJob.mapping && Object.keys(importJob.mapping).length > 0) {
        const validSaved: FieldMapping[] = Object.entries(importJob.mapping)
          .filter(([fieldId]) => currentFieldIds.has(fieldId))
          .map(([fieldId, columnName]) => ({ fieldId, columnName: columnName as string }));

        const savedFieldIds = new Set(validSaved.map(m => m.fieldId));
        const unmappedFields = allFields.filter(
          f => !savedFieldIds.has(f.id) && f.type !== 'qr_code' && f.type !== 'image'
        );
        const additionalMappings = autoMapColumns(unmappedFields, headers);
        resolvedMappings = [...validSaved, ...additionalMappings];
      } else {
        resolvedMappings = autoMapColumns(allFields, headers);
      }

      setImportedData({
        fileName: importJob.file_name,
        headers,
        rows,
        rowCount: importJob.total_rows ?? rows.length,
        importId: importId,
        importIds: [importId],
      });
      setFieldMappings(resolvedMappings);

      // Stay on the data step so the user can review/adjust mappings before generating.
      // (DataSelector shows the mapping UI once importedData is set and showUpload → false.)
    } catch (error) {
      console.error('Error loading import:', error);
      throw error;
    }
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  // Row 1 live preview — fieldId → value from the first imported data row.
  // Drives the canvas display without mutating field.sampleValue.
  const livePreviewValues = useMemo((): Record<string, string> => {
    const firstRow = importedData?.rows[0];
    if (!firstRow) return {};
    return Object.fromEntries(
      fieldMappings
        .filter(m => m.columnName && firstRow[m.columnName] != null && String(firstRow[m.columnName]).trim() !== '')
        .map(m => [m.fieldId, String(firstRow[m.columnName])])
    );
  }, [importedData, fieldMappings]);

  // Step indicators
  const steps = [
    { id: 'template', label: 'Choose Template', icon: FileText, completed: !!template },
    { id: 'design', label: 'Design Fields', icon: Palette, completed: !!template && fields.length > 0 },
    { id: 'data', label: 'Import Data', icon: Database, completed: !!importedData },
    { id: 'export', label: 'Generate', icon: Wand2, completed: false },
  ];


  const stepperContent = (
    <div className="flex items-center gap-0.5 bg-card/90 backdrop-blur-xl border border-border/50 rounded-xl shadow-lg px-2 py-2">
      {steps.map((step, index) => {
        const isActive = currentStep === step.id;
        const isCompleted = step.completed;
        const currentIndex = steps.findIndex(s => s.id === currentStep);
        const isNext = index === currentIndex + 1;
        const canNavigate = isCompleted || isActive || isNext || step.id === 'template';
        const StepIcon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => {
                if (!canNavigate) return;
                if (step.id === 'template' && currentStep !== 'template' && fields.length > 0) {
                  setShowNavGuard(true);
                  return;
                }
                if (step.id === 'template' && currentStep !== 'template') {
                  skipAutoSelectRef.current = true;
                  selectRequestRef.current++;
                  setTemplate(null);
                  setFields([]);
                  setSelectedFieldId(null);
                  setPanelReady(false);
                  router.replace(pathname);
                }
                if (step.id === 'design' && currentStep !== 'design') {
                  setFitTrigger(t => t + 1);
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setCurrentStep(step.id as any);
              }}
              disabled={!canNavigate}
              title={step.label}
              className={[
                'flex items-center gap-2 rounded-lg transition-all select-none tracking-wide',
                isActive
                  ? 'px-4 py-2 bg-primary text-primary-foreground font-semibold text-[11px] shadow-[0_0_18px_hsl(var(--primary)/_0.55)]'
                  : 'px-2.5 py-1.5 text-[10px] font-medium',
                isCompleted && !isActive ? 'text-foreground/80 hover:bg-muted/60 cursor-pointer' : '',
                isNext && !isCompleted ? 'text-muted-foreground hover:bg-muted/40 cursor-pointer' : '',
                !canNavigate ? 'text-muted-foreground/25 cursor-not-allowed' : '',
              ].filter(Boolean).join(' ')}
            >
              {isCompleted && !isActive ? (
                <CheckCircle2 className={isActive ? 'w-4 h-4' : 'w-3.5 h-3.5 text-primary'} />
              ) : (
                <StepIcon className={isActive ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
              )}
              <span className="leading-none whitespace-nowrap">{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <div className="w-px h-5 bg-border/40 mx-0.5 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );

  const _handleLeftPanelDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    leftPanelDragOrigin.current = { mx: e.clientX, my: e.clientY, px: leftPanelPos.x, py: leftPanelPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!leftPanelDragOrigin.current) return;
      const { mx, px } = leftPanelDragOrigin.current;
      setLeftPanelPos(prev => ({ ...prev, x: px + ev.clientX - mx }));
    };
    const onUp = () => {
      leftPanelDragOrigin.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Headers from the imported file that don't already have a matching template field.
  // Used by "From your file" in the left panel to avoid offering already-added columns.
  const existingFieldTypeSet = new Set(fields.map(f => f.type));
  const existingFieldLabelLower = new Set(fields.map(f => f.label.toLowerCase().trim()));
  const unaddedImportHeaders = importedData
    ? importedData.headers.filter(h => {
        const fieldType = headerToFieldType(h);
        const displayLabelLower = h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).toLowerCase();
        if (fieldType !== 'custom_text' && existingFieldTypeSet.has(fieldType)) return false;
        if (existingFieldLabelLower.has(displayLabelLower)) return false;
        if (existingFieldLabelLower.has(h.toLowerCase().trim())) return false;
        return true;
      })
    : [];

  return (
    <>
      {/* Small-screen gate — covers entire page below lg breakpoint */}
      <NotAvailableOverlay />

      {/* Full-page initializing skeleton — prevents step-1 flash on reload */}
      {pageInitializing && (
        <div className="fixed top-0 left-14 right-0 bottom-0 z-150 bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 opacity-40">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        </div>
      )}

      {/* Remote-changes CTA — floats bottom-right when template list changed remotely */}
      {hasRemoteChanges && !pageInitializing && (
        <div className="fixed bottom-6 right-6 z-120">
          <button
            onClick={() => { setHasRemoteChanges(false); loadSavedDataRef.current?.(false); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-primary/30 shadow-lg text-sm font-medium text-foreground hover:bg-primary/5 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-primary" />
            New changes — click to refresh
          </button>
        </div>
      )}

      {/* Normal flow layout (template / data / export steps) */}
      <div className="flex flex-col h-[calc(100vh-3rem)]">

        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          {currentStep === 'template' && (
            <div className="flex-1 overflow-hidden">
              <TemplateSelector
                savedTemplates={savedTemplates}
                onSelectTemplate={(t) => { setTemplateMode('single'); handleTemplateSelect(t); setPendingResumeSession(null); }}
                onNewUpload={handleNewTemplateUpload}
                onDeleteTemplate={handleDeleteTemplate}
                onRenameTemplate={async (id, name) => {
                  await api.templates.update(id, { name });
                  setSavedTemplates(prev => prev.map(t => t.id === id ? { ...t, title: name, name } : t));
                }}
                recentGenerated={recentGenerated}
                inProgress={inProgressTemplates}
                recentLoading={recentLoading}
                onSelectRecentTemplate={(t, loadFields) => { handleRecentTemplateSelect(t, loadFields); setPendingResumeSession(null); }}
                templateMode={templateMode}
                onTemplateModeChange={setTemplateMode}
                onSelectMultipleTemplates={(ts) => { handleSelectMultipleTemplates(ts); setPendingResumeSession(null); }}
                pendingResumeSession={pendingResumeSession}
                onResumeSession={handleResumeSession}
                onDismissResume={() => {
                  setPendingResumeSession(null);
                  sessionStorage.removeItem(`gencert_session:${orgSlug}`);
                  try { localStorage.removeItem(`gencert_draft:${orgSlug}`); } catch { /* ignore */ }
                }}
                onStartFresh={() => {
                  const tid = pendingResumeSession?.templateId;
                  // Clear saved session so it doesn't re-appear
                  sessionStorage.removeItem(`gencert_session:${orgSlug}`);
                  try { localStorage.removeItem(`gencert_draft:${orgSlug}`); } catch { /* ignore */ }
                  setPendingResumeSession(null);
                  const templateObj = savedTemplates.find(t => t.id === tid);
                  if (templateObj) {
                    setTemplateMode('single');
                    handleTemplateSelect(templateObj);
                  }
                }}
              />
            </div>
          )}

          {currentStep === 'data' && (
            <div className="flex-1 px-8 pt-8 pb-20 overflow-y-auto">
              {(() => {
                // In multi mode, expose all templates' fields for sample file + mapping
                const allMultiFields = templateMode === 'multi' && templateConfigs.length > 0
                  ? templateConfigs.map((c, i) => i === activeTemplateIndex ? fields : c.fields).flat()
                  : fields;
                const templateGroupsForData = templateMode === 'multi' && templateConfigs.length > 1
                  ? templateConfigs.map((c, i) => ({
                      templateName: c.template.templateName,
                      fields: i === activeTemplateIndex ? fields : c.fields,
                    }))
                  : undefined;
                return (
                  <DataSelector
                    fields={allMultiFields}
                    templateGroups={templateGroupsForData}
                    savedImports={savedImports}
                    importedData={importedData}
                    fieldMappings={fieldMappings}
                    onDataImport={handleDataImport}
                    onMappingChange={setFieldMappings}
                    onLoadImport={handleLoadImport}
                    onContinueToGenerate={handleContinueToGenerate}
                    onAdditionalRows={setAdditionalRows}
                    additionalRows={additionalRows}
                    onGoToDesign={() => { setCurrentStep('design'); setFitTrigger(t => t + 1); }}
                  />
                );
              })()}
            </div>
          )}

          {currentStep === 'export' && (
            <div className="flex-1 px-8 pt-8 pb-20 overflow-y-auto">
              {(() => {
                if (templateMode === 'multi' && templateConfigs.length > 0) {
                  // Build primary + additional from templateConfigs
                  const primaryCfg = templateConfigs[0]!;
                  const primaryFields = activeTemplateIndex === 0 ? fields : primaryCfg.fields;
                  const primaryMappings = fieldMappings.filter(m => primaryFields.some(f => f.id === m.fieldId));
                  const multiAdditional: CertificateConfig[] = templateConfigs.slice(1).map((c, relIdx) => {
                    const absIdx = relIdx + 1;
                    const tplFields = absIdx === activeTemplateIndex ? fields : c.fields;
                    return {
                      key: `multi_${absIdx}`,
                      template: c.template,
                      fields: tplFields,
                      fieldMappings: fieldMappings.filter(m => tplFields.some(f => f.id === m.fieldId)),
                      label: c.template.templateName,
                    };
                  });
                  return (
                    <ExportSection
                      template={primaryCfg.template}
                      fields={primaryFields}
                      importedData={importedData}
                      fieldMappings={primaryMappings}
                      onFieldMappingsChange={setFieldMappings}
                      subcategoryName={templateMeta.subcategory || undefined}
                      savedTemplates={savedTemplates}
                      additionalConfigs={multiAdditional}
                      onAdditionalConfigsChange={undefined}
                      additionalRows={additionalRows}
                      onTrackEvent={(eventType, data) => trackEvent(eventType as Parameters<typeof trackEvent>[0], { templateVersionId: templateVersionId ?? undefined, ...data })}
                    />
                  );
                }
                return (
                  <ExportSection
                    template={template}
                    fields={fields}
                    importedData={importedData}
                    fieldMappings={fieldMappings}
                    onFieldMappingsChange={setFieldMappings}
                    subcategoryName={templateMeta.subcategory || undefined}
                    savedTemplates={savedTemplates}
                    additionalConfigs={additionalCertConfigs}
                    onAdditionalConfigsChange={setAdditionalCertConfigs}
                    additionalRows={additionalRows}
                    onTrackEvent={(eventType, data) => trackEvent(eventType as Parameters<typeof trackEvent>[0], { templateVersionId: templateVersionId ?? undefined, ...data })}
                  />
                );
              })()}
            </div>
          )}

          {/* Floating stepper overlay — shown on data / export steps only (not template or design) */}
          {currentStep !== 'design' && currentStep !== 'template' && (
            <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center items-center pointer-events-none">
              <div className="pointer-events-auto">
                {stepperContent}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Template loading overlay — shown while template loads, min 2.5 s so canvas is fully ready ── */}
      {/* Only render on the design step — prevents the fixed overlay from covering data/export steps */}
      {showDesignOverlay && currentStep === 'design' && (
        <DesignLoadingOverlay message="Loading template…" />
      )}

      {/* ── Full-screen design overlay ── */}
      {template && (
        <div className={`fixed top-0 left-14 right-0 bottom-0 z-50 bg-[#0A0A0A] flex flex-col${currentStep !== 'design' ? ' hidden' : ''}`}>

          {/* ── Version-change warning banner ── */}
          {versionChangedWarning && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/25 text-amber-700 dark:text-amber-400 text-sm shrink-0 z-10">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1">
                <strong className="font-semibold">Template updated</strong>
                {' — the image changed since you last edited this design. '}
                Field positions are in pixel coordinates relative to the original image, so they may no longer align. Review each field.
              </span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setVersionChangedWarning(false)}
                className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 hover:bg-amber-500/10 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Image-lost warning banner ── */}
          {imageLostFields.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/25 text-amber-700 dark:text-amber-400 text-sm shrink-0 z-10">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">
                <strong className="font-semibold">
                  {imageLostFields.length === 1 ? '1 image' : `${imageLostFields.length} images`} need re-uploading:
                </strong>
                {' '}
                <span className="italic">{imageLostFields.join(', ')}</span>
                {'. '}
                Images are stored in your browser and lost when the tab closes. Select each field and re-upload in the panel.
              </span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setImageLostFields([])}
                className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 hover:bg-amber-500/10 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Canvas area + panels + optional preview — flex row, fills all space */}
          <div className="flex-1 flex overflow-hidden">

          {/* ── Canvas area (flex-1) — both panels are absolute overlays, layout never shifts ── */}

          <div className="flex-1 relative overflow-hidden min-w-0" ref={canvasAreaRef} style={{ overscrollBehavior: 'none' }}>

            {/* ── Left panel — absolute overlay, never shifts canvas layout ── */}
            {!previewOpen && (
              !leftPanelVisible ? (
                <div className="absolute top-1/2 -translate-y-1/2 left-5 z-40 pointer-events-auto">
                  <div
                    className="flex flex-col items-center gap-3 bg-card dark:bg-[#141414] border border-border rounded-xl shadow-md py-3 px-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
                    style={{ width: 40 }}
                    onClick={() => setLeftPanelVisible(true)}
                    title="Expand layers panel"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-muted-foreground/70" />
                    <span
                      className="text-[9px] font-semibold text-muted-foreground tracking-widest uppercase"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      Layers
                    </span>
                    <Maximize2 className="w-3 h-3 text-muted-foreground/40" />
                  </div>
                </div>
              ) : (
                <div className="absolute top-5 left-5 bottom-12 z-40 w-72 flex flex-col bg-card dark:bg-[#141414] border border-border rounded-xl shadow-2xl overflow-hidden pointer-events-auto">
                  {/* Panel header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-semibold text-foreground flex-1">Design</span>
                    <button
                      onClick={() => setLeftPanelVisible(false)}
                      className="text-muted-foreground/60 hover:text-foreground rounded p-0.5 hover:bg-muted/50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Multi-template switcher */}
                  {templateMode === 'multi' && templateConfigs.length > 1 && (
                    <div className="shrink-0 border-b border-border/30 px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Templates</p>
                      <div className="space-y-0.5">
                        {templateConfigs.map((cfg, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSwitchActiveTemplate(idx)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                              idx === activeTemplateIndex
                                ? 'bg-primary text-primary-foreground font-medium'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded-full border text-[9px] flex items-center justify-center shrink-0 font-bold ${
                              idx === activeTemplateIndex ? 'border-primary-foreground/50' : 'border-current'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="truncate">{cfg.template.templateName || `Template ${idx + 1}`}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tab switcher */}
                  <div className="shrink-0 px-3 pt-2 pb-1">
                    <div className="flex items-center bg-muted rounded-lg p-1 gap-1 h-8">
                      <button
                        onClick={() => setActiveTab('fields')}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md h-full transition-all ${
                          activeTab === 'fields' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Layers className="w-3 h-3" />
                        Fields
                      </button>
                      <button
                        onClick={() => setActiveTab('assets')}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md h-full transition-all ${
                          activeTab === 'assets' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <ImageIcon className="w-3 h-3" />
                        Assets
                      </button>
                    </div>
                  </div>

                  {/* Scrollable content */}
                  <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]">
                    {activeTab === 'fields' && (
                      <div>
                        {importedData && importedData.headers.length > 0 && (
                          <div className="px-3 pt-3 pb-2">
                            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">From your file</p>
                            {unaddedImportHeaders.length > 0 ? (
                              <div className="grid grid-cols-2 gap-1.5">
                                {unaddedImportHeaders.map((h) => {
                                  const fieldType = headerToFieldType(h);
                                  const Icon = FIELD_ICONS[fieldType];
                                  const displayLabel = h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                  return (
                                    <button
                                      key={h}
                                      onClick={() => handleAddDataFields([h])}
                                      className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-center group select-none"
                                    >
                                      <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                                      <span className="text-[11px] font-medium leading-tight line-clamp-2 w-full">{displayLabel}</span>
                                      <span className="text-[9px] text-muted-foreground/50 group-hover:text-primary/60 transition-colors">+ Add</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 py-1 text-xs text-green-700 dark:text-green-400">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                All file columns are in your template
                              </div>
                            )}
                          </div>
                        )}

                        <div className="h-px bg-border/40 mx-3" />

                        {importedData && importedData.headers.length > 0 ? (
                          <div>
                            <button
                              onClick={() => setAddMoreOpen(v => !v)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            >
                              <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${addMoreOpen ? 'rotate-90' : ''}`} />
                              Add more fields
                            </button>
                            {addMoreOpen && (
                              <div className="px-3 pb-3">
                                <FieldTypeSelector
                                  onAddField={handleAddField}
                                  onAddImageField={handleAddAssetField}
                                  onAddImageFile={handleAddImageFile}
                                  pdfWidth={template.pdfWidth}
                                  pdfHeight={template.pdfHeight}
                                  orgLogoUrl={organization?.logo_url ?? null}
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="px-3 pt-3 pb-2">
                            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Add Fields</p>
                            <FieldTypeSelector
                              onAddField={handleAddField}
                              onAddImageField={handleAddAssetField}
                              onAddImageFile={handleAddImageFile}
                              pdfWidth={template.pdfWidth}
                              pdfHeight={template.pdfHeight}
                              orgLogoUrl={organization?.logo_url ?? null}
                            />
                          </div>
                        )}

                        <div className="h-px bg-border/40 mx-3" />

                        <div>
                          <button
                            onClick={() => setLayersOpen(v => !v)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                          >
                            <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${layersOpen ? 'rotate-90' : ''}`} />
                            Layers
                            {fields.length > 0 && (
                              <span className="ml-auto text-[10px] font-normal text-muted-foreground/60">{fields.length}</span>
                            )}
                          </button>
                          {layersOpen && (
                            <div className="px-3 pb-4">
                              <ErrorBoundary fallbackLabel="Layers panel error">
                                <FieldLayersList
                                  fields={fields}
                                  selectedFieldId={selectedFieldId}
                                  hiddenFields={hiddenFields}
                                  onFieldSelect={handleFieldSelect}
                                  onFieldDelete={handleDeleteField}
                                  onToggleVisibility={handleToggleVisibility}
                                  onFieldReorder={handleFieldLayerReorder}
                                  onFieldLock={handleFieldLock}
                                  onFieldRename={handleFieldRename}
                                  onFieldDuplicate={handleFieldDuplicate}
                                />
                              </ErrorBoundary>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {activeTab === 'assets' && (
                      <div className="p-3">
                        <AssetLibrary
                          assets={libraryAssets}
                          onAssetsChange={setLibraryAssets}
                          onAddAsset={handleAddAssetField}
                        />
                      </div>
                    )}
                  </div>

                  {/* Template dimensions — pinned at bottom */}
                  {template && (
                    <div className="shrink-0 border-t border-border/40 px-3 py-2">
                      <p className="text-[9px] text-muted-foreground/50 tabular-nums">
                        {Math.round(template.pdfWidth)} × {Math.round(template.pdfHeight)} px
                        {' · '}
                        {fields.length} field{fields.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </div>
              )
            )}

            {/* Template breadcrumb — transparent overlay, top-center of canvas */}
            {template && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50">
                <TemplateBreadcrumb
                  templateId={template.id ?? ''}
                  templateName={template.templateName}
                  categories={templateMeta.categories ?? (
                    templateMeta.categoryId ? [{
                      categoryId: templateMeta.categoryId,
                      categoryName: templateMeta.category,
                      categoryColor: templateMeta.categoryColor ?? null,
                      subcategoryId: templateMeta.subcategoryId ?? null,
                      subcategoryName: templateMeta.subcategory || null,
                      subcategoryColor: templateMeta.subcategoryColor ?? null,
                      isPrimary: true,
                    }] : []
                  )}
                  onCategoriesChanged={(cats) => {
                    const primary = cats.find(c => c.isPrimary) ?? cats[0];
                    setTemplateMeta({
                      category: primary?.categoryName ?? '',
                      subcategory: primary?.subcategoryName ?? '',
                      categoryId: primary?.categoryId,
                      subcategoryId: primary?.subcategoryId ?? undefined,
                      categoryColor: primary?.categoryColor,
                      subcategoryColor: primary?.subcategoryColor,
                      categories: cats,
                    });
                    if (template?.id) {
                      setSavedTemplates(prev => prev.map(t => t.id === template.id
                        ? { ...t, category_id: primary?.categoryId ?? null, category_name: primary?.categoryName ?? '', subcategory_id: primary?.subcategoryId ?? null, subcategory_name: primary?.subcategoryName ?? '' }
                        : t
                      ));
                    }
                  }}
                  onTemplateRenamed={(name) => setTemplate(prev => prev ? { ...prev, templateName: name } : null)}
                />
              </div>
            )}
            {useInfiniteCanvas ? (
              <ErrorBoundary fallbackLabel="Canvas failed to load">
              <InfiniteCanvas
                fileUrl={template.fileUrl}
                pdfWidth={template.pdfWidth}
                pdfHeight={template.pdfHeight}
                fields={fields}
                selectedFieldId={selectedFieldId}
                hiddenFields={hiddenFields}
                scale={canvasScale}
                onFieldUpdate={handleUpdateField}
                onFieldSelect={handleFieldSelect}
                onScaleChange={setCanvasScale}
                onFieldDelete={handleDeleteField}
                onTemplateResize={handleTemplateResize}
                onTemplateResizeStart={handleTemplateResizeStart}
                onAssetDrop={(url, name, x, y, replaceBlobUrl) => handleAddAssetField(url, name, x, y, replaceBlobUrl)}
                onFieldDuplicate={handleFieldDuplicate}
                onPreviewToggle={() => {
                  const opening = !previewOpen;
                  setPreviewOpen(opening);
                  if (opening) {
                    setLeftPanelVisible(false);
                    setRightPanelVisible(false);
                    setSelectedFieldId(null);
                  }
                  setFitTrigger(t => t + 1);
                }}
                previewOpen={previewOpen}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                saveStatus={saveStatus}
                lastSavedAt={lastSavedAt}
                onSaveNow={() => saveNowRef.current?.()}
                livePreviewValues={livePreviewValues}
                onFieldsDelete={handleFieldsDelete}
                onFieldReorder={handleFieldReorder}
                onFieldLock={handleFieldLock}
                onFieldDragStart={handleFieldDragStart}
                snapToGrid={snapToGrid}
                onSnapToggle={() => setSnapToGrid(v => !v)}
                fitTrigger={fitTrigger}
                footerHeight={40}
                leftPanelOpen={leftPanelVisible}
                rightPanelOpen={rightPanelVisible}
                leftPanelWidth={leftPanelVisible ? 308 : 60}
                rightPanelWidth={rightPanelVisible ? 340 : 60}
                revealContent={!showDesignOverlay}
              />
              </ErrorBoundary>
            ) : (
              <div className="absolute inset-0 overflow-auto flex items-center justify-center p-8">
                <CertificateCanvas
                  fileUrl={template.fileUrl}
                  pdfWidth={template.pdfWidth}
                  pdfHeight={template.pdfHeight}
                  fields={fields}
                  selectedFieldId={selectedFieldId}
                  hiddenFields={hiddenFields}
                  scale={canvasScale}
                  onFieldUpdate={handleUpdateField}
                  onFieldSelect={handleFieldSelect}
                  onScaleChange={setCanvasScale}
                  onFieldDelete={handleDeleteField}
                  onTemplateResize={handleTemplateResize}
                />
              </div>
            )}

            {/* ── Stepper — floating glass overlay at bottom of canvas, centered between panels ── */}
            <div
              className="absolute bottom-4 z-30 flex justify-center items-center pointer-events-none"
              style={{
                left: leftPanelVisible ? 308 : 60,
                right: rightPanelVisible ? 340 : 60,
              }}
            >
              <div className="pointer-events-auto">
                {stepperContent}
              </div>
            </div>
            {/* ── Right panel — overlay inside canvas, never pushes template ── */}
            {!previewOpen && selectedField && (
              rightPanelVisible ? (
                <div className="absolute top-5 right-5 bottom-12 z-40 w-80 flex flex-col bg-card dark:bg-[#141414] border border-border rounded-xl shadow-2xl overflow-hidden pointer-events-auto">
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
                    <Palette className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <FieldPropertiesGuide fieldType={selectedField.type} />
                    <span className="text-xs font-semibold text-foreground flex-1">Properties</span>
                    <button
                      onClick={() => { setRightPanelVisible(false); setFitTrigger(t => t + 1); }}
                      className="text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted transition-colors"
                      title="Hide panel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]">
                    <RightPanel
                      selectedField={selectedField}
                      onFieldUpdate={(updates) => {
                        if (selectedFieldId) handleUpdateField(selectedFieldId, updates);
                      }}
                      allFieldLabels={fields.filter(f => f.id !== selectedFieldId).map(f => f.label)}
                      scale={canvasScale}
                      onScaleChange={setCanvasScale}
                      onFitToScreen={() => setFitTrigger(t => t + 1)}
                      snapToGrid={snapToGrid}
                      onSnapToggle={() => setSnapToGrid(v => !v)}
                      pdfWidth={template?.pdfWidth}
                      pdfHeight={template?.pdfHeight}
                      onAlignField={(alignment) => {
                        if (!selectedField || !template) return;
                        const { width, height } = selectedField;
                        const { pdfWidth, pdfHeight } = template;
                        const updates: Partial<CertificateField> = {};
                        if (alignment === 'left') updates.x = 0;
                        else if (alignment === 'center-h') updates.x = (pdfWidth - width) / 2;
                        else if (alignment === 'right') updates.x = pdfWidth - width;
                        else if (alignment === 'top') updates.y = 0;
                        else if (alignment === 'center-v') updates.y = (pdfHeight - height) / 2;
                        else if (alignment === 'bottom') updates.y = pdfHeight - height;
                        if (selectedFieldId) handleUpdateField(selectedFieldId, updates);
                      }}
                      onBringForward={() => selectedFieldId && handleFieldReorder(selectedFieldId, 'front')}
                      onSendBackward={() => selectedFieldId && handleFieldReorder(selectedFieldId, 'back')}
                      columnHeaders={importedData?.headers}
                    />
                  </div>
                </div>
              ) : (
                <div className="absolute top-1/2 right-5 -translate-y-1/2 z-40 pointer-events-auto">
                  <div
                    className="flex flex-col items-center gap-3 bg-card dark:bg-[#141414] border border-border rounded-xl shadow-md py-3 px-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
                    style={{ width: 40 }}
                    onClick={() => { setRightPanelVisible(true); setFitTrigger(t => t + 1); }}
                    title="Expand properties panel"
                  >
                    <Palette className="w-4 h-4 text-muted-foreground/70" />
                    <span
                      className="text-[9px] font-semibold text-muted-foreground tracking-widest uppercase"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      Props
                    </span>
                    <Maximize2 className="w-3 h-3 text-muted-foreground/40" />
                  </div>
                </div>
              )
            )}
          </div>{/* end canvas area */}

          {/* ── Preview panel ── */}
          {previewOpen && (
            <div className="flex-1 flex flex-col border-l border-border/40 min-w-0">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-card/80 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold">Preview</span>
                </div>
                <button
                  onClick={() => { setPreviewOpen(false); setFitTrigger(t => t + 1); }}
                  className="text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted transition-colors"
                  title="Close preview"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Preview content */}
              <div className="flex-1 overflow-hidden">
                <CertificatePreview
                  template={template}
                  fields={fields}
                />
              </div>
            </div>
          )}

          </div>{/* end flex row */}

        </div>
      )}

      {/* ── Navigation guard dialog ── */}
      {showNavGuard && (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Go back to template selection?</h3>
              <p className="text-xs text-muted-foreground mt-1.5">
                You have {fields.length} field{fields.length !== 1 ? 's' : ''} placed. Going back will clear all of them and cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
                onClick={() => setShowNavGuard(false)}
              >
                Stay here
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                onClick={() => {
                  setShowNavGuard(false);
                  skipAutoSelectRef.current = true;
                  selectRequestRef.current++;
                  setTemplate(null);
                  setFields([]);
                  setSelectedFieldId(null);
                  setPanelReady(false);
                  historyRef.current = [];
                  futureRef.current = [];
                  setCanUndo(false);
                  setCanRedo(false);
                  router.replace(pathname);
                  setCurrentStep('template');
                }}
              >
                Clear & go back
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Map a DB field record back to a frontend CertificateField, restoring all style properties
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbFieldToFrontend(field: any): CertificateField {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (field.style ?? {}) as Record<string, any>;
  const VALID_FRONTEND_TYPES = new Set(['name', 'course', 'date', 'start_date', 'end_date', 'custom_text', 'qr_code', 'image', 'credential_id', 'organization', 'grade', 'level', 'duration', 'issuer', 'place']);
  return {
    // Prefer originalFieldId (frontend UUID stored at save time) so field IDs remain
    // stable across DB round-trips. Falling back to field.id (DB UUID) or field_key
    // would cause autosave to derive a new field_key, duplicating fields in the DB.
    id: s.originalFieldId || field.id || field.field_key,
    type: (s.fieldType && VALID_FRONTEND_TYPES.has(s.fieldType) ? s.fieldType : mapBackendTypeToFrontend(field.type)) as CertificateField['type'],
    label: field.label,
    x: field.x,
    y: field.y,
    width: field.width || 200,
    height: field.height || 30,
    // Core text style
    fontSize: s.fontSize ?? 16,
    fontFamily: s.fontFamily ?? 'DM Sans',
    color: s.color ?? '#000000',
    fontWeight: s.fontWeight ?? '400',
    fontStyle: s.fontStyle ?? 'normal',
    textAlign: s.textAlign ?? 'left',
    // Formatting
    ...(s.dateFormat !== undefined && { dateFormat: s.dateFormat }),
    ...(s.prefix !== undefined && { prefix: s.prefix }),
    ...(s.suffix !== undefined && { suffix: s.suffix }),
    // Typography extras
    ...(s.opacity !== undefined && { opacity: s.opacity }),
    ...(s.letterSpacing !== undefined && { letterSpacing: s.letterSpacing }),
    ...(s.lineHeight !== undefined && { lineHeight: s.lineHeight }),
    ...(s.textTransform !== undefined && { textTransform: s.textTransform }),
    ...(s.textShadow !== undefined && { textShadow: s.textShadow }),
    // Gradient / color mode
    ...(s.colorMode !== undefined && { colorMode: s.colorMode }),
    ...(s.gradientStartColor !== undefined && { gradientStartColor: s.gradientStartColor }),
    ...(s.gradientEndColor !== undefined && { gradientEndColor: s.gradientEndColor }),
    ...(s.gradientAngle !== undefined && { gradientAngle: s.gradientAngle }),
    // QR code
    ...(s.qrStyle !== undefined && { qrStyle: s.qrStyle }),
    ...(s.qrTransparentBg !== undefined && { qrTransparentBg: s.qrTransparentBg }),
    ...(s.qrLogoUrl !== undefined && { qrLogoUrl: s.qrLogoUrl }),
    // Image
    ...(s.imageUrl !== undefined && { imageUrl: s.imageUrl }),
    ...(s.cornerRadius !== undefined && { cornerRadius: s.cornerRadius }),
    // Text background
    ...(s.bgPaddingH !== undefined && { bgPaddingH: s.bgPaddingH as number }),
    ...(s.bgPaddingV !== undefined && { bgPaddingV: s.bgPaddingV as number }),
    ...(s.backgroundColor !== undefined && { backgroundColor: s.backgroundColor as string }),
    ...(s.bgCornerRadius !== undefined && { bgCornerRadius: s.bgCornerRadius as number }),
  };
}

// Map frontend field type to backend field type
function mapFrontendTypeToBackend(frontendType: CertificateField['type']): 'text' | 'date' | 'qrcode' | 'custom' | 'image' {
  switch (frontendType) {
    case 'name':
    case 'course':
    case 'custom_text':
    case 'credential_id':
    case 'organization':
    case 'grade':
    case 'level':
    case 'duration':
    case 'issuer':
    case 'place':
      return 'text';
    case 'date':
    case 'start_date':
    case 'end_date':
      return 'date';
    case 'qr_code':
      return 'qrcode';
    case 'image':
      return 'image';
    default:
      return 'text';
  }
}

// Map backend field type to frontend field type
function mapBackendTypeToFrontend(backendType: string): CertificateField['type'] {
  switch (backendType) {
    case 'text':
      return 'custom_text';
    case 'date':
      return 'date';
    case 'qrcode':
      return 'qr_code';
    case 'image':
      return 'image';
    default:
      return 'custom_text';
  }
}

// Sort CSV headers to match semantic field order so data preview columns are predictable
function sortHeadersByFieldOrder(headers: string[], fields: CertificateField[]): string[] {
  const TYPE_ORDER: Record<string, number> = { name: 0, course: 1, date: 2, start_date: 3, end_date: 4, credential_id: 5, organization: 6, grade: 7, level: 8, duration: 9, issuer: 10, place: 11 };
  const labelToOrder = new Map<string, number>();
  fields.forEach(f => { labelToOrder.set(f.label.toLowerCase().trim(), TYPE_ORDER[f.type] ?? 99); });
  return [...headers].sort((a, b) => {
    const oa = labelToOrder.get(a.toLowerCase().trim()) ?? 99;
    const ob = labelToOrder.get(b.toLowerCase().trim()) ?? 99;
    return oa - ob;
  });
}

// Auto-map Excel columns to certificate fields
function autoMapColumns(fields: CertificateField[], headers: string[]): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const usedHeaders = new Set<string>();

  // Pass 1: exact label matches — highest priority, never stolen by fuzzy matching.
  // "Course Name" column belongs to the field labeled "Course Name", period.
  fields.forEach((field) => {
    const exactMatch = headers.find(
      (h) => h.toLowerCase().trim() === field.label.toLowerCase().trim()
    );
    if (exactMatch) {
      mappings.push({ fieldId: field.id, columnName: exactMatch });
      usedHeaders.add(exactMatch);
    }
  });

  // Pass 2: semantic type fuzzy matches — only for fields still unmatched, only on unclaimed headers.
  // This prevents "Course Name" from also matching the `name` type field because
  // 'course name'.includes('name') is true.
  fields.forEach((field) => {
    if (mappings.some((m) => m.fieldId === field.id)) return;
    const matchingHeader = headers.find((header) => {
      if (usedHeaders.has(header)) return false;
      const nh = header.toLowerCase().trim();
      if (field.type === 'name' && nh.includes('name')) return true;
      if (field.type === 'course' && (nh.includes('course') || nh.includes('program'))) return true;
      if (field.type === 'date' && (nh === 'date' || nh.includes('completion') || nh.includes('award'))) return true;
      if (field.type === 'start_date' && (nh.includes('start') || nh.includes('issue'))) return true;
      if (field.type === 'end_date' && (nh.includes('end') || nh.includes('expir'))) return true;
      if (field.type === 'credential_id' && (nh.includes('credential') || nh.includes('cert_id') || nh.includes('certificate_id'))) return true;
      if (field.type === 'organization' && (nh.includes('org') || nh.includes('institution') || nh.includes('company'))) return true;
      if (field.type === 'issuer' && (nh.includes('issuer') || nh.includes('instructor') || nh.includes('trainer'))) return true;
      if (field.type === 'place' && (nh.includes('place') || nh.includes('venue') || nh.includes('location') || nh.includes('city'))) return true;
      return false;
    });
    if (matchingHeader) {
      mappings.push({ fieldId: field.id, columnName: matchingHeader });
      usedHeaders.add(matchingHeader);
    }
  });

  return mappings;
}
