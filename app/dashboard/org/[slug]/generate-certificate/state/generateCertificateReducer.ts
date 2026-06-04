/**
 * GENERATE CERTIFICATE — STATE REDUCER
 *
 * Centralises all state transitions for the certificate generation flow.
 * Replaces 20+ scattered useState hooks with a single, testable reducer.
 *
 * Usage (once the page is migrated to use this):
 *   const [state, dispatch] = useReducer(generateCertificateReducer, createInitialState(urlTemplateId));
 *
 * Current status: infrastructure-ready — page.tsx still uses useState hooks
 * (Wave 2 migration). Components can start using this reducer incrementally.
 */

import type { CertificateField, CertificateTemplate, ImportedData, FieldMapping } from "@/lib/types/certificate";
import type { RecentGeneratedTemplate, InProgressTemplate } from "@/lib/api/client";
import type { Asset } from "../components/AssetLibrary";
import type { SaveStatus } from "../components/InfiniteCanvas";
import type { CertificateConfig } from "../components/ExportSection";
import type {
  GenerateCertificateState,
  GenerateStep,
  TemplateConfig,
  TemplateMeta,
  PanelPosition,
  SavedImport,
} from "../schema/types";
import { createInitialState } from "../schema/types";

// ── Action types ──────────────────────────────────────────────────────────────

export type GenerateCertificateAction =
  // Step navigation
  | { type: "SET_STEP"; step: GenerateStep }

  // Template
  | { type: "SET_TEMPLATE"; template: CertificateTemplate | null; versionId?: string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: "SET_SAVED_TEMPLATES"; templates: any[] }
  | { type: "SET_TEMPLATE_LOADING"; loading: boolean }
  | { type: "SET_TEMPLATE_META"; meta: TemplateMeta }
  | { type: "SET_TEMPLATE_FILE"; file: File | null }
  | { type: "SET_TEMPLATE_VERSION"; versionId: string | null }
  | { type: "REMOVE_SAVED_TEMPLATE"; templateId: string }
   

  // Multi-template
  | { type: "SET_TEMPLATE_MODE"; mode: "single" | "multi" }
  | { type: "SET_TEMPLATE_CONFIGS"; configs: TemplateConfig[] }
  | { type: "SET_ACTIVE_TEMPLATE_INDEX"; index: number }

  // Fields
  | { type: "SET_FIELDS"; fields: CertificateField[] }
  | { type: "SET_SELECTED_FIELD"; fieldId: string | null }
  | { type: "TOGGLE_FIELD_VISIBILITY"; fieldId: string }
  | { type: "SET_HIDDEN_FIELDS"; hidden: Set<string> }

  // Data import
  | { type: "SET_IMPORTED_DATA"; data: ImportedData | null }
  | { type: "SET_SAVED_IMPORTS"; imports: SavedImport[] }
  | { type: "SET_FIELD_MAPPINGS"; mappings: FieldMapping[] }

  // Additional cert configs
  | { type: "SET_ADDITIONAL_CERT_CONFIGS"; configs: CertificateConfig[] }

  // Recent usage
  | { type: "SET_RECENT"; generated: RecentGeneratedTemplate[]; inProgress: InProgressTemplate[] }
  | { type: "SET_RECENT_LOADING"; loading: boolean }

  // Undo/redo flags
  | { type: "SET_UNDO_REDO"; canUndo: boolean; canRedo: boolean }

  // Save status
  | { type: "SET_SAVE_STATUS"; status: SaveStatus }

  // Canvas / view
  | { type: "SET_CANVAS_SCALE"; scale: number }
  | { type: "SET_ACTIVE_TAB"; tab: string }
  | { type: "TOGGLE_INFINITE_CANVAS" }
  | { type: "SET_SNAP_TO_GRID"; enabled: boolean }
  | { type: "TRIGGER_FIT" }

  // Panels
  | { type: "SET_LEFT_PANEL_VISIBLE"; visible: boolean }
  | { type: "SET_LEFT_PANEL_POS"; pos: PanelPosition }
  | { type: "SET_RIGHT_PANEL_VISIBLE"; visible: boolean }
  | { type: "SET_STEPPER_EXPANDED"; expanded: boolean }
  | { type: "SET_PANEL_POS"; pos: PanelPosition }
  | { type: "SET_PANEL_READY"; ready: boolean }

  // Preview
  | { type: "SET_PREVIEW_OPEN"; open: boolean }

  // Asset library
  | { type: "SET_LIBRARY_ASSETS"; assets: Asset[] }

  // Nav guard
  | { type: "SET_NAV_GUARD"; show: boolean }

  // Reset
  | { type: "RESET_DESIGN" };

// ── Reducer ───────────────────────────────────────────────────────────────────

export function generateCertificateReducer(
  state: GenerateCertificateState,
  action: GenerateCertificateAction,
): GenerateCertificateState {
  switch (action.type) {
    // ── Step ────────────────────────────────────────────────────────────────
    case "SET_STEP":
      return { ...state, currentStep: action.step };

    // ── Template ─────────────────────────────────────────────────────────────
    case "SET_TEMPLATE":
      return {
        ...state,
        template: action.template,
        ...(action.versionId !== undefined ? { templateVersionId: action.versionId } : {}),
      };
    case "SET_SAVED_TEMPLATES":
      return { ...state, savedTemplates: action.templates };
    case "SET_TEMPLATE_LOADING":
      return { ...state, isTemplateLoading: action.loading };
    case "SET_TEMPLATE_META":
      return { ...state, templateMeta: action.meta };
    case "SET_TEMPLATE_FILE":
      return { ...state, templateFile: action.file };
    case "SET_TEMPLATE_VERSION":
      return { ...state, templateVersionId: action.versionId };
    case "REMOVE_SAVED_TEMPLATE":
      return {
        ...state,
        savedTemplates: state.savedTemplates.filter((t) => t.id !== action.templateId),
      };

    // ── Multi-template ────────────────────────────────────────────────────────
    case "SET_TEMPLATE_MODE":
      return { ...state, templateMode: action.mode };
    case "SET_TEMPLATE_CONFIGS":
      return { ...state, templateConfigs: action.configs };
    case "SET_ACTIVE_TEMPLATE_INDEX":
      return { ...state, activeTemplateIndex: action.index };

    // ── Fields ───────────────────────────────────────────────────────────────
    case "SET_FIELDS":
      return { ...state, fields: action.fields };
    case "SET_SELECTED_FIELD":
      return { ...state, selectedFieldId: action.fieldId };
    case "TOGGLE_FIELD_VISIBILITY": {
      const hidden = new Set(state.hiddenFields);
      hidden.has(action.fieldId) ? hidden.delete(action.fieldId) : hidden.add(action.fieldId);
      return { ...state, hiddenFields: hidden };
    }
    case "SET_HIDDEN_FIELDS":
      return { ...state, hiddenFields: action.hidden };

    // ── Data import ───────────────────────────────────────────────────────────
    case "SET_IMPORTED_DATA":
      return { ...state, importedData: action.data };
    case "SET_SAVED_IMPORTS":
      return { ...state, savedImports: action.imports };
    case "SET_FIELD_MAPPINGS":
      return { ...state, fieldMappings: action.mappings };
    case "SET_ADDITIONAL_CERT_CONFIGS":
      return { ...state, additionalCertConfigs: action.configs };

    // ── Recent usage ──────────────────────────────────────────────────────────
    case "SET_RECENT":
      return { ...state, recentGenerated: action.generated, inProgressTemplates: action.inProgress };
    case "SET_RECENT_LOADING":
      return { ...state, recentLoading: action.loading };

    // ── Undo/redo ─────────────────────────────────────────────────────────────
    case "SET_UNDO_REDO":
      return { ...state, canUndo: action.canUndo, canRedo: action.canRedo };

    // ── Save status ───────────────────────────────────────────────────────────
    case "SET_SAVE_STATUS":
      return { ...state, saveStatus: action.status };

    // ── Canvas ────────────────────────────────────────────────────────────────
    case "SET_CANVAS_SCALE":
      return { ...state, canvasScale: action.scale };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "TOGGLE_INFINITE_CANVAS":
      return { ...state, useInfiniteCanvas: !state.useInfiniteCanvas };
    case "SET_SNAP_TO_GRID":
      return { ...state, snapToGrid: action.enabled };
    case "TRIGGER_FIT":
      return { ...state, fitTrigger: state.fitTrigger + 1 };

    // ── Panels ────────────────────────────────────────────────────────────────
    case "SET_LEFT_PANEL_VISIBLE":
      return { ...state, leftPanelVisible: action.visible };
    case "SET_LEFT_PANEL_POS":
      return { ...state, leftPanelPos: action.pos };
    case "SET_RIGHT_PANEL_VISIBLE":
      return { ...state, rightPanelVisible: action.visible };
    case "SET_STEPPER_EXPANDED":
      return { ...state, stepperExpanded: action.expanded };
    case "SET_PANEL_POS":
      return { ...state, panelPos: action.pos };
    case "SET_PANEL_READY":
      return { ...state, panelReady: action.ready };

    // ── Preview ───────────────────────────────────────────────────────────────
    case "SET_PREVIEW_OPEN":
      return { ...state, previewOpen: action.open };

    // ── Asset library ─────────────────────────────────────────────────────────
    case "SET_LIBRARY_ASSETS":
      return { ...state, libraryAssets: action.assets };

    // ── Nav guard ─────────────────────────────────────────────────────────────
    case "SET_NAV_GUARD":
      return { ...state, showNavGuard: action.show };

    // ── Reset design ──────────────────────────────────────────────────────────
    case "RESET_DESIGN":
      return {
        ...state,
        template: null,
        templateFile: null,
        templateVersionId: null,
        fields: [],
        selectedFieldId: null,
        hiddenFields: new Set(),
        importedData: null,
        fieldMappings: [],
        canUndo: false,
        canRedo: false,
        saveStatus: "idle",
        panelReady: false,
        currentStep: "template",
      };

    default:
      return state;
  }
}

// Re-export for convenience
export { createInitialState };
