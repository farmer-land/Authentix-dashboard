"use client";

/**
 * TiptapRichText — a free, WYSIWYG rich-text editor (Tiptap) that reads/writes MARKDOWN.
 *
 * Why markdown: the email blocks already store + render markdown via markdownToEmailHtml
 * (email-safe, inline-styled). Tiptap is just a visual front-end over that pipeline, so:
 *  - paste content from Claude / ChatGPT / Gemini (which is markdown) → it formats instantly
 *  - {{variables}} survive as plain text and are interpolated at send time
 *  - the stored value stays markdown, so nothing downstream changes.
 */

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  Heading1, Heading2, List, ListOrdered, Quote, Link as LinkIcon, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  textColor?: string;
}

export function TiptapRichText({ value, onChange, onBlur, placeholder, textColor }: Props) {
  const lastEmitted = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Placeholder.configure({ placeholder: placeholder ?? "Write here… or paste from ChatGPT / Claude / Gemini" }),
      // Parses pasted markdown into rich text + serializes back to markdown.
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true, linkify: true, breaks: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "tiptap-prose outline-none min-h-[60px]",
      },
    },
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown();
      lastEmitted.current = md;
      onChange(md);
    },
  });

  // Sync external value changes (undo, template load) without clobbering active typing.
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmitted.current) {
      editor.commands.setContent(value, false);
      lastEmitted.current = value;
    }
  }, [value, editor]);

  if (!editor) return null;

  const Btn = ({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded transition-colors",
        active ? "bg-[#3ECF8E] text-white" : "text-zinc-300 hover:text-white hover:bg-zinc-700",
      )}
    >
      {children}
    </button>
  );

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div onBlur={onBlur}>
      {/* Floating toolbar on selection */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}
        className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-1 py-1 shadow-xl">
        <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></Btn>
        <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></Btn>
        <Btn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-3.5 h-3.5" /></Btn>
        <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></Btn>
        <Btn title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code className="w-3.5 h-3.5" /></Btn>
        <Btn title="Link" active={editor.isActive("link")} onClick={setLink}><LinkIcon className="w-3.5 h-3.5" /></Btn>
      </BubbleMenu>

      {/* Fixed toolbar (always visible while editing) */}
      <div className="flex items-center gap-0.5 flex-wrap mb-2 bg-zinc-800/60 rounded-lg px-1.5 py-1 border border-zinc-700/50">
        <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></Btn>
        <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></Btn>
        <Btn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-3.5 h-3.5" /></Btn>
        <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></Btn>
        <div className="w-px h-4 bg-zinc-600 mx-0.5" />
        <Btn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="w-3.5 h-3.5" /></Btn>
        <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-3.5 h-3.5" /></Btn>
        <div className="w-px h-4 bg-zinc-600 mx-0.5" />
        <Btn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-3.5 h-3.5" /></Btn>
        <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-3.5 h-3.5" /></Btn>
        <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-3.5 h-3.5" /></Btn>
        <Btn title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code className="w-3.5 h-3.5" /></Btn>
        <Btn title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-3.5 h-3.5" /></Btn>
        <div className="w-px h-4 bg-zinc-600 mx-0.5" />
        <Btn title="Link" active={editor.isActive("link")} onClick={setLink}><LinkIcon className="w-3.5 h-3.5" /></Btn>
      </div>

      <EditorContent editor={editor} style={{ color: textColor || "#d1d5db", fontSize: 15, lineHeight: 1.7 }} />

      {/* Minimal content styling so the WYSIWYG is legible in the dark editor */}
      <style>{`
        .tiptap-prose:focus { outline: none; }
        .tiptap-prose p { margin: 0.45em 0; }
        .tiptap-prose h1 { font-size: 1.6em; font-weight: 700; margin: 0.5em 0 0.3em; }
        .tiptap-prose h2 { font-size: 1.3em; font-weight: 700; margin: 0.5em 0 0.3em; }
        .tiptap-prose h3 { font-size: 1.12em; font-weight: 700; margin: 0.5em 0 0.3em; }
        .tiptap-prose ul, .tiptap-prose ol { padding-left: 1.4em; margin: 0.45em 0; }
        .tiptap-prose ul { list-style: disc; }
        .tiptap-prose ol { list-style: decimal; }
        .tiptap-prose blockquote { border-left: 3px solid #3ECF8E; padding-left: 0.85em; margin: 0.55em 0; opacity: 0.92; }
        .tiptap-prose a { color: #3ECF8E; text-decoration: underline; }
        .tiptap-prose code { background: rgba(255,255,255,0.12); padding: 1px 4px; border-radius: 3px; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .tiptap-prose hr { border: none; border-top: 1px solid rgba(255,255,255,0.18); margin: 0.8em 0; }
        .tiptap-prose p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #6b7280; float: left; height: 0; pointer-events: none; }
      `}</style>
    </div>
  );
}
