"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  ChevronLeft, ChevronRight, Loader2, Eye, EyeOff, Monitor, Smartphone,
  SlidersHorizontal, X, Layers,
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
  blocksToHtml,
  extractBlocksFromHtml,
  defaultBlock,
  STARTER_BLOCKS,
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
  onDone: (result: EmailEditorResult) => void;
  onBack: () => void;
}

// ── Live preview (mirrors template editor) ──────────────────────────────────────

function LivePreview({ html, previewMode }: { html: string; previewMode: "desktop" | "mobile" }) {
  const rendered = applyPreviewMocks(html);
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
    const saved = initialHtml ? extractBlocksFromHtml(initialHtml) : null;
    return saved ?? STARTER_BLOCKS.map(b => ({ ...b, id: nanoid(8) }));
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Panel / UI state
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [leftPanelTab, setLeftPanelTab] = useState<"blocks" | "settings">("blocks");
  const [panelWidth, setPanelWidth] = useState(0);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [selectedVar, setSelectedVar] = useState<string | null>(null);
  const [dockMinimized, setDockMinimized] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Resize-drag refs
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  // Clear selected var when block selection changes
  useEffect(() => { setSelectedVar(null); }, [selectedId]);

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

  // ── Block handlers ──────────────────────────────────────────────────────────

  const handleBlocksChange = useCallback((newBlocks: EmailBlock[]) => {
    setBlocks(newBlocks);
  }, []);

  const addBlock = useCallback((type: BlockType) => {
    const b = defaultBlock(type);
    setBlocks(prev => [...prev, b]);
    setSelectedId(b.id);
    requestAnimationFrame(() => {
      document.getElementById("broadcast-canvas")?.scrollTo({ top: 99999, behavior: "smooth" });
    });
  }, []);

  const handleStartFresh = () => {
    setBlocks(STARTER_BLOCKS.map(b => ({ ...b, id: nanoid(8) })));
    setSelectedId(null);
  };

  // ── Variable insertion ──────────────────────────────────────────────────────

  const handleInsertVar = useCallback((varName: string) => {
    if (!selectedId) {
      toast.info("Click a text block in the canvas first, then click a variable to insert it", { duration: 2500 });
      return;
    }
    setBlocks(prev => {
      const block = prev.find(b => b.id === selectedId);
      if (!block) return prev;
      const clean = varName.replace(/^\{\{|\}\}$/g, "").trim();
      const token = `{{${clean}}}`;
      const replaceOrAppend = (text: string) => {
        if (selectedVar) {
          const old = `{{${selectedVar}}}`;
          if (text.includes(old)) return text.replace(old, token);
        }
        return (text ?? "") + " " + token;
      };
      let patch: Partial<EmailBlock> | null = null;
      if (["text", "greeting", "markdown", "footer", "linkedin", "cta_button"].includes(block.type)) {
        patch = { content: replaceOrAppend(block.content ?? "") };
      } else if (block.type === "header") {
        patch = { title: replaceOrAppend(block.title ?? "") };
      }
      if (!patch) return prev;
      return prev.map(b => b.id === selectedId ? { ...b, ...patch! } : b);
    });
    setSelectedVar(null);
  }, [selectedId, selectedVar]);

  // ── Done ────────────────────────────────────────────────────────────────────

  const handleDone = async () => {
    setPublishing(true);
    try {
      onDone({
        subject,
        from_name: fromName,
        from_email: fromEmail,
        reply_to: replyTo,
        preview_text: previewText,
        html_body: bodyHtml,
        content_json: null,
      });
    } catch {
      toast.error("Failed to save email design");
      setPublishing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">

      {/* ── Header ── */}
      <header className="h-11 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0">
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

        {/* ── CENTER: canvas + floating left panel ── */}
        <div className="flex-1 relative overflow-hidden min-w-0">

          {/* Collapsed panel restore pill */}
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
              {/* Panel header */}
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

              {/* Tab switcher */}
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

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto min-h-0">

                {/* Blocks tab */}
                {leftPanelTab === "blocks" && (
                  <div className="p-3 pb-4">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Add Blocks</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {EMAIL_BLOCKS_PALETTE.map(item => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => addBlock(item.type)}
                          draggable
                          onDragStart={e => e.dataTransfer.setData("block-type", item.type)}
                          title={item.desc}
                          className="flex items-center gap-2 p-2.5 rounded-lg border border-transparent bg-muted/30 hover:bg-muted/60 hover:border-border cursor-grab active:cursor-grabbing transition-all text-left group"
                        >
                          <span className="shrink-0 text-muted-foreground group-hover:text-[#3ECF8E] transition-colors">
                            {item.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium truncate">{item.label}</p>
                            <p className="text-[9px] text-muted-foreground truncate leading-tight">{item.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 mt-2.5">Click to add · drag into canvas</p>
                  </div>
                )}

                {/* Settings tab — meta fields */}
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
                        <p className="text-[9px] text-muted-foreground/50">Click to copy · select a block and use the dock below to insert</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Canvas scroll area — panel floats over canvas so email stays centred */}
          <div
            id="broadcast-canvas"
            className="absolute inset-0 overflow-y-auto pt-3 pb-24"
          >
            <EmailBlockBuilder
              blocks={blocks}
              selectedId={selectedId}
              subject={subject}
              availableVars={availableVars}
              onChange={handleBlocksChange}
              onSelect={setSelectedId}
              onStartFresh={handleStartFresh}
              onSubjectChange={setSubject}
              onAddBlock={addBlock}
              onVarClick={v => setSelectedVar(v)}
            />
          </div>
        </div>

        {/* ── RIGHT: Preview panel (optional) ── */}

        {/* Floating preview pill — only when panel hidden */}
        {panelWidth === 0 && (
          <button
            className="absolute z-40 right-4 top-3 flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-md px-3 py-2 hover:bg-zinc-800 transition-colors select-none text-zinc-400 hover:text-zinc-200"
            onClick={() => setPanelWidth(previewMode === "mobile" ? 440 : 660)}
            title="Show preview"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Preview</span>
          </button>
        )}

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
              <div className="flex items-center justify-between px-4 pt-4 pb-2.5 shrink-0 border-b border-zinc-800 bg-zinc-900/80">
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

              {/* Preview content */}
              <div className="flex-1 overflow-y-auto p-3 pb-24">
                {bodyHtml.trim() ? (
                  <LivePreview html={bodyHtml} previewMode={previewMode} />
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
                  Sample values shown.{" "}
                  <span className="text-amber-500/80">Amber</span>
                  {" "}= unknown variables.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── BOTTOM DOCK ── */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="pointer-events-auto inline-flex flex-col items-stretch bg-zinc-900/95 backdrop-blur-md border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden">

          {/* Replace indicator */}
          {selectedVar && (
            <div className="flex items-center justify-center gap-2 px-4 py-1.5 border-b border-[#3ECF8E]/20 bg-[#3ECF8E]/5">
              <span className="text-[10px] text-[#3ECF8E]/90">
                Replacing{" "}
                <code className="font-mono bg-[#3ECF8E]/15 px-1 rounded">{`{{${selectedVar}}}`}</code>
                {" "}— click a field to replace, or{" "}
                <button onClick={() => setSelectedVar(null)} className="underline hover:text-[#3ECF8E] transition-colors">cancel</button>
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-2">

            {!dockMinimized && (
              <>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">Fields</p>

                {availableVars.length > 0 ? (
                  <div
                    className="flex items-center gap-1.5 overflow-x-auto"
                    style={{ maxWidth: 420, scrollbarWidth: "none" }}
                  >
                    {availableVars.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleInsertVar(v)}
                        title={
                          selectedVar
                            ? `Replace {{${selectedVar}}} with {{${v}}}`
                            : `Insert {{${v}}} into selected block`
                        }
                        className={cn(
                          "flex items-center px-2.5 py-1.5 rounded-lg border transition-all shrink-0 font-mono text-[11px] font-medium",
                          selectedVar
                            ? "border-[#3ECF8E]/60 bg-[#3ECF8E]/15 text-[#3ECF8E] hover:bg-[#3ECF8E]/25"
                            : "border-zinc-700/50 bg-zinc-800/40 hover:bg-[#3ECF8E]/10 hover:border-[#3ECF8E]/40 text-zinc-400 hover:text-zinc-200",
                        )}
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] text-zinc-600 italic">
                    Upload a CSV in the Recipients step to add personalised variables
                  </span>
                )}

                <div className="w-px h-5 bg-zinc-700/60 shrink-0" />
              </>
            )}

            {/* Minimize toggle */}
            <button
              onClick={() => setDockMinimized(d => !d)}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
              title={dockMinimized ? "Show fields" : "Collapse fields"}
            >
              {dockMinimized
                ? <ChevronRight className="w-3.5 h-3.5" />
                : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>

            {/* Preview toggle */}
            {panelWidth === 0 && (
              <button
                onClick={() => setPanelWidth(360)}
                className="p-1 rounded-lg text-zinc-500 hover:text-[#3ECF8E] hover:bg-zinc-800 transition-colors shrink-0"
                title="Show preview"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
