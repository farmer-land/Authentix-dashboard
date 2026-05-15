"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  ChevronLeft, Loader2, Eye, EyeOff, Monitor, Smartphone,
  SlidersHorizontal, X, Layers, Undo2, Redo2, Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import {
  EmailBlockBuilder,
  BlockPropertiesPanel,
  PaletteItemCard,
  blocksToHtml,
  extractBlocksFromHtml,
  defaultBlock,
  EMAIL_BLOCKS_PALETTE,
  applyPreviewMocks,
  type EmailBlock,
  type BlockType,
} from "../email-templates/[id]/EmailBlockBuilder";

// ── Types ───────────────────────────────────────────────────────────────────────

export interface EmailEditorResult {
  subject: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  preview_text: string;
  html_body: string;
  content_json: JSONContent | null;
}

interface EmailEditorProps {
  campaignName: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  /** Pass w.html_body to restore a previously designed email */
  initialHtml?: string;
  /** CSV column names surfaced as insertable variables */
  availableVars?: string[];
  /** Actual CSV rows for preview simulation (column → value) */
  csvRows?: Record<string, string>[];
  onDone: (result: EmailEditorResult) => void;
  onBack: () => void;
}

// ── Keyboard shortcuts shown in the popover ──────────────────────────────────

const KEYBOARD_SHORTCUTS = [
  { keys: ["⌘", "Z"],        desc: "Undo" },
  { keys: ["⌘", "⇧", "Z"],  desc: "Redo" },
  { keys: ["Del"],            desc: "Delete block" },
  { keys: ["⌘", "D"],        desc: "Duplicate block" },
  { keys: ["Esc"],            desc: "Deselect block" },
];

// ── Live preview (mirrors template editor) ──────────────────────────────────────

function applyRowData(html: string, row: Record<string, string>): string {
  return html.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, key: string) => {
    const k = key.trim();
    const val = row[k];
    if (val === undefined) return match;
    return `<span style="background:rgba(255,255,255,0.92);color:#1a1a1a;border:1px solid rgba(0,0,0,0.18);border-radius:5px;padding:1px 7px;font-size:inherit;line-height:inherit;font-weight:600;" title="Row data for {{${k}}}">${val}</span>`;
  });
}

function LivePreview({ html, previewMode, rowData }: { html: string; previewMode: "desktop" | "mobile"; rowData?: Record<string, string> }) {
  const rendered = rowData ? applyRowData(html, rowData) : applyPreviewMocks(html);
  const maxW = previewMode === "mobile" ? 375 : 600;
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#18181b;font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:flex-start;min-height:100vh}.ew{width:100%;max-width:${maxW}px;background:#18181b;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}</style></head><body><div class="ew">${rendered}</div></body></html>`;
  return (
    <div className="w-full">
      <div className="rounded-t-xl overflow-hidden border border-zinc-700 shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border-b border-zinc-700">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <span className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex-1 mx-2 bg-zinc-700 rounded-md h-6 flex items-center px-3">
            <span className="text-[10px] text-zinc-400 truncate">
              📧 Preview — {previewMode === "mobile" ? "Mobile" : "Desktop"}
            </span>
          </div>
        </div>
        <iframe
          key={`${srcDoc.length}-${previewMode}`}
          srcDoc={srcDoc}
          className="w-full border-0 block"
          style={{ minHeight: 520, background: "#18181b" }}
          onLoad={e => {
            const f = e.target as HTMLIFrameElement;
            const b = f.contentDocument?.body;
            if (b) f.style.height = Math.max(b.scrollHeight + 32, 520) + "px";
          }}
          title="Email Preview"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}

// ── Main editor ─────────────────────────────────────────────────────────────────

export function EmailEditor({
  campaignName,
  subject: initialSubject,
  fromName: initialFromName,
  fromEmail: initialFromEmail,
  replyTo: initialReplyTo,
  initialHtml,
  availableVars = [],
  csvRows = [],
  onDone,
  onBack,
}: EmailEditorProps) {
  // Meta fields
  const [subject, setSubject] = useState(initialSubject);
  const [fromName, setFromName] = useState(initialFromName);
  const [fromEmail, setFromEmail] = useState(initialFromEmail);
  const [replyTo, setReplyTo] = useState(initialReplyTo);
  const [previewText, setPreviewText] = useState("");

  // Block canvas state
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => {
    if (initialHtml) {
      const saved = extractBlocksFromHtml(initialHtml);
      if (saved) return saved;
    }
    // No saved content — show template gallery (empty blocks triggers gallery in EmailBlockBuilder)
    return [];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Undo/redo history (stored in refs — mutations don't trigger re-renders)
  const historyRef = useRef<{ past: EmailBlock[][], future: EmailBlock[][] }>({ past: [], future: [] });
  const blocksRef = useRef<EmailBlock[]>(blocks);
  const selectedIdRef = useRef<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Keep selectedIdRef in sync so keyboard handler doesn't go stale
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Panel / UI state
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [leftPanelTab, setLeftPanelTab] = useState<"blocks" | "settings">("blocks");
  const [panelWidth, setPanelWidth] = useState(0);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);

  // Resize-drag refs
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  // Panel resize mouse handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX;
      setPanelWidth(Math.min(700, Math.max(280, dragStartW.current + delta)));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const bodyHtml = blocksToHtml(blocks);

  // ── Undo / Redo ─────────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    historyRef.current.past = past.slice(0, -1);
    historyRef.current.future = [blocksRef.current, ...future];
    blocksRef.current = prev;
    setBlocks(prev);
    setCanUndo(past.length > 1);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future[0]!;
    historyRef.current.past = [...past, blocksRef.current];
    historyRef.current.future = future.slice(1);
    blocksRef.current = next;
    setBlocks(next);
    setCanUndo(true);
    setCanRedo(future.length > 1);
  }, []);

  // ── Block handlers ───────────────────────────────────────────────────────────

  const handleBlocksChange = useCallback((newBlocks: EmailBlock[]) => {
    const past = historyRef.current.past;
    historyRef.current.past = [...(past.length >= 60 ? past.slice(-59) : past), blocksRef.current];
    historyRef.current.future = [];
    blocksRef.current = newBlocks;
    setBlocks(newBlocks);
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const addBlock = useCallback((type: BlockType) => {
    const b = defaultBlock(type);
    const cur = blocksRef.current;
    // Insert before footer if it is the last block, so footer stays pinned at the bottom
    const lastIsFooter = cur[cur.length - 1]?.type === "footer";
    const insertAt = lastIsFooter ? cur.length - 1 : cur.length;
    const newBlocks = [...cur.slice(0, insertAt), b, ...cur.slice(insertAt)];
    historyRef.current.past = [...historyRef.current.past, cur];
    historyRef.current.future = [];
    blocksRef.current = newBlocks;
    setBlocks(newBlocks);
    setSelectedId(b.id);
    setCanUndo(true);
    setCanRedo(false);
    requestAnimationFrame(() => {
      document.getElementById("broadcast-canvas")?.scrollTo({ top: 99999, behavior: "smooth" });
    });
  }, []);

  const handleStartFresh = useCallback(() => {
    // Broadcast-only starter: no cert-specific blocks (cert_image, qr_code, details_box)
    const fresh = [
      defaultBlock("header"),
      defaultBlock("greeting"),
      defaultBlock("text"),
      defaultBlock("cta_button"),
      defaultBlock("linkedin"),
      defaultBlock("divider"),
      defaultBlock("footer"),
    ].map(b => ({ ...b, id: nanoid(8) }));
    historyRef.current.past = [...historyRef.current.past, blocksRef.current];
    historyRef.current.future = [];
    blocksRef.current = fresh;
    setBlocks(fresh);
    setSelectedId(null);
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  // ── Keyboard-shortcut actions (stable — use refs only) ───────────────────────

  const deleteSelected = useCallback(() => {
    const curId = selectedIdRef.current;
    if (!curId) return;
    const curBlocks = blocksRef.current;
    const idx = curBlocks.findIndex(b => b.id === curId);
    const newBlocks = curBlocks.filter(b => b.id !== curId);
    historyRef.current.past = [...historyRef.current.past, curBlocks];
    historyRef.current.future = [];
    blocksRef.current = newBlocks;
    setBlocks(newBlocks);
    setSelectedId(newBlocks[Math.min(idx, newBlocks.length - 1)]?.id ?? null);
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const duplicateSelected = useCallback(() => {
    const curId = selectedIdRef.current;
    if (!curId) return;
    const curBlocks = blocksRef.current;
    const block = curBlocks.find(b => b.id === curId);
    if (!block) return;
    const dup = { ...block, id: nanoid(8) };
    const newBlocks = curBlocks.flatMap(b => b.id === curId ? [b, dup] : [b]);
    historyRef.current.past = [...historyRef.current.past, curBlocks];
    historyRef.current.future = [];
    blocksRef.current = newBlocks;
    setBlocks(newBlocks);
    setSelectedId(dup.id);
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); return; }
      if ((meta && e.shiftKey && e.key === "z") || (meta && e.key === "y")) { e.preventDefault(); redo(); return; }
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.getAttribute("contenteditable") === "true";
      if (isEditing) return;
      if (!selectedIdRef.current) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); return; }
      if (meta && e.key === "d") { e.preventDefault(); duplicateSelected(); return; }
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelected, duplicateSelected]);

  // ── Done ────────────────────────────────────────────────────────────────────

  const handleDone = () => {
    setPublishing(true);
    onDone({
      subject,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
      preview_text: previewText,
      html_body: bodyHtml,
      content_json: null,
    });
    // Note: component unmounts after onDone — no need to reset publishing
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (window.innerWidth < 768) setLeftPanelVisible(false);
  }, []);

  return (
    <div className="fixed inset-0 left-14 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <header className="h-11 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Email Campaigns
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-xs text-foreground truncate max-w-48">{campaignName || "New Campaign"}</span>

        <div className="flex items-center gap-2 ml-auto">
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Composing
          </Badge>
          <Button
            size="sm"
            onClick={handleDone}
            disabled={publishing}
            className="h-7 text-xs"
          >
            {publishing
              ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Saving…</>
              : "Done"}
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── CENTER: canvas + floating panels ── */}
        <div className="flex-1 relative overflow-hidden min-w-0">

          {/* Left panel — collapsed restore pill */}
          {!leftPanelVisible && (
            <button
              className="absolute z-40 left-4 top-3 flex items-center gap-2 bg-card border border-border/50 rounded-xl shadow-md px-3 py-2 hover:bg-muted/50 transition-colors select-none"
              onClick={() => setLeftPanelVisible(true)}
              title="Show blocks panel"
            >
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                {campaignName || "Campaign"}
              </span>
            </button>
          )}

          {/* Floating left panel */}
          {leftPanelVisible && (
            <div
              className="absolute z-40 left-4 top-3 w-64 flex flex-col bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden"
              style={{ height: "calc(100% - 24px)" }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 border-b border-border/40 shrink-0 select-none">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">
                  {campaignName || "New Campaign"}
                </span>
                <button
                  onClick={() => setLeftPanelVisible(false)}
                  className="text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="px-3 pt-2 pb-1.5 shrink-0">
                <div className="flex items-center bg-muted rounded-lg p-1 gap-1 h-8">
                  <button
                    onClick={() => setLeftPanelTab("blocks")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md h-full transition-all",
                      leftPanelTab === "blocks"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Layers className="w-3 h-3" />
                    Blocks
                  </button>
                  <button
                    onClick={() => setLeftPanelTab("settings")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md h-full transition-all",
                      leftPanelTab === "settings"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    Settings
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {leftPanelTab === "blocks" && (
                  <div className="p-3 pb-4">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Add Blocks</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {EMAIL_BLOCKS_PALETTE.map(item => (
                        <PaletteItemCard
                          key={item.type}
                          item={item}
                          onClick={() => addBlock(item.type)}
                          onDragStart={e => e.dataTransfer.setData("block-type", item.type)}
                        />
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 mt-2.5">Click to add · hover to preview · drag into canvas</p>
                  </div>
                )}

                {leftPanelTab === "settings" && (
                  <div className="p-3 space-y-3 pb-4">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Email settings</p>
                    {[
                      { id: "bc-subject",  label: "Subject",      val: subject,     set: setSubject,     ph: "Your email subject…" },
                      { id: "bc-from",     label: "From name",    val: fromName,    set: setFromName,    ph: "DigiCertificates" },
                      { id: "bc-email",    label: "From email",   val: fromEmail,   set: setFromEmail,   ph: "hello@example.com" },
                      { id: "bc-reply",    label: "Reply-to",     val: replyTo,     set: setReplyTo,     ph: "Same as from" },
                      { id: "bc-preview",  label: "Preview text", val: previewText, set: setPreviewText, ph: "Short inbox preview…" },
                    ].map(f => (
                      <div key={f.id} className="space-y-1">
                        <Label htmlFor={f.id} className="text-[10px] text-muted-foreground">{f.label}</Label>
                        <Input
                          id={f.id}
                          value={f.val}
                          onChange={e => f.set(e.target.value)}
                          placeholder={f.ph}
                          className="h-7 text-xs"
                        />
                      </div>
                    ))}

                    {availableVars.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">CSV Variables</p>
                        <div className="flex flex-wrap gap-1">
                          {availableVars.map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(`{{${v}}}`).catch(() => {});
                                toast.success(`Copied {{${v}}}`, { duration: 1500 });
                              }}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-muted/40 hover:bg-muted text-foreground/70 hover:text-foreground transition-colors"
                              title={`Click to copy {{${v}}}`}
                            >
                              {`{{${v}}}`}
                            </button>
                          ))}
                        </div>
                        <p className="text-[9px] text-muted-foreground/50">
                          Click to copy · or type <code className="bg-muted px-0.5 rounded">{"{{" }</code> in any text block to insert
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Floating right panel — block properties */}
          {rightPanelVisible && (
            <div
              className="absolute z-40 right-4 top-3 w-64 flex flex-col bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden"
              style={{ height: "calc(100% - 24px)" }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 border-b border-border/40 shrink-0 select-none">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <p className="flex-1 text-xs font-semibold text-foreground">Properties</p>
                <button
                  onClick={() => setRightPanelVisible(false)}
                  className="text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <BlockPropertiesPanel
                  block={blocks.find(b => b.id === selectedId) ?? null}
                  onChange={updated => handleBlocksChange(blocks.map(b => b.id === updated.id ? updated : b))}
                />
              </div>
            </div>
          )}
          {!rightPanelVisible && (
            <button
              className="absolute z-40 right-4 top-3 flex items-center gap-2 bg-card border border-border/50 rounded-xl shadow-md px-3 py-2 hover:bg-muted/50 transition-colors select-none"
              onClick={() => setRightPanelVisible(true)}
              title="Show properties panel"
            >
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-semibold text-foreground">Properties</span>
            </button>
          )}

          {/* Canvas — dot grid background, Figma-style */}
          <div
            id="broadcast-canvas"
            className="absolute inset-0 overflow-y-auto pt-3 pb-24 transition-[padding] duration-200"
            style={{
              paddingLeft: leftPanelVisible ? 272 : 0,
              paddingRight: rightPanelVisible ? 272 : 0,
              backgroundColor: "#0d0d0d",
              backgroundImage: "radial-gradient(circle, #2a2a2a 1.5px, transparent 1.5px)",
              backgroundSize: "22px 22px",
            }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedId(null); }}
          >
            <EmailBlockBuilder
              blocks={blocks}
              selectedId={selectedId}
              subject={subject}
              senderName={fromName}
              availableVars={availableVars}
              context="broadcast"
              onChange={handleBlocksChange}
              onSelect={setSelectedId}
              onStartFresh={handleStartFresh}
              onSubjectChange={setSubject}
              onSenderNameChange={setFromName}
              onAddBlock={addBlock}
            />
          </div>
        </div>

        <div
          style={{ width: panelWidth }}
          className={cn(
            "shrink-0 border-l flex flex-col overflow-hidden bg-zinc-950 relative transition-[width] duration-200",
            panelWidth === 0 && "border-l-0",
          )}
        >
          {panelWidth > 0 && (
            <>
              {/* Resize handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize z-20 flex items-center justify-center group/resize hover:bg-[#3ECF8E]/5 transition-colors"
                onMouseDown={e => {
                  e.preventDefault();
                  isDragging.current = true;
                  dragStartX.current = e.clientX;
                  dragStartW.current = panelWidth;
                }}
              >
                <div className="flex flex-col gap-[3px] opacity-0 group-hover/resize:opacity-100 transition-opacity">
                  {[0,1,2,3,4].map(i => (
                    <span key={i} className="w-[3px] h-[3px] rounded-full bg-[#3ECF8E]" />
                  ))}
                </div>
              </div>

              {/* Preview header */}
              <div className="flex flex-col gap-2 px-4 pt-4 pb-2.5 shrink-0 border-b border-zinc-800 bg-zinc-900/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Preview</p>
                    <span className="text-[10px] text-zinc-700">{panelWidth}px</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5 border border-zinc-700 rounded-md p-0.5 bg-zinc-800/50">
                      <button
                        onClick={() => { setPreviewMode("desktop"); setPanelWidth(w => Math.max(w, 660)); }}
                        className={cn(
                          "p-1 rounded transition-colors",
                          previewMode === "desktop" ? "bg-zinc-700 text-white shadow-sm" : "hover:bg-zinc-700/50 text-zinc-500",
                        )}
                        title="Desktop"
                      >
                        <Monitor className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => { setPreviewMode("mobile"); setPanelWidth(w => Math.min(w, 440)); }}
                        className={cn(
                          "p-1 rounded transition-colors",
                          previewMode === "mobile" ? "bg-zinc-700 text-white shadow-sm" : "hover:bg-zinc-700/50 text-zinc-500",
                        )}
                        title="Mobile"
                      >
                        <Smartphone className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => setPanelWidth(0)}
                      className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                      title="Hide preview"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {csvRows.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-zinc-500 shrink-0">Preview as</span>
                    <select
                      value={selectedRowIdx ?? ""}
                      onChange={e => setSelectedRowIdx(e.target.value === "" ? null : Number(e.target.value))}
                      className="flex-1 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40"
                    >
                      <option value="">Sample data</option>
                      {csvRows.map((_, i) => <option key={i} value={i}>Row {i + 1}{csvRows[i]?.recipient_name ? ` — ${csvRows[i].recipient_name}` : ""}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Preview content */}
              <div className="flex-1 overflow-y-auto p-3 pb-24">
                {bodyHtml.trim() ? (
                  <LivePreview html={bodyHtml} previewMode={previewMode} rowData={selectedRowIdx !== null ? csvRows[selectedRowIdx] : undefined} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Monitor className="w-4 h-4 text-zinc-600" />
                    </div>
                    <p className="text-xs text-zinc-600">Add blocks to preview</p>
                  </div>
                )}
              </div>

              {/* Preview footer */}
              <div className="border-t border-zinc-800 px-3 py-2 shrink-0 bg-zinc-900">
                <p className="text-[9px] text-zinc-600">
                  {selectedRowIdx !== null
                    ? `Showing row ${selectedRowIdx + 1} from your CSV.`
                    : <>Sample values shown. <span className="text-amber-500/80">Amber</span> = unknown variables.</>
                  }
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── BOTTOM DOCK ── */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-1 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/60 rounded-2xl shadow-2xl px-3 py-2">

          {/* Undo */}
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:scale-95"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          {/* Redo */}
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:scale-95"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-700/60 mx-0.5" />

          {/* Properties toggle */}
          <button
            onClick={() => setRightPanelVisible(v => !v)}
            title={rightPanelVisible ? "Hide properties" : "Show block properties"}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              rightPanelVisible
                ? "text-[#3ECF8E] bg-[#3ECF8E]/15"
                : "text-zinc-400 hover:text-[#3ECF8E] hover:bg-zinc-800",
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Preview toggle */}
          <button
            onClick={() => setPanelWidth(w => w === 0 ? (previewMode === "mobile" ? 440 : 660) : 0)}
            title={panelWidth > 0 ? "Hide preview" : "Show preview"}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              panelWidth > 0
                ? "text-[#3ECF8E] bg-[#3ECF8E]/15"
                : "text-zinc-400 hover:text-[#3ECF8E] hover:bg-zinc-800",
            )}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-700/60 mx-0.5" />

          {/* Keyboard shortcuts popover */}
          <div className="relative">
            <button
              onClick={() => setShortcutsOpen(v => !v)}
              title="Keyboard shortcuts"
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                shortcutsOpen
                  ? "text-zinc-200 bg-zinc-800"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800",
              )}
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>

            {shortcutsOpen && (
              <div className="absolute bottom-9 right-0 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl p-3 min-w-44 z-50">
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Keyboard Shortcuts</p>
                <div className="space-y-1.5">
                  {KEYBOARD_SHORTCUTS.map(s => (
                    <div key={s.desc} className="flex items-center justify-between gap-4">
                      <span className="text-[11px] text-zinc-400">{s.desc}</span>
                      <div className="flex items-center gap-0.5">
                        {s.keys.map(k => (
                          <kbd key={k} className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono leading-none">{k}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
