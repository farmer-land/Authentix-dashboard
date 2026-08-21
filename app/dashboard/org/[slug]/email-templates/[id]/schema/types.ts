/**
 * EMAIL TEMPLATE EDITOR — DOMAIN TYPES
 */

import type { EmailBlock } from "../EmailBlockBuilder";

export type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
export type PreviewMode = "desktop" | "mobile";

// ── Editor state ──────────────────────────────────────────────────────────────

export interface EmailEditorState {
  // Load/save lifecycle
  loading: boolean;
  saving: boolean;
  error: string;
  autoSaveStatus: AutoSaveStatus;

  // Template data
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
  isActive: boolean;
  variables: string[];
  senderName: string;

  // Block builder
  blocks: EmailBlock[];
  selectedId: string | null;

  // UI
  previewMode: PreviewMode;
  panelWidth: number;
  leftPanelVisible: boolean;
  leftPanelTab: "blocks" | "settings";
  dockMinimized: boolean;

  // Variable replacement
  selectedVar: string | null;

  // Test send
  testEmail: string;
  testSending: boolean;
}

export function createInitialEmailEditorState(): EmailEditorState {
  return {
    loading: true,
    saving: false,
    error: "",
    autoSaveStatus: "idle",
    name: "",
    subject: "",
    body: "",
    isDefault: false,
    isActive: true,
    variables: [],
    senderName: "Your Organization",
    blocks: [],
    selectedId: null,
    previewMode: "desktop",
    panelWidth: 0,
    leftPanelVisible: true,
    leftPanelTab: "blocks",
    dockMinimized: false,
    selectedVar: null,
    testEmail: "",
    testSending: false,
  };
}
