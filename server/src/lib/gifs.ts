import "server-only";
import { DomainError } from "./domain";

// GIFs from GIPHY. The phone asks Afriheart, and Afriheart asks GIPHY, so GIPHY never sees who is
// searching (only Afriheart's server). When someone sends a GIF, their phone downloads it through
// Afriheart, encrypts it and sends it like a photo: the people receiving it never contact GIPHY.
// Off until GIPHY_API_KEY is set. ALLOW_TEST_GIFS=yes-insecure gives a few pretend GIFs for tests.

export interface GifResult { id: string; title: string; w: number; h: number; preview: string; full: string; mime: string }

const TEST_GIF = "R0lGODlhIAAgAIEAAA5aUgAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAHgAAACwAAAAAIAAgAAAINQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJUmRAACH5BAEeAAEALAAAAAAgACAAgdlXOwAAAAAAAAAAAAg1AAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHEmypMmTKFOqXMlSZEAAOw==";
const MEDIA_HOST = /^media[0-9]?\.giphy\.com$/;

export type GifProvider = "giphy" | "test";
export function gifProvider(): GifProvider | null {
  if (process.env.GIPHY_API_KEY) return "giphy";
  if (process.env.ALLOW_TEST_GIFS === "yes-insecure") return "test";
  return null;
}

const proxied = (u: string) => `/api/gifs/file?u=${encodeURIComponent(u)}`;
const cache = new Map<string, { at: number; results: GifResult[] }>();

interface GiphyImage { url?: string; mp4?: string; width?: string; height?: string }
interface GiphyItem { id: string; title?: string; images?: Record<string, GiphyImage> }

export async function searchGifs(q: string): Promise<GifResult[]> {
  const provider = gifProvider();
  if (!provider) throw new DomainError("GIFs aren't switched on yet.", 503);
  const query = q.trim().slice(0, 50);
  if (provider === "test") {
    return Array.from({ length: 6 }, (_, i) => ({ id: `test-${i}`, title: `${query || "Trending"} ${i + 1}`, w: 200, h: 200, preview: proxied(`test:${i}`), full: proxied(`test:${i}`), mime: "image/gif" }));
  }
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.results;
  const url = new URL(query ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending");
  url.searchParams.set("api_key", process.env.GIPHY_API_KEY!);
  if (query) url.searchParams.set("q", query);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("bundle", "messaging_non_clips");
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) throw new DomainError("Couldn't load GIFs right now. Try again.", 502);
  const body = (await res.json()) as { data?: GiphyItem[] };
  const results: GifResult[] = [];
  for (const g of body.data ?? []) {
    const small = g.images?.fixed_width_small ?? g.images?.fixed_width;
    const full = g.images?.fixed_width;
    if (!small?.mp4 || !full?.mp4) continue;
    results.push({ id: g.id, title: (g.title ?? "").slice(0, 80), w: Number(full.width) || 200, h: Number(full.height) || 200, preview: proxied(small.mp4), full: proxied(full.mp4), mime: "video/mp4" });
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), results });
  return results;
}

/** Fetches one GIF file for the phone. Only GIPHY's media servers, nothing else. */
export async function gifFile(u: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  if (u.startsWith("test:")) {
    if (gifProvider() !== "test") return null;
    const b = Buffer.from(TEST_GIF, "base64");
    return { bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, type: "image/gif" };
  }
  if (gifProvider() !== "giphy") return null;
  let url: URL;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "https:" || !MEDIA_HOST.test(url.hostname)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!/^(video\/mp4|image\/(gif|webp))/.test(type)) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > 8 * 1024 * 1024) return null;
  const bytes = await res.arrayBuffer();
  return bytes.byteLength > 8 * 1024 * 1024 ? null : { bytes, type: type.split(";")[0] };
}
