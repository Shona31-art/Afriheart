// This phone's encryption identity, and everything the screens need to send and
// read end-to-end encrypted messages. Browser only.

import { apiGet, apiSend, ApiError } from "./client";
import {
  CannotDecrypt, decryptBlob, encryptBlob, generateDeviceKeys, openEnvelope, sealEnvelope, signText, verifyText,
  type Envelope, type Payload,
} from "./e2e-crypto";

export interface MyDevice { deviceId: string; encPriv: CryptoKey; sigPriv: CryptoKey; encPub: string; sigPub: string }
export interface PublicDevice { id: string; person_id: string; enc_pub: string; sig_pub: string; created_at: string; label: string; revoked: boolean }

const DB = "common-e2e";
const STORE = "devices";

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "personId" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(personId: string): Promise<(MyDevice & { personId: string }) | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(personId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(value: MyDevice & { personId: string }) {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value); // CryptoKeys are stored as-is; the private keys stay non-extractable
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function label(): string {
  const ua = navigator.userAgent;
  if (/CommonAndroid/.test(ua)) return "Android app";
  if (/Android/.test(ua)) return "Android browser";
  if (/iPhone|iPad/.test(ua)) return "iPhone";
  return "Computer";
}

const devicePromises = new Map<string, Promise<MyDevice>>();

/** This phone's keys for this person, made and registered the first time. */
export function myDevice(personId: string): Promise<MyDevice> {
  let p = devicePromises.get(personId);
  if (!p) {
    p = (async () => {
      const stored = await idbGet(personId);
      if (stored?.deviceId) {
        const active = await apiGet<{ id: string }[]>("/api/devices").catch(() => null);
        if (!active || active.some((d) => d.id === stored.deviceId)) return stored;
      }
      // Keys are saved on this phone before they're registered, so if the page closes halfway
      // the same keys are registered again (the server returns the same device) instead of new ones.
      const keys = stored && !stored.deviceId ? stored : await generateDeviceKeys();
      if (!stored || stored.deviceId) await idbPut({ personId, deviceId: "", ...keys });
      const { id } = await apiSend<{ id: string }>("/api/devices", "POST", { enc_pub: keys.encPub, sig_pub: keys.sigPub, label: label() });
      const device = { ...keys, personId, deviceId: id };
      await idbPut(device);
      return device;
    })();
    p.catch(() => devicePromises.delete(personId));
    devicePromises.set(personId, p);
  }
  return p;
}

const chatDeviceCache = new Map<string, { at: number; list: PublicDevice[] }>();
const deviceCache = new Map<string, Promise<PublicDevice>>();

export async function chatDevices(chatId: string, fresh = false): Promise<PublicDevice[]> {
  const hit = chatDeviceCache.get(chatId);
  if (hit && !fresh && Date.now() - hit.at < 30000) return hit.list;
  const list = await apiGet<PublicDevice[]>(`/api/chats/${chatId}/devices`);
  chatDeviceCache.set(chatId, { at: Date.now(), list });
  for (const d of list) deviceCache.set(d.id, Promise.resolve(d));
  return list;
}

export function deviceKeys(id: string): Promise<PublicDevice> {
  let p = deviceCache.get(id);
  if (!p) {
    p = apiGet<PublicDevice>(`/api/devices/${id}`);
    p.catch(() => deviceCache.delete(id));
    deviceCache.set(id, p);
  }
  return p;
}

/** Encrypts for every device in the chat and sends. Re-encrypts once if someone's devices changed meanwhile. */
export async function sendEncrypted(chatId: string, personId: string, payload: Payload, opts: { meta?: "react" | "edit" | "vote"; target?: string; media?: string } = {}): Promise<string> {
  const me = await myDevice(personId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const devices = await chatDevices(chatId, attempt > 0);
    const envelope = await sealEnvelope({
      chatId, payload, sender: { deviceId: me.deviceId, sigPriv: me.sigPriv },
      recipients: devices.map((d) => ({ deviceId: d.id, encPub: d.enc_pub })),
    });
    try {
      const { id } = await apiSend<{ id: string }>(`/api/chats/${chatId}/messages`, "POST", { envelope, ...opts });
      return id;
    } catch (e) {
      if (!(e instanceof ApiError && e.message === "devices_changed")) throw e;
    }
  }
  throw new Error("Couldn't send: people in this chat keep changing devices. Try again.");
}

/** Seals something for every phone in the chat without sending it (Couple space answers). */
export async function sealForChat(chatId: string, personId: string, payload: Payload): Promise<string> {
  const me = await myDevice(personId);
  const devices = await chatDevices(chatId, true);
  const envelope = await sealEnvelope({
    chatId, payload, sender: { deviceId: me.deviceId, sigPriv: me.sigPriv },
    recipients: devices.map((d) => ({ deviceId: d.id, encPub: d.enc_pub })),
  });
  return JSON.stringify(envelope);
}

/** Posts a status update, encrypted for my contacts' devices (and mine). */
export async function postStatus(personId: string, payload: Payload, media?: string): Promise<string> {
  const me = await myDevice(personId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const devices = await apiGet<PublicDevice[]>("/api/status/devices");
    const envelope = await sealEnvelope({
      chatId: `status:${personId}`, payload, sender: { deviceId: me.deviceId, sigPriv: me.sigPriv },
      recipients: devices.map((d) => ({ deviceId: d.id, encPub: d.enc_pub })),
    });
    try {
      const { id } = await apiSend<{ id: string }>("/api/status", "POST", { envelope, media });
      return id;
    } catch (e) {
      if (!(e instanceof ApiError && e.message === "devices_changed")) throw e;
    }
  }
  throw new Error("Couldn't post: try again.");
}

/** Encrypts a status photo and uploads the scrambled bytes. */
export async function uploadStatusPhoto(blob: Blob): Promise<{ path: string; key: string; iv: string }> {
  const sealed = await encryptBlob(await blob.arrayBuffer());
  const form = new FormData();
  form.set("file", new File([sealed.data], "media.bin", { type: "application/octet-stream" }));
  const { path } = await apiSend<{ path: string }>("/api/status/media", "POST", form);
  return { path, key: sealed.key, iv: sealed.iv };
}

export type Opened = { ok: true; payload: Payload } | { ok: false; reason: "waiting" | "unverified" };
const opened = new Map<string, Promise<Opened>>();

/** Decrypts a message for this phone, checking it really came from the sender's own device. */
export function openMessage(chatId: string, personId: string, cipher: string, senderId: string | null): Promise<Opened> {
  let p = opened.get(cipher);
  if (!p) {
    p = (async (): Promise<Opened> => {
      try {
        const env = JSON.parse(cipher) as Envelope;
        const [me, sender] = await Promise.all([myDevice(personId), deviceKeys(env.sd)]);
        if (sender.person_id !== senderId) return { ok: false, reason: "unverified" };
        const payload = await openEnvelope<Payload>(env, { deviceId: me.deviceId, encPriv: me.encPriv }, sender.sig_pub, chatId);
        return { ok: true, payload };
      } catch (e) {
        if (e instanceof CannotDecrypt && e.reason === "not-for-this-device") return { ok: false, reason: "waiting" };
        return { ok: false, reason: e instanceof CannotDecrypt ? "unverified" : "waiting" };
      }
    })();
    opened.set(cipher, p);
  }
  return p;
}

/** Encrypts a photo or voice note on the phone, uploads the scrambled bytes, returns where they went and the key. */
export async function uploadEncrypted(chatId: string, blob: Blob): Promise<{ path: string; key: string; iv: string }> {
  const sealed = await encryptBlob(await blob.arrayBuffer());
  const form = new FormData();
  form.set("file", new File([sealed.data], "media.bin", { type: "application/octet-stream" }));
  const { path } = await apiSend<{ path: string }>(`/api/chats/${chatId}/media`, "POST", form);
  return { path, key: sealed.key, iv: sealed.iv };
}

const mediaUrls = new Map<string, Promise<string>>();

/** Downloads and decrypts a photo or voice note into a local blob URL. */
export function mediaUrl(path: string, key: string, iv: string, mime: string): Promise<string> {
  let p = mediaUrls.get(path);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/api/media/${path}`);
      if (!res.ok) throw new Error("Couldn't load");
      const plain = await decryptBlob(await res.arrayBuffer(), key, iv);
      return URL.createObjectURL(new Blob([plain], { type: mime }));
    })();
    p.catch(() => mediaUrls.delete(path));
    mediaUrls.set(path, p);
  }
  return p;
}

/** Call set-up is signed by this device, so the server can't intercept the call. */
export async function signCallDescription(personId: string, text: string): Promise<{ sd: string; sig: string }> {
  const me = await myDevice(personId);
  return { sd: me.deviceId, sig: await signText(me.sigPriv, text) };
}

export async function verifyCallDescription(fromPersonId: string, text: string, sd: string, sig: string): Promise<boolean> {
  try {
    const d = await deviceKeys(sd);
    return d.person_id === fromPersonId && !d.revoked && (await verifyText(d.sig_pub, text, sig));
  } catch {
    return false;
  }
}

/** Re-sends the key for my messages that someone couldn't read yet (they've now set up a phone). */
export async function resendWaitingKeys(personId: string): Promise<number> {
  const pending = await apiGet<{ id: string; chat_id: string; cipher: string }[]>("/api/rekey");
  const me = await myDevice(personId);
  let done = 0;
  for (const m of pending) {
    const opened = await openMessage(m.chat_id, personId, m.cipher, personId);
    if (!opened.ok) continue; // sent from a phone that's gone: can't be recovered, like WhatsApp
    const devices = await chatDevices(m.chat_id, true);
    const envelope = await sealEnvelope({
      chatId: m.chat_id, payload: opened.payload, sender: { deviceId: me.deviceId, sigPriv: me.sigPriv },
      recipients: devices.map((d) => ({ deviceId: d.id, encPub: d.enc_pub })),
    });
    await apiSend("/api/rekey", "POST", { message_id: m.id, envelope }).then(() => done++, () => undefined);
  }
  return done;
}

/** Sign-out: tell the server to stop encrypting for this phone, and delete its keys here. */
export async function forgetThisDevice(personId: string): Promise<void> {
  const stored = await idbGet(personId);
  if (stored?.deviceId) await apiSend(`/api/devices/${stored.deviceId}`, "DELETE").catch(() => undefined);
  devicePromises.delete(personId);
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(personId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
