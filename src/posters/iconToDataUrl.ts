// Icons for posters (spec v0.4.3 F.5): the capture clones the poster into an SVG image, which can only
// show images already inlined as data: URLs. `no-store` keeps the request from reusing an <img> response
// that was cached without CORS headers.

export const ICON_FETCH_TIMEOUT_MS = 3000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True when the body is non-empty and starts with the PNG signature (an empty or corrupt body is not an icon). */
function looksLikePng(bytes: Uint8Array): boolean {
  if (bytes.length <= PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("icon")));
    reader.onerror = () => reject(reader.error ?? new Error("icon"));
    reader.readAsDataURL(blob);
  });
}

/** The icon as a `data:image/png` URL, or null on any failure (the poster then draws a letter tile). */
export async function iconToDataUrl(url: string, timeoutMs = ICON_FETCH_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || type.split(";")[0].trim().toLowerCase() !== "image/png") {
      return null;
    }
    // Read bytes rather than a Blob, so the data: URL comes from a Blob built here (see fonts.ts).
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!looksLikePng(bytes)) {
      return null;
    }
    const dataUrl = await readAsDataUrl(new Blob([bytes], { type: "image/png" }));
    return dataUrl.startsWith("data:image/png") ? dataUrl : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
