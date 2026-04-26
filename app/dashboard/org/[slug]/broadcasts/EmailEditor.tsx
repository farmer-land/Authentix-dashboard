"use client";

import { useState, useRef, useCallback } from "react";
import { Editor } from "@maily-to/core";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { render } from "@maily-to/render";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, Loader2, Type, Image, Columns2, Code2,
  Minus, Square, AlignLeft, MousePointer2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EmailEditorResult {
  subject: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  preview_text: string;
  html_body: string;
  content_json: JSONContent;
}

interface PageStyle {
  bgColor: string;
  bodyBg: string;
  bodyWidth: string;
  bodyPaddingTop: string;
  bodyPaddingBottom: string;
  bodyPaddingLeft: string;
  bodyPaddingRight: string;
  borderRadius: string;
  hasBorder: boolean;
  borderColor: string;
}

interface EmailEditorProps {
  campaignName: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  initialJson?: JSONContent;
  onDone: (result: EmailEditorResult) => void;
  onBack: () => void;
}

// ── Sidebar block button ───────────────────────────────────────────────────────

function SidebarBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="w-9 h-9 rounded-md flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
    >
      {icon}
    </button>
  );
}

// ── Right panel control ────────────────────────────────────────────────────────

function StyleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="text-xs text-neutral-400 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-5 h-5 rounded border border-neutral-600 shrink-0 cursor-pointer"
        style={{ backgroundColor: value }}
        onClick={() => document.getElementById(`ci-${value}`)?.click()}
      />
      <input
        id={`ci-${value}`}
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="sr-only"
      />
      <input
        type="text"
        value={value.toUpperCase()}
        onChange={e => onChange(e.target.value)}
        className="w-20 h-6 bg-neutral-800 border border-neutral-700 rounded px-2 text-xs text-neutral-200 font-mono"
      />
    </div>
  );
}

function NumInput({
  value,
  onChange,
  suffix = "px",
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-14 h-6 bg-neutral-800 border border-neutral-700 rounded px-2 text-xs text-neutral-200 text-right"
      />
      <span className="text-xs text-neutral-500">{suffix}</span>
    </div>
  );
}

// ── Header meta fields ─────────────────────────────────────────────────────────

function MetaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <span className="w-28 shrink-0 px-4 py-2.5 text-xs text-muted-foreground font-medium">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-4 py-2.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}

// ── Main Editor ────────────────────────────────────────────────────────────────

export function EmailEditor({
  campaignName,
  subject: initialSubject,
  fromName: initialFromName,
  fromEmail: initialFromEmail,
  replyTo: initialReplyTo,
  initialJson,
  onDone,
  onBack,
}: EmailEditorProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [fromName, setFromName] = useState(initialFromName);
  const [fromEmail, setFromEmail] = useState(initialFromEmail);
  const [replyTo, setReplyTo] = useState(initialReplyTo);
  const [previewText, setPreviewText] = useState("");
  const [publishing, setPublishing] = useState(false);

  const [style, setStyle] = useState<PageStyle>({
    bgColor: "#f5f5f5",
    bodyBg: "#ffffff",
    bodyWidth: "600",
    bodyPaddingTop: "32",
    bodyPaddingBottom: "32",
    bodyPaddingLeft: "32",
    bodyPaddingRight: "32",
    borderRadius: "8",
    hasBorder: false,
    borderColor: "#e5e7eb",
  });

  const editorRef = useRef<TiptapEditor | null>(null);
  const contentJsonRef = useRef<JSONContent>(
    initialJson ?? { type: "doc", content: [{ type: "paragraph" }] },
  );

  const patchStyle = useCallback(
    <K extends keyof PageStyle>(key: K, value: PageStyle[K]) =>
      setStyle(s => ({ ...s, [key]: value })),
    [],
  );

  const insertBlock = useCallback((fn: (editor: TiptapEditor) => void) => {
    const editor = editorRef.current;
    if (editor) fn(editor);
  }, []);

  const handleDone = async () => {
    setPublishing(true);
    try {
      const json = contentJsonRef.current;
      const html = await render(json, { preview: previewText || undefined });
      onDone({
        subject,
        from_name: fromName,
        from_email: fromEmail,
        reply_to: replyTo,
        preview_text: previewText,
        html_body: html,
        content_json: json,
      });
    } catch (err) {
      toast.error("Failed to export email HTML");
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: style.bgColor }}>

      {/* ── Header ── */}
      <header className="h-11 bg-[#0a0a0a] flex items-center px-4 gap-3 shrink-0 border-b border-neutral-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-neutral-400 hover:text-white text-xs transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Email Campaigns
        </button>
        <span className="text-neutral-700">/</span>
        <span className="text-xs text-neutral-300 truncate max-w-48">{campaignName || "New Campaign"}</span>

        <div className="flex items-center gap-2 ml-auto">
          <Badge
            variant="outline"
            className="text-xs border-neutral-700 text-neutral-400 bg-transparent"
          >
            Draft
          </Badge>
          <Button
            size="sm"
            onClick={handleDone}
            disabled={publishing}
            className="h-7 text-xs bg-white text-black hover:bg-neutral-200"
          >
            {publishing ? (
              <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Saving…</>
            ) : (
              "Done"
            )}
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left sidebar ── */}
        <aside className="w-12 bg-[#0a0a0a] flex flex-col items-center py-3 gap-1 shrink-0 border-r border-neutral-800">
          <SidebarBtn
            icon={<Type className="h-4 w-4" />}
            label="Text"
            onClick={() =>
              insertBlock(e => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (e.chain().focus() as any).setParagraph?.().run();
              })
            }
          />
          <SidebarBtn
            icon={<AlignLeft className="h-4 w-4" />}
            label="Heading"
            onClick={() =>
              insertBlock(e => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (e.chain().focus() as any).setHeading?.({ level: 2 }).run();
              })
            }
          />
          <SidebarBtn
            icon={<Image className="h-4 w-4" />}
            label="Image"
            onClick={() =>
              insertBlock(e => {
                const url = window.prompt("Image URL:");
                if (url) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (e.chain().focus() as any).setImage?.({ src: url }).run();
                }
              })
            }
          />
          <SidebarBtn
            icon={<MousePointer2 className="h-4 w-4" />}
            label="Button"
            onClick={() =>
              insertBlock(e => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cmds = e.commands as any;
                if (cmds.setButton) {
                  cmds.setButton({ text: "Click here", url: "#" });
                } else {
                  e.chain().focus().insertContent('<a href="#">Click here</a>').run();
                }
              })
            }
          />
          <div className="my-1 w-6 h-px bg-neutral-800" />
          <SidebarBtn
            icon={<Minus className="h-4 w-4" />}
            label="Divider"
            onClick={() =>
              insertBlock(e => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (e.chain().focus() as any).setHorizontalRule?.().run();
              })
            }
          />
          <SidebarBtn
            icon={<Columns2 className="h-4 w-4" />}
            label="Columns"
            onClick={() =>
              insertBlock(e =>
                e.chain().focus().insertContent({
                  type: "columns",
                  attrs: {},
                  content: [
                    { type: "column", content: [{ type: "paragraph" }] },
                    { type: "column", content: [{ type: "paragraph" }] },
                  ],
                }).run()
              )
            }
          />
          <SidebarBtn
            icon={<Square className="h-4 w-4" />}
            label="Section"
            onClick={() =>
              insertBlock(e =>
                e.chain().focus().insertContent({
                  type: "section",
                  content: [{ type: "paragraph" }],
                }).run()
              )
            }
          />
          <SidebarBtn
            icon={<Code2 className="h-4 w-4" />}
            label="HTML block"
            onClick={() =>
              insertBlock(e =>
                e.chain().focus().insertContent({
                  type: "htmlCodeBlock",
                  attrs: { language: "html" },
                }).run()
              )
            }
          />
        </aside>

        {/* ── Center canvas ── */}
        <main className="flex-1 overflow-y-auto py-8 px-4">
          <div
            className="mx-auto bg-white shadow-sm overflow-hidden"
            style={{
              maxWidth: `${style.bodyWidth}px`,
              borderRadius: `${style.borderRadius}px`,
              border: style.hasBorder ? `1px solid ${style.borderColor}` : "none",
            }}
          >
            {/* Meta fields */}
            <div className="border-b border-neutral-100">
              <MetaField
                label="From name"
                value={fromName}
                onChange={setFromName}
                placeholder="DigiCertificates"
              />
              <MetaField
                label="From email"
                value={fromEmail}
                onChange={setFromEmail}
                placeholder="hello@digicertificates.in"
              />
              <MetaField
                label="Reply-To"
                value={replyTo}
                onChange={setReplyTo}
                placeholder="reply@example.com"
              />
              <MetaField
                label="Subject"
                value={subject}
                onChange={setSubject}
                placeholder="Your email subject…"
              />
              <MetaField
                label="Preview text"
                value={previewText}
                onChange={setPreviewText}
                placeholder="Short preview shown in inbox…"
              />
            </div>

            {/* Maily editor */}
            <div
              style={{
                backgroundColor: style.bodyBg,
                paddingTop: `${style.bodyPaddingTop}px`,
                paddingBottom: `${style.bodyPaddingBottom}px`,
                paddingLeft: `${style.bodyPaddingLeft}px`,
                paddingRight: `${style.bodyPaddingRight}px`,
              }}
            >
              <Editor
                contentJson={contentJsonRef.current}
                onUpdate={editor => {
                  contentJsonRef.current = editor.getJSON();
                }}
                onCreate={editor => {
                  editorRef.current = editor;
                }}
                config={{
                  hasMenuBar: true,
                  immediatelyRender: false,
                  wrapClassName: "maily-editor-wrap",
                }}
              />
            </div>
          </div>
        </main>

        {/* ── Right panel: Page style ── */}
        <aside className="w-64 bg-[#0a0a0a] shrink-0 border-l border-neutral-800 overflow-y-auto">
          <div className="px-4 py-3 border-b border-neutral-800">
            <p className="text-xs font-medium text-neutral-300">Page style</p>
          </div>

          <div className="px-4 py-2 divide-y divide-neutral-800">
            <StyleRow label="Background">
              <ColorInput
                value={style.bgColor}
                onChange={v => patchStyle("bgColor", v)}
              />
            </StyleRow>
          </div>

          <div className="px-4 py-2 border-t border-neutral-800">
            <p className="text-xs font-medium text-neutral-400 pt-2 pb-1">Body</p>
            <div className="divide-y divide-neutral-800/60">
              <StyleRow label="Background">
                <ColorInput
                  value={style.bodyBg}
                  onChange={v => patchStyle("bodyBg", v)}
                />
              </StyleRow>
              <StyleRow label="Width">
                <NumInput
                  value={style.bodyWidth}
                  onChange={v => patchStyle("bodyWidth", v)}
                />
              </StyleRow>
              <StyleRow label="Top padding">
                <NumInput
                  value={style.bodyPaddingTop}
                  onChange={v => patchStyle("bodyPaddingTop", v)}
                />
              </StyleRow>
              <StyleRow label="Bottom padding">
                <NumInput
                  value={style.bodyPaddingBottom}
                  onChange={v => patchStyle("bodyPaddingBottom", v)}
                />
              </StyleRow>
              <StyleRow label="Left padding">
                <NumInput
                  value={style.bodyPaddingLeft}
                  onChange={v => patchStyle("bodyPaddingLeft", v)}
                />
              </StyleRow>
              <StyleRow label="Right padding">
                <NumInput
                  value={style.bodyPaddingRight}
                  onChange={v => patchStyle("bodyPaddingRight", v)}
                />
              </StyleRow>
              <StyleRow label="Corner radius">
                <NumInput
                  value={style.borderRadius}
                  onChange={v => patchStyle("borderRadius", v)}
                />
              </StyleRow>
              <StyleRow label="Border">
                <button
                  onClick={() => patchStyle("hasBorder", !style.hasBorder)}
                  className={cn(
                    "w-9 h-5 rounded-full transition-colors relative",
                    style.hasBorder ? "bg-white" : "bg-neutral-700",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-neutral-900 transition-transform",
                      style.hasBorder ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </button>
              </StyleRow>
              {style.hasBorder && (
                <StyleRow label="Border color">
                  <ColorInput
                    value={style.borderColor}
                    onChange={v => patchStyle("borderColor", v)}
                  />
                </StyleRow>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
