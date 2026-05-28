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
