/**
 * GENERATE CERTIFICATE — CUSTOM STATE HOOK
 *
 * Wraps useReducer and exposes the same API as the original useState calls
 * so the component JSX is unchanged — only the state declaration block is replaced.
 */

import { useReducer, useCallback, useRef } from "react";
import type { CertificateField, CertificateTemplate, ImportedData, FieldMapping } from "@/lib/types/certificate";
import type { RecentGeneratedTemplate, InProgressTemplate } from "@/lib/api/client";
import type { Asset } from "../components/AssetLibrary";
import type { SaveStatus } from "../components/InfiniteCanvas";
import type { CertificateConfig } from "../components/ExportSection";
import type { TemplateConfig, TemplateMeta, PanelPosition, GenerateCertificateState, SavedImport } from "../schema/types";
import { generateCertificateReducer, createInitialState } from "./generateCertificateReducer";

export function useGenerateCertificateState(templateIdFromUrl: string | null) {
  const [state, dispatch] = useReducer(
    generateCertificateReducer,
    templateIdFromUrl,
    createInitialState,
  );

  // Keep a ref to current state so functional updaters never close over stale state
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Step ──────────────────────────────────────────────────────────────────

  const setCurrentStep = useCallback((step: GenerateCertificateState["currentStep"]) => {
    dispatch({ type: "SET_STEP", step });
  }, []);

  // ── Template ──────────────────────────────────────────────────────────────

  const setTemplate = useCallback(
    (updater: CertificateTemplate | null | ((prev: CertificateTemplate | null) => CertificateTemplate | null)) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.template)
        : updater;
      dispatch({ type: "SET_TEMPLATE", template: next });
    },
    [],
  );

  const setSavedTemplates = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updater: any[] | ((prev: any[]) => any[])) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.savedTemplates)
        : updater;
      dispatch({ type: "SET_SAVED_TEMPLATES", templates: next });
    },
    [],
  );

  const setIsTemplateLoading = useCallback((loading: boolean) => {
    dispatch({ type: "SET_TEMPLATE_LOADING", loading });
  }, []);

  const setTemplateMeta = useCallback((meta: TemplateMeta) => {
    dispatch({ type: "SET_TEMPLATE_META", meta });
  }, []);

  const setPdfFile = useCallback((file: File | null) => {
    dispatch({ type: "SET_PDF_FILE", file });
  }, []);

  const setTemplateVersionId = useCallback((versionId: string | null) => {
    dispatch({ type: "SET_TEMPLATE_VERSION", versionId });
  }, []);

  // ── Multi-template ────────────────────────────────────────────────────────

  const setTemplateMode = useCallback((mode: "single" | "multi") => {
    dispatch({ type: "SET_TEMPLATE_MODE", mode });
  }, []);

  const setTemplateConfigs = useCallback(
    (updater: TemplateConfig[] | ((prev: TemplateConfig[]) => TemplateConfig[])) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.templateConfigs)
        : updater;
      dispatch({ type: "SET_TEMPLATE_CONFIGS", configs: next });
    },
    [],
  );

  const setActiveTemplateIndex = useCallback((index: number) => {
    dispatch({ type: "SET_ACTIVE_TEMPLATE_INDEX", index });
  }, []);

  // ── Fields ────────────────────────────────────────────────────────────────

  const setFields = useCallback(
    (updater: CertificateField[] | ((prev: CertificateField[]) => CertificateField[])) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.fields)
        : updater;
      dispatch({ type: "SET_FIELDS", fields: next });
    },
    [],
  );

  const setSelectedFieldId = useCallback((fieldId: string | null) => {
    dispatch({ type: "SET_SELECTED_FIELD", fieldId });
  }, []);

  const setHiddenFields = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.hiddenFields)
        : updater;
      dispatch({ type: "SET_HIDDEN_FIELDS", hidden: next });
    },
    [],
  );

  // ── Data import ───────────────────────────────────────────────────────────

  const setImportedData = useCallback((data: ImportedData | null) => {
    dispatch({ type: "SET_IMPORTED_DATA", data });
  }, []);

  const setSavedImports = useCallback((imports: SavedImport[]) => {
    dispatch({ type: "SET_SAVED_IMPORTS", imports });
  }, []);

  const setFieldMappings = useCallback((mappings: FieldMapping[]) => {
    dispatch({ type: "SET_FIELD_MAPPINGS", mappings });
  }, []);

  // ── Additional cert configs ────────────────────────────────────────────────

  const setAdditionalCertConfigs = useCallback((configs: CertificateConfig[]) => {
    dispatch({ type: "SET_ADDITIONAL_CERT_CONFIGS", configs });
  }, []);

  // ── Recent usage ──────────────────────────────────────────────────────────

  const setRecentGenerated = useCallback((generated: RecentGeneratedTemplate[]) => {
    dispatch({ type: "SET_RECENT", generated, inProgress: stateRef.current.inProgressTemplates });
  }, []);

  const setInProgressTemplates = useCallback((inProgress: InProgressTemplate[]) => {
    dispatch({ type: "SET_RECENT", generated: stateRef.current.recentGenerated, inProgress });
  }, []);

  const setRecentLoading = useCallback((loading: boolean) => {
    dispatch({ type: "SET_RECENT_LOADING", loading });
  }, []);

  // ── Undo/redo flags ───────────────────────────────────────────────────────

  const setCanUndo = useCallback((canUndo: boolean) => {
    dispatch({ type: "SET_UNDO_REDO", canUndo, canRedo: stateRef.current.canRedo });
  }, []);

  const setCanRedo = useCallback((canRedo: boolean) => {
    dispatch({ type: "SET_UNDO_REDO", canUndo: stateRef.current.canUndo, canRedo });
  }, []);

  // ── Save status ───────────────────────────────────────────────────────────

  const setSaveStatus = useCallback((status: SaveStatus) => {
    dispatch({ type: "SET_SAVE_STATUS", status });
  }, []);

  // ── Canvas / view ─────────────────────────────────────────────────────────

  const setCanvasScale = useCallback((scale: number) => {
    dispatch({ type: "SET_CANVAS_SCALE", scale });
  }, []);

  const setActiveTab = useCallback((tab: string) => {
    dispatch({ type: "SET_ACTIVE_TAB", tab });
  }, []);

  const setUseInfiniteCanvas = useCallback((_value: boolean) => {
    dispatch({ type: "TOGGLE_INFINITE_CANVAS" });
  }, []);

  const setSnapToGrid = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.snapToGrid)
        : updater;
      dispatch({ type: "SET_SNAP_TO_GRID", enabled: next });
    },
    [],
  );

  const setFitTrigger = useCallback(
    (_updater: number | ((prev: number) => number)) => {
      dispatch({ type: "TRIGGER_FIT" });
    },
    [],
  );

  // ── Panels ────────────────────────────────────────────────────────────────

  const setLeftPanelVisible = useCallback((visible: boolean) => {
    dispatch({ type: "SET_LEFT_PANEL_VISIBLE", visible });
  }, []);

  const setLeftPanelPos = useCallback(
    (updater: PanelPosition | ((prev: PanelPosition) => PanelPosition)) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.leftPanelPos)
        : updater;
      dispatch({ type: "SET_LEFT_PANEL_POS", pos: next });
    },
    [],
  );

  const setRightPanelVisible = useCallback((visible: boolean) => {
    dispatch({ type: "SET_RIGHT_PANEL_VISIBLE", visible });
  }, []);

  const setStepperExpanded = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.stepperExpanded)
        : updater;
      dispatch({ type: "SET_STEPPER_EXPANDED", expanded: next });
    },
    [],
  );

  const setPanelPos = useCallback(
    (updater: PanelPosition | ((prev: PanelPosition) => PanelPosition)) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.panelPos)
        : updater;
      dispatch({ type: "SET_PANEL_POS", pos: next });
    },
    [],
  );

  const setPanelReady = useCallback((ready: boolean) => {
    dispatch({ type: "SET_PANEL_READY", ready });
  }, []);

  // ── Preview ───────────────────────────────────────────────────────────────

  const setPreviewOpen = useCallback((open: boolean) => {
    dispatch({ type: "SET_PREVIEW_OPEN", open });
  }, []);

  // ── Asset library ─────────────────────────────────────────────────────────

  const setLibraryAssets = useCallback(
    (updater: Asset[] | ((prev: Asset[]) => Asset[])) => {
      const next = typeof updater === "function"
        ? updater(stateRef.current.libraryAssets)
        : updater;
      dispatch({ type: "SET_LIBRARY_ASSETS", assets: next });
    },
    [],
  );

  // ── Nav guard ─────────────────────────────────────────────────────────────

  const setShowNavGuard = useCallback((show: boolean) => {
    dispatch({ type: "SET_NAV_GUARD", show });
  }, []);

  // ── Reset design ──────────────────────────────────────────────────────────

  const resetDesign = useCallback(() => {
    dispatch({ type: "RESET_DESIGN" });
  }, []);

  return {
    // State (spread so components access as `template`, `fields`, etc.)
    ...state,
    // Setters
    setCurrentStep,
    setTemplate,
    setSavedTemplates,
    setIsTemplateLoading,
    setTemplateMeta,
    setPdfFile,
    setTemplateVersionId,
    setTemplateMode,
    setTemplateConfigs,
    setActiveTemplateIndex,
    setFields,
    setSelectedFieldId,
    setHiddenFields,
    setImportedData,
    setSavedImports,
    setFieldMappings,
    setAdditionalCertConfigs,
    setRecentGenerated,
    setInProgressTemplates,
    setRecentLoading,
    setCanUndo,
    setCanRedo,
    setSaveStatus,
    setCanvasScale,
    setActiveTab,
    setUseInfiniteCanvas,
    setSnapToGrid,
    setFitTrigger,
    setLeftPanelVisible,
    setLeftPanelPos,
    setRightPanelVisible,
    setStepperExpanded,
    setPanelPos,
    setPanelReady,
    setPreviewOpen,
    setLibraryAssets,
    setShowNavGuard,
    resetDesign,
    dispatch,
  };
}
