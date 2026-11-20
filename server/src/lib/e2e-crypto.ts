// End-to-end encryption for Afriheart, using only the platform's WebCrypto.
//
// Every phone/browser ("device") has two key pairs made on the device:
//   - ECDH P-256 for receiving messages,
//   - ECDSA P-256 for signing what it sends.
// The private halves are non-extractable and never leave the device; the
// server only ever sees public keys and ciphertext.
//
// Sending a message:
//   1. A fresh random 256-bit content key encrypts the payload (AES-GCM).
//   2. A fresh ephemeral ECDH key pair is made for this message. For every
//      device of every chat member (including the sender's own), ECDH with
//      that device's public key → HKDF-SHA-256 (random salt) → a wrapping key
//      that encrypts the content key (AES-GCM).
//   3. The sender's device signs the whole envelope (ECDSA, SHA-256), so the
//      server can't alter, swap or invent messages.
//
// This gives confidentiality and authenticity against the server. It does not
// give the per-message forward secrecy of the Signal protocol's ratchet: if a
// device's private key were ever stolen, messages sent to that device could be
// decrypted. Keys are kept non-extractable to make that hard.

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
const INFO = "common-e2e-v1";

export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

export interface DeviceKeys {
  encPriv: CryptoKey;
  encPub: string; // base64 raw (65 bytes)
  sigPriv: CryptoKey;
  sigPub: string; // base64 raw (65 bytes)
}

export async function generateDeviceKeys(): Promise<DeviceKeys> {
  const e = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const s = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  return {
    encPriv: e.privateKey,
    encPub: b64(await subtle().exportKey("raw", e.publicKey)),
    sigPriv: s.privateKey,
    sigPub: b64(await subtle().exportKey("raw", s.publicKey)),
  };
}

const importEncPub = (raw: string) => subtle().importKey("raw", unb64(raw), { name: "ECDH", namedCurve: "P-256" }, false, []);
const importSigPub = (raw: string) => subtle().importKey("raw", unb64(raw), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);

async function wrappingKey(priv: CryptoKey, pubRaw: string, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage) {
  const bits = await subtle().deriveBits({ name: "ECDH", public: await importEncPub(pubRaw) }, priv, 256);
  const hk = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode(INFO) }, hk, { name: "AES-GCM", length: 256 }, false, [usage]);
}

export interface Envelope {
  v: 1;
  chat: string;
  id: string; // random per message; signed, so a ciphertext can't be replayed as another message
  sd: string; // sender device id
  epk: string; // ephemeral ECDH public key
  iv: string;
  ct: string;
  keys: Record<string, { s: string; iv: string; k: string }>; // per recipient device
  sig: string;
}

/** Deterministic bytes the sender signs and the recipient verifies. */
function signedBytes(e: Omit<Envelope, "sig">): Uint8Array<ArrayBuffer> {
  const keys = Object.keys(e.keys).sort().map((d) => [d, e.keys[d].s, e.keys[d].iv, e.keys[d].k]);
  return enc.encode(JSON.stringify([e.v, e.chat, e.id, e.sd, e.epk, e.iv, e.ct, keys]));
}

export async function sealEnvelope<T>(input: {
  chatId: string;
  payload: T;
  sender: { deviceId: string; sigPriv: CryptoKey };
  recipients: { deviceId: string; encPub: string }[];
}): Promise<Envelope> {
  const contentKeyRaw = random(32);
  const contentKey = await subtle().importKey("raw", contentKeyRaw, "AES-GCM", false, ["encrypt"]);
  const iv = random(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, contentKey, enc.encode(JSON.stringify(input.payload)));
  const eph = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const keys: Envelope["keys"] = {};
  for (const r of input.recipients) {
    const salt = random(16);
    const kiv = random(12);
    const wk = await wrappingKey(eph.privateKey, r.encPub, salt, "encrypt");
    keys[r.deviceId] = { s: b64(salt), iv: b64(kiv), k: b64(await subtle().encrypt({ name: "AES-GCM", iv: kiv }, wk, contentKeyRaw)) };
  }
  const body: Omit<Envelope, "sig"> = {
    v: 1, chat: input.chatId, id: b64(random(16)), sd: input.sender.deviceId,
    epk: b64(await subtle().exportKey("raw", eph.publicKey)), iv: b64(iv), ct: b64(ct), keys,
  };
  const sig = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, input.sender.sigPriv, signedBytes(body));
  return { ...body, sig: b64(sig) };
}

export class CannotDecrypt extends Error {
  constructor(public reason: "not-for-this-device" | "bad-signature" | "damaged") {
    super(reason);
  }
}

/** Verifies the sender's signature, then decrypts. Throws CannotDecrypt. */
export async function openEnvelope<T>(e: Envelope, me: { deviceId: string; encPriv: CryptoKey }, senderSigPub: string, chatId: string): Promise<T> {
  if (e.v !== 1 || e.chat !== chatId) throw new CannotDecrypt("damaged");
  const { sig, ...body } = e;
  let valid = false;
  try {
    valid = await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, await importSigPub(senderSigPub), unb64(sig), signedBytes(body));
  } catch {
    valid = false;
  }
  if (!valid) throw new CannotDecrypt("bad-signature");
  const mine = e.keys[me.deviceId];
  if (!mine) throw new CannotDecrypt("not-for-this-device");
  try {
    const wk = await wrappingKey(me.encPriv, e.epk, unb64(mine.s), "decrypt");
    const raw = await subtle().decrypt({ name: "AES-GCM", iv: unb64(mine.iv) }, wk, unb64(mine.k));
    const ck = await subtle().importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: unb64(e.iv) }, ck, unb64(e.ct));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    throw new CannotDecrypt("damaged");
  }
}

/** Photos and voice notes: encrypted with their own key, which travels inside the (encrypted) message. */
export async function encryptBlob(data: ArrayBuffer): Promise<{ data: ArrayBuffer; key: string; iv: string }> {
  const raw = random(32);
  const key = await subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = random(12);
  return { data: await subtle().encrypt({ name: "AES-GCM", iv }, key, data), key: b64(raw), iv: b64(iv) };
}

export async function decryptBlob(data: ArrayBuffer, keyB64: string, ivB64: string): Promise<ArrayBuffer> {
  const key = await subtle().importKey("raw", unb64(keyB64), "AES-GCM", false, ["decrypt"]);
  return subtle().decrypt({ name: "AES-GCM", iv: unb64(ivB64) }, key, data);
}

/** Signs call set-up (offer/answer) so the server can't put itself in the middle of a call. */
export async function signText(sigPriv: CryptoKey, text: string): Promise<string> {
  return b64(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, sigPriv, enc.encode(text)));
}

export async function verifyText(sigPub: string, text: string, sig: string): Promise<boolean> {
  try {
    return await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, await importSigPub(sigPub), unb64(sig), enc.encode(text));
  } catch {
    return false;
  }
}

/**
 * The security code for a chat: 60 digits from everyone's device signing keys.
 * If two people see the same code, nobody (including the server) has swapped keys.
 */
export async function securityCode(devices: { person_id: string; sig_pub: string }[]): Promise<string> {
  const list = devices.map((d) => `${d.person_id}:${d.sig_pub}`).sort().join("|");
  const h = new Uint8Array(await subtle().digest("SHA-512", enc.encode(list)));
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const n = ((h[i * 5] << 24) >>> 0) + (h[i * 5 + 1] << 16) + (h[i * 5 + 2] << 8) + h[i * 5 + 3] + h[i * 5 + 4] * 2 ** 32;
    groups.push(String(n % 100000).padStart(5, "0"));
  }
  return groups.join(" ");
}

/** What's inside an encrypted message. */
/** A quoted message (reply), kept inside the encrypted payload. */
export interface Quote { id: string; name: string; text: string }
/** Fields any visible message can carry: a reply, "forwarded", and @mentions (person ids). */
export interface Extras { re?: Quote; fwd?: boolean; mentions?: string[] }

export type Payload =
  | ({ t: "text"; text: string } & Extras)
  | ({ t: "image"; path: string; key: string; iv: string; mime: string; caption?: string; once?: boolean } & Extras)
  /** wave: the recording's loudness in 48 bars (0-31), drawn as a waveform. */
  | ({ t: "voice"; path: string; key: string; iv: string; mime: string; ms: number; wave?: number[] } & Extras)
  /** A document, or a video (shown with a player). */
  | ({ t: "file"; path: string; key: string; iv: string; mime: string; name: string; size: number; caption?: string } & Extras)
  | ({ t: "location"; lat: number; lng: number; label?: string } & Extras)
  | ({ t: "contact"; name: string; phone: string } & Extras)
  | ({ t: "poll"; q: string; options: string[]; multi: boolean } & Extras)
  /** A sticker: from a pack built into the app (pack + id), or made from a photo (an encrypted file). */
  | ({ t: "sticker"; pack?: string; id?: string; label?: string; path?: string; key?: string; iv?: string; mime?: string } & Extras)
  /** A GIF, downloaded through Afriheart and sent as an encrypted file (recipients never contact the GIF service). */
  | ({ t: "gif"; path: string; key: string; iv: string; mime: string; w: number; h: number; title?: string } & Extras)
  /** A page of the alphabet date ideas album: the story, rating (1-5) and when you went. */
  | ({ t: "story"; letter: string; activity: string; story: string; rating: number; when: string } & Extras)
  /** A Talking cards question sent to the chat, to answer by text. */
  | ({ t: "card"; deck: string; question: string } & Extras)
  /** An answer to the couple question of the day (kept in Couple space, not posted in the chat). */
  | { t: "couple"; question: string; answer: string }
  /** Hidden helpers about another message (the server only knows which one): */
  | { t: "react"; emoji: string } // "" removes my reaction
  | { t: "edit"; text: string }
  | { t: "vote"; options: number[] }
  /** A status update (24 hours), sealed for the person's contacts. */
  | { t: "status"; text?: string; bg?: string; path?: string; key?: string; iv?: string; mime?: string; caption?: string };
