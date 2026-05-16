'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useGenerateCertificateState } from './state/useGenerateCertificateState';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useOrgSlug } from '@/lib/org';
import { CertificateField, CertificateTemplate, ImportedData, FieldMapping } from '@/lib/types/certificate';
import type { Asset } from './components/AssetLibrary';
import { api } from '@/lib/api/client';
import type { RecentGeneratedTemplate, InProgressTemplate } from '@/lib/api/client';
import type { CertificateConfig } from './components/ExportSection';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sparkles, Upload, Image as ImageIcon, FileText, Download,
  CheckCircle2, Circle, Layers, Palette, Database, Wand2,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Eye,
  SlidersHorizontal, Maximize2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { SaveStatus } from './components/InfiniteCanvas';

// Heavy components lazy-loaded to reduce initial bundle and speed up first render
const CertificateCanvas  = dynamic(() => import('./components/CertificateCanvas').then(m => ({ default: m.CertificateCanvas })),  { ssr: false });
const InfiniteCanvas     = dynamic(() => import('./components/InfiniteCanvas').then(m => ({ default: m.InfiniteCanvas })),     { ssr: false });
const RightPanel         = dynamic(() => import('./components/RightPanel').then(m => ({ default: m.RightPanel })),         { ssr: false });
const TemplateSelector   = dynamic(() => import('./components/TemplateSelector').then(m => ({ default: m.TemplateSelector })),   { ssr: false });
const AssetLibrary       = dynamic(() => import('./components/AssetLibrary').then(m => ({ default: m.AssetLibrary })),       { ssr: false });
const DataSelector       = dynamic(() => import('./components/DataSelector').then(m => ({ default: m.DataSelector })),       { ssr: false });
const FieldTypeSelector  = dynamic(() => import('./components/FieldTypeSelector').then(m => ({ default: m.FieldTypeSelector })),  { ssr: false });
const FieldLayersList    = dynamic(() => import('./components/FieldLayersList').then(m => ({ default: m.FieldLayersList })),    { ssr: false });
const ExportSection      = dynamic(() => import('./components/ExportSection').then(m => ({ default: m.ExportSection })),      { ssr: false });
const CertificatePreview = dynamic(() => import('./components/CertificatePreview').then(m => ({ default: m.CertificatePreview })), { ssr: false });

export default function GenerateCertificatePage() {
  // Get query parameters
  const searchParams = useSearchParams();
  const templateIdFromUrl = searchParams.get('template');
  const pathname = usePathname();
  const router = useRouter();
  const orgSlug = useOrgSlug();

  // Prevents the URL-param auto-select from re-firing when user deliberately goes back to template chooser
  const skipAutoSelectRef = useRef(false);
  // Tracks whether we've pushed a history entry for the design step (for browser-back interception)
  const designHistoryPushedRef = useRef(false);

  const {
    template, pdfFile, savedTemplates, templateVersionId,
    fields, selectedFieldId, hiddenFields,
    importedData, savedImports, fieldMappings, additionalCertConfigs,
    templateMode, templateConfigs, activeTemplateIndex,
    recentGenerated, inProgressTemplates, recentLoading,
    canvasScale, currentStep, isTemplateLoading, activeTab, useInfiniteCanvas, libraryAssets,
    snapToGrid, fitTrigger, currentPage, totalPages,
    leftPanelVisible, leftPanelPos, rightPanelVisible,
    previewOpen, templateMeta,
    stepperExpanded, panelPos, panelReady,
    canUndo, canRedo, saveStatus, showNavGuard,
    setCurrentStep, setTemplate, setSavedTemplates, setIsTemplateLoading,
    setTemplateMeta, setPdfFile, setTemplateVersionId,
    setTemplateMode, setTemplateConfigs, setActiveTemplateIndex,
    setFields, setSelectedFieldId, setHiddenFields,
    setImportedData, setSavedImports, setFieldMappings, setAdditionalCertConfigs,
    setRecentGenerated, setInProgressTemplates, setRecentLoading,
    setCanUndo, setCanRedo, setSaveStatus,
    setCanvasScale, setActiveTab, setUseInfiniteCanvas, setCurrentPage, setTotalPages,
    setSnapToGrid, setFitTrigger,
    setLeftPanelVisible, setLeftPanelPos, setRightPanelVisible, setStepperExpanded,
    setPanelPos, setPanelReady, setPreviewOpen, setLibraryAssets, setShowNavGuard,
  } = useGenerateCertificateState(templateIdFromUrl);

  // Manual entries appended after the uploaded file rows during generation
  const [additionalRows, setAdditionalRows] = useState<Record<string, unknown>[]>([]);

  // Pending session restore — set when a saved session is found on load.
  // Null means no session to restore (or user dismissed it).
  const [pendingResumeSession, setPendingResumeSession] = useState<{
    templateId: string;
    templateName: string;
    fields: any[];
    currentPage?: number;
    canvasScale?: number;
    templateVersionId: string | null;
    currentStep: string | null;
    importedDataMeta: any;
    fieldMappings: any[];
  } | null>(null);

  // Tracks previous field IDs so we can detect when field composition changes
  const prevFieldIdsRef = useRef<string>('');

  // Cancellation ref for parallel multi-select loads
  const multiSelectRequestRef = useRef(0);

  const leftPanelDragOrigin = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const historyRef = useRef<CertificateField[][]>([]);
  const futureRef  = useRef<CertificateField[][]>([]);

  const pushToHistory = useCallback((snapshot: CertificateField[]) => {
    historyRef.current = [...historyRef.current.slice(-49), snapshot];
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1] ?? [];
    futureRef.current = [fields, ...futureRef.current.slice(0, 49)];
    historyRef.current = historyRef.current.slice(0, -1);
    setFields(prev);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }, [fields]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[0] ?? [];
    historyRef.current = [...historyRef.current, fields];
    futureRef.current = futureRef.current.slice(1);
    setFields(next);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }, [fields]);

  // Template resize tracking — used to scale fields proportionally
  const templateResizeOrigin = useRef<{ w: number; h: number; fields: CertificateField[] }>({ w: 0, h: 0, fields: [] });

  // Race-condition guard: cancel stale handleTemplateSelect calls
  const selectRequestRef = useRef(0);

  // ── Session persistence ────────────────────────────────────────────────────
  // Clear sessionStorage on unmount so navigating away doesn't auto-restore the old design session.
  useEffect(() => {
    return () => { sessionStorage.removeItem(`gencert_session:${orgSlug}`); };
  }, []);

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
        } : null;
        sessionStorage.setItem(`gencert_session:${orgSlug}`, JSON.stringify({
          templateId: template.id,
          fields,
          currentPage,
          canvasScale,
          templateVersionId,
          currentStep,
          importedDataMeta,
          fieldMappings,
        }));
      } catch { /* quota exceeded */ }
      // Persist template ID to localStorage so it survives browser close / system shutdown.
      try {
        localStorage.setItem(`gencert_last_template_id:${orgSlug}`, template.id);
      } catch { /* storage unavailable */ }
    } else if (currentStep === 'template' && sessionInitRef.current) {
      // Only clear when the user deliberately navigates back to template selection,
      // not on the initial mount where currentStep starts as 'template'.
      sessionStorage.removeItem(`gencert_session:${orgSlug}`);
    }
  }, [currentStep, template?.id, fields, currentPage, canvasScale, templateVersionId, importedData, fieldMappings]);

  // Re-run auto-mapping whenever the field composition changes (IDs added/removed)
  // so stale mappings referencing deleted fields are cleaned up automatically.
  useEffect(() => {
    const currentIds = fields.map(f => f.id).sort().join(',');
    if (prevFieldIdsRef.current && prevFieldIdsRef.current !== currentIds && importedData) {
      const allFields = templateMode === 'multi' && templateConfigs.length > 0
        ? templateConfigs.map((c, i) => i === activeTemplateIndex ? fields : c.fields).flat()
        : fields;
      setFieldMappings(autoMapColumns(allFields, importedData.headers));
    }
    prevFieldIdsRef.current = currentIds;
  }, [fields]);

  // Reset right-panel position when a new template is loaded or preview opens/closes
  useEffect(() => {
    setPanelReady(false);
  }, [template?.id, previewOpen]);

  // ── Refresh guard: design step with no template → go back to template chooser ──
  useEffect(() => {
    if (currentStep === 'design' && !template && !isTemplateLoading && !templateIdFromUrl) {
      setCurrentStep('template');
    }
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
        history.pushState({ gencertStep: 'design' }, '');
      } else if (currentStep === 'export') {
        setCurrentStep('data');
        history.pushState({ gencertStep: 'data' }, '');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [currentStep, fields.length, pathname]);

  // Load saved templates and imports
  useEffect(() => {
    // Use a window-level flag (survives HMR module re-evaluation, unlike module-level variables)
    const isInitialMount = !(window as any).__gencertInitialLoadDone;
    (window as any).__gencertInitialLoadDone = true;
    loadSavedData(isInitialMount);
  }, []);

  const loadSavedData = async (isInitialMount = false) => {
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
        templatesData.map(async (template: any) => {
          if (template.id) {
            try {
              const previewUrl = await api.templates.getPreviewUrl(template.id);
              return { ...template, preview_url: previewUrl };
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
        let templateIdToRestore: string | null = null;
        let sessionFields: any[] | null = null;
        let sessionPage: number | undefined;
        let sessionScale: number | undefined;
        let sessionVersionId: string | null = null;
        let sessionStep: string | null = null;
        let sessionImportMeta: { fileName: string; headers: string[]; rowCount: number; importId?: string; importIds?: string[] } | null = null;
        let sessionFieldMappings: any[] | null = null;

        try {
          const saved = sessionStorage.getItem(`gencert_session:${orgSlug}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            templateIdToRestore = parsed.templateId ?? null;
            sessionFields = parsed.fields ?? null;
            sessionPage = parsed.currentPage;
            sessionScale = parsed.canvasScale;
            sessionVersionId = parsed.templateVersionId ?? null;
            sessionStep = parsed.currentStep ?? null;
            sessionImportMeta = parsed.importedDataMeta ?? null;
            sessionFieldMappings = parsed.fieldMappings ?? null;
          }
        } catch {
          sessionStorage.removeItem(`gencert_session:${orgSlug}`);
        }

        // Note: we intentionally do NOT fall back to localStorage here.
        // gencert_last_template_id is a hint for the email template editor only —
        // using it here caused auto-jumping into design mode on every fresh navigation.

        if (templateIdToRestore) {
          // Guard: if the template no longer exists (deleted), discard the stale session.
          const templateObj = templatesWithSignedUrls.find((t: any) => t.id === templateIdToRestore);
          if (!templateObj) {
            sessionStorage.removeItem(`gencert_session:${orgSlug}`);
            try { localStorage.removeItem(`gencert_last_template_id:${orgSlug}`); } catch { /* ignore */ }
          } else try {
            // Don't auto-jump — show a "Resume" prompt so the user can choose to
            // continue or start fresh with a different template.
            setPendingResumeSession({
              templateId: templateIdToRestore!,
              templateName: templateObj.title || templateObj.name || 'Previous session',
              fields: sessionFields ?? [],
              currentPage: sessionPage,
              canvasScale: sessionScale,
              templateVersionId: sessionVersionId,
              currentStep: sessionStep,
              importedDataMeta: sessionImportMeta,
              fieldMappings: sessionFieldMappings ?? [],
            });
          } catch {
            // Don't clear the session on restore failure — a transient network error
            // would wipe the user's work. Just fall back to template selection.
            setIsTemplateLoading(false);
            setCurrentStep('template');
          }
        }
      }
    } catch (error) {
      console.error('[Generate] Error loading saved data:', error);
      setRecentLoading(false);
    }
  };

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
  }, [templateIdFromUrl, savedTemplates, template]);

  // Handler for selecting a recent template (with or without loading fields)
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
  const handleTemplateSelect = async (selectedTemplate: any) => {
    // Increment request ID — any previous in-flight call will see a stale ID and bail out
    const requestId = ++selectRequestRef.current;

    // Navigate to design immediately so the user isn't stuck on the template chooser
    // while API calls load the template data.
    setCurrentStep('design');
    setIsTemplateLoading(true);

    // Reset state for new template to prevent stale data
    setTemplate(null);
    setTotalPages(1);
    setCurrentPage(0);
    setFields([]);
    setSelectedFieldId(null);
    setTemplateVersionId(null);

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
    let pageCount = 1; // Default to 1 page

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

            // Determine file type from editor data or template data
            // Reset to single page for image templates
            setTotalPages(1);
            setCurrentPage(0);
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

    // Store version ID for autosave
    if (editorData?.version?.id) {
      setTemplateVersionId(editorData.version.id);
    }

    // Map backend fields to frontend format if needed
    const mappedFields = editorData?.fields?.map(mapDbFieldToFrontend) || selectedTemplate.fields || [];

    // If the user already clicked a different template, discard this result
    if (selectRequestRef.current !== requestId) { setIsTemplateLoading(false); return; }

    setTemplate({
      id: selectedTemplate.id,
      templateName: selectedTemplate.title || selectedTemplate.name,
      fileUrl,
      fileType,
      pdfWidth: pdfWidth || 800,
      pdfHeight: pdfHeight || 600,
      pageCount,
      fields: mappedFields,
    });
    setTemplateMeta({
      category: selectedTemplate.category_name || '',
      subcategory: selectedTemplate.subcategory_name || '',
    });
    setFields(mappedFields);
    setIsTemplateLoading(false);
  };

  // Safety net: if handleTemplateSelect ever throws without resetting isTemplateLoading,
  // the user would be stuck on the skeleton forever. This wrapper ensures cleanup always happens.
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
  const loadTemplateData = async (t: any): Promise<{ template: CertificateTemplate; fields: CertificateField[]; versionId: string | null }> => {
    try {
      const editorData = await api.templates.getEditorData(t.id);
      let fileUrl: string = editorData?.source_file?.url || t.preview_url || '';
      const fileType = 'image';
      const mappedFields: CertificateField[] = (editorData?.fields ?? []).map(mapDbFieldToFrontend);

      let pdfWidth: number = t.width || 0;
      let pdfHeight: number = t.height || 0;
      const pageCount = 1;

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
        pageCount,
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
          pageCount: 1,
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

    const templateObj = savedTemplates.find((t: any) => t.id === session.templateId);
    if (!templateObj) return;

    await handleTemplateSelectSafe(templateObj);

    if (session.fields.length > 0) {
      const sanitized = session.fields.map((f: any) => ({
        ...f,
        imageUrl: f.imageUrl?.startsWith('blob:') ? undefined : f.imageUrl,
        qrLogoUrl: f.qrLogoUrl?.startsWith('blob:') ? undefined : f.qrLogoUrl,
      }));
      setFields(sanitized);
    }
    if (session.currentPage !== undefined) setCurrentPage(session.currentPage);
    if (session.canvasScale) setCanvasScale(session.canvasScale);
    if (session.templateVersionId) setTemplateVersionId(session.templateVersionId);
    if (session.fieldMappings.length > 0) setFieldMappings(session.fieldMappings);

    const meta = session.importedDataMeta;
    if (meta?.importId) {
      try {
        const [importJob, dataPage] = await Promise.all([
          api.imports.get(meta.importId),
          api.imports.getData(meta.importId, { limit: 100 }),
        ]);
        const rows = ((dataPage.items ?? []) as Array<{ row_index: number; data: Record<string, any> }>).map((r: any) => r.data ?? r);
        setImportedData({
          fileName: importJob.file_name ?? meta.fileName,
          headers: meta.headers,
          rows,
          rowCount: importJob.total_rows ?? meta.rowCount,
          importId: meta.importId,
          importIds: meta.importIds ?? [meta.importId],
        });
      } catch {
        setImportedData({ fileName: meta.fileName, headers: meta.headers, rows: [], rowCount: meta.rowCount, importId: meta.importId, importIds: meta.importIds });
      }
    }

    if (session.currentStep === 'data' || session.currentStep === 'export') {
      setCurrentStep(session.currentStep as any);
    }
  };

  // Multi-mode: load all selected templates in parallel, navigate to design
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
    setCurrentPage(0);
    // Fit the new template to screen (different dimensions = wrong scale otherwise)
    setFitTrigger(t => t + 1);
    // Restore this template's own undo/redo history
    historyRef.current = cfg.history ?? [];
    futureRef.current = cfg.future ?? [];
    setCanUndo((cfg.history?.length ?? 0) > 0);
    setCanRedo((cfg.future?.length ?? 0) > 0);
  };

  const handleNewTemplateUpload = async (file: File, width: number, height: number, saveTemplate: boolean, templateName?: string, categoryId?: string, subcategoryId?: string): Promise<any> => {
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
      if (!categoryId || !subcategoryId) return null;
      try {
        const templateData = await api.templates.create(file, {
          title: finalTemplateName.trim(),
          category_id: categoryId,
          subcategory_id: subcategoryId,
        });
        // Try to attach a preview URL so the carousel card shows the thumbnail
        let withPreview: any = templateData;
        try {
          const previewUrl = await api.templates.getPreviewUrl(templateData.id);
          withPreview = { ...templateData, preview_url: previewUrl };
        } catch { /* preview not critical */ }
        setSavedTemplates(prev => [withPreview, ...prev]);
        return withPreview;
      } catch (error: any) {
        console.error('Error saving template in multi mode:', error);
        return null;
      }
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

    if (saveTemplate) {
      try {
        if (!categoryId || !subcategoryId) {
          throw new Error('Category and subcategory IDs are required');
        }
        const templateData = await api.templates.create(file, {
          title: finalTemplateName.trim(),
          category_id: categoryId,
          subcategory_id: subcategoryId,
        });
        setSavedTemplates((prev) => [templateData, ...prev]);
        if (templateData.version?.id) {
          setTemplateVersionId(templateData.version.id);
        }
        setTemplate((prev) => prev ? { ...prev, id: templateData.id } : null);
      } catch (error: any) {
        console.error('Error saving template:', error);
        if (error?.message?.includes('Bucket not found') || error?.message?.includes('bucket') || error?.statusCode === 404) {
          toast.error('Storage Bucket Error', {
            description: `The storage bucket "authentix" might not exist or you don't have access. Check that the bucket exists in Supabase Storage, storage policies allow uploads, and your user has organization_id set. (${error?.message})`,
          });
        } else {
          toast.error('Failed to save template', {
            description: `${error?.message || 'Unknown error'} — you can still use it for this session.`,
          });
        }
      }
    }
    return null;
  };

  const handleDeleteTemplate = async (templateId: string) => {
    await api.templates.delete(templateId);
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

  const handleAddField = (field: CertificateField) => {
    pushToHistory(fields);
    setFields((prev) => {
      const uniqueLabel = makeUniqueLabel(field.label, prev);
      return [...prev, { ...field, label: uniqueLabel }];
    });
    setSelectedFieldId(field.id);
    setRightPanelVisible(true);
  };

  const handleUpdateField = (fieldId: string, updates: Partial<CertificateField>) => {
    setFields((prev) =>
      prev.map((field) => (field.id === fieldId ? { ...field, ...updates } : field))
    );
  };

  const handleDeleteField = (fieldId: string) => {
    pushToHistory(fields);
    setFields((prev) => prev.filter((field) => field.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  const handleFieldsDelete = (fieldIds: string[]) => {
    pushToHistory(fields);
    const idSet = new Set(fieldIds);
    setFields((prev) => prev.filter((f) => !idSet.has(f.id)));
    if (selectedFieldId && idSet.has(selectedFieldId)) setSelectedFieldId(null);
  };

  const handleFieldDuplicate = (field: CertificateField) => {
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
  }, [fields, pushToHistory]);

  const handleFieldSelect = (fieldId: string) => {
    if (previewOpen) return; // don't open right panel in preview mode
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
      pageNumber: currentPage,
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
    
    if (!templateId || !versionId || fields.length === 0) return;

    setSaveStatus('saving');
    const timeoutId = setTimeout(async () => {
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
            if (field.qrLogoUrl) style.qrLogoUrl = field.qrLogoUrl;
          }
          if (field.type === 'image') {
            if (field.cornerRadius !== undefined) style.cornerRadius = field.cornerRadius;
            if (field.imageUrl) style.imageUrl = field.imageUrl;
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
            page_number: (field.pageNumber ?? 0) + 1, // Convert 0-indexed to 1-indexed
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
        setTimeout(() => setSaveStatus('idle'), 2000);
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
    }, 1000); // Debounce: wait 1 second after last change

    return () => clearTimeout(timeoutId);
  }, [fields, template?.id, templateVersionId]);
  
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
    if (importedData && fieldMappings.length > 0) {
      setCurrentStep('export');
    }
  };

  const handleLoadImport = async (importId: string) => {
    try {
      // Fetch metadata and normalized rows from the backend — no client-side file parsing.
      const [importJob, dataPage] = await Promise.all([
        api.imports.get(importId),
        api.imports.getData(importId, { limit: 100 }),
      ]);

      // Backend returns { row_index, data: {...} } — extract the inner data object
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

  // Step indicators
  const steps = [
    { id: 'template', label: 'Choose Template', icon: FileText, completed: !!template },
    { id: 'design', label: 'Design Fields', icon: Palette, completed: !!template && fields.length > 0 },
    { id: 'data', label: 'Import Data', icon: Database, completed: !!importedData },
    { id: 'export', label: 'Generate', icon: Wand2, completed: false },
  ];


  const stepperContent = (
    <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-full border">
      {steps.map((step, index) => {
        const isActive = currentStep === step.id;
        const isCompleted = step.completed;

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => {
                const canNavigate = step.completed || isActive || index === steps.findIndex(s => s.id === currentStep) + 1;
                if (!canNavigate) return;
                // Going back to template selection — warn if fields exist
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
                setCurrentStep(step.id as any);
              }}
              disabled={!step.completed && !isActive && index !== steps.findIndex(s => s.id === currentStep) + 1 && step.id !== 'template'}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${isActive 
                  ? 'bg-primary text-primary-foreground shadow-sm' 
                  : isCompleted 
                  ? 'text-foreground hover:bg-muted-foreground/10' 
                  : index === steps.findIndex(s => s.id === currentStep) + 1
                  ? 'text-foreground/70 hover:bg-muted-foreground/10'
                  : 'text-muted-foreground opacity-50 cursor-not-allowed'
                }
              `}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${isActive ? 'border-primary-foreground/30' : 'border-muted-foreground'}`}>{index + 1}</span>
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <div className="w-4 h-px bg-border mx-2" />
            )}
          </div>
        );
      })}
    </div>
  );

  const titleContent = (
    <div className="flex flex-col justify-center">
       <h1 className="text-sm font-semibold tracking-tight">Generate Certificate</h1>
       <p className="text-[10px] text-muted-foreground hidden lg:block">
         Design, customize, and issue certificates in four simple steps.
       </p>
    </div>
  );

  const handleLeftPanelDragStart = (e: React.MouseEvent) => {
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

  return (
    <>
      {/* Normal flow layout (template / data / export steps) */}
      <div className="flex flex-col h-[calc(100vh-3rem)]">

        {/* Inline title + stepper (shown on non-design steps) */}
        {currentStep !== 'design' && (
          <div className="flex items-center justify-between pb-3 shrink-0">
            {titleContent}
            {stepperContent}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden min-h-0">
          {currentStep === 'template' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Resume session banner */}
              {pendingResumeSession && (
                <div className="shrink-0 mx-6 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Resume previous session?</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      You were working on <span className="font-medium text-foreground">{pendingResumeSession.templateName}</span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleResumeSession}
                    className="shrink-0 gap-1.5"
                  >
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPendingResumeSession(null);
                      sessionStorage.removeItem(`gencert_session:${orgSlug}`);
                    }}
                    className="shrink-0 text-muted-foreground"
                  >
                    Start fresh
                  </Button>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <TemplateSelector
                  savedTemplates={savedTemplates}
                  onSelectTemplate={(t) => { setTemplateMode('single'); handleTemplateSelect(t); setPendingResumeSession(null); }}
                  onNewUpload={handleNewTemplateUpload}
                  onDeleteTemplate={handleDeleteTemplate}
                  recentGenerated={recentGenerated}
                  inProgress={inProgressTemplates}
                  recentLoading={recentLoading}
                  onSelectRecentTemplate={(t, loadFields) => { handleRecentTemplateSelect(t, loadFields); setPendingResumeSession(null); }}
                  templateMode={templateMode}
                  onTemplateModeChange={setTemplateMode}
                  onSelectMultipleTemplates={(ts) => { handleSelectMultipleTemplates(ts); setPendingResumeSession(null); }}
                />
              </div>
            </div>
          )}

          {currentStep === 'data' && (
            <div className="flex-1 p-8 overflow-y-auto">
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
                  />
                );
              })()}
            </div>
          )}

          {currentStep === 'export' && (
            <div className="flex-1 p-8 overflow-y-auto">
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
                      subcategoryName={templateMeta.subcategory || undefined}
                      savedTemplates={savedTemplates}
                      additionalConfigs={multiAdditional}
                      onAdditionalConfigsChange={undefined}
                      additionalRows={additionalRows}
                    />
                  );
                }
                return (
                  <ExportSection
                    template={template}
                    fields={fields}
                    importedData={importedData}
                    fieldMappings={fieldMappings}
                    subcategoryName={templateMeta.subcategory || undefined}
                    savedTemplates={savedTemplates}
                    additionalConfigs={additionalCertConfigs}
                    onAdditionalConfigsChange={setAdditionalCertConfigs}
                    additionalRows={additionalRows}
                  />
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Template loading overlay (shown while handleTemplateSelect fetches data) ── */}
      {currentStep === 'design' && !template && isTemplateLoading && (
        <div className="fixed top-0 left-14 right-0 bottom-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
          <div className="relative w-20 h-20">
            <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '1.6s' }} />
            <div className="absolute inset-3 rounded-full bg-primary/15 flex items-center justify-center">
              <Wand2 className="w-8 h-8 text-primary animate-pulse" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground font-medium">Loading template…</p>
        </div>
      )}

      {/* ── Full-screen design overlay ── */}
      {currentStep === 'design' && template && (
        <div className="fixed top-0 left-14 right-0 bottom-0 z-50 bg-background flex flex-col">

          {/* Canvas area + optional preview — flex row, fills all space */}
          <div className="flex-1 flex overflow-hidden">

          {/* Editing canvas — always fills full width; panels float as absolute overlays */}
          <div className="flex-1 relative overflow-hidden min-w-0" ref={canvasAreaRef}>
            {useInfiniteCanvas ? (
              <ErrorBoundary fallbackLabel="Canvas failed to load">
              <InfiniteCanvas
                fileUrl={template.fileUrl}
                pdfWidth={template.pdfWidth}
                pdfHeight={template.pdfHeight}
                fields={fields.filter(f => (f.pageNumber ?? 0) === currentPage)}
                selectedFieldId={selectedFieldId}
                hiddenFields={hiddenFields}
                scale={canvasScale}
                currentPage={currentPage + 1}
                totalPages={totalPages}
                onFieldUpdate={handleUpdateField}
                onFieldSelect={handleFieldSelect}
                onScaleChange={setCanvasScale}
                onFieldDelete={handleDeleteField}
                onTemplateResize={handleTemplateResize}
                onTemplateResizeStart={handleTemplateResizeStart}
                onPageChange={(page) => setCurrentPage(page - 1)}
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
                }}
                previewOpen={previewOpen}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                saveStatus={saveStatus}
                onFieldsDelete={handleFieldsDelete}
                onFieldReorder={handleFieldReorder}
                onFieldLock={handleFieldLock}
                onFieldDragStart={handleFieldDragStart}
                snapToGrid={snapToGrid}
                onSnapToggle={() => setSnapToGrid(v => !v)}
                fitTrigger={fitTrigger}
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

            {/* ── Left pill (collapsed) — floating, left:12 keeps gap from nav ── */}
            {!leftPanelVisible && !previewOpen && (
              <div
                className="absolute z-40 flex flex-col items-center gap-3 bg-card border border-border/50 rounded-xl shadow-md py-3 px-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
                style={{ left: 12, top: '50%', transform: 'translateY(-50%)', width: 40 }}
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
            )}

            {/* ── Left panel (expanded) — floating overlay ── */}
            {leftPanelVisible && !previewOpen && (
              <div
                className="absolute z-40 w-72 flex flex-col bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden"
                style={{ left: 12, top: 60, height: 'calc(100% - 140px)' }}
              >
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40 shrink-0">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-semibold text-foreground flex-1">Layers</span>
                  <button
                    onClick={() => setLeftPanelVisible(false)}
                    className="text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

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

                <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
                    <div className="px-3 pt-2 pb-1 shrink-0">
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
                    <TabsContent value="fields" className="p-3 mt-0 space-y-5">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Add Fields</p>
                        <FieldTypeSelector
                          onAddField={handleAddField}
                          onAddImageField={handleAddAssetField}
                          onAddImageFile={handleAddImageFile}
                          pdfWidth={template.pdfWidth}
                          pdfHeight={template.pdfHeight}
                          currentPage={currentPage}
                        />
                      </div>
                      <div className="pb-4">
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Layers</p>
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
                    </TabsContent>
                    <TabsContent value="assets" className="p-3 mt-0">
                      <AssetLibrary
                        assets={libraryAssets}
                        onAssetsChange={setLibraryAssets}
                        onAddAsset={handleAddAssetField}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}

            {/* ── Right pill (collapsed) ── */}
            {selectedField && !rightPanelVisible && !previewOpen && (
              <div
                className="absolute z-40 flex flex-col items-center gap-3 bg-card border border-border/50 rounded-xl shadow-md py-3 px-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
                style={{ right: 12, top: '50%', transform: 'translateY(-50%)', width: 40 }}
                onClick={() => setRightPanelVisible(true)}
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
            )}

            {/* ── Right panel (expanded) — floating overlay ── */}
            {selectedField && rightPanelVisible && !previewOpen && (
              <div
                className="absolute z-40 w-80 flex flex-col bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden"
                style={{ right: 12, top: 60, height: 'calc(100% - 140px)' }}
              >
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40 shrink-0">
                  <Palette className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-semibold text-foreground flex-1">Properties</span>
                  <button
                    onClick={() => setRightPanelVisible(false)}
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
            )}

            {/* ── Stepper — transparent overlay at bottom of canvas ── */}
            <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
              <div className="flex items-center px-4 py-2 gap-2 pointer-events-auto">
                <div className="flex-1 flex justify-center">
                  {stepperExpanded ? (
                    stepperContent
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground select-none">
                      {steps.find(s => s.id === currentStep)?.label ?? 'Design Fields'}
                    </span>
                  )}
                </div>
                <button
                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
                  onClick={() => setStepperExpanded(v => !v)}
                  title={stepperExpanded ? 'Collapse steps' : 'Expand steps'}
                >
                  {stepperExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

          </div>{/* end editing canvas */}

          {/* ── Preview panel ── */}
          {previewOpen && (
            <div className="flex-1 flex flex-col border-l border-border/40 min-w-0">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-card/80 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold">Preview</span>
                  <span className="text-[10px] text-muted-foreground/60">· sample values</span>
                </div>
                <button
                  onClick={() => setPreviewOpen(false)}
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
                  currentPage={currentPage}
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
function mapDbFieldToFrontend(field: any): CertificateField {
  const s = (field.style ?? {}) as Record<string, any>;
  const VALID_FRONTEND_TYPES = new Set(['name', 'course', 'start_date', 'end_date', 'custom_text', 'qr_code', 'image']);
  return {
    id: field.id || field.field_key,
    type: (s.fieldType && VALID_FRONTEND_TYPES.has(s.fieldType) ? s.fieldType : mapBackendTypeToFrontend(field.type)) as CertificateField['type'],
    label: field.label,
    x: field.x,
    y: field.y,
    width: field.width || 200,
    height: field.height || 30,
    // Multi-page: page_number is 1-indexed in DB, pageNumber is 0-indexed in frontend
    pageNumber: field.page_number != null ? field.page_number - 1 : 0,
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
  };
}

// Map frontend field type to backend field type
function mapFrontendTypeToBackend(frontendType: CertificateField['type']): 'text' | 'date' | 'qrcode' | 'custom' | 'image' {
  switch (frontendType) {
    case 'name':
    case 'course':
    case 'custom_text':
      return 'text';
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
      return 'start_date';
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
  const TYPE_ORDER: Record<string, number> = { name: 0, course: 1, start_date: 2, end_date: 3, email: 4, phone: 5 };
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
      if (field.type === 'start_date' && (nh.includes('start') || nh.includes('issue'))) return true;
      if (field.type === 'end_date' && (nh.includes('end') || nh.includes('expir'))) return true;
      if (field.type === 'email' && (nh.includes('email') || nh.includes('e-mail'))) return true;
      if (field.type === 'phone' && (nh.includes('phone') || nh.includes('mobile') || nh.includes('contact'))) return true;
      return false;
    });
    if (matchingHeader) {
      mappings.push({ fieldId: field.id, columnName: matchingHeader });
      usedHeaders.add(matchingHeader);
    }
  });

  return mappings;
}
