/**
 * Force-download a file from a cross-origin URL (e.g. Supabase signed URLs).
 *
 * Browsers ignore the `download` attribute on anchor tags for cross-origin URLs —
 * they navigate to (or open) the URL instead. Fetching the file as a blob and
 * creating a local object URL makes the browser treat it as a same-origin resource,
 * so the `download` attribute is respected and the file saves to disk.
 */
export async function downloadFileFromUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Build a human-friendly, unique certificate download filename:
 *   "{Recipient Name}-{certificate_number}.{ext}"
 * Falls back gracefully when the name or number is missing, and sanitizes
 * characters that are invalid in filenames. The certificate number keeps the
 * name unique even when two recipients share the same name.
 */
export function certificateFileName(
  cert: { recipient_name?: string | null; certificate_number?: string | null },
  ext = "png",
): string {
  const clean = (s: string) =>
    s.trim().replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, " ").trim().replace(/ /g, "_");
  const namePart = clean(cert.recipient_name ?? "") || "Certificate";
  const numPart = clean(cert.certificate_number ?? "");
  const base = numPart ? `${namePart}-${numPart}` : namePart;
  return `${base}.${ext}`;
}
