"use client";

/**
 * EmailBlockBuilder — Canvas-only component.
 * State is fully controlled by the parent (page.tsx).
 * Exports: EmailBlockBuilder, blocksToHtml, defaultBlock, STARTER_BLOCKS, PALETTE, applyPreviewMocks, BlockType, EmailBlock
 */

import React, { useRef, useLayoutEffect, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";
import { CERTIFICATE_FONTS } from "@/lib/types/certificate";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  DragOverlay,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Type, AlignLeft, Image as ImageIcon, QrCode, MousePointerClick,
  TableProperties, Minus, ArrowUpDown, LayoutTemplate, Plus, Trash2,
  GripVertical, AlertCircle, RefreshCw, Copy, SlidersHorizontal,
  ArrowUp, ArrowDown, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

// ── Block types ──────────────────────────────────────────────────────────────

export type BlockType =
  | "header"
  | "greeting"
  | "text"
  | "markdown"
  | "two_column"
  | "cert_image"
  | "qr_code"
  | "details_box"
  | "cta_button"
  | "linkedin"
  | "divider"
  | "spacer"
  | "footer";

export interface EmailBlock {
  id: string;
  type: BlockType;
  bgColor?: string;
  title?: string;
  titleColor?: string;
  subtitle?: string;
  content?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  detailRows?: Array<{ label: string; value: string }>;
  detailBgColor?: string;
  detailTextColor?: string;
  btnLabel?: string;
  btnUrl?: string;
  btnColor?: string;
  height?: number;
  // two_column
  leftContent?: string;
  rightContent?: string;
  leftTextColor?: string;
  rightTextColor?: string;
}

// ── Palette catalog (exported for use in left panel) ─────────────────────────

// Generic email blocks — shown in both cert-delivery and broadcast editors
export const EMAIL_BLOCKS_PALETTE: Array<{ type: BlockType; icon: React.ReactNode; label: string; desc: string }> = [
  { type: "header",      icon: <LayoutTemplate className="w-3.5 h-3.5" />,    label: "Header",       desc: "Title banner" },
  { type: "greeting",    icon: <AlignLeft className="w-3.5 h-3.5" />,         label: "Greeting",     desc: "Hi {{name}}" },
  { type: "text",        icon: <AlignLeft className="w-3.5 h-3.5" />,         label: "Text",         desc: "Paragraph" },
  { type: "markdown",    icon: <Type className="w-3.5 h-3.5" />,              label: "Markdown",     desc: "Rich text / tables" },
  { type: "two_column",  icon: <TableProperties className="w-3.5 h-3.5" />,   label: "Two Columns",  desc: "Side-by-side layout" },
  { type: "cta_button",  icon: <MousePointerClick className="w-3.5 h-3.5" />, label: "CTA Button",   desc: "Action link" },
  { type: "linkedin",    icon: <Type className="w-3.5 h-3.5" />,              label: "LinkedIn",     desc: "Share prompt" },
  { type: "divider",     icon: <Minus className="w-3.5 h-3.5" />,             label: "Divider",      desc: "Separator" },
  { type: "spacer",      icon: <ArrowUpDown className="w-3.5 h-3.5" />,       label: "Spacer",       desc: "Empty space" },
  { type: "footer",      icon: <LayoutTemplate className="w-3.5 h-3.5" />,    label: "Footer",       desc: "Footer text" },
];

// Certificate-specific blocks — shown only in the cert-delivery email template editor
export const CERT_BLOCKS_PALETTE: Array<{ type: BlockType; icon: React.ReactNode; label: string; desc: string }> = [
  { type: "cert_image",  icon: <ImageIcon className="w-3.5 h-3.5" />,        label: "Cert Image",  desc: "Certificate preview" },
  { type: "qr_code",     icon: <QrCode className="w-3.5 h-3.5" />,           label: "QR Code",     desc: "Verify link" },
  { type: "details_box", icon: <TableProperties className="w-3.5 h-3.5" />,  label: "Details Box", desc: "Course, date…" },
];

// Full palette for cert delivery email editor (email + cert blocks)
export const PALETTE = [...EMAIL_BLOCKS_PALETTE, ...CERT_BLOCKS_PALETTE];

// ── Default block configs ────────────────────────────────────────────────────

export function defaultBlock(type: BlockType): EmailBlock {
  const id = nanoid(8);
  switch (type) {
    case "header":      return { id, type, bgColor: "#3ECF8E", titleColor: "#ffffff", title: "Congratulations, {{recipient_name}}!", subtitle: "You've completed {{course_name}}" };
    case "greeting":    return { id, type, content: "Hi {{recipient_name}},", textColor: "#e5e7eb" };
    case "text":        return { id, type, content: "We are delighted to inform you that you have successfully completed this program. Your certificate is ready below.", textColor: "#d1d5db" };
    case "markdown":    return { id, type, content: "## Congratulations, **{{recipient_name}}**!\n\nYou have successfully completed **{{course_name}}**.\n\n- 📅 Issued on {{issue_date}}\n- 🔗 [View & verify your certificate]({{verification_url}})\n\n> Your achievement has been recorded and is ready to share.", textColor: "#d1d5db" };
    case "two_column":  return { id, type, leftContent: "**Course Details**\n\nCourse: {{course_name}}\nDate: {{issue_date}}", rightContent: "**About Your Certificate**\n\nThis certificate verifies your achievement. Share it with your network!", leftTextColor: "#d1d5db", rightTextColor: "#d1d5db" };
    case "cert_image":  return { id, type };
    case "qr_code":     return { id, type, content: "Scan QR to verify certificate authenticity" };
    case "details_box": return { id, type, detailRows: [{ label: "Course", value: "{{course_name}}" }, { label: "Date Issued", value: "{{issue_date}}" }], detailBgColor: "#1a1a1a", detailTextColor: "#3ECF8E" };
    case "cta_button":  return { id, type, btnLabel: "View & Verify Certificate", btnUrl: "{{verification_url}}", btnColor: "#3ECF8E" };
    case "linkedin":    return { id, type, content: "🎓 Share your achievement on LinkedIn and inspire others!", textColor: "#9ca3af" };
    case "divider":     return { id, type };
    case "spacer":      return { id, type, height: 24 };
    case "footer":      return { id, type, content: "© {{organization_name}} · Powered by Authentix", textColor: "#6b7280" };
  }
}

// ── Preview utilities ────────────────────────────────────────────────────────

function makeQrSvg(data: string, px = 120): string {
  const N = 21;
  const m: boolean[][] = Array.from({ length: N }, () => new Array(N).fill(false) as boolean[]);
  const set = (r: number, c: number, v = true) => { if (r >= 0 && r < N && c >= 0 && c < N) m[r]![c] = v; };
  for (const [r0, c0] of [[0,0],[0,N-7],[N-7,0]] as [number,number][]) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++)
      set(r0+r, c0+c, r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));
  }
  for (let i = 8; i < N-8; i++) { set(6,i,i%2===0); set(i,6,i%2===0); }
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data.charCodeAt(i), 0x01000193);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if ((r<9&&(c<9||c>=N-8))||(r>=N-8&&c<9)||r===6||c===6) continue;
    h = Math.imul(h^(r*31+c), 0x9e3779b9); h = (h^(h>>>16))|0;
    m[r]![c] = (h & 0xf) > 5;
  }
  const cs = px/N;
  let rects = '';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
    if (m[r]![c]) rects += `<rect x="${(c*cs).toFixed(1)}" y="${(r*cs).toFixed(1)}" width="${cs.toFixed(1)}" height="${cs.toFixed(1)}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"><rect width="${px}" height="${px}" fill="#1e1e1e"/><g fill="#e5e7eb">${rects}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeCertSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="392" viewBox="0 0 560 392"><rect width="560" height="392" fill="#18181b" rx="8"/><rect x="12" y="12" width="536" height="368" fill="none" stroke="#3ECF8E" stroke-width="2" rx="6"/><rect x="22" y="22" width="516" height="54" fill="#3ECF8E" rx="3"/><text x="280" y="57" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="17" font-weight="700" fill="white" letter-spacing="2">CERTIFICATE OF ACHIEVEMENT</text><circle cx="280" cy="150" r="36" fill="none" stroke="#3ECF8E" stroke-width="2"/><circle cx="280" cy="150" r="28" fill="#2d2d2d"/><text x="280" y="160" text-anchor="middle" font-size="24" fill="#3ECF8E">✦</text><text x="280" y="210" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="11" fill="#6b7280" letter-spacing="1">THIS CERTIFIES THAT</text><text x="280" y="245" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="26" font-weight="600" fill="#e5e7eb">Alex Johnson</text><line x1="155" y1="258" x2="405" y2="258" stroke="#2d2d2d" stroke-width="1"/><text x="280" y="286" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="12" fill="#9ca3af">has successfully completed</text><text x="280" y="313" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="15" font-weight="600" fill="#3ECF8E">Advanced React Development</text><text x="280" y="356" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="10" fill="#6b7280">March 22, 2026  ·  Authentix Academy</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const _CERT_SVG = makeCertSvg();
const _QR_SVG = makeQrSvg("https://verify.authentix.io/abc123");

const PREVIEW_MOCKS: Record<string, string> = {
  recipient_name: "Alex Johnson",
  organization_name: "Authentix Academy",
  issue_date: "March 22, 2026",
  course_name: "Advanced React Development",
  event_name: "Annual Tech Summit 2026",
  event_date: "March 22, 2026",
  award_name: "Employee of the Year",
  training_name: "Leadership Excellence Program",
  membership_type: "Gold Member",
  valid_until: "December 31, 2026",
  completion_date: "March 22, 2026",
  certificate_image_url: _CERT_SVG,
  verification_url: "https://verify.authentix.io/abc123",
  verification_url_encoded: encodeURIComponent("https://verify.authentix.io/abc123"),
};

export function applyPreviewMocks(html: string): string {
  // Step 1: Replace variables inside src= / href= attribute values with raw mock values.
  // This prevents broken img tags when {{certificate_image_url}} or {{verification_url}}
  // appear inside an HTML attribute — we just substitute the URL string directly.
  let result = html.replace(/(src|href)="([^"]*)"/g, (_fullMatch, attr, val: string) => {
    const newVal = val.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_m, key: string) => {
      const k = key.trim();
      return PREVIEW_MOCKS[k] ?? `{{${k}}}`;
    });
    return `${attr}="${newVal}"`;
  });

  // Step 2: Replace {{verification_url_encoded}} that wasn't caught in Step 1 (it appears
  // inside an already-processed src attribute); replace with the encoded mock URL.
  result = result.replace(/\{\{verification_url_encoded\}\}/g, encodeURIComponent(PREVIEW_MOCKS.verification_url ?? ""));

  // Step 3: Replace QR API URLs (now containing the resolved verification URL) with local QR SVG.
  result = result.replace(/https:\/\/api\.qrserver\.com\/v1\/create-qr-code\/[^"' <]*/g, _QR_SVG);

  // Step 4: Replace remaining {{variable}} tokens in text content with styled preview chips.
  result = result.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, key: string) => {
    const k = key.trim();
    if (PREVIEW_MOCKS[k]) {
      return `<span style="position:relative;display:inline-block;pointer-events:none;cursor:default;">`
        + `<span style="background:rgba(255,255,255,0.92);color:#1a1a1a;border:1px solid rgba(0,0,0,0.18);border-radius:5px;padding:1px 7px 1px 5px;font-size:inherit;line-height:inherit;font-weight:600;" title="Preview sample for {{${k}}} — replaced with real data at send time">`
        + PREVIEW_MOCKS[k]
        + `</span>`
        + `<span style="position:absolute;top:-6px;right:-2px;font-size:7px;background:#3ECF8E;color:#fff;border-radius:3px;padding:0 3px;font-family:system-ui,sans-serif;font-weight:700;letter-spacing:0.3px;line-height:12px;">●</span>`
        + `</span>`;
    }
    return `<span style="background:rgba(255,255,255,0.85);color:#92400e;border:1px solid rgba(0,0,0,0.15);padding:1px 6px;border-radius:5px;font-family:monospace;font-size:11px;font-weight:600;" title="Variable not in standard list — will be replaced if present in your data">{{${k}}}</span>`;
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

function darken(hex: string): string {
  try {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, (n >> 16) - 30);
    const g = Math.max(0, ((n >> 8) & 0xff) - 30);
    const b = Math.max(0, (n & 0xff) - 30);
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
  } catch { return hex; }
}

// ── Markdown → email-safe HTML ───────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function markdownToEmailHtml(md: string, textColor = "#374151"): string {
  if (!md.trim()) return "";

  // 1. Preserve {{variables}} by swapping with indexed placeholders
  const vars: string[] = [];
  let out = md.replace(/\{\{([\w.\s]+)\}\}/g, (m) => { vars.push(m); return `\x00VAR${vars.length - 1}\x00`; });

  // 2. Fenced code blocks  (``` … ```)
  out = out.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) =>
    `<pre style="background:#1e293b;border-radius:8px;padding:14px 18px;overflow-x:auto;margin:12px 0;"><code style="font-family:'Courier New',Courier,monospace;font-size:12px;color:#e2e8f0;white-space:pre-wrap;line-height:1.6;">${escHtml(code.trimEnd())}</code></pre>`
  );

  // 3. Blockquotes  (> …)
  out = out.replace(/^> (.+)$/gm, (_, t) =>
    `<blockquote style="border-left:4px solid #3ECF8E;margin:10px 0;padding:10px 16px;background:rgba(62,207,142,0.08);border-radius:0 6px 6px 0;color:#3ECF8E;font-style:italic;font-size:14px;">${t}</blockquote>`
  );

  // 4. Tables  (| … | … |)
  out = out.replace(/^\|(.+)\|\s*\n\|[-:| ]+\|\s*\n((?:\|.+\|\n?)*)/gm, (_, hdr, body) => {
    const ths = hdr.split("|").filter(Boolean).map((h: string) =>
      `<th style="padding:8px 14px;background:#27272a;border:1px solid #3f3f46;font-size:13px;font-weight:600;text-align:left;color:${textColor};">${h.trim()}</th>`
    ).join("");
    const trs = body.trim().split("\n").map((row: string) =>
      `<tr>${row.split("|").filter(Boolean).map((c: string) =>
        `<td style="padding:8px 14px;border:1px solid #3f3f46;font-size:13px;color:${textColor};">${c.trim()}</td>`
      ).join("")}</tr>`
    ).join("");
    return `<table style="width:100%;border-collapse:collapse;margin:14px 0;">\n<thead><tr>${ths}</tr></thead>\n<tbody>${trs}</tbody>\n</table>`;
  });

  // 5. Horizontal rules
  out = out.replace(/^[-*_]{3,}\s*$/gm, `<hr style="border:none;border-top:1px solid #3f3f46;margin:16px 0;" />`);

  // 6. Headings (process h6 → h1 to avoid partial matches)
  const headingStyles: Record<number, string> = {
    1: `font-size:26px;font-weight:700;margin:20px 0 8px;letter-spacing:-0.4px;`,
    2: `font-size:21px;font-weight:700;margin:18px 0 6px;`,
    3: `font-size:17px;font-weight:700;margin:14px 0 5px;`,
    4: `font-size:15px;font-weight:700;margin:12px 0 4px;`,
    5: `font-size:13px;font-weight:700;margin:10px 0 3px;text-transform:uppercase;letter-spacing:0.5px;`,
    6: `font-size:12px;font-weight:700;margin:8px 0 2px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;`,
  };
  for (let i = 6; i >= 1; i--) {
    const re = new RegExp(`^#{${i}} (.+)$`, "gm");
    out = out.replace(re, (_, t) =>
      `<h${i} style="${headingStyles[i]}color:${textColor};">${t}</h${i}>`
    );
  }

  // 7. Unordered lists  (- / * / + items)
  out = out.replace(/((?:^[-*+] .+\n?)+)/gm, (match) => {
    const items = match.trim().split("\n").map(li =>
      `<li style="margin:3px 0;font-size:14px;color:${textColor};">${li.replace(/^[-*+] /, "")}</li>`
    ).join("");
    return `<ul style="padding-left:22px;margin:8px 0;list-style:disc;">${items}</ul>`;
  });

  // 8. Ordered lists  (1. items)
  out = out.replace(/((?:^\d+\. .+\n?)+)/gm, (match) => {
    const items = match.trim().split("\n").map(li =>
      `<li style="margin:3px 0;font-size:14px;color:${textColor};">${li.replace(/^\d+\. /, "")}</li>`
    ).join("");
    return `<ol style="padding-left:22px;margin:8px 0;list-style:decimal;">${items}</ol>`;
  });

  // 9. Inline elements (order matters)

  // Inline code
  out = out.replace(/`([^`\n]+)`/g, (_, code) =>
    `<code style="font-family:'Courier New',monospace;font-size:12px;background:#27272a;border:1px solid #3f3f46;border-radius:3px;padding:1px 5px;color:#f87171;">${escHtml(code)}</code>`
  );

  // Images  ![alt](src)  — before links
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
    `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto;border-radius:6px;display:block;margin:10px auto;" />`
  );

  // Links  [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) =>
    `<a href="${href}" style="color:#3ECF8E;text-decoration:underline;font-weight:500;">${text}</a>`
  );

  // Bold + italic  ***text***
  out = out.replace(/\*\*\*([^*\n]+)\*\*\*/g, (_, t) => `<strong><em>${t}</em></strong>`);
  // Bold  **text** or __text__
  out = out.replace(/\*\*([^*\n]+)\*\*/g, (_, t) => `<strong>${t}</strong>`);
  out = out.replace(/__([^_\n]+)__/g, (_, t) => `<strong>${t}</strong>`);
  // Italic  *text* or _text_
  out = out.replace(/\*([^*\n]+)\*/g, (_, t) => `<em>${t}</em>`);
  out = out.replace(/_([^_\n]+)_/g, (_, t) => `<em>${t}</em>`);
  // Strikethrough  ~~text~~
  out = out.replace(/~~([^~\n]+)~~/g, (_, t) => `<del style="opacity:0.55;">${t}</del>`);

  // 10. Paragraphs — double-newline separated chunks
  const chunks = out.split(/\n{2,}/);
  out = chunks.map(chunk => {
    chunk = chunk.trim();
    if (!chunk) return "";
    // Don't wrap already-block-level tags
    if (/^<(h[1-6]|ul|ol|pre|table|blockquote|hr|img)[\s>]/.test(chunk)) return chunk;
    return `<p style="margin:0 0 12px;line-height:1.75;font-size:14px;color:${textColor};">${chunk.replace(/\n/g, "<br/>")}</p>`;
  }).filter(Boolean).join("\n");

  // 11. Restore {{variables}} — null bytes used intentionally as safe delimiters
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\u0000VAR(\d+)\u0000/g, (_, i) => vars[Number(i)] ?? "");

  return out;
}

// ── Block → HTML (for actual email sending) ──────────────────────────────────

function blockToHtml(block: EmailBlock): string {
  const ff = block.fontFamily ? `font-family:${block.fontFamily};` : "";
  const fs = block.fontSize ? `font-size:${block.fontSize}px;` : "";
  void fs;

  switch (block.type) {
    case "header":
      return `<div style="background: linear-gradient(135deg, ${block.bgColor || "#3ECF8E"} 0%, ${darken(block.bgColor || "#3ECF8E")} 100%); padding: 44px 32px; text-align: center;">
  <h1 style="color: ${block.titleColor || "#ffffff"}; font-size: 28px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.5px;${ff}">${block.title || ""}</h1>
  ${block.subtitle ? `<p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 0;${ff}">${block.subtitle}</p>` : ""}
</div>`;

    case "greeting": {
      const ta = block.textAlign || "left";
      return `<div style="padding: 20px 32px; min-height: 64px; display: flex; align-items: center; justify-content: ${ta === "center" ? "center" : ta === "right" ? "flex-end" : "flex-start"};${block.bgColor ? `background:${block.bgColor};` : ""}">
  <p style="font-size: ${block.fontSize || 16}px; color: ${block.textColor || "#e5e7eb"}; margin: 0; text-align: ${ta};${ff}">${block.content || "Hi {{recipient_name}},"}</p>
</div>`;
    }

    case "text": {
      const ta = block.textAlign || "left";
      return `<div style="padding: 16px 32px; text-align: ${ta};${block.bgColor ? `background:${block.bgColor};` : ""}">
  <p style="font-size: ${block.fontSize || 15}px; color: ${block.textColor || "#d1d5db"}; line-height: 1.7; margin: 0;${ff}">${block.content || ""}</p>
</div>`;
    }

    case "markdown":
      return `<div style="padding: 16px 32px;${block.bgColor ? `background:${block.bgColor};` : ""}">${markdownToEmailHtml(block.content ?? "", block.textColor ?? "#d1d5db")}</div>`;

    case "two_column":
      return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;${block.bgColor ? `background:${block.bgColor};` : ""}">
  <tr>
    <td width="50%" style="padding:20px 12px 20px 32px;vertical-align:top;border-right:1px solid #2d2d2d;">
      <div style="font-size:14px;color:${block.leftTextColor || "#d1d5db"};line-height:1.7;${ff}">${markdownToEmailHtml(block.leftContent ?? "", block.leftTextColor ?? "#d1d5db")}</div>
    </td>
    <td width="50%" style="padding:20px 32px 20px 12px;vertical-align:top;">
      <div style="font-size:14px;color:${block.rightTextColor || "#d1d5db"};line-height:1.7;${ff}">${markdownToEmailHtml(block.rightContent ?? "", block.rightTextColor ?? "#d1d5db")}</div>
    </td>
  </tr>
</table>`;

    case "cert_image":
      return `<div style="margin: 32px; text-align: center;">
  <img src="{{certificate_image_url}}" alt="Your Certificate" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.10);" />
</div>`;

    case "qr_code": {
      // Use a template-safe placeholder that the backend interpolate() will fill in.
      // The backend replaces {{verification_url}} then the email client decodes &amp; → &
      // so the final URL seen by the browser is properly formed.
      // We also encode the data value so qrserver.com receives a valid URL parameter.
      const qrDataParam = "{{verification_url_encoded}}";
      return `<div style="text-align: center; margin: 0 32px 28px; padding: 20px; background: #1e1e1e; border: 1px solid #2d2d2d; border-radius: 8px;">
  <a href="{{verification_url}}" style="display: inline-block;">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&amp;color=ffffff&amp;bgcolor=1e1e1e&amp;data=${qrDataParam}&amp;qzone=1" alt="Scan to verify" style="width: 120px; height: 120px; border-radius: 4px; display: inline-block;" />
  </a>
  <p style="font-size: 12px; color: #6b7280; margin: 8px 0 0;${ff}">${block.content || "Scan QR to verify certificate authenticity"}</p>
</div>`;
    }

    case "details_box": {
      const rows = block.detailRows || [];
      const cells = rows.map(r => `    <td style="padding: 4px 8px 4px 0; vertical-align: top;">
      <p style="font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 2px;">${r.label}</p>
      <p style="font-size: 15px; font-weight: 600; color: ${block.detailTextColor || "#3ECF8E"}; margin: 0;">${r.value}</p>
    </td>`).join("\n");
      return `<div style="background: ${block.detailBgColor || "#1a1a1a"}; border: 1px solid #2d2d2d; border-radius: 8px; padding: 20px 24px; margin: 16px 32px 28px;">
  <table style="width: 100%; border-collapse: collapse;"><tr>
${cells}
  </tr></table>
</div>`;
    }

    case "cta_button":
      return `<div style="text-align: center; margin: 24px 32px;">
  <a href="${block.btnUrl || "{{verification_url}}"}" style="display: inline-block; background: ${block.btnColor || "#3ECF8E"}; color: #ffffff; font-size: 15px; font-weight: 600; padding: 13px 32px; border-radius: 8px; text-decoration: none; letter-spacing: 0.2px;${ff}">${block.btnLabel || "View &amp; Verify Certificate"}</a>
</div>`;

    case "linkedin":
      return `<div style="padding: 20px 32px; text-align: center;${block.bgColor ? `background:${block.bgColor};` : ""}"><p style="font-size: 14px; color: ${block.textColor || "#9ca3af"}; margin: 0;${ff}">${block.content || "🎓 Share your achievement on LinkedIn and inspire others!"}</p></div>`;

    case "divider":
      return `<hr style="border: none; border-top: 1px solid #333; margin: 16px 32px;" />`;

    case "spacer":
      return `<div style="height: ${block.height || 24}px;"></div>`;

    case "footer":
      return `<div style="padding: 16px 32px; text-align: center; border-top: 1px solid #2d2d2d;${block.bgColor ? `background:${block.bgColor};` : ""}">
  <p style="font-size: 12px; color: ${block.textColor || "#6b7280"}; margin: 0;${ff}">${block.content || "© {{organization_name}} · Powered by Authentix"}</p>
</div>`;

    default:
      return "";
  }
}

const BLOCKS_JSON_MARKER = "__blocks_v1__";

export function blocksToHtml(blocks: EmailBlock[]): string {
  if (!blocks.length) return "";
  const inner = blocks.map(blockToHtml).join("\n");
  // Embed blocks as a JSON comment so the editor can restore them on next open
  const jsonComment = `<!-- ${BLOCKS_JSON_MARKER}:${JSON.stringify(blocks)} -->`;
  return `${jsonComment}\n<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #18181b; border-radius: 10px; overflow: hidden; border: 1px solid #2d2d2d;">
${inner}
</div>`;
}

/** Extract blocks from the embedded JSON comment in stored HTML. Returns null if not found. */
export function extractBlocksFromHtml(html: string): EmailBlock[] | null {
  const match = html.match(new RegExp(`<!-- ${BLOCKS_JSON_MARKER}:(.+?) -->`));
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as EmailBlock[];
  } catch { /* malformed JSON */ }
  return null;
}

// ── Starter blocks ───────────────────────────────────────────────────────────

export const STARTER_BLOCKS: EmailBlock[] = [
  defaultBlock("header"),
  defaultBlock("greeting"),
  defaultBlock("text"),
  defaultBlock("details_box"),
  defaultBlock("cert_image"),
  defaultBlock("qr_code"),
  defaultBlock("cta_button"),
  defaultBlock("linkedin"),
  defaultBlock("divider"),
  defaultBlock("footer"),
];

// ── EdTech starter templates ─────────────────────────────────────────────────

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  context: "cert" | "broadcast" | "both";
  blocks: () => EmailBlock[];
}

export const EDTECH_TEMPLATES: StarterTemplate[] = [
  {
    id: "course-completion",
    name: "Course Completion",
    description: "Full certificate delivery email with cert preview, details, and verify button",
    context: "cert",
    blocks: () => [
      defaultBlock("header"),
      defaultBlock("greeting"),
      { ...defaultBlock("text"), content: "We're thrilled to share that you've successfully completed the course. Your verified digital certificate is ready below.", textColor: "#d1d5db" },
      defaultBlock("cert_image"),
      defaultBlock("details_box"),
      defaultBlock("cta_button"),
      defaultBlock("linkedin"),
      defaultBlock("divider"),
      defaultBlock("footer"),
    ],
  },
  {
    id: "workshop-graduate",
    name: "Workshop Graduate",
    description: "Concise completion email for short workshops or bootcamps",
    context: "cert",
    blocks: () => [
      { ...defaultBlock("header"), title: "Workshop Complete — {{recipient_name}}!", subtitle: "You've earned your certificate for {{course_name}}" },
      defaultBlock("greeting"),
      { ...defaultBlock("text"), content: "Congratulations on completing the workshop. Your certificate of completion is attached and ready to share.", textColor: "#d1d5db" },
      { ...defaultBlock("details_box"), detailRows: [{ label: "Workshop", value: "{{course_name}}" }, { label: "Date", value: "{{issue_date}}" }, { label: "Issued by", value: "{{organization_name}}" }] },
      defaultBlock("cta_button"),
      defaultBlock("footer"),
    ],
  },
  {
    id: "professional-cert",
    name: "Professional Certificate",
    description: "Two-column layout with cert preview — ideal for professional certifications",
    context: "cert",
    blocks: () => [
      { ...defaultBlock("header"), title: "Professional Certificate Awarded", subtitle: "{{recipient_name}} · {{course_name}}" },
      defaultBlock("greeting"),
      { ...defaultBlock("two_column"), leftContent: "**Certificate Details**\n\nCourse: {{course_name}}\nDate: {{issue_date}}\nIssued by: {{organization_name}}", rightContent: "**Verify Your Certificate**\n\nThis certificate is digitally verified and can be shared with employers, LinkedIn, or any professional network." },
      defaultBlock("cert_image"),
      defaultBlock("qr_code"),
      { ...defaultBlock("cta_button"), btnLabel: "View & Verify Certificate" },
      defaultBlock("footer"),
    ],
  },
  {
    id: "achievement-award",
    name: "Achievement Award",
    description: "For recognition awards, honours, or special achievements",
    context: "cert",
    blocks: () => [
      { ...defaultBlock("header"), bgColor: "#1e3a5f", title: "🏆 You've Been Recognised!", subtitle: "{{recipient_name}} — {{course_name}}" },
      defaultBlock("greeting"),
      { ...defaultBlock("text"), content: "We are proud to present you with this award in recognition of your outstanding achievement. This certificate is a testament to your dedication and hard work.", textColor: "#d1d5db" },
      defaultBlock("cert_image"),
      defaultBlock("linkedin"),
      defaultBlock("cta_button"),
      defaultBlock("divider"),
      defaultBlock("footer"),
    ],
  },
  {
    id: "course-announcement",
    name: "Course Announcement",
    description: "Announce a new course or learning programme to your learners",
    context: "broadcast",
    blocks: () => [
      { ...defaultBlock("header"), title: "New Course Available 🎓", subtitle: "{{course_name}} is now open for enrolment" },
      { ...defaultBlock("greeting"), content: "Hi {{recipient_name}}," },
      { ...defaultBlock("text"), content: "We're excited to announce that **{{course_name}}** is now live. This course is designed to help you gain industry-recognised skills and advance your career.", textColor: "#d1d5db" },
      { ...defaultBlock("two_column"), leftContent: "**What you'll learn**\n\n• Core concepts and frameworks\n• Hands-on projects\n• Industry best practices", rightContent: "**Course highlights**\n\n• Self-paced learning\n• Certificate upon completion\n• Expert instructors" },
      { ...defaultBlock("cta_button"), btnLabel: "Enrol Now", btnUrl: "{{verification_url}}" },
      defaultBlock("footer"),
    ],
  },
  {
    id: "completion-reminder",
    name: "Completion Reminder",
    description: "Nudge learners who are close to finishing a course",
    context: "broadcast",
    blocks: () => [
      { ...defaultBlock("header"), bgColor: "#7c3aed", title: "You're Almost There, {{recipient_name}}!", subtitle: "Complete {{course_name}} to earn your certificate" },
      { ...defaultBlock("greeting"), content: "Hi {{recipient_name}}," },
      { ...defaultBlock("text"), content: "You're so close to finishing {{course_name}}! Don't let your progress go to waste — complete the remaining lessons today and earn your verified certificate.", textColor: "#d1d5db" },
      { ...defaultBlock("cta_button"), btnLabel: "Continue Learning", btnColor: "#7c3aed" },
      { ...defaultBlock("text"), content: "If you have any questions or need support, reply to this email — we're here to help.", textColor: "#9ca3af", fontSize: 13 },
      defaultBlock("footer"),
    ],
  },
  {
    id: "welcome-email",
    name: "Welcome to Course",
    description: "Warm welcome email for learners who just enrolled",
    context: "broadcast",
    blocks: () => [
      { ...defaultBlock("header"), title: "Welcome to {{course_name}}! 👋", subtitle: "We're glad you're here, {{recipient_name}}" },
      { ...defaultBlock("greeting"), content: "Hi {{recipient_name}}," },
      { ...defaultBlock("text"), content: "Thank you for enrolling in **{{course_name}}**. You've taken a great step towards advancing your skills. Here's everything you need to get started.", textColor: "#d1d5db" },
      { ...defaultBlock("two_column"), leftContent: "**Getting Started**\n\n1. Log in to your account\n2. Navigate to your course\n3. Start with Module 1", rightContent: "**Need Help?**\n\nOur support team is here for you. Reply to this email or visit our help centre at any time." },
      { ...defaultBlock("cta_button"), btnLabel: "Start Learning Now" },
      defaultBlock("footer"),
    ],
  },
  {
    id: "monthly-newsletter",
    name: "Monthly Progress Update",
    description: "Periodic newsletter-style update for your learner community",
    context: "broadcast",
    blocks: () => [
      { ...defaultBlock("header"), title: "Learning Update 📚", subtitle: "Your monthly progress from {{organization_name}}" },
      { ...defaultBlock("greeting"), content: "Hi {{recipient_name}}," },
      { ...defaultBlock("text"), content: "Here's a summary of what's been happening this month across your learning journey.", textColor: "#d1d5db" },
      defaultBlock("divider"),
      { ...defaultBlock("text"), content: "**This Month's Highlights**\n\nNew courses have been added to the catalogue, and our top learners have been recognised for their achievements. Keep up the great work!", textColor: "#d1d5db" },
      defaultBlock("divider"),
      { ...defaultBlock("cta_button"), btnLabel: "View My Learning Dashboard" },
      defaultBlock("footer"),
    ],
  },
];

// ── StarterTemplateGallery ────────────────────────────────────────────────────

// ── Palette block hover preview (exported for use in parent left panels) ─────

export function PaletteItemCard({
  item,
  onClick,
  onDragStart,
}: {
  item: { type: BlockType; icon: React.ReactNode; label: string; desc: string };
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);

  const previewBlock = useMemo(() => defaultBlock(item.type), [item.type]);
  const previewHtml = useMemo(() => {
    const raw = blockToHtml(previewBlock);
    return applyPreviewMocks(raw);
  }, [previewBlock]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        onMouseEnter={e => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPreviewPos({ x: rect.right + 8, y: rect.top });
          setShowPreview(true);
        }}
        onMouseLeave={() => setShowPreview(false)}
        title={item.desc}
        className="flex items-center gap-2 p-2.5 rounded-lg border border-transparent bg-muted/30 hover:bg-muted/60 hover:border-border cursor-grab active:cursor-grabbing transition-all text-left group w-full"
      >
        <span className="shrink-0 text-muted-foreground group-hover:text-[#3ECF8E] transition-colors">
          {item.icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium truncate">{item.label}</p>
          <p className="text-[9px] text-muted-foreground truncate leading-tight">{item.desc}</p>
        </div>
      </button>

      {showPreview && createPortal(
        <div
          className="fixed z-99999 pointer-events-none"
          style={{ left: Math.min(previewPos.x, window.innerWidth - 320), top: Math.max(8, previewPos.y) }}
        >
          <div className="w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-3 py-1.5 border-b border-zinc-700 bg-zinc-800/80">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{item.label} preview</p>
            </div>
            <div
              className="overflow-hidden"
              style={{ transform: "scale(0.65)", transformOrigin: "top left", width: "154%" }}
              dangerouslySetInnerHTML={{ __html: previewHtml || `<div style="padding:16px;color:#6b7280;font-size:12px;font-family:sans-serif">${item.label}</div>` }}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function StarterTemplateGallery({
  context,
  onSelect,
  onDismiss,
}: {
  context: "cert" | "broadcast";
  onSelect: (blocks: EmailBlock[]) => void;
  onDismiss: () => void;
}) {
  const templates = EDTECH_TEMPLATES.filter(t => t.context === context || t.context === "both");

  return (
    <div className="flex flex-col items-center gap-6 py-12 px-6 max-w-2xl mx-auto">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-[#3ECF8E]/10 flex items-center justify-center mx-auto mb-3">
          <LayoutTemplate className="w-5 h-5 text-[#3ECF8E]" />
        </div>
        <p className="text-base font-semibold text-foreground mb-1">Choose a starting template</p>
        <p className="text-xs text-muted-foreground">EdTech-focused templates — customise everything after selecting</p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full">
        {templates.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.blocks().map(b => ({ ...b, id: nanoid(8) })))}
            className="group text-left p-4 rounded-xl border border-border/60 bg-card hover:border-[#3ECF8E]/60 hover:bg-[#3ECF8E]/5 transition-all"
          >
            <p className="text-xs font-semibold text-foreground mb-1 group-hover:text-[#3ECF8E] transition-colors">{t.name}</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{t.description}</p>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Start with blank canvas instead
      </button>
    </div>
  );
}

const BLOCK_LABELS: Record<BlockType, string> = {
  header: "Header",
  greeting: "Greeting",
  text: "Text Block",
  markdown: "Markdown",
  two_column: "Two Columns",
  cert_image: "Certificate Image",
  qr_code: "QR Code",
  details_box: "Details Box",
  cta_button: "CTA Button",
  linkedin: "LinkedIn Nudge",
  divider: "Divider",
  spacer: "Spacer",
  footer: "Footer",
};

// ── Shared variable dropdown portal (autocomplete + swap) ────────────────────

function VarListPortal({
  vars,
  query,
  x,
  y,
  title,
  onSelect,
  onClose,
}: {
  vars: string[];
  query: string;
  x: number;
  y: number;
  title: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const filtered = vars.filter(v =>
    !query || v.toLowerCase().includes(query.toLowerCase())
  );
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const adjustedX = Math.min(x, vw - 220);

  React.useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest(".var-portal-root")) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  return createPortal(
    <div className="var-portal-root" style={{
      position: "fixed", left: adjustedX, top: y + 6, zIndex: 99999,
      borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.26)",
      minWidth: 210, maxHeight: 240, overflow: "hidden",
      display: "flex", flexDirection: "column",
      background: "var(--color-card, #1c1c1e)",
      border: "1px solid rgba(255,255,255,0.1)",
    }}>
      <p style={{ fontSize: 9, color: "#6b7280", padding: "5px 10px 4px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        {title}
      </p>
      <div style={{ overflowY: "auto", padding: "3px 0" }}>
        {filtered.length === 0 && (
          <p style={{ fontSize: 11, color: "#6b7280", padding: "8px 10px" }}>No matches</p>
        )}
        {filtered.map(v => (
          <button
            key={v}
            onMouseDown={e => { e.preventDefault(); onSelect(v); }}
            style={{ display: "block", width: "100%", padding: "5px 10px", textAlign: "left", fontSize: 12, fontFamily: "monospace", color: "#3ECF8E", background: "transparent", border: "none", cursor: "pointer" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(62,207,142,0.12)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

// ── EditableText — contenteditable inline text element with @ / {{ autocomplete ─

function toVarHtml(text: string): string {
  return (text || "").replace(/\{\{([\w.]+)\}\}/g, (match, varName) =>
    `<span data-var data-var-name="${varName}" style="display:inline-block;border:1px solid rgba(62,207,142,0.5);border-radius:4px;padding:1px 5px;color:#3ECF8E;font-family:monospace;font-size:0.82em;background:rgba(62,207,142,0.08);line-height:1.6;cursor:pointer;font-weight:600;white-space:nowrap;" title="Click to swap this variable">${match}</span>`
  );
}

function EditableText({
  value,
  onChange,
  tag: Tag = "span",
  style,
  placeholder,
  availableVars = [],
}: {
  value: string;
  onChange: (v: string) => void;
  tag?: keyof React.JSX.IntrinsicElements;
  style?: React.CSSProperties;
  placeholder?: string;
  availableVars?: string[];
}) {
  const ref = useRef<HTMLElement>(null);
  const isFocused = useRef(false);
  // @ / {{ autocomplete dropdown
  const [autocomplete, setAutocomplete] = useState<{ trigger: string; query: string; x: number; y: number } | null>(null);
  // Chip click → inline swap popover
  const [swapPopover, setSwapPopover] = useState<{ varName: string; x: number; y: number } | null>(null);

  // Sync DOM from prop when not being edited
  useLayoutEffect(() => {
    if (ref.current && !isFocused.current) {
      const styled = toVarHtml(value);
      if (ref.current.innerHTML !== styled) {
        ref.current.innerHTML = styled;
      }
    }
  });

  // Set content on first mount
  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = toVarHtml(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectTrigger = () => {
    if (!availableVars.length) return null;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return null;
    const textBefore = (container.textContent ?? "").slice(0, range.startOffset);

    // Check {{ trigger first (longer pattern, check before @)
    const dblBraceIdx = textBefore.lastIndexOf("{{");
    if (dblBraceIdx !== -1) {
      const query = textBefore.slice(dblBraceIdx + 2);
      if (!query.includes(" ") && !query.includes("\n") && !query.includes("}")) {
        const rect = range.getBoundingClientRect();
        return { trigger: "{{", query, x: rect.left, y: rect.bottom };
      }
    }

    // Check @ trigger
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = textBefore.slice(atIdx + 1);
      if (!query.includes(" ") && !query.includes("\n")) {
        const rect = range.getBoundingClientRect();
        return { trigger: "@", query, x: rect.left, y: rect.bottom };
      }
    }

    return null;
  };

  const handleInput = () => {
    const found = detectTrigger();
    setAutocomplete(found);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (autocomplete && e.key === "Escape") {
      setAutocomplete(null);
      e.preventDefault();
    }
  };

  const insertVar = (varName: string) => {
    if (!ref.current) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;
    const text = container.textContent ?? "";
    const cursorOffset = range.startOffset;
    const textBefore = text.slice(0, cursorOffset);

    // Find the trigger start position
    const dblBraceIdx = textBefore.lastIndexOf("{{");
    const atIdx = textBefore.lastIndexOf("@");
    const triggerIdx = dblBraceIdx > atIdx ? dblBraceIdx : atIdx;
    if (triggerIdx === -1) return;

    const insertion = `{{${varName}}}`;
    container.textContent = text.slice(0, triggerIdx) + insertion + text.slice(cursorOffset);
    const newOffset = triggerIdx + insertion.length;
    range.setStart(container, newOffset);
    range.setEnd(container, newOffset);
    sel.removeAllRanges();
    sel.addRange(range);
    setAutocomplete(null);
    onChange(ref.current.textContent ?? "");
  };

  const swapVar = (oldVar: string, newVar: string) => {
    if (!ref.current) return;
    const current = ref.current.textContent ?? "";
    const newText = current.replace(new RegExp(`\\{\\{${oldVar}\\}\\}`, "g"), `{{${newVar}}}`);
    onChange(newText);
    setSwapPopover(null);
  };

  const Comp = Tag as any;
  return (
    <>
      <Comp
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => {
          isFocused.current = true;
          if (ref.current) {
            const plain = ref.current.textContent ?? "";
            ref.current.textContent = plain;
            const range = document.createRange();
            const sel = window.getSelection();
            if (ref.current.lastChild) {
              range.setStartAfter(ref.current.lastChild);
            } else {
              range.selectNodeContents(ref.current);
              range.collapse(false);
            }
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }}
        onBlur={(e: React.FocusEvent<HTMLElement>) => {
          isFocused.current = false;
          setTimeout(() => setAutocomplete(null), 130);
          onChange(e.currentTarget.textContent ?? "");
        }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseDown={(e: React.MouseEvent) => {
          // Chip click: show inline swap popover (unfocused DOM has styled spans)
          if (!isFocused.current && availableVars.length > 0) {
            const target = e.target as Element;
            const varSpan = target.closest("[data-var-name]") as HTMLElement | null;
            if (varSpan?.dataset.varName) {
              const rect = varSpan.getBoundingClientRect();
              setSwapPopover({ varName: varSpan.dataset.varName, x: rect.left, y: rect.bottom });
              e.preventDefault();
            }
          }
          e.stopPropagation();
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{ outline: "none", cursor: "text", ...style }}
      />
      {autocomplete && availableVars.length > 0 && (
        <VarListPortal
          vars={availableVars}
          query={autocomplete.query}
          x={autocomplete.x}
          y={autocomplete.y}
          title={`Variables — type to filter`}
          onSelect={insertVar}
          onClose={() => setAutocomplete(null)}
        />
      )}
      {swapPopover && availableVars.length > 0 && (
        <VarListPortal
          vars={availableVars.filter(v => v !== swapPopover.varName)}
          query=""
          x={swapPopover.x}
          y={swapPopover.y}
          title={`Replace {{${swapPopover.varName}}} with…`}
          onSelect={v => swapVar(swapPopover.varName, v)}
          onClose={() => setSwapPopover(null)}
        />
      )}
    </>
  );
}

// ── MarkdownBlockView — textarea edit + rendered preview ─────────────────────

function MarkdownBlockView({
  block,
  isSelected,
  onChange,
}: {
  block: EmailBlock;
  isSelected: boolean;
  onChange: (b: EmailBlock) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.content ?? "");

  // Keep draft in sync when block changes externally (e.g. undo)
  React.useEffect(() => {
    if (!editing) setDraft(block.content ?? "");
  }, [block.content, editing]);

  const commit = () => {
    setEditing(false);
    onChange({ ...block, content: draft });
  };

  const rendered = markdownToEmailHtml(draft || "*Click to write markdown…*", block.textColor ?? "#d1d5db");

  return (
    <div style={{ padding: "16px 32px", background: block.bgColor ?? "transparent" }}>
      {editing ? (
        <div className="relative">
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === "Escape") commit();
              // Cmd/Ctrl+Enter also commits
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
              e.stopPropagation();
            }}
            rows={Math.max(6, draft.split("\n").length + 1)}
            placeholder={"# Heading\n**bold**, *italic*, [link](url)\n- list item\n> blockquote\n\n{{variable}}"}
            className="w-full font-mono text-xs p-3 border-2 border-[#3ECF8E]/50 rounded-lg bg-card text-foreground focus:outline-none focus:border-[#3ECF8E] resize-y leading-relaxed"
            style={{ minHeight: 120 }}
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground font-mono">
              Markdown · <kbd className="bg-muted border rounded px-1 py-px">⌘↵</kbd> or click outside to save
            </span>
            <span className="text-[10px] text-muted-foreground">{draft.length} chars</span>
          </div>
        </div>
      ) : (
        <div
          onClick={e => { e.stopPropagation(); setEditing(true); }}
          className={cn(
            "min-h-[2rem] cursor-text transition-colors rounded",
            isSelected ? "ring-1 ring-[#3ECF8E]/30 ring-offset-1" : "hover:bg-muted/10"
          )}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}
    </div>
  );
}

// ── BlockLiveView — renders a block as actual email HTML with inline editing ─

function BlockLiveView({
  block,
  isSelected,
  onChange,
  availableVars = [],
}: {
  block: EmailBlock;
  isSelected: boolean;
  onChange: (b: EmailBlock) => void;
  availableVars?: string[];
}) {
  const u = (patch: Partial<EmailBlock>) => onChange({ ...block, ...patch });
  const ff = block.fontFamily || "inherit";

  switch (block.type) {
    case "header":
      return (
        <div style={{ background: `linear-gradient(135deg, ${block.bgColor || "#3ECF8E"} 0%, ${darken(block.bgColor || "#3ECF8E")} 100%)`, padding: "44px 32px", textAlign: "center" }}>
          <EditableText
            value={block.title || ""}
            onChange={v => u({ title: v })}
            tag="h1"
            placeholder="Header title…"
            availableVars={availableVars}
            style={{ color: block.titleColor || "#ffffff", fontSize: 28, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.5px", fontFamily: ff, display: "block" }}
          />
          <EditableText
            value={block.subtitle || ""}
            onChange={v => u({ subtitle: v })}
            tag="p"
            placeholder="Subtitle…"
            availableVars={availableVars}
            style={{ color: "rgba(255,255,255,0.85)", fontSize: 16, margin: 0, fontFamily: ff, display: "block" }}
          />
        </div>
      );

    case "greeting": {
      const ta = (block.textAlign || "left") as React.CSSProperties["textAlign"];
      return (
        <div style={{ padding: "20px 32px", background: block.bgColor || "transparent", display: "flex", alignItems: "center", justifyContent: ta === "center" ? "center" : ta === "right" ? "flex-end" : "flex-start", minHeight: 64 }}>
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="Hi {{recipient_name}},"
            availableVars={availableVars}
            style={{ fontSize: block.fontSize || 16, color: block.textColor || "#e5e7eb", margin: 0, fontFamily: ff, display: "block", textAlign: ta }}
          />
        </div>
      );
    }

    case "text": {
      const ta = (block.textAlign || "left") as React.CSSProperties["textAlign"];
      return (
        <div style={{ padding: "16px 32px", background: block.bgColor || "transparent", textAlign: ta }}>
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="Enter paragraph text…"
            availableVars={availableVars}
            style={{ fontSize: block.fontSize || 15, color: block.textColor || "#d1d5db", lineHeight: 1.7, margin: 0, fontFamily: ff, display: "block", textAlign: ta }}
          />
        </div>
      );
    }

    case "cert_image":
      return (
        <div style={{ margin: "32px", textAlign: "center" }}>
          <img src={_CERT_SVG} alt="Certificate" style={{ maxWidth: "100%", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }} />
          {isSelected && (
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
              The real certificate image is inserted at send time
            </p>
          )}
        </div>
      );

    case "qr_code":
      return (
        <div style={{ textAlign: "center", margin: "0 32px 28px", padding: 20, background: "#1e1e1e", border: "1px solid #2d2d2d", borderRadius: 8 }}>
          <img src={_QR_SVG} alt="QR Code" style={{ width: 120, height: 120, borderRadius: 4, display: "inline-block" }} />
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="QR caption…"
            availableVars={availableVars}
            style={{ fontSize: 12, color: "#6b7280", margin: "8px 0 0", fontFamily: ff, display: "block" }}
          />
        </div>
      );

    case "details_box": {
      const rows = block.detailRows || [];
      return (
        <div style={{ background: block.detailBgColor || "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: 8, padding: "20px 24px", margin: "16px 32px 28px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ minWidth: 110 }}>
                <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 2px" }}>{r.label}</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: block.detailTextColor || "#3ECF8E", margin: 0 }}>{r.value}</p>
              </div>
            ))}
          </div>
          {isSelected && rows.length === 0 && (
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>No rows yet — add rows in the panel below</p>
          )}
        </div>
      );
    }

    case "cta_button":
      return (
        <div style={{ textAlign: "center", margin: "24px 32px" }}>
          <EditableText
            value={block.btnLabel || ""}
            onChange={v => u({ btnLabel: v })}
            tag="span"
            placeholder="Button label…"
            availableVars={availableVars}
            style={{ display: "inline-block", background: block.btnColor || "#3ECF8E", color: "#ffffff", fontSize: 15, fontWeight: 600, padding: "13px 32px", borderRadius: 8, letterSpacing: "0.2px", fontFamily: ff }}
          />
        </div>
      );

    case "linkedin":
      return (
        <div style={{ padding: "20px 32px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 56, background: block.bgColor || "transparent" }}>
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="LinkedIn share message…"
            availableVars={availableVars}
            style={{ fontSize: 14, color: block.textColor || "#9ca3af", margin: 0, fontFamily: ff, display: "block" }}
          />
        </div>
      );

    case "divider":
      return <hr style={{ border: "none", borderTop: "1px solid #333", margin: "16px 32px" }} />;

    case "spacer":
      return (
        <div style={{ height: block.height || 24, background: isSelected ? "rgba(62,207,142,0.06)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isSelected && <span style={{ fontSize: 10, color: "#9ca3af", userSelect: "none" }}>↕ {block.height || 24}px spacer — change height below</span>}
        </div>
      );

    case "footer":
      return (
        <div style={{ padding: "16px 32px", textAlign: "center", borderTop: "1px solid #2d2d2d", background: block.bgColor || "transparent" }}>
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="Footer text…"
            availableVars={availableVars}
            style={{ fontSize: 12, color: block.textColor || "#6b7280", margin: 0, fontFamily: ff, display: "block" }}
          />
        </div>
      );

    case "markdown":
      return <MarkdownBlockView block={block} isSelected={isSelected} onChange={onChange} />;

    case "two_column":
      return (
        <div style={{ padding: "20px 32px", background: block.bgColor || "transparent" }}>
          <div style={{ display: "flex", gap: 0 }}>
            <div style={{ flex: 1, borderRight: "1px solid #2d2d2d", paddingRight: 20 }}>
              <EditableText
                value={block.leftContent || ""}
                onChange={v => u({ leftContent: v })}
                tag="div"
                placeholder="Left column — click to edit…"
                availableVars={availableVars}
                style={{ fontSize: 14, color: block.leftTextColor || "#d1d5db", fontFamily: ff, display: "block", lineHeight: 1.7 }}
              />
            </div>
            <div style={{ flex: 1, paddingLeft: 20 }}>
              <EditableText
                value={block.rightContent || ""}
                onChange={v => u({ rightContent: v })}
                tag="div"
                placeholder="Right column — click to edit…"
                availableVars={availableVars}
                style={{ fontSize: 14, color: block.rightTextColor || "#d1d5db", fontFamily: ff, display: "block", lineHeight: 1.7 }}
              />
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ── StyleToolbar — floating style controls for selected block ─────────────────

const EMAIL_FONT_LIST = CERTIFICATE_FONTS.map(f => ({ value: f.value, label: f.name, category: f.category }));

const ALIGN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "left",   label: "←" },
  { value: "center", label: "↔" },
  { value: "right",  label: "→" },
];

const QUICK_COLORS = ["#ffffff","#18181b","#3ECF8E","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#6b7280","#e5e7eb","#d1d5db"];

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const safeValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";

  return (
    <div className="relative" ref={ref}>
      <label className="flex items-center justify-between cursor-pointer group/swatch">
        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="w-6 h-6 rounded border border-border shadow-sm group-hover/swatch:ring-2 group-hover/swatch:ring-[#3ECF8E]/40 transition-all shrink-0"
          style={{ background: value || "#ffffff" }}
        />
      </label>
      {open && createPortal(
        <div
          className="fixed z-99999 bg-card border border-border rounded-xl shadow-2xl p-3 space-y-2"
          style={{ top: ref.current ? ref.current.getBoundingClientRect().bottom + 6 : 0, left: ref.current ? Math.min(ref.current.getBoundingClientRect().left, window.innerWidth - 228) : 0, width: 228 }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <HexColorPicker color={safeValue} onChange={onChange} style={{ width: "100%", height: 160 }} />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground shrink-0">Hex</span>
            <input
              type="text"
              value={value}
              onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v); }}
              className="flex-1 text-[11px] border border-border rounded px-1.5 py-0.5 font-mono bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform"
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function FontPickerControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? EMAIL_FONT_LIST.filter(f => f.label.toLowerCase().includes(q)) : EMAIL_FONT_LIST;
  }, [search]);

  const currentLabel = EMAIL_FONT_LIST.find(f => f.value === value)?.label ?? (value ? value.split(",")[0] : "System");

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground font-medium shrink-0">Font</span>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-background text-foreground focus:outline-none hover:border-[#3ECF8E]/60 transition-colors flex-1 min-w-0 text-left flex items-center justify-between gap-1"
          style={{ fontFamily: value || "inherit" }}
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
        </button>
      </div>
      {open && createPortal(
        <div
          className="fixed z-99999 bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
          style={{ top: ref.current ? ref.current.getBoundingClientRect().bottom + 4 : 0, left: ref.current ? Math.min(ref.current.getBoundingClientRect().left, window.innerWidth - 200) : 0, width: 200, maxHeight: 280 }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="p-2 border-b border-border shrink-0">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search fonts…"
              className="w-full text-[11px] border border-border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40"
            />
          </div>
          <div className="overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={cn("w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted transition-colors", !value ? "bg-[#3ECF8E]/10 text-[#3ECF8E]" : "text-foreground")}
            >
              System default
            </button>
            {filtered.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => { onChange(f.value); setOpen(false); }}
                className={cn("w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted transition-colors truncate", value === f.value ? "bg-[#3ECF8E]/10 text-[#3ECF8E]" : "text-foreground")}
                style={{ fontFamily: f.value }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function StyleToolbar({ block, onChange }: { block: EmailBlock; onChange: (b: EmailBlock) => void }) {
  const u = (patch: Partial<EmailBlock>) => onChange({ ...block, ...patch });
  const { type } = block;

  const showBg       = ["header", "text", "greeting", "footer", "qr_code", "markdown", "linkedin", "two_column"].includes(type);
  const showText     = ["header", "text", "greeting", "footer", "linkedin", "cta_button", "markdown"].includes(type);
  const showFont     = ["header", "text", "greeting", "footer", "linkedin", "cta_button", "two_column"].includes(type);
  const showSize     = ["header", "text", "greeting", "cta_button"].includes(type);
  const showAlign    = ["text", "greeting", "header", "footer", "linkedin", "cta_button"].includes(type);
  const showBtn      = type === "cta_button";
  const showDetailBg = type === "details_box";
  const showTwoCols  = type === "two_column";

  const defaultTextColor = (() => {
    if (type === "greeting") return "#e5e7eb";
    if (type === "text" || type === "markdown") return "#d1d5db";
    if (type === "footer") return "#6b7280";
    if (type === "linkedin") return "#9ca3af";
    if (type === "cta_button") return "#ffffff";
    return "#d1d5db";
  })();

  const defaultSize = (() => {
    if (type === "header") return 28;
    if (type === "greeting") return 16;
    if (type === "cta_button") return 15;
    return 15;
  })();

  const hasColors = showBg || showText || showBtn || showDetailBg || showTwoCols;
  const hasTypography = showFont || showSize || showAlign;

  return (
    <div className="flex flex-col divide-y divide-border/30 text-xs" onClick={e => e.stopPropagation()}>
      {hasColors && (
        <div className="px-3 py-2.5 space-y-2.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Colors</p>
          {showBg && (
            <ColorSwatch
              label={type === "header" ? "Header BG" : "Background"}
              value={type === "header" ? (block.bgColor || "#3ECF8E") : type === "qr_code" ? (block.bgColor || "#1e1e1e") : (block.bgColor || "#18181b")}
              onChange={v => u({ bgColor: v })}
            />
          )}
          {type === "header" && (
            <ColorSwatch label="Title" value={block.titleColor || "#ffffff"} onChange={v => u({ titleColor: v })} />
          )}
          {showText && type !== "header" && (
            <ColorSwatch label="Text" value={block.textColor || defaultTextColor} onChange={v => u({ textColor: v })} />
          )}
          {showBtn && (
            <ColorSwatch label="Button BG" value={block.btnColor || "#3ECF8E"} onChange={v => u({ btnColor: v })} />
          )}
          {showDetailBg && (
            <>
              <ColorSwatch label="Box BG" value={block.detailBgColor || "#1a1a1a"} onChange={v => u({ detailBgColor: v })} />
              <ColorSwatch label="Values" value={block.detailTextColor || "#3ECF8E"} onChange={v => u({ detailTextColor: v })} />
            </>
          )}
          {showTwoCols && (
            <>
              <ColorSwatch label="Left text" value={block.leftTextColor || "#d1d5db"} onChange={v => u({ leftTextColor: v })} />
              <ColorSwatch label="Right text" value={block.rightTextColor || "#d1d5db"} onChange={v => u({ rightTextColor: v })} />
            </>
          )}
        </div>
      )}
      {hasTypography && (
        <div className="px-3 py-2.5 space-y-2.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Typography</p>
          {showFont && (
            <FontPickerControl value={block.fontFamily || ""} onChange={v => u({ fontFamily: v })} />
          )}
          {showSize && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Size</span>
              <input
                type="number"
                min={10}
                max={72}
                value={block.fontSize || defaultSize}
                onChange={e => u({ fontSize: Number(e.target.value) })}
                className="w-16 text-[11px] border border-border rounded px-1.5 py-0.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 text-right"
              />
            </div>
          )}
          {showAlign && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Align</span>
              <div className="flex border border-border rounded overflow-hidden">
                {ALIGN_OPTIONS.map(a => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => u({ textAlign: a.value as EmailBlock["textAlign"] })}
                    className={cn(
                      "px-2 py-0.5 text-[11px] transition-colors",
                      (block.textAlign || "left") === a.value
                        ? "bg-[#3ECF8E] text-white"
                        : "hover:bg-muted text-muted-foreground"
                    )}
                    title={`Align ${a.value}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Extra controls for complex blocks (details rows, btn url, spacer height) ─

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function BlockExtrasPanel({ block, onChange }: { block: EmailBlock; onChange: (b: EmailBlock) => void }) {
  const u = (patch: Partial<EmailBlock>) => onChange({ ...block, ...patch });

  if (block.type === "details_box") {
    const rows = block.detailRows ?? [];
    return (
      <div className="px-3 pb-4 pt-2.5 space-y-3 border-t border-border/30">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Content</p>
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={row.label} onChange={e => { const r = [...rows]; r[i] = { ...r[i]!, label: e.target.value }; u({ detailRows: r }); }} placeholder="Label" className="h-7 text-xs w-24" />
            <span className="text-muted-foreground text-xs">→</span>
            <Input value={row.value} onChange={e => { const r = [...rows]; r[i] = { ...r[i]!, value: e.target.value }; u({ detailRows: r }); }} placeholder="{{variable}}" className="h-7 text-xs flex-1 font-mono" />
            <button type="button" onClick={() => u({ detailRows: rows.filter((_, j) => j !== i) })} className="text-destructive/60 hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => u({ detailRows: [...rows, { label: "", value: "" }] })} className="flex items-center gap-1 text-xs text-[#3ECF8E] font-medium hover:text-[#34b87a]">
          <Plus className="w-3 h-3" /> Add Row
        </button>
      </div>
    );
  }

  if (block.type === "cta_button") {
    return (
      <div className="px-3 pb-4 pt-2.5 space-y-2.5 border-t border-border/30">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Content</p>
        <Field label="Button URL">
          <Input value={block.btnUrl ?? ""} onChange={e => u({ btnUrl: e.target.value })} placeholder="{{verification_url}}" className="h-7 text-xs font-mono" />
        </Field>
      </div>
    );
  }

  if (block.type === "spacer") {
    return (
      <div className="px-3 pb-4 pt-2.5 space-y-2.5 border-t border-border/30">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Content</p>
        <Field label="Height (px)">
          <Input type="number" min={4} max={120} value={block.height ?? 24} onChange={e => u({ height: Number(e.target.value) })} className="h-7 w-24 text-xs" />
        </Field>
      </div>
    );
  }

  if (block.type === "two_column") {
    return (
      <div className="px-3 pb-4 pt-2.5 space-y-3 border-t border-border/30">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Content</p>
        <Field label="Left column (markdown supported)">
          <textarea
            value={block.leftContent ?? ""}
            onChange={e => u({ leftContent: e.target.value })}
            rows={4}
            placeholder="Left column content…"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 resize-y font-mono leading-relaxed"
          />
        </Field>
        <Field label="Right column (markdown supported)">
          <textarea
            value={block.rightContent ?? ""}
            onChange={e => u({ rightContent: e.target.value })}
            rows={4}
            placeholder="Right column content…"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 resize-y font-mono leading-relaxed"
          />
        </Field>
      </div>
    );
  }

  return null;
}

// ── Block properties panel (exported for right sidebar) ──────────────────────

export function BlockPropertiesPanel({
  block,
  onChange,
}: {
  block: EmailBlock | null;
  onChange: (b: EmailBlock) => void;
}) {
  if (!block) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground/50" />
        </div>
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          Select a block to edit its style and properties
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 overflow-y-auto">
      <div className="px-3 py-2 border-b border-[#3ECF8E]/15 bg-[#3ECF8E]/5 shrink-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#3ECF8E]/70">
          {BLOCK_LABELS[block.type]}
        </p>
      </div>
      <StyleToolbar block={block} onChange={onChange} />
      <BlockExtrasPanel block={block} onChange={onChange} />
    </div>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
}

function BlockContextMenu({
  x, y, items, onClose,
}: {
  x: number; y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  React.useEffect(() => {
    const close = () => onClose();
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
    };
  }, [onClose]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const adjustedX = Math.min(x, vw - 180);
  const adjustedY = Math.min(y, vh - items.length * 32 - 16);

  return createPortal(
    <div
      style={{ position: "fixed", left: adjustedX, top: adjustedY, zIndex: 99999, minWidth: 168, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.1)", padding: "4px 0" }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onMouseDown={e => { e.preventDefault(); item.action(); onClose(); }}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 12px", fontSize: 12, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", color: item.danger ? "#f87171" : "#e5e7eb" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = item.danger ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.07)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <span style={{ opacity: 0.7 }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ── Sortable block card ───────────────────────────────────────────────────────

interface SortableBlockCardProps {
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (b: EmailBlock) => void;
  availableVars?: string[];
  isFirst?: boolean;
  isLast?: boolean;
}

function SortableBlockCard({ block, isSelected, onSelect, onRemove, onDuplicate, onMoveUp, onMoveDown, onChange, availableVars = [], isFirst, isLast }: SortableBlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const contextItems: ContextMenuItem[] = [
    ...(!isFirst ? [{ label: "Move up", icon: <ArrowUp className="w-3 h-3" />, action: onMoveUp }] : []),
    ...(!isLast ? [{ label: "Move down", icon: <ArrowDown className="w-3 h-3" />, action: onMoveDown }] : []),
    { label: "Duplicate", icon: <Copy className="w-3 h-3" />, action: onDuplicate },
    { label: "Delete block", icon: <Trash2 className="w-3 h-3" />, action: onRemove, danger: true },
  ];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={cn("relative group mx-2 mt-7 mb-2", isDragging && "z-50")}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* Left drag handle — wider for easier grab */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 opacity-30 group-hover:opacity-70 hover:opacity-100! transition-opacity"
        onClick={e => e.stopPropagation()}
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-zinc-400" />
      </div>

      {/* Block type label */}
      <div className={cn(
        "absolute -top-5 left-9 z-20 flex items-center gap-1 px-2.5 py-0.75 text-[8px] font-bold uppercase tracking-widest pointer-events-none select-none",
        "rounded-t-md border-t border-l border-r",
        isSelected
          ? "bg-zinc-900 text-[#3ECF8E] border-[#3ECF8E]/50"
          : "bg-zinc-900 text-zinc-500 border-zinc-700/50"
      )}>
        {BLOCK_LABELS[block.type]}
      </div>

      {/* Card */}
      <div className={cn(
        "ml-9 relative rounded-lg border border-dashed transition-all overflow-hidden",
        isSelected
          ? "border-[#3ECF8E]/70 shadow-md shadow-[#3ECF8E]/10 ring-1 ring-[#3ECF8E]/20"
          : "border-zinc-700/50 hover:border-[#3ECF8E]/40",
      )}>
        {/* Left selection accent */}
        <div className={cn(
          "absolute left-0 top-0 bottom-0 w-0.75 z-10 transition-all duration-150",
          isSelected ? "bg-[#3ECF8E]" : "bg-transparent group-hover:bg-[#3ECF8E]/30"
        )} />

        {/* Floating controls */}
        <div className={cn(
          "absolute top-2 right-2 z-20 flex items-center gap-1 px-1.5 py-1 rounded-lg bg-zinc-900/95 border border-zinc-700 shadow-md transition-opacity pointer-events-auto",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <button type="button" onClick={e => { e.stopPropagation(); onDuplicate(); }} className="p-0.5 text-zinc-500 hover:text-[#3ECF8E] transition-colors" title="Duplicate (⌘D)">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }} className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors" title="Delete (⌫)">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Selection overlay — intercepts single click to just select, not enter edit mode */}
        {!isSelected && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
          />
        )}

        {/* Rendered block */}
        <div className="transition-all duration-150">
          <BlockLiveView
            block={block}
            isSelected={isSelected}
            onChange={onChange}
            availableVars={availableVars}
          />
        </div>
      </div>

      {contextMenu && (
        <BlockContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ── Main canvas component ────────────────────────────────────────────────────

export interface EmailBlockBuilderProps {
  blocks: EmailBlock[];
  selectedId: string | null;
  subject?: string;
  senderName?: string;
  availableVars?: string[];
  /** "cert" = cert delivery editor, "broadcast" = broadcast email editor */
  context?: "cert" | "broadcast";
  onChange: (blocks: EmailBlock[]) => void;
  onSelect: (id: string | null) => void;
  onStartFresh: () => void;
  onSubjectChange?: (val: string) => void;
  onSenderNameChange?: (val: string) => void;
  onAddBlock?: (type: BlockType) => void;
}

export function EmailBlockBuilder({
  blocks,
  selectedId,
  subject = "",
  senderName = "Your Organization",
  availableVars = [],
  context = "cert",
  onChange,
  onSelect,
  onStartFresh,
  onSubjectChange,
  onSenderNameChange,
  onAddBlock,
}: EmailBlockBuilderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const removeBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id));
    if (selectedId === id) onSelect(null);
  };

  const duplicateBlock = (id: string) => {
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    const dupe: EmailBlock = { ...block, id: nanoid(8) };
    const idx = blocks.findIndex(b => b.id === id);
    const next = [...blocks.slice(0, idx + 1), dupe, ...blocks.slice(idx + 1)];
    onChange(next);
    onSelect(dupe.id);
  };

  const moveBlock = (id: string, direction: "up" | "down") => {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    onChange(arrayMove(blocks, idx, newIdx));
  };

  const insertBlockAfter = (afterId: string) => {
    const b = defaultBlock("text");
    const idx = blocks.findIndex(blk => blk.id === afterId);
    const next = [...blocks.slice(0, idx + 1), b, ...blocks.slice(idx + 1)];
    onChange(next);
    onSelect(b.id);
  };

  const updateBlock = (updated: EmailBlock) => {
    onChange(blocks.map(b => b.id === updated.id ? updated : b));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    onChange(arrayMove(blocks, oldIndex, newIndex));
  };

  const activeBlock = activeId ? blocks.find(b => b.id === activeId) : null;

  if (blocks.length === 0) {
    return (
      <StarterTemplateGallery
        context={context}
        onSelect={onChange}
        onDismiss={onStartFresh}
      />
    );
  }

  return (
    <div
      className="py-10 px-8"
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={e => {
        e.preventDefault();
        const type = e.dataTransfer.getData("block-type") as BlockType;
        if (type) onAddBlock?.(type);
      }}
    >
      <div className="max-w-[600px] mx-auto rounded-2xl overflow-hidden" style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)" }}>

        {/* Email client header chrome */}
        <div className="bg-zinc-800 border-b border-zinc-700 px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-[#3ECF8E] flex items-center justify-center text-white text-sm font-bold shrink-0 select-none">
              {senderName.trim()[0]?.toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <input
                  value={senderName}
                  onChange={e => onSenderNameChange?.(e.target.value)}
                  className="text-sm font-semibold text-zinc-100 bg-transparent border-none outline-none min-w-0 w-auto max-w-[220px] cursor-text hover:bg-zinc-700/40 focus:bg-zinc-700/60 rounded px-1 -ml-1 transition-colors"
                  placeholder="Sender Name"
                  title="Click to edit sender name"
                />
                <span className="text-xs text-zinc-500 shrink-0">via Authentix</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-zinc-500 shrink-0 font-medium">Subject:</span>
                <input
                  value={subject}
                  onChange={e => onSubjectChange?.(e.target.value)}
                  className="text-sm text-zinc-300 bg-transparent border-none outline-none flex-1 min-w-0 cursor-text hover:bg-zinc-700/40 focus:bg-zinc-700/60 rounded px-1 -ml-0.5 transition-colors"
                  placeholder="Your Certificate from {{organization_name}}"
                  title="Click to edit email subject"
                />
              </div>
            </div>
            <div className="text-xs text-zinc-500 select-none shrink-0">just now</div>
          </div>
          <p className="text-[10px] text-zinc-500 mt-2.5 pl-14 leading-relaxed">
            Single-click to select · double-click to edit text · drag grip to reorder · right-click for options
          </p>
        </div>

        {/* Email body */}
        <div style={{ background: "#18181b" }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div>
                {blocks.map((block, idx) => (
                  <React.Fragment key={block.id}>
                    {idx > 0 && (
                      <div className="relative h-3 group/insert mx-8">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover/insert:opacity-100 transition-opacity">
                          <div className="flex-1 border-t border-dashed border-[#3ECF8E]/50" />
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); insertBlockAfter(blocks[idx - 1]!.id); }}
                            className="mx-2 w-5 h-5 rounded-full bg-[#3ECF8E] text-white flex items-center justify-center hover:bg-[#2aac76] shadow-sm transition-colors shrink-0"
                            title="Insert text block here"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <div className="flex-1 border-t border-dashed border-[#3ECF8E]/50" />
                        </div>
                      </div>
                    )}
                    <SortableBlockCard
                      block={block}
                      isSelected={block.id === selectedId}
                      isFirst={idx === 0}
                      isLast={idx === blocks.length - 1}
                      onSelect={() => onSelect(block.id === selectedId ? null : block.id)}
                      onRemove={() => removeBlock(block.id)}
                      onDuplicate={() => duplicateBlock(block.id)}
                      onMoveUp={() => moveBlock(block.id, "up")}
                      onMoveDown={() => moveBlock(block.id, "down")}
                      onChange={updateBlock}
                      availableVars={availableVars}
                    />
                  </React.Fragment>
                ))}
              </div>
            </SortableContext>

            {/* Drag ghost overlay — full-width semi-transparent clone */}
            <DragOverlay dropAnimation={null}>
              {activeBlock && (
                <div style={{ opacity: 0.5, pointerEvents: "none", background: "#18181b", borderRadius: 8, border: "1px dashed #3ECF8E", overflow: "hidden", maxWidth: 560, margin: "0 auto" }}>
                  <BlockLiveView block={activeBlock} isSelected={false} onChange={() => {}} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
      <div className="h-8" />
    </div>
  );
}
