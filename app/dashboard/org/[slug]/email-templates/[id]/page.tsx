"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Save, Loader2, AlertCircle, Monitor, Smartphone,
  SendHorizonal, Send, FlaskConical,
  SlidersHorizontal, X, Layers,
  Eye, EyeOff, Undo2, Redo2, Keyboard,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useOrg } from "@/lib/org";
import {
  EmailBlockBuilder,
  BlockPropertiesPanel,
  PaletteItemCard,
  blocksToHtml,
  extractBlocksFromHtml,
  defaultBlock,
  STARTER_BLOCKS,
  PALETTE,
  CERT_BLOCKS_PALETTE,
  applyPreviewMocks,
  type EmailBlock,
  type BlockType,
  type EmailBackground,
} from "./EmailBlockBuilder";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { useEmailEditorState } from "./state/useEmailEditorState";

// ── Keyboard shortcut legend ──────────────────────────────────────────────────

const KEYBOARD_SHORTCUTS = [
  { key: "⌘Z", label: "Undo" },
  { key: "⌘⇧Z", label: "Redo" },
  { key: "⌫", label: "Delete selected block" },
  { key: "⌘D", label: "Duplicate block" },
  { key: "↑ / ↓", label: "Move block up / down" },
  { key: "Esc", label: "Deselect" },
  { key: "@  or  {{", label: "Insert variable" },
  { key: "⌘+ / ⌘−", label: "Zoom in / out" },
  { key: "⌘0", label: "Reset zoom to 100%" },
] as const;

// ── Live preview ──────────────────────────────────────────────────────────────

function LivePreview({ html, previewMode, panelWidth }: { html: string; previewMode: "desktop" | "mobile"; panelWidth: number }) {
  const rendered = applyPreviewMocks(html);
  const contentMaxWidth = previewMode === "mobile" ? 375 : 600;
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#18181b;font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:flex-start;min-height:100vh}.email-wrapper{width:100%;max-width:${contentMaxWidth}px;background:#18181b;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5)}</style></head><body><div class="email-wrapper">${rendered}</div></body></html>`;

  return (
    <div className="w-full">
      <div className="rounded-t-xl overflow-hidden border border-zinc-700 shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border-b border-zinc-700">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <span className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex-1 mx-2 bg-zinc-700 rounded-md h-6 flex items-center px-3 gap-2">
            <span className="text-[10px] text-zinc-400 truncate">📧 Email Preview — {previewMode === "mobile" ? "Mobile" : "Desktop"}</span>
          </div>
        </div>
        <iframe
          key={`${srcDoc.length}-${previewMode}`}
          srcDoc={srcDoc}
          className="w-full border-0 block"
          style={{ minHeight: 520, background: "#18181b" }}
          onLoad={(e) => {
            const iframe = e.target as HTMLIFrameElement;
            const body = iframe.contentDocument?.body;
            if (body) iframe.style.height = Math.max(body.scrollHeight + 32, 520) + "px";
          }}
          title="Email Preview"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}

// ── Main editor page ──────────────────────────────────────────────────────────

export default function EmailTemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgPath, slug: orgSlug } = useOrg();
  const templateId = params.id as string;
  const returnToSend = searchParams.get("returnToSend") === "1";

  const {
    loading, saving, error,
    name, subject, body, isDefault, isActive, variables, senderName,
    blocks, selectedId,
    previewMode, panelWidth, leftPanelVisible, leftPanelTab,
    testEmail, testSending, autoSaveStatus,
    setName, setSubject, setBody, setIsDefault, setIsActive, setVariables, setSenderName,
    setBlocks, setSelectedId,
    setSaving, setError, setAutoSaveStatus,
    setPreviewMode, setPanelWidth, setLeftPanelVisible, setLeftPanelTab,
    setTestEmail, setTestSending,
    onLoadSuccess,
  } = useEmailEditorState();

  // Right panel for block properties
  const [rightPanelVisible, setRightPanelVisible] = useState(true);

  // Email background
  const [emailBg, setEmailBg] = useState<EmailBackground>({ type: "solid", color: "#18181b" });

  // Canvas zoom (Ctrl+scroll or +/- controls)
  const [zoom, setZoom] = useState(1.0);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  // Undo/redo history (stored in refs to avoid re-renders on push)
  const historyRef = useRef<{ past: EmailBlock[][]; future: EmailBlock[][] }>({ past: [], future: [] });
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryFlags = () => {
    setCanUndo(historyRef.current.past.length > 0);
    setCanRedo(historyRef.current.future.length > 0);
  };

  // Refs (DOM/timing)
  const builderInitRef = useRef(false);
  const isDraggingPanel = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);
  const subjectInputRef = useRef<HTMLInputElement>(null);

  function insertSubjectVar(variable: string) {
    const tag = `{{${variable}}}`;
    const el = subjectInputRef.current;
    const start = el?.selectionStart ?? subject.length;
    const end = el?.selectionEnd ?? subject.length;
    const next = subject.slice(0, start) + tag + subject.slice(end);
    handleSubjectChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  // Hide left panel on small screens; hide right panel too
  useEffect(() => {
    if (window.innerWidth < 768) {
      setLeftPanelVisible(false);
      setRightPanelVisible(false);
    }
  }, []);

  useEffect(() => {
    loadTemplate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // ── Auto-save (debounced 4s) ─────────────────────────────────────────────
  useEffect(() => {
    if (isInitialLoad.current) return;
    if (!body.trim() || !name.trim()) return;

    setAutoSaveStatus("pending");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        await api.delivery.updateTemplate(templateId, {
          name: name.trim(),
          email_subject: subject.trim() || undefined,
          body,
          variables,
          is_default: isDefault,
          is_active: isActive,
        });
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 3000);
      } catch {
        setAutoSaveStatus("idle");
      }
    }, 4000);

    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, subject, name, isDefault, isActive]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingPanel.current) return;
      const delta = dragStartX.current - e.clientX;
      const next = Math.min(700, Math.max(280, dragStartWidth.current + delta));
      setPanelWidth(next);
    };
    const onUp = () => { isDraggingPanel.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Canvas zoom: Ctrl+scroll on the canvas area
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.0015;
        setZoom(z => +Math.min(2.5, Math.max(0.25, z + delta)).toFixed(2));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const loadTemplate = async () => {
    try {
      const list = await api.delivery.listTemplates();
      const template = list.find(t => t.id === templateId);
      if (!template) {
        router.push(orgPath("/email-templates"));
        return;
      }

      if (!builderInitRef.current) {
        builderInitRef.current = true;
        const savedHtml = template.body ?? "";
        // Attempt to restore blocks from the embedded JSON comment
        const savedBlocks = savedHtml ? extractBlocksFromHtml(savedHtml) : null;
        if (savedBlocks) {
          setBlocks(savedBlocks);
        } else {
          // No saved blocks: show the template gallery (empty = gallery renders in EmailBlockBuilder)
          setBlocks([]);
        }
      }

      const bodyHtml = template.body ?? "";
      const subject = template.email_subject ?? "";
      const vars = extractVars(bodyHtml, subject);

      onLoadSuccess({
        name: template.name,
        subject,
        body: bodyHtml,
        isDefault: template.is_default,
        isActive: template.is_active,
        variables: vars,
      });
    } catch (err: any) {
      setError(err.message ?? "Failed to load template");
    } finally {
      setTimeout(() => { isInitialLoad.current = false; }, 500);
    }
  };

  const extractVars = useCallback((bodyText: string, subjectText: string): string[] => {
    const matches = new Set<string>();
    const pattern = /\{\{(\s*[\w.]+\s*)\}\}/g;
    let m;
    const combined = bodyText + " " + subjectText;
    while ((m = pattern.exec(combined)) !== null) {
      matches.add(m[1]!.trim());
    }
    return Array.from(matches);
  }, []);

  const syncVariables = useCallback((bodyText: string, subjectText: string) => {
    setVariables(extractVars(bodyText, subjectText));
  }, [extractVars]);

  // ── Block handlers ──────────────────────────────────────────

  const handleBlocksChange = useCallback((newBlocks: EmailBlock[]) => {
    // Push to undo history
    const h = historyRef.current;
    h.past.push([...blocksRef.current]);
    if (h.past.length > 60) h.past.shift();
    h.future = [];
    updateHistoryFlags();

    setBlocks(newBlocks);
    const html = blocksToHtml(newBlocks, emailBg);
    setBody(html);
    syncVariables(html, subject);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, syncVariables, emailBg]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past.pop()!;
    h.future.unshift([...blocksRef.current]);
    updateHistoryFlags();
    const html = blocksToHtml(prev, emailBg);
    setBlocks(prev);
    setBody(html);
    syncVariables(html, subject);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, syncVariables, emailBg]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future.shift()!;
    h.past.push([...blocksRef.current]);
    updateHistoryFlags();
    const html = blocksToHtml(next, emailBg);
    setBlocks(next);
    setBody(html);
    syncVariables(html, subject);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, syncVariables]);

  const addBlock = useCallback((type: BlockType) => {
    const b = defaultBlock(type);
    setBlocks(prev => {
      // Insert before footer if it is the last block, so footer stays pinned at the bottom
      const lastIsFooter = prev[prev.length - 1]?.type === "footer";
      const insertAt = lastIsFooter ? prev.length - 1 : prev.length;
      const newBlocks = [...prev.slice(0, insertAt), b, ...prev.slice(insertAt)];
      const h = historyRef.current;
      h.past.push([...blocksRef.current]);
      if (h.past.length > 60) h.past.shift();
      h.future = [];
      updateHistoryFlags();
      const html = blocksToHtml(newBlocks, emailBg);
      setBody(html);
      syncVariables(html, subject);
      return newBlocks;
    });
    setSelectedId(b.id);
    requestAnimationFrame(() => {
      document.getElementById("block-canvas")?.scrollTo({ top: 99999, behavior: "smooth" });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, syncVariables]);

  const handleStartFresh = () => {
    const starters = STARTER_BLOCKS.map(b => ({ ...b, id: nanoid(8) }));
    const html = blocksToHtml(starters, emailBg);
    const h = historyRef.current;
    h.past.push([...blocksRef.current]);
    h.future = [];
    updateHistoryFlags();
    setBlocks(starters);
    setBody(html);
    syncVariables(html, subject);
    setSelectedId(null);
  };

  // ── Subject handler ─────────────────────────────────────────

  const handleSubjectChange = (val: string) => {
    setSubject(val);
    syncVariables(body, val);
  };

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key === "Z" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); setZoom(z => +Math.min(2.5, z + 0.1).toFixed(2)); return; }
      if (mod && e.key === "-") { e.preventDefault(); setZoom(z => +Math.max(0.25, z - 0.1).toFixed(2)); return; }
      if (mod && e.key === "0") { e.preventDefault(); setZoom(1); return; }
      if (mod && e.key === "d" && selectedId) {
        e.preventDefault();
        // Trigger duplicate via blocks change
        const block = blocksRef.current.find(b => b.id === selectedId);
        if (block) {
          const dupe = { ...block, id: nanoid(8) };
          const idx = blocksRef.current.findIndex(b => b.id === selectedId);
          const next = [...blocksRef.current.slice(0, idx + 1), dupe, ...blocksRef.current.slice(idx + 1)];
          handleBlocksChange(next);
          setSelectedId(dupe.id);
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        const next = blocksRef.current.filter(b => b.id !== selectedId);
        handleBlocksChange(next);
        setSelectedId(null);
        return;
      }
      if (e.key === "Escape" && selectedId) { setSelectedId(null); return; }
      if (e.key === "ArrowUp" && selectedId) {
        e.preventDefault();
        const idx = blocksRef.current.findIndex(b => b.id === selectedId);
        if (idx > 0) {
          const next = [...blocksRef.current];
          [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
          handleBlocksChange(next);
        }
        return;
      }
      if (e.key === "ArrowDown" && selectedId) {
        e.preventDefault();
        const idx = blocksRef.current.findIndex(b => b.id === selectedId);
        if (idx < blocksRef.current.length - 1) {
          const next = [...blocksRef.current];
          [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
          handleBlocksChange(next);
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, undo, redo, handleBlocksChange]);

  // ── Test send ────────────────────────────────────────────────
  const handleTestSend = async () => {
    if (!testEmail.trim()) return;
    setTestSending(true);
    try {
      await api.delivery.testSend({
        test_email: testEmail.trim(),
        template_id: templateId,
        use_platform_default: true,
      });
      toast.success(`Test email sent to ${testEmail}`, { duration: 3000 });
      setTestEmail("");
    } catch (err: any) {
      toast.error(err.message ?? "Test send failed");
    } finally {
      setTestSending(false);
    }
  };

  // ── Save ────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) { setError("Template name is required"); return; }
    if (!body.trim()) { setError("Template body is required"); return; }
    setSaving(true);
    setError("");
    try {
      await api.delivery.updateTemplate(templateId, {
        name: name.trim(),
        email_subject: subject.trim() || undefined,
        body,
        variables,
        is_default: isDefault,
        is_active: isActive,
      });
      try {
        const etKey = `et_saved_ids:${orgSlug}`;
        const raw = localStorage.getItem(etKey);
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (!ids.includes(templateId)) {
          ids.push(templateId);
          localStorage.setItem(etKey, JSON.stringify(ids));
        }
      } catch { /* non-fatal */ }
      toast.success("Template saved");
      if (returnToSend) {
        router.push(orgPath("/generate-certificate"));
      } else {
        router.push(orgPath("/email-templates"));
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading template…</span>
      </div>
    );
  }

  const allVars = [
    "recipient_name", "organization_name", "course_name",
    "start_date", "end_date", "custom_text",
    "verification_url", "certificate_image_url",
  ];

  return (
    <div className="fixed inset-0 left-14 flex flex-col overflow-hidden">

      {/* ── Main flex body ────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── CENTER: Canvas (full width, floating left panel overlay) ── */}
        <div className="flex-1 relative overflow-hidden min-w-0">

          {/* Collapsed panel restore pill */}
          {!leftPanelVisible && (
            <button
              className="absolute z-40 left-4 top-3 flex items-center gap-2 bg-card border border-border/50 rounded-xl shadow-md px-3 py-2 hover:bg-muted/50 transition-colors select-none"
              onClick={() => setLeftPanelVisible(true)}
              title="Show blocks panel"
            >
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">{name || "Template"}</span>
            </button>
          )}

          {/* Floating left panel (cert-builder style) */}
          {leftPanelVisible && (
            <div
              className="absolute z-40 left-4 top-3 w-64 flex flex-col bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden"
              style={{ height: "calc(100% - 24px)" }}
            >
              {/* Header: template name + auto-save indicator + close */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 border-b border-border/40 shrink-0 select-none">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Template name"
                  className="flex-1 min-w-0 text-xs font-semibold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 cursor-text select-text truncate max-w-30"
                />
                {autoSaveStatus === "saving" && (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/60 shrink-0" />
                )}
                {autoSaveStatus === "saved" && (
                  <span className="text-[9px] text-[#3ECF8E]/80 shrink-0 font-medium">Saved</span>
                )}
                {error && (
                  <span title={error}><AlertCircle className="w-3 h-3 text-destructive shrink-0" /></span>
                )}
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
                        : "text-muted-foreground hover:text-foreground"
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
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    Settings
                  </button>
                </div>
              </div>

              {/* Tab content — scrollable */}
              <div className="flex-1 overflow-y-auto min-h-0">

                {leftPanelTab === "blocks" && (
                  <div className="p-3 pb-4 space-y-3">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Email Blocks</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PALETTE.filter(item => !CERT_BLOCKS_PALETTE.some(c => c.type === item.type)).map(item => (
                          <PaletteItemCard
                            key={item.type}
                            item={item}
                            onClick={() => addBlock(item.type)}
                            onDragStart={e => e.dataTransfer.setData("block-type", item.type)}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Certificate Blocks</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {CERT_BLOCKS_PALETTE.map(item => (
                          <PaletteItemCard
                            key={item.type}
                            item={item}
                            onClick={() => addBlock(item.type)}
                            onDragStart={e => e.dataTransfer.setData("block-type", item.type)}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground/50">Click to add · hover to preview · drag into canvas</p>
                  </div>
                )}

                {leftPanelTab === "settings" && (
                  <div className="p-3 space-y-4 pb-4">

                    {/* Subject line */}
                    <div className="space-y-2">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Subject Line</p>
                      <input
                        ref={subjectInputRef}
                        value={subject}
                        onChange={e => handleSubjectChange(e.target.value)}
                        placeholder="🎓 Your Certificate — {{course_name}}"
                        className="w-full text-xs border border-border rounded-md px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40"
                      />
                      <p className="text-[9px] text-muted-foreground/60">Click a variable to insert it at cursor</p>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { v: "recipient_name",    label: "Name" },
                          { v: "course_name",       label: "Course" },
                          { v: "organization_name", label: "Org" },
                          { v: "start_date",        label: "Start date" },
                          { v: "end_date",          label: "End date" },
                        ].map(({ v, label }) => (
                          <button
                            key={v}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); insertSubjectVar(v); }}
                            className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#3ECF8E]/30 bg-[#3ECF8E]/10 text-[#3ECF8E] hover:bg-[#3ECF8E]/20 transition-colors"
                            title={`Insert {{${v}}}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Template toggles */}
                    <div className="space-y-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Template</p>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="is_default_sw" className="text-xs cursor-pointer text-muted-foreground">Default template</Label>
                        <Switch id="is_default_sw" checked={isDefault} onCheckedChange={setIsDefault} />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="is_active_sw" className="text-xs cursor-pointer text-muted-foreground">Active</Label>
                        <Switch id="is_active_sw" checked={isActive} onCheckedChange={setIsActive} />
                      </div>
                    </div>

                    {/* Quick variables */}
                    <div className="space-y-2">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Quick Variables</p>
                      <p className="text-[9px] text-muted-foreground/60">
                        Type <kbd className="font-mono bg-muted border rounded px-1 py-px text-[9px]">@</kbd> in any block · click to copy
                      </p>
                      {[
                        { v: "organization_name", d: "Your organisation",       color: "text-violet-400 bg-violet-500/10" },
                        { v: "verification_url",  d: "Certificate verify link",  color: "text-sky-400 bg-sky-500/10" },
                      ].map(({ v, d, color }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(`{{${v}}}`).catch(() => {});
                            toast.success(`Copied {{${v}}}`, { duration: 1500 });
                          }}
                          className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/60 group transition-colors text-left"
                        >
                          <span className={cn("font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border border-current/20 shrink-0 truncate max-w-32.5", color)}>
                            {`{{${v}}}`}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex-1 truncate">{d}</span>
                          <span className="text-[9px] text-transparent group-hover:text-muted-foreground/50 shrink-0 transition-colors">copy</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Canvas scroll area — dot grid background, Figma-style */}
          <div
            ref={canvasScrollRef}
            id="block-canvas"
            className="absolute inset-0 overflow-auto transition-[padding] duration-200"
            style={{
              paddingLeft: leftPanelVisible ? 272 : 0,
              paddingRight: rightPanelVisible ? 272 : 0,
              backgroundColor: "#0d0d0d",
              backgroundImage: "radial-gradient(circle, #2a2a2a 1.5px, transparent 1.5px)",
              backgroundSize: "22px 22px",
            }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedId(null); }}
          >
            <div style={{ zoom, minHeight: "100%" }}>
              <EmailBlockBuilder
                blocks={blocks}
                selectedId={selectedId}
                subject={subject}
                senderName={senderName}
                availableVars={allVars}
                context="cert"
                emailBg={emailBg}
                onEmailBgChange={setEmailBg}
                onChange={handleBlocksChange}
                onSelect={setSelectedId}
                onStartFresh={handleStartFresh}
                onSubjectChange={handleSubjectChange}
                onSenderNameChange={setSenderName}
                onAddBlock={addBlock}
              />
            </div>
          </div>

          {/* Floating right panel — properties (mirrors left panel style) */}
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
                  emailBg={emailBg}
                  onEmailBgChange={setEmailBg}
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
        </div>

        {/* ── RIGHT: Preview (collapsible, resizable) ───────────────── */}
        <div
          style={{ width: panelWidth }}
          className={cn(
            "shrink-0 border-l flex flex-col overflow-hidden bg-zinc-950 relative transition-[width] duration-200",
            panelWidth === 0 && "border-l-0"
          )}
        >
          {panelWidth > 0 && (
          <>
          {/* Resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize z-20 flex items-center justify-center group/resize hover:bg-[#3ECF8E]/5 transition-colors"
            onMouseDown={e => {
              e.preventDefault();
              isDraggingPanel.current = true;
              dragStartX.current = e.clientX;
              dragStartWidth.current = panelWidth;
            }}
          >
            <div className="flex flex-col gap-0.75 opacity-0 group-hover/resize:opacity-100 transition-opacity">
              {[0, 1, 2, 3, 4].map(i => (
                <span key={i} className="w-0.75 h-0.75 rounded-full bg-[#3ECF8E]" />
              ))}
            </div>
          </div>

          {/* Preview header — top padding matches canvas margin */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2.5 shrink-0 border-b border-zinc-800 bg-zinc-900/80">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Preview</p>
              <span className="text-[10px] text-zinc-700">{panelWidth}px</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5 border border-zinc-700 rounded-md p-0.5 bg-zinc-800/50">
                <button
                  onClick={() => { setPreviewMode("desktop"); setPanelWidth(Math.max(panelWidth, 660)); }}
                  className={cn(
                    "p-1 rounded transition-colors",
                    previewMode === "desktop" ? "bg-zinc-700 text-white shadow-sm" : "hover:bg-zinc-700/50 text-zinc-500"
                  )}
                  title="Desktop"
                >
                  <Monitor className="w-3 h-3" />
                </button>
                <button
                  onClick={() => { setPreviewMode("mobile"); setPanelWidth(Math.min(panelWidth, 440)); }}
                  className={cn(
                    "p-1 rounded transition-colors",
                    previewMode === "mobile" ? "bg-zinc-700 text-white shadow-sm" : "hover:bg-zinc-700/50 text-zinc-500"
                  )}
                  title="Mobile"
                >
                  <Smartphone className="w-3 h-3" />
                </button>
              </div>
              {/* Close preview */}
              <button
                onClick={() => setPanelWidth(0)}
                className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Hide preview"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Preview area */}
          <div className="flex-1 overflow-y-auto p-3 pb-24">
            {body.trim() ? (
              <LivePreview html={body} previewMode={previewMode} panelWidth={panelWidth} />
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

      {/* ── BOTTOM DOCK ──────────────────────────────────────────────── */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-2 px-3 py-2 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/60 rounded-2xl shadow-2xl">

          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            title="Undo (⌘Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            title="Redo (⌘⇧Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-zinc-700/60 shrink-0" />

          {/* Zoom */}
          <button
            onClick={() => setZoom(z => +Math.max(0.25, z - 0.1).toFixed(2))}
            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700/70 rounded transition-colors text-base leading-none font-light shrink-0"
            title="Zoom out (⌘−)"
          >
            −
          </button>
          <button
            onClick={() => setZoom(1)}
            className="px-1.5 h-6 text-[11px] text-zinc-400 hover:text-white font-mono hover:bg-zinc-700/70 rounded transition-colors min-w-10 text-center shrink-0"
            title="Reset zoom (⌘0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom(z => +Math.min(2.5, z + 0.1).toFixed(2))}
            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700/70 rounded transition-colors text-base leading-none font-light shrink-0"
            title="Zoom in (⌘+)"
          >
            +
          </button>

          {/* Preview toggle */}
          {panelWidth === 0 && (
            <button
              onClick={() => setPanelWidth(previewMode === "mobile" ? 440 : 660)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-[#3ECF8E] hover:bg-zinc-800 transition-colors shrink-0"
              title="Show preview"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="w-px h-5 bg-zinc-700/60 shrink-0" />

          {/* Keyboard shortcuts popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0" title="Keyboard shortcuts">
                <Keyboard className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" side="top" className="w-56 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Shortcuts</p>
              <div className="space-y-1">
                {KEYBOARD_SHORTCUTS.map(s => (
                  <div key={s.key} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">{s.label}</span>
                    <kbd className="font-mono text-[10px] bg-muted border border-border rounded px-1.5 py-0.5 text-foreground shrink-0">{s.key}</kbd>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Error */}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1 shrink-0 max-w-35 truncate">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </p>
          )}

          {/* Test send */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs border-zinc-700 text-zinc-400 hover:text-foreground hover:border-zinc-600 shrink-0">
                <FlaskConical className="w-3.5 h-3.5" />
                Test
              </Button>
            </PopoverTrigger>
            <PopoverContent align="center" side="top" className="w-72 p-3 space-y-2">
              <p className="text-xs font-semibold">Send a test email</p>
              <p className="text-[11px] text-muted-foreground">Variables use sample data — a banner in the email will flag this.</p>
              <div className="flex gap-2">
                <Input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="your@email.com" className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") handleTestSend(); }} />
                <Button size="sm" onClick={handleTestSend} disabled={testSending || !testEmail.trim()} className="gap-1.5 h-8 bg-[#3ECF8E] hover:bg-[#34b87a] text-white shrink-0">
                  {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Save */}
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-8 text-xs bg-[#3ECF8E] hover:bg-[#34b87a] text-white shrink-0">
            {saving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : returnToSend ? <SendHorizonal className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />
            }
            {returnToSend ? "Save & Send" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
