/**
 * GENERATE CERTIFICATE — DOMAIN TYPES
 *
 * Canonical type definitions for the certificate generation flow.
 * Imported by page, components, state, and service layers.
 */

import type { CertificateField, CertificateTemplate, ImportedData, FieldMapping } from "@/lib/types/certificate";
import type { RecentGeneratedTemplate, InProgressTemplate } from "@/lib/api/client";
import type { Asset } from "../components/AssetLibrary";
import type { SaveStatus } from "../components/InfiniteCanvas";
import type { CertificateConfig } from "../components/ExportSection";

export type GenerateStep = "template" | "design" | "data" | "export";
export type TemplateMode = "single" | "multi";

export interface SavedImport {
  id: string;
  file_name?: string;
  total_rows?: number;
  status?: string;
  created_at?: string;
}

// ── Per-template config (multi-template mode) ─────────────────────────────────

export interface TemplateConfig {
  template: CertificateTemplate;
  fields: CertificateField[];
  versionId: string | null;
  history?: CertificateField[][];
  future?: CertificateField[][];
}

// ── Template metadata ─────────────────────────────────────────────────────────

export interface TemplateMeta {
  category: string;
  subcategory: string;
}

// ── Panel position ────────────────────────────────────────────────────────────

export interface PanelPosition {
  x: number;
  y: number;
}

// ── Full page state ───────────────────────────────────────────────────────────

export interface GenerateCertificateState {
  // Step navigation
  currentStep: GenerateStep;

  // Template
  template: CertificateTemplate | null;
  pdfFile: File | null;
  savedTemplates: any[]; // API response shape differs from frontend CertificateTemplate
  templateVersionId: string | null;
  isTemplateLoading: boolean;
  templateMeta: TemplateMeta;

  // Multi-template
  templateMode: TemplateMode;
  templateConfigs: TemplateConfig[];
  activeTemplateIndex: number;

  // Fields
  fields: CertificateField[];
  selectedFieldId: string | null;
  hiddenFields: Set<string>;

  // Data import
  importedData: ImportedData | null;
  savedImports: SavedImport[];
  fieldMappings: FieldMapping[];

  // Additional cert configs (multi-cert generation)
  additionalCertConfigs: CertificateConfig[];

  // Recent usage
  recentGenerated: RecentGeneratedTemplate[];
  inProgressTemplates: InProgressTemplate[];
  recentLoading: boolean;

  // Undo/redo flags (actual history lives in refs)
  canUndo: boolean;
  canRedo: boolean;

  // Autosave
  saveStatus: SaveStatus;

  // Canvas / view
  canvasScale: number;
  activeTab: string;
  useInfiniteCanvas: boolean;
  currentPage: number;
  totalPages: number;

  // Panel visibility
  leftPanelVisible: boolean;
  leftPanelPos: PanelPosition;
  rightPanelVisible: boolean;
  stepperExpanded: boolean;

  // Preview
  previewOpen: boolean;

  // Draggable properties panel
  panelPos: PanelPosition;
  panelReady: boolean;

  // Canvas controls
  snapToGrid: boolean;
  fitTrigger: number;

  // Asset library (lifted to survive tab switches)
  libraryAssets: Asset[];

  // Nav guard
  showNavGuard: boolean;
}

// ── Initial state factory ─────────────────────────────────────────────────────

export function createInitialState(templateIdFromUrl: string | null): GenerateCertificateState {
  return {
    currentStep: templateIdFromUrl ? "design" : "template",
    template: null,
    pdfFile: null,
    savedTemplates: [] as any[],
    templateVersionId: null,
    isTemplateLoading: !!templateIdFromUrl,
    templateMeta: { category: "", subcategory: "" },
    templateMode: "single",
    templateConfigs: [],
    activeTemplateIndex: 0,
    fields: [],
    selectedFieldId: null,
    hiddenFields: new Set(),
    importedData: null,
    savedImports: [],
    fieldMappings: [],
    additionalCertConfigs: [] as CertificateConfig[],
    recentGenerated: [],
    inProgressTemplates: [],
    recentLoading: true,
    canUndo: false,
    canRedo: false,
    saveStatus: "idle",
    canvasScale: 0.5,
    activeTab: "fields",
    useInfiniteCanvas: true,
    currentPage: 0,
    totalPages: 1,
    leftPanelVisible: true,
    leftPanelPos: { x: 16, y: 24 },
    rightPanelVisible: true,
    stepperExpanded: true,
    previewOpen: false,
    panelPos: { x: 0, y: 0 },
    panelReady: false,
    snapToGrid: false,
    fitTrigger: 0,
    libraryAssets: [],
    showNavGuard: false,
  };
}
