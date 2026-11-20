import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Photos and voice notes. Locally they go to .data/media; with Supabase they go to
// the private `chat-media` bucket. Files are only ever served through
// /api/media/<name>, which checks the viewer is in the chat.

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VOICE_BYTES = 10 * 1024 * 1024;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "application/octet-stream": "bin",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac",
};

export function mediaExtension(contentType: string): string | null {
  return TYPES[contentType.split(";")[0].trim().toLowerCase()] ?? null;
}

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop() ?? "";
  return Object.entries(TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

function supabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

const localDir = () => path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_MEDIA_DIR || ".data/media");

/** Saves a file and records who uploaded it. */
export async function saveOwnedMedia(ownerId: string, kind: "profile" | "chat" | "selfie" | "status" | "support", folder: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const name = await saveMedia(folder, bytes, contentType);
  const { getStore } = await import("./store");
  await getStore().insert("media_files", { id: name, owner_id: ownerId, kind, chat_id: kind === "chat" ? folder : null, created_at: new Date().toISOString() });
  return name;
}

/** Deletes a file and its ownership record. */
export async function deleteOwnedMedia(name: string): Promise<void> {
  await deleteMedia(name);
  const small = smallCopyOf(name);
  if (small) await deleteMedia(small).catch(() => undefined);
  const { getStore } = await import("./store");
  if (await getStore().get("media_files", name)) await getStore().remove("media_files", name);
}

export async function saveMedia(chatId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = mediaExtension(contentType);
  if (!ext) throw new Error("Unsupported file type.");
  return saveMediaAt(`${chatId}/${randomBytes(12).toString("hex")}.${ext}`, bytes, contentType);
}

/** A profile photo's small copy for data-light mode: same file name, in "profiles-small". */
export const smallCopyOf = (name: string) => (name.startsWith("profiles/") ? `profiles-small/${name.slice(9)}` : null);

export async function saveMediaAt(name: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const sb = supabase();
  if (sb) {
    const { error } = await sb.storage.from("chat-media").upload(name, bytes, { contentType, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  } else {
    const file = path.join(/* turbopackIgnore: true */ localDir(), name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
  return name;
}

/** Deletes a stored file for good (used for verification selfies once they're checked). */
export async function deleteMedia(name: string): Promise<void> {
  if (!/^[\w-]+\/[a-f0-9]{24}\.[a-z0-9]+$/.test(name)) return;
  const sb = supabase();
  if (sb) {
    await sb.storage.from("chat-media").remove([name]);
    return;
  }
  await fs.rm(path.join(/* turbopackIgnore: true */ localDir(), name), { force: true });
}

export async function readMedia(name: string): Promise<Uint8Array | null> {
  if (!/^[\w-]+\/[a-f0-9]{24}\.[a-z0-9]+$/.test(name)) return null;
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.storage.from("chat-media").download(name);
    return error || !data ? null : new Uint8Array(await data.arrayBuffer());
  }
  try {
    return new Uint8Array(await fs.readFile(path.join(/* turbopackIgnore: true */ localDir(), name)));
  } catch {
    return null;
  }
}
