"use client";

/**
 * EmailBlockBuilder — Canvas-only component.
 * State is fully controlled by the parent (page.tsx).
 * Exports: EmailBlockBuilder, blocksToHtml, defaultBlock, STARTER_BLOCKS, PALETTE, applyPreviewMocks, BlockType, EmailBlock
 */

import React, { useRef, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
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
  GripVertical, AlertCircle, RefreshCw, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

// ── Block types ──────────────────────────────────────────────────────────────

export type BlockType =
  | "header"
  | "greeting"
  | "text"
  | "markdown"
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
}

// ── Palette catalog (exported for use in left panel) ─────────────────────────

export const EMAIL_BLOCKS_PALETTE: Array<{ type: BlockType; icon: React.ReactNode; label: string; desc: string }> = [
  { type: "header",      icon: <LayoutTemplate className="w-3.5 h-3.5" />,    label: "Header",      desc: "Title banner" },
  { type: "greeting",    icon: <AlignLeft className="w-3.5 h-3.5" />,         label: "Greeting",    desc: "Hi {{name}}" },
  { type: "text",        icon: <AlignLeft className="w-3.5 h-3.5" />,         label: "Text",        desc: "Paragraph" },
  { type: "cert_image",  icon: <ImageIcon className="w-3.5 h-3.5" />,         label: "Certificate", desc: "Certificate preview" },
  { type: "qr_code",     icon: <QrCode className="w-3.5 h-3.5" />,            label: "QR Code",     desc: "Verify link" },
  { type: "details_box", icon: <TableProperties className="w-3.5 h-3.5" />,   label: "Details",     desc: "Course, date…" },
  { type: "cta_button",  icon: <MousePointerClick className="w-3.5 h-3.5" />, label: "CTA Button",  desc: "Verify button" },
  { type: "linkedin",    icon: <Type className="w-3.5 h-3.5" />,              label: "LinkedIn",    desc: "Share prompt" },
  { type: "divider",     icon: <Minus className="w-3.5 h-3.5" />,             label: "Divider",     desc: "Separator" },
  { type: "spacer",      icon: <ArrowUpDown className="w-3.5 h-3.5" />,       label: "Spacer",      desc: "Empty space" },
  { type: "footer",      icon: <LayoutTemplate className="w-3.5 h-3.5" />,    label: "Footer",      desc: "Footer text" },
];

export const CERT_BLOCKS_PALETTE: Array<{ type: BlockType; icon: React.ReactNode; label: string; desc: string }> = [
  { type: "cert_image",  icon: <ImageIcon className="w-3.5 h-3.5" />,        label: "Cert Image", desc: "Certificate preview" },
  { type: "qr_code",     icon: <QrCode className="w-3.5 h-3.5" />,           label: "QR Code",    desc: "Verify link" },
  { type: "details_box", icon: <TableProperties className="w-3.5 h-3.5" />,  label: "Details",    desc: "Course, date…" },
];

export const PALETTE = [...EMAIL_BLOCKS_PALETTE, ...CERT_BLOCKS_PALETTE];

// ── Default block configs ────────────────────────────────────────────────────

export function defaultBlock(type: BlockType): EmailBlock {
  const id = nanoid(8);
  switch (type) {
    case "header":      return { id, type, bgColor: "#3ECF8E", titleColor: "#ffffff", title: "Congratulations, {{recipient_name}}!", subtitle: "You've completed {{course_name}}" };
    case "greeting":    return { id, type, content: "Hi {{recipient_name}},", textColor: "#e5e7eb" };
    case "text":        return { id, type, content: "We are delighted to inform you that you have successfully completed this program. Your certificate is ready below.", textColor: "#d1d5db" };
    case "markdown":    return { id, type, content: "## Congratulations, **{{recipient_name}}**!\n\nYou have successfully completed **{{course_name}}**.\n\n- 📅 Issued on {{issue_date}}\n- 🔗 [View & verify your certificate]({{verification_url}})\n\n> Your achievement has been recorded and is ready to share.", textColor: "#d1d5db" };
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

const BLOCK_LABELS: Record<BlockType, string> = {
  header: "Header",
  greeting: "Greeting",
  text: "Text Block",
  markdown: "Markdown",
  cert_image: "Certificate Image",
  qr_code: "QR Code",
  details_box: "Details Box",
  cta_button: "CTA Button",
  linkedin: "LinkedIn Nudge",
  divider: "Divider",
  spacer: "Spacer",
  footer: "Footer",
};

// ── Variable autocomplete dropdown (rendered via portal at cursor position) ───

function VarDropdown({
  vars,
  query,
  x,
  y,
  onSelect,
}: {
  vars: string[];
  query: string;
  x: number;
  y: number;
  onSelect: (v: string) => void;
}) {
  const filtered = vars.filter(v =>
    !query || v.toLowerCase().startsWith(query.toLowerCase()) || v.toLowerCase().includes(query.toLowerCase())
  );
  if (filtered.length === 0) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const adjustedX = Math.min(x, vw - 210);

  return createPortal(
    <div className="var-dropdown-portal" style={{
      position: "fixed",
      left: adjustedX,
      top: y + 6,
      zIndex: 99999,
      borderRadius: 8,
      boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
      minWidth: 200,
      maxHeight: 220,
      overflow: "auto",
      padding: "4px 0",
      background: "var(--color-card, #fff)",
      border: "1px solid var(--color-border, #e2e8f0)",
      color: "var(--color-foreground, #111)",
    }}>
      <p style={{ fontSize: 9, color: "var(--color-muted-foreground, #9ca3af)", padding: "4px 10px 3px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px", borderBottom: "1px solid var(--color-border, #f1f5f9)", marginBottom: 2 }}>
        Variables — type to filter
      </p>
      {filtered.map(v => (
        <button
          key={v}
          onMouseDown={e => { e.preventDefault(); onSelect(v.replace(/^\{\{|\}\}$/g, "").trim()); }}
          style={{ display: "block", width: "100%", padding: "5px 10px", textAlign: "left", fontSize: 12, fontFamily: "monospace", color: "#3ECF8E", background: "transparent", border: "none", cursor: "pointer" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(62,207,142,0.1)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          {`{{${v.replace(/^\{\{|\}\}$/g, "").trim()}}}`}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ── EditableText — contenteditable inline text element with @ autocomplete ────

function toVarHtml(text: string): string {
  return (text || "").replace(/\{\{([\w.]+)\}\}/g, (match, varName) =>
    `<span data-var data-var-name="${varName}" style="display:inline-block;border:1px solid rgba(0,0,0,0.25);border-radius:3px;padding:0 4px;color:#1a1a1a;font-family:monospace;font-size:0.82em;background:rgba(255,255,255,0.88);line-height:1.6;cursor:pointer;font-weight:600;" title="Click to select this variable">${match}</span>`
  );
}

function EditableText({
  value,
  onChange,
  tag: Tag = "span",
  style,
  placeholder,
  availableVars = [],
  onVarClick,
}: {
  value: string;
  onChange: (v: string) => void;
  tag?: keyof React.JSX.IntrinsicElements;
  style?: React.CSSProperties;
  placeholder?: string;
  availableVars?: string[];
  onVarClick?: (varName: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const isFocused = useRef(false);
  const [atDropdown, setAtDropdown] = useState<{ query: string; x: number; y: number } | null>(null);

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

  const handleInput = () => {
    if (!availableVars.length) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { setAtDropdown(null); return; }
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) { setAtDropdown(null); return; }
    const textBefore = (container.textContent ?? "").slice(0, range.startOffset);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = textBefore.slice(atIdx + 1);
      if (!query.includes(" ") && !query.includes("\n")) {
        const rect = range.getBoundingClientRect();
        setAtDropdown({ query, x: rect.left, y: rect.bottom });
        return;
      }
    }
    setAtDropdown(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (atDropdown && e.key === "Escape") {
      setAtDropdown(null);
      e.preventDefault();
    }
  };

  const insertVar = (varName: string) => {
    if (!ref.current) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;
    const text = container.textContent ?? "";
    const cursorOffset = range.startOffset;
    const textBefore = text.slice(0, cursorOffset);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx === -1) return;
    // Strip any accidental {{ }} wrapping from the var name before inserting
    const cleanName = varName.replace(/^\{\{|\}\}$/g, "").trim();
    const insertion = `{{${cleanName}}}`;
    container.textContent = text.slice(0, atIdx) + insertion + text.slice(cursorOffset);
    const newOffset = atIdx + insertion.length;
    range.setStart(container, newOffset);
    range.setEnd(container, newOffset);
    sel.removeAllRanges();
    sel.addRange(range);
    setAtDropdown(null);
    onChange(ref.current.textContent ?? "");
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
          // Switch from styled HTML to plain text for clean editing
          if (ref.current) {
            const plain = ref.current.textContent ?? "";
            ref.current.textContent = plain;
            // Place cursor at end
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
          // Small delay so mousedown on dropdown fires before blur hides it
          setTimeout(() => setAtDropdown(null), 130);
          const text = e.currentTarget.textContent ?? "";
          onChange(text);
        }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseDown={(e: React.MouseEvent) => {
          // Detect click on a variable chip BEFORE focus fires (chips are in blurred DOM)
          if (!isFocused.current && onVarClick) {
            const target = e.target as Element;
            const varSpan = target.closest('[data-var-name]') as HTMLElement | null;
            if (varSpan?.dataset.varName) {
              onVarClick(varSpan.dataset.varName);
            }
          }
          e.stopPropagation();
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{ outline: "none", cursor: "text", ...style }}
      />
      {atDropdown && availableVars.length > 0 && (
        <VarDropdown
          vars={availableVars}
          query={atDropdown.query}
          x={atDropdown.x}
          y={atDropdown.y}
          onSelect={insertVar}
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
  onVarClick,
}: {
  block: EmailBlock;
  isSelected: boolean;
  onChange: (b: EmailBlock) => void;
  availableVars?: string[];
  onVarClick?: (varName: string) => void;
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
            onVarClick={onVarClick}
            style={{ color: block.titleColor || "#ffffff", fontSize: 28, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.5px", fontFamily: ff, display: "block" }}
          />
          <EditableText
            value={block.subtitle || ""}
            onChange={v => u({ subtitle: v })}
            tag="p"
            placeholder="Subtitle…"
            availableVars={availableVars}
            onVarClick={onVarClick}
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
            onVarClick={onVarClick}
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
            onVarClick={onVarClick}
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
            onVarClick={onVarClick}
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
            onVarClick={onVarClick}
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
            onVarClick={onVarClick}
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
            onVarClick={onVarClick}
            style={{ fontSize: 12, color: block.textColor || "#6b7280", margin: 0, fontFamily: ff, display: "block" }}
          />
        </div>
      );

    case "markdown":
      return <MarkdownBlockView block={block} isSelected={isSelected} onChange={onChange} />;

    default:
      return null;
  }
}

// ── StyleToolbar — floating style controls for selected block ─────────────────

const FONT_OPTIONS = [
  { value: "", label: "System" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "'Courier New', Courier, monospace", label: "Courier" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
];

const ALIGN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "left",   label: "←" },
  { value: "center", label: "↔" },
  { value: "right",  label: "→" },
];

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer group/swatch">
      <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">{label}</span>
      <div className="relative">
        <div
          className="w-6 h-6 rounded border border-border shadow-sm group-hover/swatch:ring-2 group-hover/swatch:ring-[#3ECF8E]/40 transition-all"
          style={{ background: value || "#ffffff" }}
        />
        <input
          type="color"
          value={value || "#ffffff"}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </label>
  );
}

function StyleToolbar({ block, onChange }: { block: EmailBlock; onChange: (b: EmailBlock) => void }) {
  const u = (patch: Partial<EmailBlock>) => onChange({ ...block, ...patch });
  const { type } = block;

  const showBg       = ["header", "text", "greeting", "footer", "qr_code", "markdown", "linkedin"].includes(type);
  const showText     = ["header", "text", "greeting", "footer", "linkedin", "cta_button", "markdown"].includes(type);
  const showFont     = ["header", "text", "greeting", "footer", "linkedin", "cta_button"].includes(type);
  const showSize     = ["header", "text", "greeting", "cta_button"].includes(type);
  const showAlign    = ["text", "greeting", "header", "footer", "linkedin", "cta_button"].includes(type);
  const showBtn      = type === "cta_button";
  const showDetailBg = type === "details_box";

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

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 bg-card border-t border-[#3ECF8E]/20 text-xs">
      {showBg && (
        <ColorSwatch
          label={type === "header" ? "Header BG" : "Background"}
          value={
            type === "header" ? (block.bgColor || "#3ECF8E") :
            type === "qr_code" ? (block.bgColor || "#1e1e1e") :
            (block.bgColor || "#18181b")
          }
          onChange={v => u({ bgColor: v })}
        />
      )}
      {type === "header" && (
        <ColorSwatch label="Title color" value={block.titleColor || "#ffffff"} onChange={v => u({ titleColor: v })} />
      )}
      {showText && type !== "header" && (
        <ColorSwatch
          label="Text color"
          value={block.textColor || defaultTextColor}
          onChange={v => u({ textColor: v })}
        />
      )}
      {showBtn && (
        <ColorSwatch label="Button BG" value={block.btnColor || "#3ECF8E"} onChange={v => u({ btnColor: v })} />
      )}
      {showDetailBg && (
        <>
          <ColorSwatch label="Box BG" value={block.detailBgColor || "#1a1a1a"} onChange={v => u({ detailBgColor: v })} />
          <ColorSwatch label="Value color" value={block.detailTextColor || "#3ECF8E"} onChange={v => u({ detailTextColor: v })} />
        </>
      )}
      {showFont && (
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium">Font</span>
          <select
            value={block.fontFamily || ""}
            onChange={e => u({ fontFamily: e.target.value })}
            className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40"
          >
            {FONT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
      {showSize && (
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium">Size</span>
          <input
            type="number"
            min={10}
            max={48}
            value={block.fontSize || defaultSize}
            onChange={e => u({ fontSize: Number(e.target.value) })}
            className="w-14 text-[11px] border border-border rounded px-1.5 py-0.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40"
          />
        </label>
      )}
      {showAlign && (
        <div className="flex items-center gap-1">
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
      <div className="px-4 pb-4 pt-3 space-y-3 border-t border-[#3ECF8E]/10 bg-[#3ECF8E]/5 dark:bg-[#3ECF8E]/[0.04]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#3ECF8E]">Detail Rows</p>
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
      <div className="px-4 pb-4 pt-3 border-t border-[#3ECF8E]/10 bg-zinc-800/30">
        <Field label="Button URL">
          <Input value={block.btnUrl ?? ""} onChange={e => u({ btnUrl: e.target.value })} placeholder="{{verification_url}}" className="h-7 text-xs font-mono" />
        </Field>
      </div>
    );
  }

  if (block.type === "spacer") {
    return (
      <div className="px-4 pb-4 pt-3 border-t border-[#3ECF8E]/10 bg-zinc-800/30">
        <Field label="Height (px)">
          <Input type="number" min={4} max={120} value={block.height ?? 24} onChange={e => u({ height: Number(e.target.value) })} className="h-7 w-24 text-xs" />
        </Field>
      </div>
    );
  }

  return null;
}

// ── Sortable block card ───────────────────────────────────────────────────────

interface SortableBlockCardProps {
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onChange: (b: EmailBlock) => void;
  availableVars?: string[];
  onVarClick?: (varName: string) => void;
}

function SortableBlockCard({ block, isSelected, onSelect, onRemove, onDuplicate, onChange, availableVars = [], onVarClick }: SortableBlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className={cn("relative group mx-2 mt-7 mb-2", isDragging && "z-50")}
    >
      {/* Left drag handle — outside card, always visible, vertically centred on card */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 opacity-20 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-zinc-400" />
      </div>

      {/* Block type label — above the card, offset right of the grip handle */}
      <div className={cn(
        "absolute -top-5 left-6 z-20 flex items-center gap-1 px-2.5 py-[3px] text-[8px] font-bold uppercase tracking-widest pointer-events-none select-none",
        "rounded-t-md border-t border-l border-r",
        isSelected
          ? "bg-zinc-900 text-[#3ECF8E] border-[#3ECF8E]/50"
          : "bg-zinc-900 text-zinc-500 border-zinc-700/50"
      )}>
        {BLOCK_LABELS[block.type]}
      </div>

      {/* Card with dashed border — offset right to leave room for grip */}
      <div className={cn(
        "ml-6 relative rounded-lg border border-dashed transition-all overflow-hidden",
        isSelected
          ? "border-[#3ECF8E]/70 shadow-md shadow-[#3ECF8E]/10 ring-1 ring-[#3ECF8E]/20"
          : "border-zinc-700/50 hover:border-[#3ECF8E]/50",
      )}>
        {/* Left selection accent */}
        <div className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] z-10 transition-all duration-150",
          isSelected ? "bg-[#3ECF8E]" : "bg-transparent group-hover:bg-[#3ECF8E]/40"
        )} />

        {/* Floating controls — duplicate + delete (grip is now on the left side) */}
        <div className={cn(
          "absolute top-2 right-2 z-20 flex items-center gap-1 px-1.5 py-1 rounded-lg bg-zinc-900/95 border border-zinc-700 shadow-md transition-opacity pointer-events-auto",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDuplicate(); }}
            className="p-0.5 text-zinc-500 hover:text-[#3ECF8E] transition-colors"
            title="Duplicate block"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors"
            title="Remove block"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Rendered block — click anywhere to select */}
        <div
          onClick={onSelect}
          className="transition-all duration-150"
        >
          <BlockLiveView
            block={block}
            isSelected={isSelected}
            onChange={onChange}
            availableVars={availableVars}
            onVarClick={(varName) => {
              // Ensure the block is selected so the dock can insert/replace into it
              if (!isSelected) onSelect();
              onVarClick?.(varName);
            }}
          />
        </div>

        {/* Style toolbar + extra controls when selected */}
        {isSelected && (
          <>
            <StyleToolbar block={block} onChange={onChange} />
            <BlockExtrasPanel block={block} onChange={onChange} />
          </>
        )}
      </div>
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
  onChange: (blocks: EmailBlock[]) => void;
  onSelect: (id: string | null) => void;
  onStartFresh: () => void;
  onSubjectChange?: (val: string) => void;
  onSenderNameChange?: (val: string) => void;
  onAddBlock?: (type: BlockType) => void;
  onVarClick?: (varName: string) => void;
}

export function EmailBlockBuilder({
  blocks,
  selectedId,
  subject = "",
  senderName = "Your Organization",
  availableVars = [],
  onChange,
  onSelect,
  onStartFresh,
  onSubjectChange,
  onSenderNameChange,
  onAddBlock,
  onVarClick,
}: EmailBlockBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    onChange(arrayMove(blocks, oldIndex, newIndex));
  };

  if (blocks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-24 px-8 text-center">
        <LayoutTemplate className="w-12 h-12 text-[#3ECF8E]/20" />
        <p className="font-medium text-sm text-muted-foreground">No blocks yet</p>
        <p className="text-xs text-muted-foreground/60">Add blocks from the left panel or drag them in</p>
      </div>
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
      {/* ── Email client chrome ─────────────────────────────────────────────── */}
      <div className="max-w-[600px] mx-auto rounded-2xl overflow-hidden" style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)" }}>

        {/* Dark email client header with editable sender + subject */}
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
              {/* Editable subject line */}
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
            Click sender name or subject to edit · Blocks below can be dragged to reorder
          </p>
        </div>

        {/* Email body */}
        <div style={{ background: "#18181b" }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div>
                {blocks.map((block, idx) => (
                  <React.Fragment key={block.id}>
                    {/* Insert zone between blocks */}
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
                      onSelect={() => onSelect(block.id === selectedId ? null : block.id)}
                      onRemove={() => removeBlock(block.id)}
                      onDuplicate={() => duplicateBlock(block.id)}
                      onChange={updateBlock}
                      availableVars={availableVars}
                      onVarClick={onVarClick}
                    />
                  </React.Fragment>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
      <div className="h-8" />
    </div>
  );
}
