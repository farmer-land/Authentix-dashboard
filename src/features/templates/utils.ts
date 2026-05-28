/**
 * TEMPLATES FEATURE - UTILITIES
 *
 * Helper functions for template operations.
 */

import type { TemplateFileType, CertificateField } from "./types";

/**
 * Badge colors based on category/subcategory text
 * Returns consistent colors for the same text
 */
export function getCategoryBadgeColor(text: string): {
  bg: string;
  text: string;
  border: string;
} {
  const colors = [
    { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
    { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" },
    { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" },
    { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
    { bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-300" },
    { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-300" },
    { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
    { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-300" },
    { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-300" },
    { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300" },
  ];

  // Simple hash function for consistent index
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index]!;
}

/**
 * Check if file type is an image
 */
export function isImageFileType(fileType: TemplateFileType): boolean {
  return ["png", "jpg", "jpeg"].includes(fileType);
}

/**
 * Check if file type is PDF
 */
export function isPdfFileType(fileType: TemplateFileType): boolean {
  return fileType === "pdf";
}

/**
 * Detect file type from File object
 */
export function detectFileType(file: File): TemplateFileType {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }
  if (mimeType === "image/png" || extension === "png") {
    return "png";
  }
  if (mimeType === "image/jpeg" || extension === "jpg" || extension === "jpeg") {
    return "jpeg";
  }

  // Default to PDF
  return "pdf";
}

/**
 * Validate template file
 * Note: image/jpg is not a standard MIME type - browsers send image/jpeg
 */
export function validateTemplateFile(file: File): {
  valid: boolean;
  error?: string;
} {
  const maxSize = 50 * 1024 * 1024; // 50MB (matches backend limit)
  const allowedTypes = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  if (file.size > maxSize) {
    return { valid: false, error: "File size must be less than 50MB" };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: "File type must be PDF, PNG, JPEG, WebP, DOCX, or PPTX",
    };
  }

  return { valid: true };
}

/**
 * Auto-generate field mappings based on header names
 */
export function autoMapFieldsToHeaders(
  fields: CertificateField[],
  headers: string[]
): Array<{ fieldId: string; columnName: string }> {
  const mappings: Array<{ fieldId: string; columnName: string }> = [];

  fields.forEach((field) => {
    const matchingHeader = headers.find((header) => {
      const normalizedHeader = header.toLowerCase().trim();
      const normalizedLabel = field.label.toLowerCase().trim();

      if (normalizedHeader === normalizedLabel) return true;
      if (field.type === "name" && normalizedHeader.includes("name")) return true;
      if (field.type === "course" && (normalizedHeader.includes("course") || normalizedHeader.includes("program"))) return true;
      if (field.type === "start_date" && (normalizedHeader.includes("start") || normalizedHeader.includes("issue"))) return true;
      if (field.type === "end_date" && (normalizedHeader.includes("end") || normalizedHeader.includes("expir"))) return true;
      if (field.type === "email" && (normalizedHeader.includes("email") || normalizedHeader.includes("e-mail"))) return true;
      if (field.type === "phone" && (normalizedHeader.includes("phone") || normalizedHeader.includes("mobile") || normalizedHeader.includes("contact"))) return true;

      return false;
    });

    if (matchingHeader) {
      mappings.push({
        fieldId: field.id,
        columnName: matchingHeader,
      });
    }
  });

  return mappings;
}
