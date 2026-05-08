"use client";

import { useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Save, Loader2, AlertCircle, Monitor, Smartphone,
  SendHorizonal, Send, FlaskConical,
  SlidersHorizontal, X, Layers,
  User, BookOpen, Calendar, Type, QrCode, Image as ImageIcon,
  ChevronLeft, ChevronRight, Eye, EyeOff,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useOrg } from "@/lib/org";
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
} from "./EmailBlockBuilder";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { useEmailEditorState } from "./state/useEmailEditorState";

// ── Cert field dock items ─────────────────────────────────────────────────────

const CERT_DOCK_FIELDS = [
  { key: "name",        varName: "recipient_name", label: "Recipient Name", Icon: User,      isBlock: false, blockType: null },
  { key: "course",      varName: "course_name",    label: "Course Name",    Icon: BookOpen,  isBlock: false, blockType: null },
  { key: "start_date",  varName: "start_date",     label: "Start Date",     Icon: Calendar,  isBlock: false, blockType: null },
  { key: "end_date",    varName: "end_date",       label: "End Date",       Icon: Calendar,  isBlock: false, blockType: null },
  { key: "custom_text", varName: "custom_text",    label: "Custom Text",    Icon: Type,      isBlock: false, blockType: null },
  { key: "qr_code",     varName: null,             label: "QR Code",        Icon: QrCode,    isBlock: true,  blockType: "qr_code" as BlockType },
  { key: "image",       varName: null,             label: "Cert Image",     Icon: ImageIcon, isBlock: true,  blockType: "cert_image" as BlockType },
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
    dockMinimized, selectedVar, testEmail, testSending, autoSaveStatus,
    setName, setSubject, setBody, setIsDefault, setIsActive, setVariables, setSenderName,
    setBlocks, setSelectedId,
    setSaving, setError, setAutoSaveStatus,
    setPreviewMode, setPanelWidth, setLeftPanelVisible, setLeftPanelTab,
    setDockMinimized, setSelectedVar, setTestEmail, setTestSending,
    onLoadSuccess,
  } = useEmailEditorState();

  // Refs (DOM/timing — not part of state machine)
  const builderInitRef = useRef(false);
  const isDraggingPanel = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  // Clear selectedVar and reset dock when selected block changes
  useEffect(() => {
    setSelectedVar(null);
    if (!selectedId) setDockMinimized(false);
  }, [selectedId]);

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
  }, [body, subject, name]);

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
          // No saved blocks: initialise with starters (new template or legacy HTML-only)
          const starters = STARTER_BLOCKS.map(b => ({ ...b, id: nanoid(8) }));
          setBlocks(starters);
          // Don't overwrite savedHtml — if the template has legacy HTML, keep it in body
          // until the user saves (which will then embed the JSON comment)
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
    setBlocks(newBlocks);
    const html = blocksToHtml(newBlocks);
    setBody(html);
    syncVariables(html, subject);
  }, [subject, syncVariables]);

  const addBlock = useCallback((type: BlockType) => {
    const b = defaultBlock(type);
    setBlocks(prev => {
      const newBlocks = [...prev, b];
      const html = blocksToHtml(newBlocks);
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
    const html = blocksToHtml(starters);
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

  // ── Var chip clicked in a block ─────────────────────────────
  const handleVarClick = useCallback((varName: string) => {
    setSelectedVar(varName);
  }, []);

  // ── Insert / replace variable into selected block ───────────
  const handleInsertVarToSelected = useCallback((varName: string) => {
    if (!selectedId) return;
    setBlocks(prev => {
      const block = prev.find(b => b.id === selectedId);
      if (!block) return prev;

      const clean = varName.replace(/^\{\{|\}\}$/g, "").trim();
      const token = `{{${clean}}}`;

      // Replace existing selected var, or append to end
      const replaceOrAppend = (text: string): string => {
        if (selectedVar) {
          const oldToken = `{{${selectedVar}}}`;
          if (text.includes(oldToken)) return text.replace(oldToken, token);
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

      const newBlocks = prev.map(b => b.id === selectedId ? { ...b, ...patch! } : b);
      const html = blocksToHtml(newBlocks);
      setBody(html);
      syncVariables(html, subject);
      return newBlocks;
    });
    setSelectedVar(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedVar, subject, syncVariables]);

  // ── Dock field click ─────────────────────────────────────────
  const handleDockFieldClick = useCallback((field: typeof CERT_DOCK_FIELDS[number]) => {
    if (field.isBlock && field.blockType) {
      addBlock(field.blockType);
      setSelectedVar(null);
    } else if (field.varName) {
      if (!selectedId) {
        toast.info("Click a text block in the canvas first, then click a field to insert it", { duration: 2500 });
        return;
      }
      handleInsertVarToSelected(field.varName);
    }
  }, [addBlock, handleInsertVarToSelected, selectedId]);

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
    <div className="flex flex-col h-screen -m-6 overflow-hidden">

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
                  className="flex-1 min-w-0 text-xs font-semibold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 cursor-text select-text"
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

                {leftPanelTab === "settings" && (
                  <div className="p-3 space-y-4 pb-4">
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
                          <span className={cn("font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border border-current/20 shrink-0 truncate max-w-[130px]", color)}>
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

          {/* Canvas scroll area — panel floats over the canvas so the email stays centred */}
          <div
            id="block-canvas"
            className="absolute inset-0 overflow-y-auto pt-3 pb-24"
          >
            <EmailBlockBuilder
              blocks={blocks}
              selectedId={selectedId}
              subject={subject}
              senderName={senderName}
              availableVars={allVars}
              onChange={handleBlocksChange}
              onSelect={setSelectedId}
              onStartFresh={handleStartFresh}
              onSubjectChange={handleSubjectChange}
              onSenderNameChange={setSenderName}
              onAddBlock={addBlock}
              onVarClick={handleVarClick}
            />
          </div>
        </div>

        {/* ── RIGHT: Preview (collapsible, resizable) ───────────────── */}
        {/* Collapsed preview — floating pill button */}
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
            <div className="flex flex-col gap-[3px] opacity-0 group-hover/resize:opacity-100 transition-opacity">
              {[0, 1, 2, 3, 4].map(i => (
                <span key={i} className="w-[3px] h-[3px] rounded-full bg-[#3ECF8E]" />
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

      {/* ── BOTTOM DOCK — truly floating, fixed to viewport bottom ──── */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="pointer-events-auto inline-flex flex-col items-stretch bg-zinc-900/95 backdrop-blur-md border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden">

          {/* Replace indicator — only when selectedVar */}
          {selectedVar && (
            <div className="flex items-center justify-center gap-2 px-4 py-1.5 border-b border-[#3ECF8E]/20 bg-[#3ECF8E]/5">
              <span className="text-[10px] text-[#3ECF8E]/90">
                Replacing{" "}
                <code className="font-mono bg-[#3ECF8E]/15 px-1 rounded">{`{{${selectedVar}}}`}</code>
                {" "}— click a field below to replace, or{" "}
                <button onClick={() => setSelectedVar(null)} className="underline hover:text-[#3ECF8E] transition-colors">cancel</button>
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-2">

            {/* Fields — always visible and always clickable */}
            {!dockMinimized && (
              <>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">Fields</p>
                <div
                  className="flex items-center gap-1.5 overflow-x-auto"
                  style={{ maxWidth: 420, scrollbarWidth: "none" }}
                >
                  {CERT_DOCK_FIELDS.map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => handleDockFieldClick(f)}
                      title={
                        f.isBlock
                          ? `Add ${f.label} block`
                          : selectedVar
                            ? `Replace {{${selectedVar}}} with {{${f.varName}}}`
                            : `Insert {{${f.varName}}} into selected block`
                      }
                      className={cn(
                        "flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all shrink-0",
                        !f.isBlock && selectedVar
                          ? "border-[#3ECF8E]/60 bg-[#3ECF8E]/15 text-[#3ECF8E] hover:bg-[#3ECF8E]/25"
                          : "border-zinc-700/50 bg-zinc-800/40 hover:bg-[#3ECF8E]/10 hover:border-[#3ECF8E]/40 text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      <f.Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[11px] font-medium whitespace-nowrap">{f.label}</span>
                    </button>
                  ))}
                </div>
                <div className="w-px h-5 bg-zinc-700/60 shrink-0" />
              </>
            )}

            {/* Minimize/expand toggle */}
            <button
              onClick={() => setDockMinimized(d => !d)}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
              title={dockMinimized ? "Show fields" : "Collapse fields"}
            >
              {dockMinimized
                ? <ChevronRight className="w-3.5 h-3.5" />
                : <ChevronLeft className="w-3.5 h-3.5" />
              }
            </button>

            {/* Preview toggle — shows when preview panel is hidden */}
            {panelWidth === 0 && (
              <button
                onClick={() => setPanelWidth(previewMode === "mobile" ? 440 : 660)}
                className="p-1 rounded-lg text-zinc-500 hover:text-[#3ECF8E] hover:bg-zinc-800 transition-colors shrink-0"
                title="Show preview"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Error */}
            {error && (
              <p className="text-xs text-destructive flex items-center gap-1 shrink-0 max-w-[140px] truncate">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </p>
            )}

            {/* Test send */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-xs border-zinc-700 text-zinc-400 hover:text-foreground hover:border-zinc-600 shrink-0"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  Test
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" side="top" className="w-72 p-3 space-y-2">
                <p className="text-xs font-semibold">Send a test email</p>
                <p className="text-[11px] text-muted-foreground">Preview this template in your inbox using sample data.</p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="h-8 text-sm flex-1"
                    onKeyDown={e => { if (e.key === "Enter") handleTestSend(); }}
                  />
                  <Button
                    size="sm"
                    onClick={handleTestSend}
                    disabled={testSending || !testEmail.trim()}
                    className="gap-1.5 h-8 bg-[#3ECF8E] hover:bg-[#34b87a] text-white shrink-0"
                  >
                    {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Save */}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 h-8 text-xs bg-[#3ECF8E] hover:bg-[#34b87a] text-white shrink-0"
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : returnToSend
                  ? <SendHorizonal className="w-3.5 h-3.5" />
                  : <Save className="w-3.5 h-3.5" />
              }
              {returnToSend ? "Save & Send" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
