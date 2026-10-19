/**
 * Hand a file to the visitor as a download, entirely inside the tab.
 *
 * Before 0.59 every tool pack (pdf, office, legal, media, devkit, qr,
 * businesscard) and the install wizard carried its own copy. One of them never
 * attached the link to the document; one revoked after 2 s, the rest after 1 s.
 * Browser-only (needs `document`); no React.
 */

/** How long the object URL outlives the click. An immediate revoke beats Firefox's download. */
export const DOWNLOAD_REVOKE_MS = 1000;

/** Click a temporary `<a download>` for `href`. The link is attached, because Firefox ignores a detached click. */
export function downloadUrl(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Offer a Blob as a download. The object URL is revoked shortly after, never leaked. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_MS);
}

/**
 * Bytes (pdf-lib, a ZIP writer) as a download. Copies the view first: pdf-lib
 * hands back a view into a larger buffer, and the Blob would carry all of it.
 */
export function downloadBytes(bytes: Uint8Array, mime: string, filename: string): void {
  downloadBlob(new Blob([bytes.slice()], { type: mime }), filename);
}

/** Text as a download; `mime` defaults to UTF-8 plain text. */
export function downloadText(text: string, filename: string, mime = "text/plain;charset=utf-8"): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
