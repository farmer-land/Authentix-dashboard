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
  Type, AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, QrCode, MousePointerClick,
  TableProperties, Minus, ArrowUpDown, LayoutTemplate, Plus, Trash2,
  GripVertical, GripHorizontal, AlertCircle, RefreshCw, Copy, SlidersHorizontal,
  ArrowUp, ArrowDown, ChevronDown, ChevronRight, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { api } from "@/lib/api/client";
import { Upload, Video, Globe } from "lucide-react";

// ── Block types ──────────────────────────────────────────────────────────────

export type BlockType =
  | "header"
  | "greeting"
  | "text"
  | "image"
  | "markdown"
  | "two_column"
  | "cert_image"
  | "qr_code"
  | "details_box"
  | "cta_button"
  | "linkedin"
  | "social"
  | "divider"
  | "spacer"
  | "footer"
  | "video"
  | "table"
  | "iframe";

export interface EmailBlock {
  id: string;
  type: BlockType;
  // Background
  bgColor?: string;
  bgType?: "solid" | "gradient" | "image";
  bgImage?: string;
  bgImagePosition?: string;
  bgImageSize?: "cover" | "contain" | "auto";
  bgImageRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  gradientEnd?: string;
  gradientAngle?: number;
  // Header-specific
  title?: string;
  titleColor?: string;
  subtitle?: string;
  subtitleColor?: string;
  // Text
  content?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  // Spacing
  paddingV?: number;
  paddingH?: number;
  // Border
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  // Details box
  detailRows?: Array<{ label: string; value: string }>;
  detailBgColor?: string;
  detailTextColor?: string;
  // CTA button
  btnLabel?: string;
  btnUrl?: string;
  btnColor?: string;
  btnTextColor?: string;
  btnRadius?: number;
  btnWidth?: "auto" | "full";
  btnPaddingH?: number;
  btnPaddingV?: number;
  btnFontWeight?: string;
  // Spacer
  height?: number;
  // QR
  qrUrl?: string;
  // Two column
  leftContent?: string;
  rightContent?: string;
  leftTextColor?: string;
  rightTextColor?: string;
  // Divider
  dividerStyle?: "solid" | "dashed" | "dotted";
  dividerColor?: string;
  dividerThickness?: number;
  dividerWidth?: number;
  // Image block
  imageUrl?: string;
  imageAlt?: string;
  imageLinkUrl?: string;
  imageAlign?: "left" | "center" | "right";
  imageWidth?: number;
  imageBorderRadius?: number;
  // Social block
  socialLinks?: Array<{ platform: string; url: string }>;
  // Video block
  videoUrl?: string;
  videoType?: "youtube" | "vimeo" | "gif" | "direct";
  videoThumb?: string;
  videoCaptionText?: string;
  // Table block
  tableHeaders?: string[];
  tableRows?: string[][];
  tableBgColor?: string;
  tableHeaderBgColor?: string;
  tableHeaderTextColor?: string;
  tableBorderColor?: string;
  // Iframe block
  iframeUrl?: string;
  iframeHeight?: number;
  iframeTitle?: string;
  iframeSandbox?: string;
  iframeAllow?: string;
  iframeFallbackText?: string;
  // Block-level border (top / bottom)
  blockBorderTop?: number;     // px, 0–8
  blockBorderBottom?: number;  // px, 0–8
  blockBorderColor?: string;   // hex
  // Hide on mobile
  hideOnMobile?: boolean;
  // Social block
  socialAlign?: "left" | "center" | "right";
  socialIconSize?: "sm" | "md" | "lg";
  socialIconStyle?: "button" | "pill" | "outline";
  // Image block extras
  imageShadow?: "none" | "soft" | "hard";
  imageOpenNewTab?: boolean;
  // Video caption alignment
  videoCaptionAlign?: "left" | "center" | "right";
}

export interface EmailBackground {
  type?: "solid" | "gradient" | "image";
  color?: string;
  gradientEnd?: string;
  gradientAngle?: number;
  imageUrl?: string;
  imagePosition?: string; // CSS background-position, e.g. "center", "top left", "50% 20%"
  imageSize?: "cover" | "contain" | "auto";
  imageRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
}

// ── Palette catalog (exported for use in left panel) ─────────────────────────

// Generic email blocks — shown in both cert-delivery and broadcast editors
export const EMAIL_BLOCKS_PALETTE: Array<{ type: BlockType; icon: React.ReactNode; label: string; desc: string }> = [
  { type: "header",      icon: <LayoutTemplate className="w-3.5 h-3.5" />,    label: "Header",       desc: "Title banner" },
  { type: "greeting",    icon: <AlignLeft className="w-3.5 h-3.5" />,         label: "Greeting",     desc: "Hi {{name}}" },
  { type: "text",        icon: <AlignLeft className="w-3.5 h-3.5" />,         label: "Text",         desc: "Paragraph" },
  { type: "image",       icon: <ImageIcon className="w-3.5 h-3.5" />,         label: "Image",        desc: "Embed image" },
  { type: "markdown",    icon: <Type className="w-3.5 h-3.5" />,              label: "Markdown",     desc: "Rich text / tables" },
  { type: "two_column",  icon: <TableProperties className="w-3.5 h-3.5" />,   label: "Two Columns",  desc: "Side-by-side layout" },
  { type: "cta_button",  icon: <MousePointerClick className="w-3.5 h-3.5" />, label: "CTA Button",   desc: "Action link" },
  { type: "linkedin",    icon: <Type className="w-3.5 h-3.5" />,              label: "LinkedIn",     desc: "Share prompt" },
  { type: "social",      icon: <Type className="w-3.5 h-3.5" />,              label: "Social Links", desc: "Follow buttons" },
  { type: "video",  icon: <Video className="w-3.5 h-3.5" />,        label: "Video / GIF", desc: "Embed video or GIF" },
  { type: "table",  icon: <TableProperties className="w-3.5 h-3.5" />, label: "Table",     desc: "Data table" },
  { type: "iframe",      icon: <Globe className="w-3.5 h-3.5" />,             label: "Embed / iFrame", desc: "Website, map, form" },
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

// ── Embed URL parser — handles pasted <iframe> HTML + platform URL shortcuts ──

export function parseEmbedInput(raw: string): { url: string; height?: number; title?: string; allow?: string } {
  const s = raw.trim();
  // Full <iframe> HTML paste → extract attributes
  const srcMatch = s.match(/<iframe[^>]+\bsrc=["']([^"']+)["']/i);
  if (srcMatch) {
    const heightMatch = s.match(/\bheight=["']?(\d+)["']?/i);
    const titleMatch = s.match(/\btitle=["']([^"']+)["']/i);
    const allowMatch = s.match(/\ballow=["']([^"']+)["']/i);
    return {
      url: srcMatch[1]!,
      height: heightMatch ? Number(heightMatch[1]) : undefined,
      title: titleMatch ? titleMatch[1] : undefined,
      allow: allowMatch ? allowMatch[1] : undefined,
    };
  }
  // YouTube watch URL → embed
  const ytWatch = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytWatch) return { url: `https://www.youtube.com/embed/${ytWatch[1]}`, allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" };
  // Vimeo URL → embed
  const vimeo = s.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { url: `https://player.vimeo.com/video/${vimeo[1]}`, allow: "autoplay; fullscreen; picture-in-picture" };
  // Already an embed URL — return as-is
  return { url: s };
}

// Domains that set X-Frame-Options DENY/SAMEORIGIN — can't be iframed
const BLOCKS_EMBED = [
  "linkedin.com", "instagram.com", "facebook.com", "twitter.com", "x.com",
  "tiktok.com", "reddit.com", "pinterest.com",
  // YouTube non-embed pages
  "youtube.com/watch", "youtube.com/channel", "youtube.com/@", "youtube.com/shorts",
  "youtu.be",
];

export function embedIsBlocked(url: string): boolean {
  if (!url) return false;
  try { new URL(url); } catch { return false; }
  return BLOCKS_EMBED.some(p => url.includes(p));
}

// Parses clipboard data into table headers+rows. Handles HTML tables (Google Sheets),
// TSV (Excel / Numbers), and CSV.
export function parseClipboardTable(html: string, text: string): { headers: string[]; rows: string[][] } | null {
  if (html && /<table/i.test(html)) {
    if (typeof DOMParser === "undefined") return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const trs = Array.from(doc.querySelectorAll("tr"));
    if (trs.length === 0) return null;
    const all = trs.map(tr => Array.from(tr.querySelectorAll("th,td")).map(td => td.textContent?.trim() ?? ""));
    const headers = all[0] ?? [];
    if (headers.length === 0) return null;
    return { headers, rows: all.slice(1) };
  }
  if (text && text.includes("\t")) {
    const lines = text.trim().split(/\r?\n/);
    const headers = (lines[0] ?? "").split("\t");
    const rows = lines.slice(1).map(l => l.split("\t"));
    if (headers.length > 0) return { headers, rows };
  }
  if (text && text.includes(",")) {
    const lines = text.trim().split(/\r?\n/);
    const parseRow = (line: string) => {
      const res: string[] = []; let cur = ""; let q = false;
      for (const ch of line) {
        if (ch === '"') { q = !q; } else if (ch === "," && !q) { res.push(cur); cur = ""; } else { cur += ch; }
      }
      res.push(cur);
      return res;
    };
    const headers = parseRow(lines[0] ?? "");
    const rows = lines.slice(1).map(parseRow);
    if (headers.length > 1) return { headers, rows };
  }
  return null;
}

// ── Default block configs ────────────────────────────────────────────────────

export function defaultBlock(type: BlockType): EmailBlock {
  const id = nanoid(8);
  switch (type) {
    case "header":      return { id, type, bgType: "gradient", bgColor: "#3ECF8E", gradientEnd: "#1a9e6b", gradientAngle: 135, titleColor: "#ffffff", title: "Congratulations, {{recipient_name}}!", subtitle: "You've completed {{course_name}}" };
    case "greeting":    return { id, type, content: "Hi {{recipient_name}},", textColor: "#e5e7eb", fontSize: 16, lineHeight: 1.7, textAlign: "left" };
    case "text":        return { id, type, content: "We are delighted to inform you that you have successfully completed this program. Your certificate is ready below.", textColor: "#d1d5db", fontSize: 15, lineHeight: 1.7 };
    case "image":       return { id, type, imageUrl: "", imageAlt: "", imageAlign: "center", imageWidth: 100, imageBorderRadius: 8 };
    case "markdown":    return { id, type, content: "## Congratulations, **{{recipient_name}}**!\n\nYou have successfully completed **{{course_name}}**.\n\n- 📅 Issued on {{issue_date}}\n- 🔗 [View & verify your certificate]({{verification_url}})\n\n> Your achievement has been recorded and is ready to share.", textColor: "#d1d5db" };
    case "two_column":  return { id, type, leftContent: "**Course Details**\n\nCourse: {{course_name}}\nDate: {{issue_date}}", rightContent: "**About Your Certificate**\n\nThis certificate verifies your achievement. Share it with your network!", leftTextColor: "#d1d5db", rightTextColor: "#d1d5db" };
    case "cert_image":  return { id, type };
    case "qr_code":     return { id, type, content: "Scan QR to verify certificate authenticity" };
    case "details_box": return { id, type, detailRows: [{ label: "Course", value: "{{course_name}}" }, { label: "Date Issued", value: "{{issue_date}}" }], detailBgColor: "#1a1a1a", detailTextColor: "#3ECF8E" };
    case "cta_button":  return { id, type, btnLabel: "View & Verify Certificate", btnUrl: "{{verification_url}}", btnColor: "#3ECF8E", btnTextColor: "#ffffff", btnRadius: 8, btnWidth: "auto", btnPaddingH: 32, btnPaddingV: 13 };
    case "linkedin":    return { id, type, content: "🎓 Share your achievement on LinkedIn and inspire others!", textColor: "#9ca3af" };
    case "social":      return { id, type, socialLinks: [{ platform: "LinkedIn", url: "" }, { platform: "Twitter", url: "" }] };
    case "divider":     return { id, type, dividerStyle: "solid", dividerColor: "#333333", dividerThickness: 1, dividerWidth: 100 };
    case "spacer":      return { id, type, height: 24 };
    case "footer":      return { id, type, content: "© {{organization_name}} · Powered by Authentix", textColor: "#6b7280", fontSize: 12, lineHeight: 1.6 };
    case "video": return { id, type, videoUrl: "", videoType: "youtube", videoCaptionText: "" };
    case "table": return { id, type, tableHeaders: ["Column 1", "Column 2", "Column 3"], tableRows: [["", "", ""], ["", "", ""]], tableBgColor: "#1e1e1e", tableHeaderBgColor: "transparent", tableHeaderTextColor: "#3ECF8E", tableBorderColor: "#3f3f46" };
    case "iframe": return { id, type, iframeUrl: "", iframeHeight: 400, iframeTitle: "Embedded content", iframeSandbox: "allow-scripts allow-same-origin allow-forms", iframeFallbackText: "View this content online →" };
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
    case "header": {
      const pV = block.paddingV ?? 44;
      const pH = block.paddingH ?? 32;
      const bgStyle = (() => {
        if (block.bgType === "image" && block.bgImage) {
          const pos = block.bgImagePosition || "center";
          const size = block.bgImageSize || "cover";
          const repeat = block.bgImageRepeat || "no-repeat";
          return `background-image:url('${block.bgImage}');background-size:${size};background-position:${pos};background-repeat:${repeat};`;
        }
        if (block.bgType === "solid")
          return `background:${block.bgColor || "#3ECF8E"};`;
        // gradient (default)
        const angle = block.gradientAngle ?? 135;
        return `background:linear-gradient(${angle}deg, ${block.bgColor || "#3ECF8E"} 0%, ${block.gradientEnd || darken(block.bgColor || "#3ECF8E")} 100%);`;
      })();
      return `<div style="${bgStyle}padding:${pV}px ${pH}px;text-align:center;">
  <h1 style="color:${block.titleColor || "#ffffff"};font-size:28px;font-weight:${block.fontWeight || "700"};margin:0 0 8px;letter-spacing:-0.5px;${ff}">${block.title || ""}</h1>
  ${block.subtitle ? `<p style="color:${block.subtitleColor || "rgba(255,255,255,0.85)"};font-size:16px;margin:0;${ff}">${block.subtitle}</p>` : ""}
</div>`;
    }

    case "greeting": {
      const ta = block.textAlign || "left";
      const pV = block.paddingV ?? 20; const pH = block.paddingH ?? 32;
      return `<div style="padding:${pV}px ${pH}px;min-height:64px;display:flex;align-items:center;justify-content:${ta === "center" ? "center" : ta === "right" ? "flex-end" : "flex-start"};${block.bgColor ? `background:${block.bgColor};` : ""}">
  <p style="font-size:${block.fontSize || 16}px;color:${block.textColor || "#e5e7eb"};margin:0;text-align:${ta};line-height:${block.lineHeight || 1.7};letter-spacing:${block.letterSpacing || 0}px;font-weight:${block.fontWeight || "normal"};font-style:${block.fontStyle || "normal"};${ff}">${block.content || "Hi {{recipient_name}},"}</p>
</div>`;
    }

    case "text": {
      const ta = block.textAlign || "left";
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      return `<div style="padding:${pV}px ${pH}px;text-align:${ta};${block.bgColor ? `background:${block.bgColor};` : ""}">
  <p style="font-size:${block.fontSize || 15}px;color:${block.textColor || "#d1d5db"};line-height:${block.lineHeight || 1.7};margin:0;letter-spacing:${block.letterSpacing || 0}px;font-weight:${block.fontWeight || "normal"};font-style:${block.fontStyle || "normal"};${ff}">${block.content || ""}</p>
</div>`;
    }

    case "image": {
      const align = block.imageAlign || "center";
      const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      const shadowCss = block.imageShadow === "soft" ? "box-shadow:0 4px 24px rgba(0,0,0,0.18);" : block.imageShadow === "hard" ? "box-shadow:4px 6px 0 rgba(0,0,0,0.35);" : "";
      const imgStyle = `max-width:${block.imageWidth || 100}%;height:auto;border-radius:${block.imageBorderRadius ?? 8}px;display:block;${shadowCss}`;
      const newTab = block.imageOpenNewTab !== false;
      const imgTag = block.imageUrl
        ? `<img src="${block.imageUrl}" alt="${block.imageAlt || ""}" style="${imgStyle}" />`
        : `<div style="background:#27272a;border:1px dashed #3f3f46;border-radius:${block.imageBorderRadius ?? 8}px;height:120px;display:flex;align-items:center;justify-content:center;"><span style="color:#6b7280;font-size:12px;font-family:sans-serif;">Image placeholder</span></div>`;
      const wrapped = block.imageLinkUrl ? `<a href="${block.imageLinkUrl}"${newTab ? ' target="_blank" rel="noopener noreferrer"' : ''} style="display:block;">${imgTag}</a>` : imgTag;
      return `<div style="padding:${pV}px ${pH}px;display:flex;justify-content:${justify};${block.bgColor ? `background:${block.bgColor};` : ""}">${wrapped}</div>`;
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

    case "cta_button": {
      const bpH = block.btnPaddingH ?? 32;
      const bpV = block.btnPaddingV ?? 13;
      const bw = block.btnWidth === "full" ? "width:100%;box-sizing:border-box;" : "display:inline-block;";
      const pV = block.paddingV ?? 24; const pH = block.paddingH ?? 32;
      return `<div style="text-align:center;margin:${pV}px ${pH}px;">
  <a href="${block.btnUrl || "{{verification_url}}"}" style="${bw}background:${block.btnColor || "#3ECF8E"};color:${block.btnTextColor || "#ffffff"};font-size:15px;font-weight:${block.btnFontWeight || "600"};padding:${bpV}px ${bpH}px;border-radius:${block.btnRadius ?? 8}px;text-decoration:none;letter-spacing:0.2px;${ff}">${block.btnLabel || "View &amp; Verify Certificate"}</a>
</div>`;
    }

    case "linkedin": {
      const pV = block.paddingV ?? 20; const pH = block.paddingH ?? 32;
      return `<div style="padding:${pV}px ${pH}px;text-align:center;${block.bgColor ? `background:${block.bgColor};` : ""}"><p style="font-size:14px;color:${block.textColor || "#9ca3af"};margin:0;font-style:${block.fontStyle || "normal"};${ff}">${block.content || "🎓 Share your achievement on LinkedIn and inspire others!"}</p></div>`;
    }

    case "social": {
      const links = block.socialLinks ?? [];
      const SOCIAL_COLORS: Record<string, string> = { LinkedIn: "#0A66C2", Twitter: "#1DA1F2", X: "#000000", Instagram: "#E1306C", Facebook: "#1877F2", YouTube: "#FF0000", GitHub: "#24292e", Website: "#6b7280" };
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      const align = block.socialAlign || "center";
      const iconSize = block.socialIconSize || "md";
      const iconStyle = block.socialIconStyle || "button";
      const [fz, padV, padH, radius] =
        iconSize === "sm" ? [11, 5, 12, 6] :
        iconSize === "lg" ? [14, 10, 20, 8] :
        [12, 7, 16, 6];
      const btns = links.map(l => {
        const col = SOCIAL_COLORS[l.platform] || "#6b7280";
        const aStyle = iconStyle === "pill"
          ? `background:${col};color:#fff;border-radius:999px;border:none;`
          : iconStyle === "outline"
          ? `background:transparent;color:${col};border:2px solid ${col};border-radius:${radius}px;`
          : `background:${col};color:#fff;border-radius:${radius}px;border:none;`;
        return `<a href="${l.url || "#"}" target="_blank" rel="noopener noreferrer" style="display:inline-block;${aStyle}font-size:${fz}px;font-weight:600;padding:${padV}px ${padH}px;text-decoration:none;margin:4px;">${l.platform}</a>`;
      }).join("");
      return `<div style="padding:${pV}px ${pH}px;text-align:${align};${block.bgColor ? `background:${block.bgColor};` : ""}">${btns || "<span style='color:#6b7280;font-size:12px;'>Add social links in the panel</span>"}</div>`;
    }

    case "divider": {
      const style = block.dividerStyle || "solid";
      const color = block.dividerColor || "#333333";
      const thickness = block.dividerThickness || 1;
      const width = block.dividerWidth || 100;
      return `<div style="padding:8px 0;text-align:center;"><hr style="border:none;border-top:${thickness}px ${style} ${color};width:${width}%;margin:0 auto;" /></div>`;
    }

    case "spacer":
      return `<div style="height: ${block.height || 24}px;"></div>`;

    case "footer": {
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      return `<div style="padding:${pV}px ${pH}px;text-align:center;border-top:1px solid #2d2d2d;${block.bgColor ? `background:${block.bgColor};` : ""}">
  <p style="font-size:${block.fontSize || 12}px;color:${block.textColor || "#6b7280"};margin:0;line-height:${block.lineHeight || 1.6};font-style:${block.fontStyle || "normal"};${ff}">${block.content || "© {{organization_name}} · Powered by Authentix"}</p>
</div>`;
    }

    case "video": {
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      if (!block.videoUrl) return `<div style="padding:${pV}px ${pH}px;text-align:center;background:#1a1a1a;border:1px dashed #3f3f46;border-radius:8px;margin:0 32px;"><p style="color:#6b7280;font-size:12px;font-family:sans-serif;margin:0;">Add a video URL in the properties panel</p></div>`;
      if (block.videoType === "gif") {
        return `<div style="padding:${pV}px ${pH}px;text-align:center;"><img src="${block.videoUrl}" alt="${block.videoCaptionText || "Animation"}" style="max-width:100%;border-radius:8px;display:block;margin:0 auto;"/>${block.videoCaptionText ? `<p style="color:#9ca3af;font-size:12px;margin:8px 0 0;font-family:sans-serif;">${block.videoCaptionText}</p>` : ""}</div>`;
      }
      let thumbUrl = block.videoThumb || "";
      if (!thumbUrl && block.videoType === "youtube") {
        const ytId = block.videoUrl?.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
        if (ytId) thumbUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      }
      const thumbnail = thumbUrl
        ? `<img src="${thumbUrl}" alt="Video" style="max-width:100%;border-radius:8px;display:block;"/>`
        : `<div style="background:#1a1a1a;border-radius:8px;height:180px;display:flex;align-items:center;justify-content:center;"><span style="color:#6b7280;font-size:12px;font-family:sans-serif;">Video preview</span></div>`;
      return `<div style="padding:${pV}px ${pH}px;text-align:center;"><a href="${block.videoUrl}" style="display:inline-block;position:relative;max-width:100%;text-decoration:none;">${thumbnail}<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;"><div style="width:52px;height:52px;background:rgba(0,0,0,0.70);border-radius:50%;display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 18 18" fill="white"><polygon points="5,2 16,9 5,16"/></svg></div></div></a>${block.videoCaptionText ? `<p style="color:#9ca3af;font-size:12px;margin:8px 0 0;font-family:sans-serif;">${block.videoCaptionText}</p>` : ""}</div>`;
    }

    case "table": {
      const headers = block.tableHeaders ?? ["Col 1", "Col 2"];
      const rows = block.tableRows ?? [];
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      const headerCells = headers.map(h => `<th style="padding:8px 12px;text-align:left;color:${block.tableHeaderTextColor || "#3ECF8E"};font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;border-bottom:2px solid ${block.tableBorderColor || "#3f3f46"};background:${block.tableHeaderBgColor || "transparent"};">${h}</th>`).join("");
      const rowHtml = rows.map((row, ri) => {
        const cells = headers.map((_, ci) => `<td style="padding:8px 12px;font-size:13px;color:${block.textColor || "#d1d5db"};border-bottom:1px solid ${block.tableBorderColor || "#3f3f46"};">${row[ci] || ""}</td>`).join("");
        return `<tr style="background:${ri % 2 === 1 ? "rgba(255,255,255,0.03)" : "transparent"};">${cells}</tr>`;
      }).join("");
      return `<div style="padding:${pV}px ${pH}px;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${block.tableBgColor || "#1e1e1e"};border-radius:8px;overflow:hidden;font-family:-apple-system,sans-serif;"><thead><tr>${headerCells}</tr></thead><tbody>${rowHtml}</tbody></table></div>`;
    }

    case "iframe": {
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      if (!block.iframeUrl) return `<div style="padding:${pV}px ${pH}px;"><div style="border:1px dashed #3f3f46;border-radius:8px;padding:32px 16px;text-align:center;"><p style="color:#6b7280;font-size:12px;font-family:sans-serif;margin:0;">Add an embed URL in the properties panel</p></div></div>`;
      const title = block.iframeTitle || "View Embedded Content";
      const fallback = block.iframeFallbackText || "Click to open →";
      return `<div style="padding:${pV}px ${pH}px;text-align:center;"><a href="${block.iframeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1e1e1e;border:1px solid #3f3f46;border-radius:8px;padding:20px 32px;text-decoration:none;"><p style="color:#3ECF8E;font-size:14px;font-weight:600;margin:0;font-family:-apple-system,sans-serif;">${title}</p><p style="color:#6b7280;font-size:12px;margin:6px 0 0;font-family:-apple-system,sans-serif;">${fallback}</p></a><p style="color:#6b7280;font-size:10px;margin:8px 0 0;font-family:sans-serif;">Note: embedded content opens in browser</p></div>`;
    }

    default:
      return "";
  }
}

const BLOCKS_JSON_MARKER = "__blocks_v1__";

export function blocksToHtml(blocks: EmailBlock[], emailBg?: EmailBackground, preheader?: string, utm?: { source?: string; medium?: string; campaign?: string }): string {
  if (!blocks.length) return "";

  // Determine if any block needs mobile-hide support
  const needsMobileHide = blocks.some(b => b.hideOnMobile);
  const mobileHideStyle = needsMobileHide
    ? `<style>@media only screen and (max-width:600px){.mobile-hide{display:none!important;max-height:0!important;overflow:hidden!important;}}</style>`
    : "";

  const inner = blocks.map(block => {
    const html = blockToHtml(block);
    // Apply block-level border wrapper
    const borderStyle = [
      block.blockBorderTop ? `border-top:${block.blockBorderTop}px solid ${block.blockBorderColor || '#3f3f46'};` : '',
      block.blockBorderBottom ? `border-bottom:${block.blockBorderBottom}px solid ${block.blockBorderColor || '#3f3f46'};` : '',
    ].join('');
    const bw = block.borderWidth ?? 0;
    const br = block.borderRadius ?? 0;
    let wrapped = html;
    if (bw > 0 || br > 0) {
      const bStr = bw > 0 ? `border:${bw}px solid ${block.borderColor || '#3f3f46'};` : '';
      const rStr = br > 0 ? `border-radius:${br}px;overflow:hidden;` : '';
      wrapped = `<div style="${bStr}${rStr}">${wrapped}</div>`;
    }
    if (borderStyle) {
      wrapped = `<div style="${borderStyle}">${wrapped}</div>`;
    }
    // Apply hide-on-mobile wrapper
    if (block.hideOnMobile) {
      wrapped = `<!--[if !mso]><!-->
<div class="mobile-hide" style="display:block;">
  ${wrapped}
</div>
<!--<![endif]-->`;
    }
    return wrapped;
  }).join("\n");

  const wrapperBg = (() => {
    if (!emailBg || !emailBg.type || emailBg.type === "solid")
      return `background:${emailBg?.color || "#ffffff"};`;
    if (emailBg.type === "image" && emailBg.imageUrl) {
      const pos = emailBg.imagePosition || "center";
      const size = emailBg.imageSize || "cover";
      const repeat = emailBg.imageRepeat || "no-repeat";
      return `background-image:url('${emailBg.imageUrl}');background-size:${size};background-position:${pos};background-repeat:${repeat};`;
    }
    if (emailBg.type === "gradient") {
      const angle = emailBg.gradientAngle ?? 135;
      return `background:linear-gradient(${angle}deg,${emailBg.color||"#ffffff"} 0%,${emailBg.gradientEnd||"#f0f0f0"} 100%);`;
    }
    return "background:#ffffff;";
  })();

  // Preheader hidden div
  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;color:#fefefe;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>`
    : "";

  // Embed blocks + editor metadata as a JSON comment so the editor can restore them on next open
  const editorMeta = { v: 2, blocks, preheader: preheader ?? '', emailBg: emailBg ?? null, utm: utm ?? {} };
  const jsonComment = `<!-- ${BLOCKS_JSON_MARKER}:${JSON.stringify(editorMeta)} -->`;
  let fullHtml = `${jsonComment}\n${mobileHideStyle}<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; ${wrapperBg} border-radius: 10px; overflow: hidden; border: 1px solid #2d2d2d;">
${preheaderHtml}
${inner}
</div>`;

  // Apply UTM params to all http(s) hrefs
  if (utm && (utm.source || utm.medium || utm.campaign)) {
    const utmStr = [
      utm.source ? `utm_source=${encodeURIComponent(utm.source)}` : '',
      utm.medium ? `utm_medium=${encodeURIComponent(utm.medium)}` : '',
      utm.campaign ? `utm_campaign=${encodeURIComponent(utm.campaign)}` : '',
    ].filter(Boolean).join('&');

    fullHtml = fullHtml.replace(/href="(https?:\/\/[^"]+)"/g, (_, url) => {
      const sep = url.includes('?') ? '&' : '?';
      return `href="${url}${sep}${utmStr}"`;
    });
  }

  return fullHtml;
}

export interface EditorState {
  blocks: EmailBlock[];
  preheader?: string;
  emailBg?: EmailBackground;
  utm?: { source?: string; medium?: string; campaign?: string };
}

/** Extract editor state (blocks + metadata) from the embedded JSON comment in stored HTML. */
export function extractEditorState(html: string): EditorState | null {
  const match = html.match(new RegExp(`<!-- ${BLOCKS_JSON_MARKER}:(.+?) -->`));
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Legacy format: just blocks array
      return { blocks: parsed as EmailBlock[] };
    }
    if (parsed.v === 2 && Array.isArray(parsed.blocks)) {
      return { blocks: parsed.blocks as EmailBlock[], preheader: parsed.preheader, emailBg: parsed.emailBg, utm: parsed.utm };
    }
  } catch { /* malformed JSON */ }
  return null;
}

/** @deprecated Use extractEditorState instead */
export function extractBlocksFromHtml(html: string): EmailBlock[] | null {
  return extractEditorState(html)?.blocks ?? null;
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
          className="fixed z-[99999] pointer-events-none"
          style={{
            left: Math.min(previewPos.x, window.innerWidth - 320),
            top: Math.max(8, Math.min(previewPos.y, window.innerHeight - 300)),
          }}
        >
          <div className="w-72 bg-zinc-800 border border-zinc-600/60 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-3 py-1.5 border-b border-zinc-700/60 bg-zinc-700/50">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{item.label}</p>
            </div>
            <div className="overflow-hidden" style={{ maxHeight: 260 }}>
              <div
                style={{ transform: "scale(0.65)", transformOrigin: "top center", width: "154%", marginLeft: "-27%" }}
                dangerouslySetInnerHTML={{ __html: previewHtml || `<div style="padding:16px;color:#6b7280;font-size:12px;font-family:sans-serif;background:#18181b">${item.label}</div>` }}
              />
            </div>
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
  image: "Image",
  markdown: "Markdown",
  two_column: "Two Columns",
  cert_image: "Certificate Image",
  qr_code: "QR Code",
  details_box: "Details Box",
  cta_button: "CTA Button",
  linkedin: "LinkedIn Nudge",
  social: "Social Links",
  divider: "Divider",
  spacer: "Spacer",
  footer: "Footer",
  video: "Video / GIF",
  table: "Table",
  iframe: "Embed / iFrame",
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
          {/* Markdown formatting toolbar */}
          <div className="flex items-center gap-0.5 mb-2 flex-wrap bg-zinc-800/60 rounded-lg px-2 py-1.5 border border-zinc-700/50">
            {[
              { label: "B",    title: "Bold (**text**)",        syntax: ["**", "**"] as [string, string] },
              { label: "I",    title: "Italic (*text*)",        syntax: ["*", "*"] as [string, string] },
              { label: "~~",   title: "Strikethrough",          syntax: ["~~", "~~"] as [string, string] },
              { label: "`",    title: "Inline code",            syntax: ["`", "`"] as [string, string] },
            ].map(fmt => (
              <button key={fmt.label} type="button" title={fmt.title}
                onMouseDown={e => {
                  e.preventDefault();
                  const ta = e.currentTarget.closest("div")?.parentElement?.querySelector("textarea") as HTMLTextAreaElement | null;
                  if (!ta) return;
                  const s = ta.selectionStart; const end = ta.selectionEnd;
                  const sel = draft.slice(s, end) || "text";
                  const next = draft.slice(0, s) + fmt.syntax[0] + sel + fmt.syntax[1] + draft.slice(end);
                  setDraft(next);
                  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + fmt.syntax[0].length, s + fmt.syntax[0].length + sel.length); });
                }}
                className="px-1.5 h-6 text-xs font-mono text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors">
                {fmt.label}
              </button>
            ))}
            <div className="w-px h-4 bg-zinc-600 mx-0.5" />
            {[
              { label: "H1", title: "Heading 1", prefix: "# " },
              { label: "H2", title: "Heading 2", prefix: "## " },
              { label: "H3", title: "Heading 3", prefix: "### " },
            ].map(h => (
              <button key={h.label} type="button" title={h.title}
                onMouseDown={e => {
                  e.preventDefault();
                  const ta = e.currentTarget.closest("div")?.parentElement?.querySelector("textarea") as HTMLTextAreaElement | null;
                  if (!ta) return;
                  const s = ta.selectionStart;
                  const lineStart = draft.lastIndexOf("\n", s - 1) + 1;
                  const next = draft.slice(0, lineStart) + h.prefix + draft.slice(lineStart);
                  setDraft(next);
                  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + h.prefix.length, s + h.prefix.length); });
                }}
                className="px-1.5 h-6 text-[10px] font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors">
                {h.label}
              </button>
            ))}
            <div className="w-px h-4 bg-zinc-600 mx-0.5" />
            {[
              { label: "—", title: "Bullet list",   prefix: "- " },
              { label: "1.", title: "Ordered list",  prefix: "1. " },
              { label: "❝",  title: "Blockquote",    prefix: "> " },
              { label: "—",  title: "Divider",       full: "\n---\n" },
            ].map((item, i) => (
              <button key={i} type="button" title={item.title}
                onMouseDown={e => {
                  e.preventDefault();
                  const ta = e.currentTarget.closest("div")?.parentElement?.querySelector("textarea") as HTMLTextAreaElement | null;
                  if (!ta) return;
                  if (item.full) {
                    const s = ta.selectionStart;
                    const next = draft.slice(0, s) + item.full + draft.slice(s);
                    setDraft(next);
                    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + item.full!.length, s + item.full!.length); });
                  } else if (item.prefix) {
                    const s = ta.selectionStart;
                    const lineStart = draft.lastIndexOf("\n", s - 1) + 1;
                    const next = draft.slice(0, lineStart) + item.prefix + draft.slice(lineStart);
                    setDraft(next);
                    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + item.prefix!.length, s + item.prefix!.length); });
                  }
                }}
                className="px-1.5 h-6 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors">
                {item.label}
              </button>
            ))}
            <div className="w-px h-4 bg-zinc-600 mx-0.5" />
            <button type="button" title="Image ![alt](url)"
              onMouseDown={e => {
                e.preventDefault();
                const ta = e.currentTarget.closest("div")?.parentElement?.querySelector("textarea") as HTMLTextAreaElement | null;
                if (!ta) return;
                const s = ta.selectionStart;
                const insert = "![alt text](https://example.com/image.jpg)";
                const next = draft.slice(0, s) + insert + draft.slice(s);
                setDraft(next);
                requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 2, s + 10); });
              }}
              className="px-1.5 h-6 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors">
              🖼
            </button>
            <button type="button" title="Link [text](url)"
              onMouseDown={e => {
                e.preventDefault();
                const ta = e.currentTarget.closest("div")?.parentElement?.querySelector("textarea") as HTMLTextAreaElement | null;
                if (!ta) return;
                const s = ta.selectionStart; const end = ta.selectionEnd;
                const sel = draft.slice(s, end) || "link text";
                const insert = `[${sel}](https://example.com)`;
                const next = draft.slice(0, s) + insert + draft.slice(end);
                setDraft(next);
                requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + sel.length + 3, s + insert.length - 1); });
              }}
              className="px-1.5 h-6 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors">
              🔗
            </button>
          </div>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === "Escape") commit();
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
              e.stopPropagation();
            }}
            rows={Math.max(6, draft.split("\n").length + 1)}
            placeholder={"# Heading\n**bold**, *italic*, [link](url)\n- list item\n> blockquote\n\n{{variable}}\n\n![image](https://url)"}
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
    case "header": {
      const pV = block.paddingV ?? 44; const pH = block.paddingH ?? 32;
      const bgCss = (() => {
        if (block.bgType === "image" && block.bgImage)
          return { backgroundImage: `url('${block.bgImage}')`, backgroundSize: block.bgImageSize || "cover", backgroundPosition: block.bgImagePosition || "center", backgroundRepeat: block.bgImageRepeat || "no-repeat" };
        if (block.bgType === "solid")
          return { background: block.bgColor || "#3ECF8E" };
        const angle = block.gradientAngle ?? 135;
        return { background: `linear-gradient(${angle}deg, ${block.bgColor || "#3ECF8E"} 0%, ${block.gradientEnd || darken(block.bgColor || "#3ECF8E")} 100%)` };
      })();
      return (
        <div style={{ position: "relative", ...bgCss, padding: `${pV}px ${pH}px`, textAlign: "center", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.25) 100%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <EditableText
              value={block.title || ""}
              onChange={v => u({ title: v })}
              tag="h1"
              placeholder="Header title…"
              availableVars={availableVars}
              style={{ color: block.titleColor || "#ffffff", fontSize: 28, fontWeight: block.fontWeight || "700", margin: "0 0 8px", letterSpacing: "-0.5px", fontFamily: ff, display: "block" }}
            />
            <EditableText
              value={block.subtitle || ""}
              onChange={v => u({ subtitle: v })}
              tag="p"
              placeholder="Subtitle…"
              availableVars={availableVars}
              style={{ color: block.subtitleColor || "rgba(255,255,255,0.85)", fontSize: 16, margin: 0, fontFamily: ff, display: "block" }}
            />
          </div>
        </div>
      );
    }

    case "greeting": {
      const ta = (block.textAlign || "left") as React.CSSProperties["textAlign"];
      const pV = block.paddingV ?? 20; const pH = block.paddingH ?? 32;
      return (
        <div style={{ padding: `${pV}px ${pH}px`, background: block.bgColor || "transparent", display: "flex", alignItems: "center", justifyContent: ta === "center" ? "center" : ta === "right" ? "flex-end" : "flex-start", minHeight: 64 }}>
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="Hi {{recipient_name}},"
            availableVars={availableVars}
            style={{ fontSize: block.fontSize || 16, color: block.textColor || "#e5e7eb", margin: 0, fontFamily: ff, display: "block", textAlign: ta, lineHeight: block.lineHeight || 1.7, letterSpacing: `${block.letterSpacing || 0}px`, fontWeight: block.fontWeight || "normal", fontStyle: block.fontStyle || "normal" }}
          />
        </div>
      );
    }

    case "text": {
      const ta = (block.textAlign || "left") as React.CSSProperties["textAlign"];
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      return (
        <div style={{ padding: `${pV}px ${pH}px`, background: block.bgColor || "transparent", textAlign: ta }}>
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="Enter paragraph text…"
            availableVars={availableVars}
            style={{ fontSize: block.fontSize || 15, color: block.textColor || "#d1d5db", lineHeight: block.lineHeight || 1.7, margin: 0, fontFamily: ff, display: "block", textAlign: ta, letterSpacing: `${block.letterSpacing || 0}px`, fontWeight: block.fontWeight || "normal", fontStyle: block.fontStyle || "normal" }}
          />
        </div>
      );
    }

    case "image": {
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      const align = block.imageAlign || "center";
      const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
      const shadowStyle = block.imageShadow === "soft" ? "0 4px 24px rgba(0,0,0,0.18)" : block.imageShadow === "hard" ? "4px 6px 0 rgba(0,0,0,0.35)" : "none";
      return (
        <div style={{ padding: `${pV}px ${pH}px`, background: block.bgColor || "transparent", display: "flex", justifyContent: justify }}>
          {block.imageUrl ? (
            <img
              src={block.imageUrl}
              alt={block.imageAlt || ""}
              style={{ maxWidth: `${block.imageWidth || 100}%`, height: "auto", borderRadius: `${block.imageBorderRadius ?? 8}px`, display: "block", boxShadow: shadowStyle }}
            />
          ) : (
            <div style={{ background: "#27272a", border: "1px dashed #3f3f46", borderRadius: `${block.imageBorderRadius ?? 8}px`, height: 120, width: `${block.imageWidth || 100}%`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="flex flex-col items-center gap-2 text-zinc-500">
                <ImageIcon className="w-6 h-6" />
                <span style={{ fontSize: 12 }}>Paste image URL in panel</span>
              </div>
            </div>
          )}
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
                <EditableText
                  value={r.value}
                  onChange={v => { const upd = [...rows]; upd[i] = { ...upd[i]!, value: v }; u({ detailRows: upd }); }}
                  tag="span"
                  placeholder="{{variable}}"
                  availableVars={availableVars}
                  style={{ fontSize: 15, fontWeight: 600, color: block.detailTextColor || "#3ECF8E", display: "block", fontFamily: ff }}
                />
              </div>
            ))}
          </div>
          {isSelected && rows.length === 0 && (
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>No rows yet — add rows in the panel below</p>
          )}
        </div>
      );
    }

    case "cta_button": {
      const pV2 = block.paddingV ?? 24; const pH2 = block.paddingH ?? 32;
      const bpH = block.btnPaddingH ?? 32; const bpV = block.btnPaddingV ?? 13;
      const btnStyle: React.CSSProperties = {
        display: block.btnWidth === "full" ? "block" : "inline-block",
        background: block.btnColor || "#3ECF8E",
        color: block.btnTextColor || "#ffffff",
        fontSize: 15,
        fontWeight: block.btnFontWeight || "600",
        padding: `${bpV}px ${bpH}px`,
        borderRadius: block.btnRadius ?? 8,
        letterSpacing: "0.2px",
        fontFamily: ff,
        textAlign: "center",
        width: block.btnWidth === "full" ? "100%" : undefined,
        boxSizing: "border-box",
      };
      return (
        <div style={{ textAlign: "center", margin: `${pV2}px ${pH2}px` }}>
          <EditableText
            value={block.btnLabel || ""}
            onChange={v => u({ btnLabel: v })}
            tag="span"
            placeholder="Button label…"
            availableVars={availableVars}
            style={btnStyle}
          />
        </div>
      );
    }

    case "linkedin": {
      const pV = block.paddingV ?? 20; const pH = block.paddingH ?? 32;
      return (
        <div style={{ padding: `${pV}px ${pH}px`, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 56, background: block.bgColor || "transparent" }}>
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="LinkedIn share message…"
            availableVars={availableVars}
            style={{ fontSize: 14, color: block.textColor || "#9ca3af", margin: 0, fontFamily: ff, display: "block", fontWeight: block.fontWeight || "normal", fontStyle: block.fontStyle || "normal" }}
          />
        </div>
      );
    }

    case "social": {
      const SOCIAL_COLORS: Record<string, string> = { LinkedIn: "#0A66C2", Twitter: "#1DA1F2", X: "#000000", Instagram: "#E1306C", Facebook: "#1877F2", YouTube: "#FF0000", GitHub: "#24292e", Website: "#6b7280" };
      const links = block.socialLinks ?? [];
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      const align = block.socialAlign || "center";
      const iconSize = block.socialIconSize || "md";
      const iconStyle = block.socialIconStyle || "button";
      const [fz, padV, padH, radius] =
        iconSize === "sm" ? [11, 5, 12, 6] :
        iconSize === "lg" ? [14, 10, 20, 8] :
        [12, 7, 16, 6];
      const justifyContent = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
      return (
        <div style={{ padding: `${pV}px ${pH}px`, background: block.bgColor || "transparent" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent }}>
            {links.length > 0 ? links.map((l, i) => {
              const col = SOCIAL_COLORS[l.platform] || "#6b7280";
              const btnStyle: React.CSSProperties = iconStyle === "pill"
                ? { background: col, color: "#fff", borderRadius: 999, border: "none" }
                : iconStyle === "outline"
                ? { background: "transparent", color: col, border: `2px solid ${col}`, borderRadius: radius }
                : { background: col, color: "#fff", borderRadius: radius, border: "none" };
              return (
                <a key={i} href={l.url || "#"} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-block", ...btnStyle, fontSize: fz, fontWeight: 600, padding: `${padV}px ${padH}px`, textDecoration: "none" }}>
                  {l.platform}
                </a>
              );
            }) : (
              <span style={{ fontSize: 12, color: "#6b7280" }}>Add social links in the panel →</span>
            )}
          </div>
        </div>
      );
    }

    case "divider": {
      const style = block.dividerStyle || "solid";
      const color = block.dividerColor || "#333333";
      const thickness = block.dividerThickness || 1;
      const width = block.dividerWidth || 100;
      return (
        <div style={{ padding: "8px 0", textAlign: "center" }}>
          <hr style={{ border: "none", borderTop: `${thickness}px ${style} ${color}`, width: `${width}%`, margin: "0 auto" }} />
        </div>
      );
    }

    case "spacer":
      return (
        <div style={{
          height: block.height || 24,
          background: isSelected
            ? "rgba(62,207,142,0.07)"
            : "repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(255,255,255,0.025) 6px, rgba(255,255,255,0.025) 12px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isSelected
            ? <span style={{ fontSize: 10, color: "#9ca3af", userSelect: "none" }}>↕ {block.height || 24}px spacer — change height in panel</span>
            : <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", userSelect: "none", letterSpacing: "0.12em", fontWeight: 600 }}>SPACER</span>
          }
        </div>
      );

    case "footer": {
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      return (
        <div style={{ padding: `${pV}px ${pH}px`, textAlign: "center", borderTop: "1px solid #2d2d2d", background: block.bgColor || "transparent" }}>
          <EditableText
            value={block.content || ""}
            onChange={v => u({ content: v })}
            tag="p"
            placeholder="Footer text…"
            availableVars={availableVars}
            style={{ fontSize: block.fontSize || 12, color: block.textColor || "#6b7280", margin: 0, fontFamily: ff, display: "block", lineHeight: block.lineHeight || 1.6, fontWeight: block.fontWeight || "normal", fontStyle: block.fontStyle || "normal" }}
          />
        </div>
      );
    }

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

    case "video": {
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      if (!block.videoUrl) return (
        <div style={{ padding: `${pV}px ${pH}px`, textAlign: "center" }}>
          <div style={{ border: "1px dashed #3f3f46", borderRadius: 8, padding: "24px 16px", color: "#6b7280", fontSize: 12, fontFamily: "sans-serif" }}>
            <Video size={20} style={{ display: "block", margin: "0 auto 6px", opacity: 0.4 }} />
            Add a video URL in the properties panel
          </div>
        </div>
      );
      if (block.videoType === "gif") return (
        <div style={{ padding: `${pV}px ${pH}px`, textAlign: "center" }}>
          <img src={block.videoUrl} alt={block.videoCaptionText || "GIF"} style={{ maxWidth: "100%", borderRadius: 8, display: "block", margin: "0 auto" }} />
          {block.videoCaptionText && <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 8 }}>{block.videoCaptionText}</p>}
        </div>
      );
      // YouTube/Vimeo: show iframe embed
      const embedUrl = (() => {
        if (block.videoType === "youtube" || !block.videoType) {
          const id = block.videoUrl?.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
          return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (block.videoType === "vimeo") {
          const id = block.videoUrl?.match(/vimeo\.com\/(\d+)/)?.[1];
          return id ? `https://player.vimeo.com/video/${id}` : null;
        }
        return null;
      })();
      return (
        <div style={{ padding: `${pV}px ${pH}px` }}>
          {embedUrl ? (
            <div style={{ position: "relative", paddingBottom: "56.25%", borderRadius: 8, overflow: "hidden", background: "#000" }}>
              <iframe src={embedUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="video" />
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              {block.videoThumb
                ? <img src={block.videoThumb} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />
                : <div style={{ background: "#1a1a1a", borderRadius: 8, padding: "32px 16px", color: "#6b7280", fontSize: 12, fontFamily: "sans-serif" }}>▶ {block.videoUrl}</div>
              }
            </div>
          )}
          {block.videoCaptionText && <p style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", marginTop: 8 }}>{block.videoCaptionText}</p>}
        </div>
      );
    }

    case "table": {
      const headers = block.tableHeaders ?? ["Col 1", "Col 2"];
      const rows = block.tableRows ?? [];
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;

      const handlePaste = (e: React.ClipboardEvent) => {
        const html = e.clipboardData.getData("text/html");
        const text = e.clipboardData.getData("text/plain");
        const parsed = parseClipboardTable(html, text);
        if (parsed) {
          e.preventDefault();
          u({ tableHeaders: parsed.headers, tableRows: parsed.rows });
        }
      };

      return (
        <div style={{ padding: `${pV}px ${pH}px` }} onPaste={handlePaste}>
          {isSelected && (
            <p style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, fontFamily: "sans-serif", fontStyle: "italic" }}>
              Click cells to edit · Paste CSV/TSV to import from Excel or Google Sheets
            </p>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", background: block.tableBgColor || "#1e1e1e", borderRadius: 8, overflow: "hidden", fontFamily: "-apple-system,sans-serif" }}>
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    contentEditable={isSelected}
                    suppressContentEditableWarning
                    onBlur={e => {
                      const hs = [...headers]; hs[i] = e.currentTarget.textContent ?? ""; u({ tableHeaders: hs });
                    }}
                    style={{ padding: "8px 12px", textAlign: "left", color: block.tableHeaderTextColor || "#3ECF8E", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderBottom: `2px solid ${block.tableBorderColor || "#3f3f46"}`, background: block.tableHeaderBgColor || "transparent", outline: isSelected ? "1px dashed rgba(62,207,142,0.35)" : "none", cursor: isSelected ? "text" : "default" }}
                  >{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 1 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                  {headers.map((_, ci) => (
                    <td
                      key={ci}
                      contentEditable={isSelected}
                      suppressContentEditableWarning
                      onBlur={e => {
                        const rs = rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? (e.currentTarget.textContent ?? "") : c) : r);
                        u({ tableRows: rs });
                      }}
                      style={{ padding: "8px 12px", fontSize: 13, color: block.textColor || "#d1d5db", borderBottom: `1px solid ${block.tableBorderColor || "#3f3f46"}`, outline: isSelected ? "1px dashed rgba(255,255,255,0.08)" : "none", cursor: isSelected ? "text" : "default" }}
                    >{row[ci] || ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "iframe": {
      const pV = block.paddingV ?? 16; const pH = block.paddingH ?? 32;
      const url = block.iframeUrl || "";
      const isYt = url.includes("youtube.com/embed");
      const isVimeo = url.includes("player.vimeo.com");
      const blocked = embedIsBlocked(url);
      const allowAttr = block.iframeAllow
        ?? (isYt ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          : isVimeo ? "autoplay; fullscreen; picture-in-picture"
          : undefined);
      let hostname = "";
      try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      return (
        <div style={{ padding: `${pV}px ${pH}px` }}>
          {!url ? (
            <div style={{ border: "1px dashed #3f3f46", borderRadius: 8, padding: "32px 16px", textAlign: "center", color: "#6b7280", fontSize: 12, fontFamily: "sans-serif" }}>
              <Globe size={20} style={{ display: "block", margin: "0 auto 6px", opacity: 0.4 }} />
              Add an embed URL in the properties panel
            </div>
          ) : blocked ? (
            /* Site blocks iframe embedding — show a preview card instead */
            <div style={{ border: "1px solid #3f3f46", borderRadius: 8, padding: "24px 20px", textAlign: "center", background: "#1a1a1a", fontFamily: "sans-serif" }}>
              <Globe size={18} style={{ display: "block", margin: "0 auto 8px", color: "#3ECF8E", opacity: 0.8 }} />
              <p style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>{block.iframeTitle || hostname}</p>
              <p style={{ color: "#6b7280", fontSize: 11, margin: "0 0 12px" }}>
                {hostname} prevents live preview — email recipients will see a link instead.
              </p>
              <a href={url} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", background: "#3ECF8E", color: "#000", fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 6, textDecoration: "none" }}>
                Open in new tab ↗
              </a>
            </div>
          ) : (
            <iframe
              src={url}
              title={block.iframeTitle || "Embedded content"}
              height={block.iframeHeight || 400}
              {...(allowAttr ? { allow: allowAttr } : {})}
              {...(allowAttr ? { allowFullScreen: true } : { sandbox: block.iframeSandbox || "allow-scripts allow-same-origin allow-forms" })}
              style={{ width: "100%", border: "none", borderRadius: 8, display: "block" }}
            />
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

// ── Block properties panel helpers ───────────────────────────────────────────

const EMAIL_FONT_LIST = CERTIFICATE_FONTS.map(f => ({ value: f.value, label: f.name, category: f.category }));

const ALIGN_OPTIONS = [
  { value: "left",   icon: <AlignLeft  className="w-3 h-3" /> },
  { value: "center", icon: <AlignCenter className="w-3 h-3" /> },
  { value: "right",  icon: <AlignRight className="w-3 h-3" /> },
];

const FONT_SIZE_PRESETS = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48];

const QUICK_COLORS = ["#ffffff","#f8fafc","#e5e7eb","#3ECF8E","#22c55e","#3b82f6","#6366f1","#8b5cf6","#f59e0b","#ef4444","#ec4899","#6b7280","#374151","#111827"];

// ── Collapsible section — supports accordion mode via context ─────────────────

const SectionOpenCtx = React.createContext<{ open: string | null; setOpen: (k: string | null) => void } | null>(null);

function Section({ label, children, defaultOpen = true }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const ctx = React.useContext(SectionOpenCtx);
  const [localOpen, setLocalOpen] = useState(defaultOpen && !ctx);
  const open = ctx ? ctx.open === label : localOpen;
  const toggle = () => {
    if (ctx) ctx.setOpen(ctx.open === label ? null : label);
    else setLocalOpen(v => !v);
  };
  return (
    <div className="border-t border-zinc-800 first:border-t-0">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <p className="text-sm font-bold text-white select-none">{label}</p>
        <ChevronRight className={cn("w-3.5 h-3.5 text-zinc-600 transition-transform duration-150", open && "rotate-90")} />
      </button>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  );
}

// ── NumBox: compact labelled number input ─────────────────────────────────────

function NumBox({ label, value, onChange, unit, min, max, step = 1, className = "", icon }: {
  label?: string; value: number; onChange: (v: number) => void;
  unit?: string; min?: number; max?: number; step?: number; className?: string; icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center bg-zinc-800/80 rounded px-3 gap-2 h-8", className)}>
      {icon && <span className="shrink-0 text-zinc-500">{icon}</span>}
      {label && <span className="text-xs text-zinc-500 shrink-0 select-none">{label}</span>}
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 min-w-0 bg-transparent text-sm text-zinc-200 outline-none"
      />
      {unit && <span className="text-sm text-zinc-500 shrink-0 select-none">{unit}</span>}
    </div>
  );
}

// Label | Pill row layout
const MROW = "flex items-center gap-3";
const MLABEL = "text-sm text-zinc-400 shrink-0 select-none" as const;
const PILL_FULL = "flex items-center bg-zinc-800/80 rounded px-3 gap-2.5 h-8 flex-1 min-w-0" as const;

// ── Background image position + size controls ────────────────────────────────

const BG_POSITIONS = [
  ["top left",    "top center",    "top right"],
  ["center left", "center",        "center right"],
  ["bottom left", "bottom center", "bottom right"],
] as const;

function BgPositionPicker({ position, onPositionChange }: { position?: string; onPositionChange: (p: string) => void }) {
  const cur = position || "center";
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground/70 select-none">Position</label>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {BG_POSITIONS.flat().map(p => (
          <button key={p} type="button" title={p}
            onClick={() => onPositionChange(p)}
            className={cn(
              "h-6 rounded flex items-center justify-center transition-colors border",
              cur === p
                ? "bg-[#3ECF8E] border-transparent text-zinc-900"
                : "border-border/60 text-muted-foreground hover:bg-muted"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-muted-foreground/50 shrink-0 select-none">Custom</span>
        <input
          type="text"
          value={cur}
          onChange={e => onPositionChange(e.target.value)}
          placeholder="50% 20%"
          className="flex-1 text-[10px] bg-card border border-border/60 rounded-md px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 font-mono"
        />
      </div>
    </div>
  );
}

function BgSizeRow({ size, repeat, onSizeChange, onRepeatChange }: {
  size?: string; repeat?: string;
  onSizeChange: (s: string) => void;
  onRepeatChange: (r: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground/70 select-none">Size</label>
        <div className="flex border border-border/60 rounded-md overflow-hidden text-[10px] font-semibold">
          {(["cover", "contain", "auto"] as const).map(s => (
            <button key={s} type="button"
              onClick={() => onSizeChange(s)}
              className={cn("flex-1 h-6 capitalize transition-colors",
                (size || "cover") === s ? "bg-[#3ECF8E] text-white" : "text-muted-foreground hover:bg-muted")}
            >{s}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground/70 select-none">Repeat</label>
        <div className="flex border border-border/60 rounded-md overflow-hidden text-[10px] font-semibold">
          {([["no-repeat","None"],["repeat","Tile"],["repeat-x","X"],["repeat-y","Y"]] as const).map(([v, label]) => (
            <button key={v} type="button"
              onClick={() => onRepeatChange(v)}
              className={cn("flex-1 h-6 transition-colors",
                (repeat || "no-repeat") === v ? "bg-[#3ECF8E] text-white" : "text-muted-foreground hover:bg-muted")}
            >{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MediaUploader: URL tab + file upload tab ──────────────────────────────────

function MediaUploader({
  url, onUrlChange, accept = "image/*",
  placeholder = "https://example.com/image.png",
}: {
  url: string; onUrlChange: (url: string) => void;
  accept?: string; placeholder?: string;
}) {
  const [tab, setTab] = useState<"url" | "upload">("url");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const blobUrl = URL.createObjectURL(file);
    onUrlChange(blobUrl);
    setUploading(true);
    try {
      const permanentUrl = await api.templates.uploadAsset(file);
      URL.revokeObjectURL(blobUrl);
      onUrlChange(permanentUrl);
    } catch {
      // keep blob url as fallback
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex border border-border/60 rounded-md overflow-hidden text-[10px] font-semibold">
        {(["url", "upload"] as const).map(t => (
          <button key={t} type="button"
            onClick={() => setTab(t)}
            className={cn("flex-1 h-6 capitalize transition-colors",
              tab === t ? "bg-[#3ECF8E] text-white" : "text-muted-foreground hover:bg-muted")}
          >{t === "url" ? "URL" : "Upload"}</button>
        ))}
      </div>
      {tab === "url" ? (
        <input value={url} onChange={e => onUrlChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-[10px] font-mono bg-card border border-border/60 rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40" />
      ) : (
        <>
          <input ref={fileRef} type="file" accept={accept} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          {url ? (
            <div className="flex items-center gap-2.5">
              <div className="relative w-14 h-12 rounded border border-border/50 overflow-hidden bg-muted/30 shrink-0">
                <img src={url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                  className="p-1.5 rounded border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50" title="Replace">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => onUrlChange("")}
                  className="p-1.5 rounded border border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors" title="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="border border-dashed border-border/50 rounded-lg p-3 text-center cursor-pointer hover:border-[#3ECF8E]/50 hover:bg-[#3ECF8E]/5 transition-all"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            >
              <Upload className="w-4 h-4 text-muted-foreground/50 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground/60">Click or drag to upload</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Draggable floating colour picker ─────────────────────────────────────────

function FloatingColorPicker({ color, label, initialPos, onClose, onChange }: {
  color: string;
  label: string;
  initialPos: { x: number; y: number };
  onClose: () => void;
  onChange: (c: string) => void;
}) {
  const [pos, setPos] = useState(initialPos);
  const dragOrigin = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin.current) return;
      setPos({ x: dragOrigin.current.px + (e.clientX - dragOrigin.current.mx), y: dragOrigin.current.py + (e.clientY - dragOrigin.current.my) });
    };
    const onUp = () => { dragOrigin.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // slight delay so the open-click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ffffff";

  return (
    <div
      ref={containerRef}
      className="fixed z-[9999] bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden select-none"
      style={{ left: pos.x, top: pos.y, width: 232 }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border/30 cursor-grab active:cursor-grabbing bg-muted/20"
        onMouseDown={e => { e.preventDefault(); dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }; }}
      >
        <div className="flex items-center gap-1.5">
          <GripHorizontal className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
        </div>
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted transition-colors"
          onClick={onClose}
          onMouseDown={e => e.stopPropagation()}
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
      <div className="p-3 cp-compact">
        <HexColorPicker color={safeColor} onChange={onChange} style={{ width: "100%", height: 160 }} />
      </div>
      <div className="px-3 pb-3 pt-0 border-t border-border/30">
        <div className="flex items-center gap-2 py-2">
          <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0 select-none">HEX</span>
          <input
            type="text"
            value={color}
            onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v); }}
            className="flex-1 text-[11px] border border-border rounded px-1.5 py-0.5 font-mono bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 uppercase"
          />
        </div>
        <p className="text-[9px] text-muted-foreground/50 mb-1.5 select-none">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COLORS.map(c => (
            <button
              key={c}
              type="button"
              title={c}
              className="w-5 h-5 rounded-full border-2 border-transparent hover:border-[#3ECF8E]/60 hover:scale-110 transition-all shrink-0"
              style={{ backgroundColor: c }}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });
  const swatchRef = useRef<HTMLButtonElement>(null);

  const displayHex = /^#[0-9a-fA-F]{3,8}$/.test(value) ? value.toUpperCase() : value || "#000000";

  const openPicker = () => {
    if (swatchRef.current) {
      const rect = swatchRef.current.getBoundingClientRect();
      const pickerW = 240;
      const x = Math.max(8, rect.left - pickerW - 8);
      const y = Math.max(8, Math.min(rect.top - 24, window.innerHeight - 360));
      setPickerPos({ x, y });
    }
    setPickerOpen(true);
  };

  return (
    <div className={MROW}>
      <span className={cn(MLABEL, "w-[90px]")}>{label}</span>
      <button
        ref={swatchRef}
        type="button"
        onClick={openPicker}
        className="flex items-center bg-zinc-800 rounded px-3 gap-2.5 h-8 flex-1 hover:bg-zinc-700 transition-colors"
      >
        <div className="w-5 h-5 rounded-[4px] shrink-0 border border-zinc-600" style={{ background: value || "#000000" }} />
        <span className="text-sm text-zinc-200 font-mono uppercase truncate">{displayHex}</span>
      </button>
      {pickerOpen && createPortal(
        <FloatingColorPicker
          color={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
          label={label}
          initialPos={pickerPos}
          onClose={() => setPickerOpen(false)}
          onChange={onChange}
        />,
        document.body
      )}
    </div>
  );
}

// ── Inline color swatch (button only, no label row) ─────────────────────────

function InlineSwatch({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });
  const swatchRef = useRef<HTMLButtonElement>(null);
  const openPicker = () => {
    if (swatchRef.current) {
      const rect = swatchRef.current.getBoundingClientRect();
      const pickerW = 240;
      const x = Math.max(8, rect.left - pickerW - 8);
      const y = Math.max(8, Math.min(rect.top - 24, window.innerHeight - 360));
      setPickerPos({ x, y });
    }
    setPickerOpen(true);
  };
  return (
    <>
      <button ref={swatchRef} type="button" onClick={openPicker}
        className="w-6 h-6 rounded-md border border-border/60 shadow-sm hover:ring-2 hover:ring-[#3ECF8E]/40 transition-all shrink-0"
        style={{ background: value || "#ffffff" }} title={title ?? value} />
      {pickerOpen && createPortal(
        <FloatingColorPicker color={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
          label={title ?? "Color"} initialPos={pickerPos}
          onClose={() => setPickerOpen(false)} onChange={onChange} />,
        document.body
      )}
    </>
  );
}

// ── Font size input with preset dropdown ─────────────────────────────────────

function FontSizeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center bg-background border border-border rounded-md h-7 overflow-hidden">
        <input
          type="number"
          value={Math.round(value)}
          min={8}
          max={72}
          onChange={e => onChange(Math.max(8, Math.min(72, parseInt(e.target.value) || 14)))}
          className="flex-1 min-w-0 bg-transparent text-xs px-2 outline-none text-foreground"
        />
        <span className="text-[9px] text-muted-foreground/50 pr-1 select-none">px</span>
        <button
          type="button"
          className="h-full px-1.5 border-l border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setOpen(v => !v)}
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </div>
      {open && createPortal(
        <div
          className="fixed z-[99999] bg-card border border-border/50 rounded-lg shadow-xl overflow-hidden w-20"
          style={(() => {
            if (!ref.current) return { top: 0, left: 0 };
            const rect = ref.current.getBoundingClientRect();
            const dropH = 180;
            const spaceBelow = window.innerHeight - rect.bottom - 4;
            const top = spaceBelow >= dropH ? rect.bottom + 2 : Math.max(8, rect.top - dropH - 2);
            return { top, left: Math.max(8, rect.right - 80) };
          })()}
        >
          <div className="max-h-44 overflow-y-auto">
            {FONT_SIZE_PRESETS.map(s => (
              <button
                key={s}
                type="button"
                className={cn("w-full text-left px-2.5 py-1 text-xs hover:bg-muted transition-colors", Math.round(value) === s ? "text-[#3ECF8E] font-semibold" : "text-foreground")}
                onClick={() => { onChange(s); setOpen(false); }}
              >
                {s}
              </button>
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
  const [googleFonts, setGoogleFonts] = useState<Array<{ value: string; label: string; category?: string }>>([]);

  useEffect(() => {
    fetch('/api/fonts')
      .then(r => r.ok ? r.json() : null)
      .then((data: { fonts: Array<{ family: string; category?: string }> } | null) => {
        if (data?.fonts?.length) {
          setGoogleFonts(data.fonts.map(f => ({ value: f.family, label: f.family, category: f.category })));
        }
      })
      .catch(() => {});
  }, []);

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

  const allFonts = useMemo(() => {
    const seen = new Set<string>();
    return [...EMAIL_FONT_LIST, ...googleFonts].filter(f => {
      if (seen.has(f.value)) return false;
      seen.add(f.value);
      return true;
    });
  }, [googleFonts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allFonts.filter(f => f.label.toLowerCase().includes(q)) : allFonts;
  }, [search, allFonts]);

  const currentLabel = allFonts.find(f => f.value === value)?.label ?? (value ? value.split(",")[0]! : "System");

  const loadGoogleFont = (family: string) => {
    const id = `gf-${family.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  };

  return (
    <div className="relative" ref={ref}>
      <div className={MROW}>
        <span className={cn(MLABEL, "w-[90px]")}>Font</span>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center justify-between gap-2 bg-zinc-800 rounded px-3 h-8 flex-1 min-w-0 hover:bg-zinc-700 transition-colors"
          style={{ fontFamily: value || "inherit" }}
        >
          <span className="truncate text-sm text-zinc-200">{currentLabel}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
        </button>
      </div>
      {open && createPortal(
        <div
          className="fixed z-99999 bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
          style={(() => {
            if (!ref.current) return { top: 0, left: 0, width: 200, maxHeight: 280 };
            const rect = ref.current.getBoundingClientRect();
            const dropH = 280;
            const spaceBelow = window.innerHeight - rect.bottom - 8;
            const top = spaceBelow >= dropH ? rect.bottom + 4 : Math.max(8, rect.top - dropH - 4);
            return { top, left: Math.max(8, rect.right - 200), width: 200, maxHeight: dropH };
          })()}
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
                onClick={() => { loadGoogleFont(f.value); onChange(f.value); setOpen(false); }}
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

// ── Unified Block Properties Panel ───────────────────────────────────────────

export function BlockPropertiesPanel({
  block, onChange, emailBg, onEmailBgChange,
}: {
  block: EmailBlock | null;
  onChange: (b: EmailBlock) => void;
  emailBg?: EmailBackground;
  onEmailBgChange?: (bg: EmailBackground) => void;
}) {
  if (!block) {
    return (
      <div className="flex flex-col min-h-0">
        <div className="px-5 py-3 border-b border-zinc-800 shrink-0">
          <p className="text-sm font-bold text-white">Canvas</p>
        </div>
        <Section label="Email Background">
          <div className="space-y-3">
            <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-8">
              {(["solid", "gradient", "image"] as const).map(v => (
                <button key={v} type="button"
                  onClick={() => onEmailBgChange?.({ ...emailBg, type: v })}
                  className={cn("flex-1 h-full text-sm capitalize transition-colors",
                    (emailBg?.type || "solid") === v ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}
                >{v}</button>
              ))}
            </div>
            {(!emailBg?.type || emailBg.type === "solid") && (
              <ColorRow label="Background" value={emailBg?.color || "#18181b"} onChange={v => onEmailBgChange?.({ ...emailBg, type: "solid", color: v })} />
            )}
            {emailBg?.type === "gradient" && (
              <>
                <ColorRow label="Start" value={emailBg.color || "#18181b"} onChange={v => onEmailBgChange?.({ ...emailBg, color: v })} />
                <ColorRow label="End" value={emailBg.gradientEnd || "#111111"} onChange={v => onEmailBgChange?.({ ...emailBg, gradientEnd: v })} />
                <div className={MROW}>
                  <span className={cn(MLABEL, "w-[90px]")}>Angle</span>
                  <div className={PILL_FULL}>
                    <input type="number" min={0} max={360} value={emailBg.gradientAngle ?? 135}
                      onChange={e => onEmailBgChange?.({ ...emailBg, gradientAngle: Number(e.target.value) })}
                      className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
                    <span className="text-sm text-zinc-500 shrink-0">°</span>
                  </div>
                </div>
              </>
            )}
            {emailBg?.type === "image" && (
              <>
                <MediaUploader url={emailBg.imageUrl || ""} onUrlChange={v => onEmailBgChange?.({ ...emailBg, imageUrl: v })} />
                {emailBg.imageUrl && (
                  <>
                    <div className="rounded-lg overflow-hidden border border-zinc-800 mt-1">
                      <img src={emailBg.imageUrl} alt="Background preview" className="w-full object-cover" style={{ maxHeight: 140 }} />
                    </div>
                    <BgPositionPicker
                      position={emailBg.imagePosition}
                      onPositionChange={v => onEmailBgChange?.({ ...emailBg, imagePosition: v })}
                    />
                    <BgSizeRow
                      size={emailBg.imageSize}
                      repeat={emailBg.imageRepeat}
                      onSizeChange={v => onEmailBgChange?.({ ...emailBg, imageSize: v as EmailBackground["imageSize"] })}
                      onRepeatChange={v => onEmailBgChange?.({ ...emailBg, imageRepeat: v as EmailBackground["imageRepeat"] })}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </Section>
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <SlidersHorizontal className="w-4 h-4 text-zinc-700" />
          <p className="text-[11px] text-zinc-600 leading-relaxed">Select a block<br/>to edit its properties</p>
        </div>
      </div>
    );
  }

  const u = (patch: Partial<EmailBlock>) => onChange({ ...block, ...patch });
  const { type } = block;

  const INP = "w-full text-sm bg-zinc-800/80 rounded px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40";
  const NUM = "w-16 text-sm bg-zinc-800/80 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 text-right";

  // ── Spacing section (all blocks that have padding) ─────────────────────────
  const hasSpacing = !["cert_image", "divider"].includes(type);
  const spacingSection = hasSpacing ? (
    <Section label="Spacing" defaultOpen={false}>
      {/* Padding — 2×2 grid with direction icons */}
      <div className={MROW}>
        <span className={cn(MLABEL, "w-[90px]")}>Padding</span>
        <span className="text-xs text-zinc-600">Top / Bottom · Left / Right</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumBox
          icon={<svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="12" height="12" rx="1"/><line x1="1" y1="4" x2="13" y2="4"/></svg>}
          value={block.paddingV ?? (type === "header" ? 44 : 16)} onChange={v => u({ paddingV: v })} unit="px" min={0} max={120}
        />
        <NumBox
          icon={<svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="12" height="12" rx="1"/><line x1="4" y1="1" x2="4" y2="13"/></svg>}
          value={block.paddingH ?? 32} onChange={v => u({ paddingH: v })} unit="px" min={0} max={120}
        />
      </div>
      {type === "spacer" && (
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Height</span>
          <div className={PILL_FULL}>
            <input type="number" min={4} max={200} value={block.height ?? 24} onChange={e => u({ height: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">px</span>
          </div>
        </div>
      )}
    </Section>
  ) : null;

  // ── Content section ───────────────────────────────────────────────────────

  const contentSection = (() => {
    if (type === "header") return (
      <Section label="Content">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/70 select-none">Title</label>
          <input value={block.title ?? ""} onChange={e => u({ title: e.target.value })} placeholder="Congratulations, {{recipient_name}}!" className={INP} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/70 select-none">Subtitle</label>
          <input value={block.subtitle ?? ""} onChange={e => u({ subtitle: e.target.value })} placeholder="You've completed {{course_name}}" className={INP} />
        </div>
      </Section>
    );

    if (type === "image") return (
      <Section label="Image">
        <MediaUploader url={block.imageUrl || ""} onUrlChange={v => u({ imageUrl: v })} />
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-500 select-none">Alt text</p>
          <input value={block.imageAlt ?? ""} onChange={e => u({ imageAlt: e.target.value })} placeholder="Descriptive text for screen readers" className={INP} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-500 select-none">Link URL (optional)</p>
          <input value={block.imageLinkUrl ?? ""} onChange={e => u({ imageLinkUrl: e.target.value })} placeholder="https://example.com" className={`${INP} font-mono`} />
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Width</span>
          <div className={PILL_FULL}>
            <input type="number" min={10} max={100} value={block.imageWidth ?? 100} onChange={e => u({ imageWidth: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">%</span>
          </div>
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Corner radius</span>
          <div className={PILL_FULL}>
            <input type="number" min={0} max={60} value={block.imageBorderRadius ?? 8} onChange={e => u({ imageBorderRadius: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">px</span>
          </div>
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Align</span>
          <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-8 flex-1">
            {ALIGN_OPTIONS.map(a => (
              <button key={a.value} type="button" onClick={() => u({ imageAlign: a.value as EmailBlock["imageAlign"] })}
                className={cn("flex-1 h-full flex items-center justify-center transition-colors",
                  (block.imageAlign || "center") === a.value ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}
                title={`Align ${a.value}`}>
                {a.icon}
              </button>
            ))}
          </div>
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Shadow</span>
          <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-8 flex-1">
            {(["none", "soft", "hard"] as const).map(v => (
              <button key={v} type="button" onClick={() => u({ imageShadow: v })}
                className={cn("flex-1 h-full text-xs capitalize transition-colors",
                  (block.imageShadow || "none") === v ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}>
                {v}
              </button>
            ))}
          </div>
        </div>
        {block.imageLinkUrl && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Open in new tab</span>
            <button className="relative rounded-full transition-colors shrink-0"
              style={{ width: 28, height: 14, backgroundColor: block.imageOpenNewTab !== false ? '#3ECF8E' : 'var(--border)' }}
              onClick={() => u({ imageOpenNewTab: block.imageOpenNewTab === false ? true : false })}>
              <span className="absolute bg-white rounded-full shadow-sm transition-all"
                style={{ width: 10, height: 10, top: 2, left: block.imageOpenNewTab !== false ? 'calc(100% - 12px)' : 2 }} />
            </button>
          </div>
        )}
      </Section>
    );

    if (type === "text" || type === "greeting" || type === "footer" || type === "linkedin") {
      const ph: Record<string, string> = {
        text: "We are delighted to inform you…",
        greeting: "Hi {{recipient_name}},",
        footer: "© {{organization_name}} · Powered by Authentix",
        linkedin: "🎓 Share your achievement on LinkedIn and inspire others!",
      };
      return (
        <Section label="Content">
          {/* Quick format strip */}
          <div className="flex items-center gap-0.5 pb-1 border-b border-border/20 mb-1 flex-wrap">
            {[
              { label: "B", title: "Bold",       onClick: () => u({ fontWeight: block.fontWeight === "700" ? "normal" : "700" }),  active: block.fontWeight === "700",  cls: "font-bold" },
              { label: "I", title: "Italic",      onClick: () => u({ fontStyle: block.fontStyle === "italic" ? "normal" : "italic" }), active: block.fontStyle === "italic", cls: "italic" },
            ].map(btn => (
              <button key={btn.label} type="button" title={btn.title} onClick={btn.onClick}
                className={cn("w-7 h-6 text-xs rounded transition-colors", btn.cls, btn.active ? "bg-[#3ECF8E] text-white" : "text-muted-foreground hover:bg-muted")}>
                {btn.label}
              </button>
            ))}
            <div className="w-px h-4 bg-border/40 mx-0.5" />
            {(["left", "center", "right"] as const).map(a => (
              <button key={a} type="button" title={`Align ${a}`} onClick={() => u({ textAlign: a })}
                className={cn("w-7 h-6 flex items-center justify-center rounded transition-colors", block.textAlign === a || (!block.textAlign && a === "left") ? "bg-[#3ECF8E] text-white" : "text-muted-foreground hover:bg-muted")}>
                {a === "left" ? <AlignLeft className="w-3 h-3" /> : a === "center" ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
              </button>
            ))}
            <div className="w-px h-4 bg-border/40 mx-0.5" />
            <div className="flex items-center gap-1">
              <button type="button" title="Decrease size" onClick={() => u({ fontSize: Math.max(8, (block.fontSize || 15) - 1) })}
                className="w-5 h-6 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors">−</button>
              <span className="text-[10px] font-mono text-muted-foreground/60 w-6 text-center">{block.fontSize || 15}</span>
              <button type="button" title="Increase size" onClick={() => u({ fontSize: Math.min(72, (block.fontSize || 15) + 1) })}
                className="w-5 h-6 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors">+</button>
            </div>
            <div className="w-px h-4 bg-border/40 mx-0.5" />
            <InlineSwatch value={block.textColor || "#d1d5db"} onChange={v => u({ textColor: v })} title="Text color" />
          </div>
          <textarea value={block.content ?? ""} onChange={e => u({ content: e.target.value })} rows={type === "text" ? 5 : 3} placeholder={ph[type] ?? ""} className={`${INP} resize-y leading-relaxed`} />
          <p className="text-[9px] text-muted-foreground/40">Use Variables: {"{{recipient_name}}"} {"{{organization_name}}"} etc.</p>
        </Section>
      );
    }

    if (type === "markdown") return (
      <Section label="Content">
        <p className="text-[9px] text-muted-foreground/50 -mt-1">Markdown and HTML supported</p>
        <textarea value={block.content ?? ""} onChange={e => u({ content: e.target.value })} rows={6} placeholder="**Bold**, *italic*, tables, links…" className={`${INP} resize-y font-mono leading-relaxed`} />
      </Section>
    );

    if (type === "qr_code") return (
      <Section label="Content">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/70 select-none">Caption</label>
          <input value={block.content ?? ""} onChange={e => u({ content: e.target.value })} placeholder="Scan to verify certificate authenticity" className={INP} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/70 select-none">QR URL (blank = auto)</label>
          <input value={block.qrUrl ?? ""} onChange={e => u({ qrUrl: e.target.value })} placeholder="{{verification_url}}" className={`${INP} font-mono`} />
        </div>
        <p className="text-[9px] text-muted-foreground/40 leading-relaxed">The QR code encodes the recipient's verification URL when sent.</p>
      </Section>
    );

    if (type === "details_box") {
      const rows = block.detailRows ?? [];
      return (
        <Section label="Content">
          <p className="text-[9px] text-muted-foreground/50 -mt-1">Each row: label → value (supports variables)</p>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={row.label} onChange={e => { const r = [...rows]; r[i] = { ...r[i]!, label: e.target.value }; u({ detailRows: r }); }} placeholder="Label" className="w-20 text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 shrink-0" />
              <span className="text-muted-foreground/40 text-xs">→</span>
              <input value={row.value} onChange={e => { const r = [...rows]; r[i] = { ...r[i]!, value: e.target.value }; u({ detailRows: r }); }} placeholder="{{variable}}" className="flex-1 text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 font-mono min-w-0" />
              <button type="button" onClick={() => u({ detailRows: rows.filter((_, j) => j !== i) })} className="text-destructive/50 hover:text-destructive shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => u({ detailRows: [...rows, { label: "", value: "" }] })} className="flex items-center gap-1 text-xs text-[#3ECF8E] font-medium hover:text-[#34b87a]">
            <Plus className="w-3 h-3" /> Add Row
          </button>
        </Section>
      );
    }

    if (type === "cta_button") return (
      <Section label="Button">
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-500 select-none">Label</p>
          <input value={block.btnLabel ?? ""} onChange={e => u({ btnLabel: e.target.value })} placeholder="View & Verify Certificate" className={INP} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-500 select-none">URL</p>
          <input value={block.btnUrl ?? ""} onChange={e => u({ btnUrl: e.target.value })} placeholder="{{verification_url}}" className={`${INP} font-mono`} />
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Width</span>
          <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-8 flex-1">
            {(["auto", "full"] as const).map(v => (
              <button key={v} type="button" onClick={() => u({ btnWidth: v })}
                className={cn("flex-1 h-full text-sm capitalize transition-colors",
                  (block.btnWidth || "auto") === v ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Padding</span>
          <span className="text-xs text-zinc-600">H · V</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumBox value={block.btnPaddingH ?? 32} onChange={v => u({ btnPaddingH: v })} unit="px" min={4} max={80} label="H" />
          <NumBox value={block.btnPaddingV ?? 13} onChange={v => u({ btnPaddingV: v })} unit="px" min={4} max={40} label="V" />
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Corner radius</span>
          <div className={PILL_FULL}>
            <input type="number" min={0} max={40} value={block.btnRadius ?? 8} onChange={e => u({ btnRadius: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">px</span>
          </div>
        </div>
      </Section>
    );

    if (type === "divider") return (
      <Section label="Divider">
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Style</span>
          <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-8 flex-1">
            {(["solid", "dashed", "dotted"] as const).map(v => (
              <button key={v} type="button" onClick={() => u({ dividerStyle: v })}
                className={cn("flex-1 h-full text-sm capitalize transition-colors",
                  (block.dividerStyle || "solid") === v ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Thickness</span>
          <div className={PILL_FULL}>
            <input type="number" min={1} max={8} value={block.dividerThickness ?? 1} onChange={e => u({ dividerThickness: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">px</span>
          </div>
        </div>
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Width</span>
          <div className={PILL_FULL}>
            <input type="number" min={10} max={100} value={block.dividerWidth ?? 100} onChange={e => u({ dividerWidth: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">%</span>
          </div>
        </div>
        <ColorRow label="Color" value={block.dividerColor || "#333333"} onChange={v => u({ dividerColor: v })} />
      </Section>
    );

    if (type === "spacer") return (
      <Section label="Spacer">
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/70">Height</span>
          <div className="flex items-center gap-1.5">
            <input type="number" min={4} max={200} value={block.height ?? 24} onChange={e => u({ height: Number(e.target.value) })} className={NUM} />
            <span className="text-[9px] text-muted-foreground/50">px</span>
          </div>
        </div>
      </Section>
    );

    if (type === "two_column") return (
      <Section label="Content">
        <p className="text-[9px] text-muted-foreground/50 -mt-1">Markdown supported in both columns</p>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/70 select-none">Left column</label>
          <textarea value={block.leftContent ?? ""} onChange={e => u({ leftContent: e.target.value })} rows={4} placeholder="Left column…" className={`${INP} resize-y font-mono leading-relaxed`} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/70 select-none">Right column</label>
          <textarea value={block.rightContent ?? ""} onChange={e => u({ rightContent: e.target.value })} rows={4} placeholder="Right column…" className={`${INP} resize-y font-mono leading-relaxed`} />
        </div>
      </Section>
    );

    if (type === "social") {
      const PLATFORMS = ["LinkedIn", "X", "Twitter", "Instagram", "Facebook", "YouTube", "GitHub", "Website"];
      const links = block.socialLinks ?? [];
      return (
        <Section label="Social Links">
          <div className="grid grid-cols-3 gap-1.5 pb-1">
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 select-none">Align</p>
              <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-7">
                {(["left", "center", "right"] as const).map(a => (
                  <button key={a} type="button" onClick={() => u({ socialAlign: a })}
                    className={cn("flex-1 h-full flex items-center justify-center transition-colors",
                      (block.socialAlign || "center") === a ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}>
                    {a === "left" ? <AlignLeft className="w-2.5 h-2.5" /> : a === "center" ? <AlignCenter className="w-2.5 h-2.5" /> : <AlignRight className="w-2.5 h-2.5" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 select-none">Size</p>
              <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-7">
                {(["sm", "md", "lg"] as const).map(s => (
                  <button key={s} type="button" onClick={() => u({ socialIconSize: s })}
                    className={cn("flex-1 h-full text-[9px] font-bold uppercase transition-colors",
                      (block.socialIconSize || "md") === s ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 select-none">Style</p>
              <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-7">
                {(["button", "pill", "outline"] as const).map(s => (
                  <button key={s} type="button" onClick={() => u({ socialIconStyle: s })}
                    className={cn("flex-1 h-full text-[8px] font-bold capitalize transition-colors",
                      (block.socialIconStyle || "button") === s ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-2 space-y-2">
            {links.map((l, i) => (
              <div key={i} className="space-y-1 p-2 rounded-lg border border-border/40 bg-muted/10">
                <div className="flex items-center gap-1.5">
                  <select value={l.platform} onChange={e => { const s = [...links]; s[i] = { ...s[i]!, platform: e.target.value }; u({ socialLinks: s }); }}
                    className="flex-1 text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground focus:outline-none">
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button type="button" onClick={() => u({ socialLinks: links.filter((_, j) => j !== i) })} className="text-destructive/50 hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <input value={l.url} onChange={e => { const s = [...links]; s[i] = { ...s[i]!, url: e.target.value }; u({ socialLinks: s }); }}
                  placeholder="https://linkedin.com/in/…" className={`${INP} font-mono text-[10px]`} />
              </div>
            ))}
            <button type="button" onClick={() => u({ socialLinks: [...links, { platform: "LinkedIn", url: "" }] })} className="flex items-center gap-1 text-xs text-[#3ECF8E] font-medium hover:text-[#34b87a]">
              <Plus className="w-3 h-3" /> Add Platform
            </button>
          </div>
        </Section>
      );
    }

    if (type === "video") {
      return (
        <Section label="Video">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/70 select-none">Type</label>
            <div className="grid grid-cols-4 gap-1">
              {(["youtube", "vimeo", "gif", "direct"] as const).map(v => (
                <button key={v} type="button"
                  onClick={() => u({ videoType: v })}
                  className={cn("h-7 text-[9px] font-semibold rounded border capitalize transition-colors",
                    (block.videoType || "youtube") === v
                      ? "bg-[#3ECF8E] text-white border-transparent"
                      : "border-border text-muted-foreground hover:bg-muted")}
                >{v === "direct" ? "File URL" : v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>
          </div>
          {block.videoType === "gif" ? (
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground/70 select-none">GIF source</label>
              <MediaUploader url={block.videoUrl || ""} onUrlChange={v => u({ videoUrl: v })} accept="image/gif,image/*" placeholder="https://example.com/animation.gif" />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground/70 select-none">Video URL</label>
                <input value={block.videoUrl || ""} onChange={e => u({ videoUrl: e.target.value })}
                  placeholder={(block.videoType === "youtube" || !block.videoType) ? "https://youtube.com/watch?v=..." : block.videoType === "vimeo" ? "https://vimeo.com/..." : "https://example.com/video.mp4"}
                  className={`${INP} font-mono text-[10px]`} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground/70 select-none">Thumbnail (optional)</label>
                <MediaUploader url={block.videoThumb || ""} onUrlChange={v => u({ videoThumb: v })} placeholder="https://example.com/thumb.jpg" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/70 select-none">Caption</label>
            <input value={block.videoCaptionText || ""} onChange={e => u({ videoCaptionText: e.target.value })}
              placeholder="Click to watch →" className={INP} />
          </div>
        </Section>
      );
    }

    if (type === "table") {
      const headers = block.tableHeaders ?? ["Column 1", "Column 2", "Column 3"];
      const rows = block.tableRows ?? [];
      return (
        <Section label="Table">
          <p className="text-[9px] text-muted-foreground/50 -mt-1">Click cells on canvas to edit · Paste CSV/TSV from Excel or Google Sheets to import</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground/70">Columns</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { if (headers.length <= 1) return; u({ tableHeaders: headers.slice(0, -1), tableRows: rows.map(r => r.slice(0, -1)) }); }}
                className="w-6 h-6 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:bg-muted text-sm font-bold">−</button>
              <span className="text-xs font-mono w-4 text-center">{headers.length}</span>
              <button type="button" onClick={() => u({ tableHeaders: [...headers, `Col ${headers.length + 1}`], tableRows: rows.map(r => [...r, ""]) })}
                className="w-6 h-6 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:bg-muted text-sm font-bold">+</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground/70">Rows</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { if (rows.length <= 0) return; u({ tableRows: rows.slice(0, -1) }); }}
                className="w-6 h-6 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:bg-muted text-sm font-bold">−</button>
              <span className="text-xs font-mono w-4 text-center">{rows.length}</span>
              <button type="button" onClick={() => u({ tableRows: [...rows, new Array(headers.length).fill("")] })}
                className="w-6 h-6 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:bg-muted text-sm font-bold">+</button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/70 select-none">Column headers</label>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(headers.length, 2)}, 1fr)` }}>
              {headers.map((h, i) => (
                <input key={i} value={h}
                  onChange={e => { const hs = [...headers]; hs[i] = e.target.value; u({ tableHeaders: hs }); }}
                  className={`${INP} text-[10px]`} />
              ))}
            </div>
          </div>
          <div className="space-y-2 pt-1 border-t border-border/20">
            <ColorRow label="Header text" value={block.tableHeaderTextColor || "#3ECF8E"} onChange={v => u({ tableHeaderTextColor: v })} />
            <ColorRow label="Row text" value={block.textColor || "#d1d5db"} onChange={v => u({ textColor: v })} />
            <ColorRow label="Background" value={block.tableBgColor || "#1e1e1e"} onChange={v => u({ tableBgColor: v })} />
            <ColorRow label="Border" value={block.tableBorderColor || "#3f3f46"} onChange={v => u({ tableBorderColor: v })} />
          </div>
        </Section>
      );
    }

    if (type === "iframe") {
      const isBlocked = embedIsBlocked(block.iframeUrl || "");
      return (
        <Section label="Embed">
          <p className="text-[9px] text-muted-foreground/50 -mt-1">Paste a URL or the full embed code from YouTube, Calendly, Google Maps, etc.</p>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/70 select-none">URL or embed code</label>
            <textarea
              rows={3}
              value={block.iframeUrl || ""}
              placeholder={"https://calendly.com/…\n— or paste YouTube/Vimeo <iframe> code —"}
              className={`${INP} resize-none font-mono text-[10px] leading-relaxed`}
              onChange={e => {
                const parsed = parseEmbedInput(e.target.value);
                u({
                  iframeUrl: parsed.url,
                  ...(parsed.height ? { iframeHeight: parsed.height } : {}),
                  ...(parsed.title ? { iframeTitle: parsed.title } : {}),
                  ...(parsed.allow !== undefined ? { iframeAllow: parsed.allow } : {}),
                });
              }}
            />
          </div>
          {block.iframeUrl && block.iframeUrl.startsWith("http") && !isBlocked && (
            <p className="text-[9px] text-[#3ECF8E]/70 font-mono truncate">↳ {block.iframeUrl}</p>
          )}
          {isBlocked && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-yellow-500/80">Live preview not available</p>
              <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
                LinkedIn, Instagram, Facebook, X, and Twitter block iframe embedding — it's their policy, not a bug.
                Recipients will see the fallback link below instead. Use the Social block for profile links.
              </p>
            </div>
          )}
          <NumBox label="Height" value={block.iframeHeight ?? 400} onChange={v => u({ iframeHeight: v })} unit="px" min={100} max={1200} />
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/70 select-none">Title (accessibility)</label>
            <input value={block.iframeTitle || ""} onChange={e => u({ iframeTitle: e.target.value })} placeholder="Embedded content" className={INP} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/70 select-none">Fallback link text (shown in email)</label>
            <input value={block.iframeFallbackText || ""} onChange={e => u({ iframeFallbackText: e.target.value })} placeholder="View this content online →" className={INP} />
          </div>
        </Section>
      );
    }

    return null;
  })();

  // ── Colors section ────────────────────────────────────────────────────────

  const showColors = !["cert_image"].includes(type);
  const colorsSection = showColors ? (
    <Section label="Colors">
      {/* Header: background type picker */}
      {type === "header" && (
        <div className="space-y-3">
          <div className={MROW}>
            <span className={cn(MLABEL, "w-[90px]")}>Bg type</span>
            <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-8 flex-1">
              {(["gradient", "solid", "image"] as const).map(v => (
                <button key={v} type="button" onClick={() => u({ bgType: v })}
                  className={cn("flex-1 h-full text-sm capitalize transition-colors",
                    (block.bgType || "gradient") === v ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {(block.bgType === "gradient" || !block.bgType) && (
            <div className="space-y-3">
              <ColorRow label="Start color" value={block.bgColor || "#3ECF8E"} onChange={v => u({ bgColor: v })} />
              <ColorRow label="End color" value={block.gradientEnd || darken(block.bgColor || "#3ECF8E")} onChange={v => u({ gradientEnd: v })} />
              <div className={MROW}>
                <span className={cn(MLABEL, "w-[90px]")}>Angle</span>
                <div className={PILL_FULL}>
                  <input type="number" min={0} max={360} value={block.gradientAngle ?? 135} onChange={e => u({ gradientAngle: Number(e.target.value) })}
                    className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
                  <span className="text-sm text-zinc-500 shrink-0">°</span>
                </div>
              </div>
            </div>
          )}
          {block.bgType === "solid" && (
            <ColorRow label="Background" value={block.bgColor || "#3ECF8E"} onChange={v => u({ bgColor: v })} />
          )}
          {block.bgType === "image" && (
            <>
              <MediaUploader url={block.bgImage || ""} onUrlChange={v => u({ bgImage: v })} placeholder="https://example.com/banner.jpg" />
              {block.bgImage && (
                <>
                  <BgPositionPicker
                    position={block.bgImagePosition}
                    onPositionChange={v => u({ bgImagePosition: v })}
                  />
                  <BgSizeRow
                    size={block.bgImageSize}
                    repeat={block.bgImageRepeat}
                    onSizeChange={v => u({ bgImageSize: v as EmailBlock["bgImageSize"] })}
                    onRepeatChange={v => u({ bgImageRepeat: v as EmailBlock["bgImageRepeat"] })}
                  />
                </>
              )}
            </>
          )}
          <ColorRow label="Title color" value={block.titleColor || "#ffffff"} onChange={v => u({ titleColor: v })} />
          <ColorRow label="Subtitle color" value={block.subtitleColor || "rgba(255,255,255,0.85)"} onChange={v => u({ subtitleColor: v })} />
        </div>
      )}
      {/* Block background — available for all non-cert blocks */}
      {!["cert_image", "header"].includes(type) && (
        <ColorRow label="Block background" value={block.bgColor || "transparent"} onChange={v => u({ bgColor: v })} />
      )}
      {/* Text colors */}
      {["text", "greeting", "footer", "linkedin", "markdown"].includes(type) && (
        <ColorRow label="Text color" value={block.textColor || (type === "footer" || type === "linkedin" ? "#6b7280" : type === "greeting" ? "#e5e7eb" : "#d1d5db")} onChange={v => u({ textColor: v })} />
      )}
      {type === "cta_button" && (
        <>
          <ColorRow label="Button color" value={block.btnColor || "#3ECF8E"} onChange={v => u({ btnColor: v })} />
          <ColorRow label="Button text" value={block.btnTextColor || "#ffffff"} onChange={v => u({ btnTextColor: v })} />
        </>
      )}
      {type === "details_box" && (
        <>
          <ColorRow label="Box background" value={block.detailBgColor || "#1a1a1a"} onChange={v => u({ detailBgColor: v })} />
          <ColorRow label="Values color" value={block.detailTextColor || "#3ECF8E"} onChange={v => u({ detailTextColor: v })} />
        </>
      )}
      {type === "two_column" && (
        <>
          <ColorRow label="Left text" value={block.leftTextColor || "#d1d5db"} onChange={v => u({ leftTextColor: v })} />
          <ColorRow label="Right text" value={block.rightTextColor || "#d1d5db"} onChange={v => u({ rightTextColor: v })} />
        </>
      )}
      {type === "qr_code" && (
        <ColorRow label="QR dot color" value={block.textColor || "#ffffff"} onChange={v => u({ textColor: v })} />
      )}
    </Section>
  ) : null;

  // ── Typography section ────────────────────────────────────────────────────

  const hasTypo = ["header", "text", "greeting", "footer", "linkedin", "cta_button", "two_column", "markdown", "image"].includes(type);
  const typoOpenByDefault = ["text", "greeting", "header", "markdown", "footer"].includes(type);
  const typoSection = hasTypo ? (
    <Section label="Typography" defaultOpen={typoOpenByDefault}>
      {/* Font family */}
      {!["image"].includes(type) && (
        <FontPickerControl value={block.fontFamily || ""} onChange={v => u({ fontFamily: v })} />
      )}
      {/* Font size */}
      {["header", "text", "greeting", "footer", "cta_button", "markdown"].includes(type) && (
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Size</span>
          <div className={PILL_FULL}>
            <input type="number" min={8} max={96}
              value={block.fontSize || (type === "header" ? 28 : type === "greeting" ? 16 : type === "footer" ? 12 : 15)}
              onChange={e => u({ fontSize: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">px</span>
          </div>
        </div>
      )}
      {/* Font weight + italic */}
      {["header", "text", "greeting", "footer", "cta_button", "linkedin"].includes(type) && (
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Weight</span>
          <div className="relative flex-1">
            <select
              value={type === "cta_button" ? (block.btnFontWeight || "600") : (block.fontWeight || "normal")}
              onChange={e => u({ fontWeight: e.target.value, ...(type === "cta_button" ? { btnFontWeight: e.target.value } : {}) })}
              className="w-full h-8 bg-zinc-800 rounded px-3 text-sm text-zinc-200 outline-none appearance-none cursor-pointer"
            >
              {[["normal","Regular"],["500","Medium"],["600","Semi Bold"],["700","Bold"],["800","Extra Bold"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>
          {type !== "cta_button" && (
            <button
              type="button"
              title="Italic"
              onClick={() => u({ fontStyle: block.fontStyle === "italic" ? "normal" : "italic" })}
              className={cn("w-8 h-8 shrink-0 flex items-center justify-center rounded border transition-colors italic font-semibold text-sm",
                block.fontStyle === "italic"
                  ? "bg-[#3ECF8E] text-white border-transparent"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200 bg-zinc-800")}
            >
              I
            </button>
          )}
        </div>
      )}
      {/* Alignment */}
      {["text", "greeting", "header", "footer", "linkedin", "cta_button"].includes(type) && (
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Align</span>
          <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-8 flex-1">
            {ALIGN_OPTIONS.map(a => (
              <button key={a.value} type="button" onClick={() => u({ textAlign: a.value as EmailBlock["textAlign"] })}
                className={cn("flex-1 h-full flex items-center justify-center transition-colors",
                  (block.textAlign || "left") === a.value ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}
                title={`Align ${a.value}`}>
                {a.icon}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Line height */}
      {["text", "greeting", "footer", "markdown"].includes(type) && (
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Height</span>
          <div className={PILL_FULL}>
            <input type="number" min={1} max={3} step={0.1} value={block.lineHeight ?? 1.7}
              onChange={e => u({ lineHeight: parseFloat(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">×</span>
          </div>
        </div>
      )}
      {/* Letter spacing */}
      {["header", "text", "greeting", "footer"].includes(type) && (
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Spacing</span>
          <div className={PILL_FULL}>
            <input type="number" min={-2} max={10} step={0.5} value={block.letterSpacing ?? 0}
              onChange={e => u({ letterSpacing: parseFloat(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">px</span>
          </div>
        </div>
      )}
    </Section>
  ) : null;

  const showBorder = !["cert_image", "spacer", "divider"].includes(type);
  const borderSection = showBorder ? (
    <Section label="Border" defaultOpen={false}>
      <div className="space-y-3">
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Thickness</span>
          <div className={PILL_FULL}>
            <input type="number" min={0} max={20} value={block.borderWidth ?? 0}
              onChange={e => u({ borderWidth: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">px</span>
          </div>
        </div>
        {(block.borderWidth ?? 0) > 0 && (
          <ColorRow label="Border color" value={block.borderColor || "#3f3f46"} onChange={v => u({ borderColor: v })} />
        )}
        <div className={MROW}>
          <span className={cn(MLABEL, "w-[90px]")}>Radius</span>
          <div className={PILL_FULL}>
            <input type="number" min={0} max={40} value={block.borderRadius ?? 0}
              onChange={e => u({ borderRadius: Number(e.target.value) })}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none" />
            <span className="text-sm text-zinc-500 shrink-0">px</span>
          </div>
        </div>
      </div>
    </Section>
  ) : null;

  const defaultOpenSection = (() => {
    switch (type) {
      case "image": return "Image";
      case "cta_button": return "Button";
      case "social": return "Social Links";
      case "video": return "Video";
      case "iframe": return "Embed";
      case "table": return "Table";
      case "divider": return "Divider";
      case "spacer": return "Spacer";
      case "two_column": return "Content";
      default: return "Content";
    }
  })();
  const [openSection, setOpenSection] = useState<string | null>(defaultOpenSection);

  return (
    <SectionOpenCtx.Provider value={{ open: openSection, setOpen: setOpenSection }}>
    <div className="flex flex-col min-h-0">
      {/* Block type badge */}
      <div className="px-5 py-3 border-b border-zinc-800 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#3ECF8E]/80 bg-[#3ECF8E]/10 px-2.5 py-1 rounded-full select-none">
          {BLOCK_LABELS[block.type]}
        </span>
      </div>
      {/* Hide on Mobile toggle */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-800">
        <span className="text-sm text-zinc-400">Hide on Mobile</span>
        <button
          className="relative rounded-full transition-colors shrink-0"
          style={{ width: '28px', height: '14px', backgroundColor: block.hideOnMobile ? '#3ECF8E' : 'var(--border)' }}
          onClick={() => u({ hideOnMobile: !block.hideOnMobile })}
        >
          <span className="absolute bg-white rounded-full shadow-sm transition-all"
            style={{ width: '10px', height: '10px', top: '2px', left: block.hideOnMobile ? 'calc(100% - 12px)' : '2px' }} />
        </button>
      </div>
      {contentSection}
      {typoSection}
      {colorsSection}
      {borderSection}
      {spacingSection}
      {/* Block Border section */}
      <Section label="Block Border">
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className={`flex items-center ${PILL_FULL} overflow-hidden`} style={{ height: '28px' }}>
              <span className="text-[10px] text-muted-foreground/60 shrink-0 px-2">Top</span>
              <input type="number" min={0} max={8} value={block.blockBorderTop ?? 0}
                onChange={e => u({ blockBorderTop: Number(e.target.value) })}
                className="flex-1 bg-transparent text-xs text-zinc-200 outline-none" />
              <span className="text-[10px] text-zinc-500 pr-1.5">px</span>
            </div>
            <div className={`flex items-center ${PILL_FULL} overflow-hidden`} style={{ height: '28px' }}>
              <span className="text-[10px] text-muted-foreground/60 shrink-0 px-2">Bottom</span>
              <input type="number" min={0} max={8} value={block.blockBorderBottom ?? 0}
                onChange={e => u({ blockBorderBottom: Number(e.target.value) })}
                className="flex-1 bg-transparent text-xs text-zinc-200 outline-none" />
              <span className="text-[10px] text-zinc-500 pr-1.5">px</span>
            </div>
          </div>
          {(block.blockBorderTop || block.blockBorderBottom) ? (
            <ColorRow label="Color" value={block.blockBorderColor || '#3f3f46'} onChange={v => u({ blockBorderColor: v })} />
          ) : null}
        </div>
      </Section>
      {/* Email background — always accessible even when a block is selected */}
      {onEmailBgChange && (
        <Section label="Email Background" defaultOpen={false}>
          <div className="space-y-3">
            <div className="flex items-center bg-zinc-800 rounded overflow-hidden h-8">
              {(["solid", "gradient", "image"] as const).map(v => (
                <button key={v} type="button"
                  onClick={() => onEmailBgChange({ ...emailBg, type: v })}
                  className={cn("flex-1 h-full text-sm capitalize transition-colors",
                    (emailBg?.type || "solid") === v ? "bg-[#3ECF8E] text-white" : "text-zinc-400 hover:text-zinc-200")}
                >{v}</button>
              ))}
            </div>
            {(!emailBg?.type || emailBg.type === "solid") && (
              <ColorRow label="Background" value={emailBg?.color || "#18181b"} onChange={v => onEmailBgChange({ ...emailBg, type: "solid", color: v })} />
            )}
            {emailBg?.type === "gradient" && (
              <>
                <ColorRow label="Start" value={emailBg.color || "#18181b"} onChange={v => onEmailBgChange({ ...emailBg, color: v })} />
                <ColorRow label="End" value={emailBg.gradientEnd || "#111111"} onChange={v => onEmailBgChange({ ...emailBg, gradientEnd: v })} />
                <NumBox label="Angle" value={emailBg.gradientAngle ?? 135} onChange={v => onEmailBgChange({ ...emailBg, gradientAngle: v })} unit="°" min={0} max={360} />
              </>
            )}
            {emailBg?.type === "image" && (
              <>
                <MediaUploader url={emailBg.imageUrl || ""} onUrlChange={v => onEmailBgChange({ ...emailBg, imageUrl: v })} />
                {emailBg.imageUrl && (
                  <>
                    <div className="rounded-lg overflow-hidden border border-border/30">
                      <img src={emailBg.imageUrl} alt="" className="w-full object-cover" style={{ maxHeight: 120 }} />
                    </div>
                    <BgPositionPicker position={emailBg.imagePosition} onPositionChange={v => onEmailBgChange({ ...emailBg, imagePosition: v })} />
                    <BgSizeRow
                      size={emailBg.imageSize} repeat={emailBg.imageRepeat}
                      onSizeChange={v => onEmailBgChange({ ...emailBg, imageSize: v as EmailBackground["imageSize"] })}
                      onRepeatChange={v => onEmailBgChange({ ...emailBg, imageRepeat: v as EmailBackground["imageRepeat"] })}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </Section>
      )}
    </div>
    </SectionOpenCtx.Provider>
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
  const [isNew, setIsNew] = useState(true);
  const [resizing, setResizing] = useState(false);
  const [resizeLabel, setResizeLabel] = useState<string | null>(null);
  const resizeRef = useRef<{ startY: number; startVal: number; prop: "paddingV" | "height" } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setIsNew(false), 220);
    return () => clearTimeout(t);
  }, []);

  // Global mouse move/up for resize drag
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { startY, startVal, prop } = resizeRef.current;
      const delta = Math.round((e.clientY - startY) / 2);
      const next = Math.max(0, Math.min(200, startVal + delta));
      onChange({ ...block, [prop]: next });
      setResizeLabel(`${prop === "height" ? "Height" : "Padding"}: ${next}px`);
    };
    const onUp = () => { setResizing(false); setResizeLabel(null); resizeRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isSpacer = block.type === "spacer";
    const prop = isSpacer ? "height" : "paddingV";
    const startVal = isSpacer ? (block.height ?? 24) : (block.paddingV ?? (block.type === "header" ? 44 : 16));
    resizeRef.current = { startY: e.clientY, startVal, prop };
    setResizing(true);
  };

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
      className={cn("relative group", isDragging && "z-50", isNew && "block-enter")}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* Block type badge — outside overflow-hidden so it's always visible */}
      {isSelected && (
        <div className="absolute top-1.5 left-2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-900/85 backdrop-blur-sm border border-[#3ECF8E]/40 text-[8px] font-bold uppercase tracking-widest text-[#3ECF8E] pointer-events-none select-none shadow-sm">
          {BLOCK_LABELS[block.type]}
        </div>
      )}

      {/* Floating controls — outside overflow-hidden so never clipped on small blocks */}
      <div className={cn(
        "absolute -top-0 right-1.5 z-30 flex items-center gap-0.5 px-1 py-0.5 rounded-b-md bg-zinc-900/90 border border-t-0 border-zinc-700/70 shadow-sm transition-opacity pointer-events-auto",
        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        <button type="button" onClick={e => { e.stopPropagation(); onDuplicate(); }} className="p-0.5 text-zinc-500 hover:text-[#3ECF8E] transition-colors" title="Duplicate (⌘D)">
          <Copy className="w-3 h-3" />
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }} className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors" title="Delete (⌫)">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Card — full-width, Figma-style selection ring */}
      <div
        className={cn(
          "relative overflow-hidden transition-all duration-100",
          isSelected
            ? "outline outline-2 outline-[#3ECF8E] shadow-[0_0_0_4px_rgba(62,207,142,0.12)]"
            : "outline outline-0 outline-transparent hover:outline hover:outline-2 hover:outline-[#3ECF8E]/50",
        )}
        style={{
          border: (block.borderWidth ?? 0) > 0 ? `${block.borderWidth}px solid ${block.borderColor || '#3f3f46'}` : undefined,
          borderRadius: (block.borderRadius ?? 0) > 0 ? `${block.borderRadius}px` : undefined,
        }}
      >
        {/* Drag handle — slim left edge overlay, visible on hover */}
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
          title="Drag to reorder"
        >
          <GripVertical className="w-3 h-3 text-zinc-300 drop-shadow-sm" />
        </div>

        {/* Selection overlay — intercepts single click to select without entering edit mode */}
        {!isSelected && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
          />
        )}

        {/* Block content */}
        <BlockLiveView
          block={block}
          isSelected={isSelected}
          onChange={onChange}
          availableVars={availableVars}
        />

        {/* Resize handle — bottom edge, drag to change paddingV (or height for spacer) */}
        {block.type !== "cert_image" && (
          <div
            onMouseDown={startResize}
            className={cn(
              "absolute bottom-0 left-0 right-0 h-2.5 flex items-end justify-center pb-0.5 cursor-ns-resize z-20 transition-opacity select-none",
              resizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            title="Drag to resize block"
          >
            <div className={cn(
              "w-10 h-1 rounded-full transition-colors",
              resizing ? "bg-[#3ECF8E]" : "bg-zinc-500/50 hover:bg-[#3ECF8E]/70"
            )} />
          </div>
        )}

        {/* Resize tooltip */}
        {resizing && resizeLabel && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[10px] font-mono text-zinc-200 pointer-events-none whitespace-nowrap shadow-lg">
            {resizeLabel}
          </div>
        )}
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

export interface SenderOption {
  name: string;
  email: string;
  isDefault?: boolean;
}

export interface EmailBlockBuilderProps {
  blocks: EmailBlock[];
  selectedId: string | null;
  subject?: string;
  senderName?: string;
  /** Available configured senders from integrations — if provided, renders a select instead of free text */
  senderOptions?: SenderOption[];
  availableVars?: string[];
  /** "cert" = cert delivery editor, "broadcast" = broadcast email editor */
  context?: "cert" | "broadcast";
  emailBg?: EmailBackground;
  onEmailBgChange?: (bg: EmailBackground) => void;
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
  senderOptions,
  availableVars = [],
  context = "cert",
  emailBg,
  onEmailBgChange: _onEmailBgChange,
  onChange,
  onSelect,
  onStartFresh,
  onSubjectChange,
  onSenderNameChange,
  onAddBlock,
}: EmailBlockBuilderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertPickerAfterId, setInsertPickerAfterId] = useState<string | null>(null);
  const [insertPickerPos, setInsertPickerPos] = useState({ x: 0, y: 0 });
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

  const openInsertPicker = (afterId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pickerW = 288;
    const pickerH = 220;
    let x = rect.left + rect.width / 2 - pickerW / 2;
    let y = rect.bottom + 6;
    x = Math.max(8, Math.min(x, window.innerWidth - pickerW - 8));
    if (y + pickerH > window.innerHeight - 8) y = rect.top - pickerH - 6;
    setInsertPickerPos({ x, y });
    setInsertPickerAfterId(afterId);
  };

  const doInsertBlock = (type: BlockType) => {
    if (insertPickerAfterId === null) return;
    const b = defaultBlock(type);
    const idx = blocks.findIndex(blk => blk.id === insertPickerAfterId);
    const next = idx === -1
      ? [...blocks, b]
      : [...blocks.slice(0, idx + 1), b, ...blocks.slice(idx + 1)];
    onChange(next);
    onSelect(b.id);
    setInsertPickerAfterId(null);
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

  // Track whether the user has dismissed the gallery (blank canvas) or selected a template.
  // Initialized to true when blocks exist so existing templates never show the gallery.
  const [galleryDismissed, setGalleryDismissed] = useState(blocks.length > 0);

  if (blocks.length === 0 && !galleryDismissed) {
    return (
      <StarterTemplateGallery
        context={context}
        onSelect={(selected) => { setGalleryDismissed(true); onChange(selected); }}
        onDismiss={() => setGalleryDismissed(true)}
      />
    );
  }

  return (
    <div
      className="py-16 px-10 min-h-full"
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={e => {
        e.preventDefault();
        const type = e.dataTransfer.getData("block-type") as BlockType;
        if (type) onAddBlock?.(type);
      }}
    >
      {/* Artboard label — above the email card, like Figma's frame label */}
      <div className="max-w-[600px] mx-auto mb-2 flex items-center justify-between select-none">
        <span className="text-[10px] text-zinc-600 font-medium tracking-wide">Email Template</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { onChange([]); setGalleryDismissed(false); }}
            className="text-[10px] text-zinc-500 hover:text-[#3ECF8E] transition-colors flex items-center gap-1"
          >
            <LayoutTemplate className="w-3 h-3" />
            Change template
          </button>
          <span className="text-[10px] text-zinc-700 font-mono">600px</span>
        </div>
      </div>

      {/* Blank-canvas drop zone when user chose "Start with blank canvas" */}
      {blocks.length === 0 && (
        <div className="max-w-[600px] mx-auto border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Plus className="w-8 h-8 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">Blank canvas</p>
          <p className="text-xs text-zinc-600">Drag blocks from the left panel or click to add</p>
        </div>
      )}

      {/* Artboard — the email card */}
      {blocks.length > 0 && <div
        className="max-w-[600px] mx-auto"
        style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.07), 0 20px 60px rgba(0,0,0,0.55)" }}
      >
        {/* Email client mock header */}
        <div className="bg-zinc-800 border-b border-zinc-700/80 px-5 py-4">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-full bg-[#3ECF8E] flex items-center justify-center text-white text-sm font-bold shrink-0 select-none">
              {senderName.trim()[0]?.toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {senderOptions && senderOptions.length > 0 ? (
                  <select
                    value={senderName}
                    onChange={e => onSenderNameChange?.(e.target.value)}
                    className="text-sm font-semibold text-zinc-100 bg-zinc-700/60 border border-zinc-600/60 outline-none rounded px-2 py-0.5 max-w-[220px] cursor-pointer hover:bg-zinc-700 focus:bg-zinc-700 transition-colors appearance-none"
                    title="Select sender"
                  >
                    {senderOptions.map(opt => (
                      <option key={opt.email} value={opt.name} className="bg-zinc-800 text-zinc-100">
                        {opt.name}{opt.email ? ` <${opt.email}>` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={senderName}
                    onChange={e => onSenderNameChange?.(e.target.value)}
                    className="text-sm font-semibold text-zinc-100 bg-transparent border-none outline-none min-w-0 w-auto max-w-[220px] cursor-text hover:bg-zinc-700/40 focus:bg-zinc-700/60 rounded px-1 -ml-1 transition-colors"
                    placeholder="Sender Name"
                    title="Click to edit sender name"
                  />
                )}
                <span className="text-[11px] text-zinc-600 shrink-0">via Authentix</span>
              </div>
              {senderOptions && senderOptions.length > 0 && (
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {senderOptions.find(o => o.name === senderName)?.email ?? ""}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-zinc-600 shrink-0 font-medium">Subject:</span>
                <input
                  value={subject}
                  onChange={e => onSubjectChange?.(e.target.value)}
                  className="text-[13px] text-zinc-300 bg-transparent border-none outline-none flex-1 min-w-0 cursor-text hover:bg-zinc-700/40 focus:bg-zinc-700/60 rounded px-1 -ml-0.5 transition-colors"
                  placeholder="Your Certificate from {{organization_name}}"
                  title="Click to edit subject — or use Settings panel"
                />
              </div>
            </div>
            <span className="text-[11px] text-zinc-700 select-none shrink-0 mt-0.5">just now</span>
          </div>
        </div>

        {/* Email body — blocks */}
        <div style={(() => {
          if (!emailBg || !emailBg.type || emailBg.type === "solid")
            return { background: emailBg?.color || "#18181b" };
          if (emailBg.type === "image" && emailBg.imageUrl)
            return { backgroundImage: `url('${emailBg.imageUrl}')`, backgroundSize: emailBg.imageSize || "cover", backgroundPosition: emailBg.imagePosition || "center", backgroundRepeat: emailBg.imageRepeat || "no-repeat" };
          if (emailBg.type === "gradient") {
            const angle = emailBg.gradientAngle ?? 135;
            return { background: `linear-gradient(${angle}deg, ${emailBg.color || "#18181b"} 0%, ${emailBg.gradientEnd || "#111111"} 100%)` };
          }
          return { background: "#18181b" };
        })()}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div>
                {blocks.map((block, idx) => {
                  const isFooterLast = block.type === "footer" && idx === blocks.length - 1;
                  const prevBlock = idx > 0 ? blocks[idx - 1] : null;
                  return (
                    <React.Fragment key={block.id}>
                      {idx > 0 && (
                        <div className="relative h-6 group/insert">
                          <div className="absolute inset-0 flex items-center opacity-0 group-hover/insert:opacity-100 transition-all duration-150">
                            <div className="flex-1 border-t border-dashed border-[#3ECF8E]/50" />
                            <button
                              type="button"
                              onMouseDown={e => openInsertPicker(prevBlock!.id, e)}
                              className="mx-2 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3ECF8E] text-zinc-900 text-[10px] font-bold hover:bg-[#2aac76] shadow-sm transition-colors shrink-0"
                              title="Insert a block here"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              Insert
                            </button>
                            <div className="flex-1 border-t border-dashed border-[#3ECF8E]/50" />
                          </div>
                        </div>
                      )}
                      {/* Add block zone appears ABOVE the footer when footer is last */}
                      {isFooterLast && (
                        <div className="flex justify-center py-3" onMouseDown={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onMouseDown={e => {
                              const beforeFooterId = prevBlock?.id ?? block.id;
                              openInsertPicker(beforeFooterId, e);
                            }}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 hover:text-[#3ECF8E] transition-all duration-150 px-4 py-1.5 rounded-full border border-dashed border-zinc-700/40 hover:border-[#3ECF8E]/50 hover:bg-[#3ECF8E]/5"
                          >
                            <Plus className="w-3 h-3" />
                            Add block
                          </button>
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
                  );
                })}
              </div>
            </SortableContext>

            {/* Add block at end — only when last block is NOT a footer */}
            {blocks[blocks.length - 1]?.type !== "footer" && (
              <div
                className="flex justify-center py-3"
                onMouseDown={e => e.stopPropagation()}
              >
                <button
                  type="button"
                  onMouseDown={e => {
                    if (blocks.length > 0) openInsertPicker(blocks[blocks.length - 1]!.id, e);
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 hover:text-[#3ECF8E] transition-all duration-150 px-4 py-1.5 rounded-full border border-dashed border-zinc-700/40 hover:border-[#3ECF8E]/50 hover:bg-[#3ECF8E]/5"
                >
                  <Plus className="w-3 h-3" />
                  Add block
                </button>
              </div>
            )}

            <DragOverlay dropAnimation={null}>
              {activeBlock && (
                <div style={{ opacity: 0.55, pointerEvents: "none", background: "#18181b", border: "2px solid #3ECF8E", overflow: "hidden", width: 600 }}>
                  <BlockLiveView block={activeBlock} isSelected={false} onChange={() => {}} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>}

      {/* Artboard footer hint */}
      <div className="max-w-[600px] mx-auto mt-3 text-center select-none">
        <span className="text-[10px] text-zinc-700">Drag blocks to reorder · right-click for options · use Settings to edit subject</span>
      </div>

      <div className="h-16" />

      {/* Insert block type picker portal */}
      {insertPickerAfterId !== null && createPortal(
        <>
          <div
            className="fixed inset-0 z-[60]"
            onMouseDown={() => setInsertPickerAfterId(null)}
          />
          <div
            className="fixed z-[61] bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
            style={{ left: insertPickerPos.x, top: insertPickerPos.y, width: 288 }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="px-3 pt-2.5 pb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Insert block</p>
            </div>
            <div className="grid grid-cols-4 gap-0.5 px-1.5 pb-1.5">
              {(context === "cert" ? PALETTE : EMAIL_BLOCKS_PALETTE).map(item => (
                <button
                  key={item.type}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); doInsertBlock(item.type); }}
                  className="flex flex-col items-center gap-1.5 px-1 py-2.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  title={item.desc}
                >
                  <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
                  <span className="text-[9px] font-semibold leading-none text-center">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
