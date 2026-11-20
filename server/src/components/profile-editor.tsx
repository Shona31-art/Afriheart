"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DatingProfile } from "@/lib/types";
import { apiSend } from "@/lib/client";
import { IconBack, IconClose, IconPin, IconPlus, IconShield, IconSparkle } from "./icons";
import { CITIES, DEFAULT_MAX_KM, DISTANCES } from "@/lib/geo";
import { MAX_ANSWER, MAX_PROMPTS, MAX_VOICE_MS, PROMPTS, promptText } from "@/lib/prompts";
import { useRecorder } from "./composer";
import { VoicePlayer } from "./voice-player";
import { IconMic } from "./icons";

const IDEAS = [
  "Sunrise walk on the promenade, then coffee",
  "Bunny chow crawl in town",
  "Picnic at the Botanic Gardens",
  "Sunset drinks in Umhlanga",
  "Trail run at Giba Gorge",
  "Comedy night, then late dinner",
];

const GENDERS = [["woman", "Woman"], ["man", "Man"], ["nonbinary", "Non-binary"]] as const;
const SEEKING = [["women", "Women"], ["men", "Men"], ["nonbinary", "Non-binary people"]] as const;
const chip = "chip min-h-11 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent";

/** Create or edit the dating profile: photos, the basics, who you'd like to meet, and a date idea. */
export function ProfileEditor({ initial, fallbackName }: { initial: DatingProfile | null; fallbackName: string }) {
  const router = useRouter();
  const isNew = !initial;
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>(
    () => (initial?.photos ?? []).map((path) => ({ path, preview: `/api/dating/photos/${path}` })),
  );
  const [idea, setIdea] = useState(initial?.date_idea ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number; label: string } | null>(
    initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng, label: "Your approximate location is saved" } : null,
  );
  const [locChanged, setLocChanged] = useState(false);
  const [prompts, setPrompts] = useState<{ id: string; answer: string }[]>(() => {
    const have = initial?.prompts ?? [];
    return [...have, ...Array.from({ length: MAX_PROMPTS - have.length }, () => ({ id: "", answer: "" }))];
  });
  const [voice, setVoice] = useState<{ path: string; ms: number; prompt: string; src: string } | null>(
    initial?.voice_path ? { path: initial.voice_path, ms: initial.voice_ms ?? 0, prompt: initial.voice_prompt ?? "", src: `/api/dating/photos/${initial.voice_path}` } : null,
  );
  const [voiceChanged, setVoiceChanged] = useState(false);
  const [voicePrompt, setVoicePrompt] = useState(initial?.voice_prompt ?? "");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const rec = useRecorder();

  async function stopRecording() {
    const r = await rec.stop();
    if (!r) return;
    setVoiceBusy(true);
    try {
      const form = new FormData();
      form.set("file", new File([r.blob], "voice", { type: r.blob.type.split(";")[0] || "audio/webm" }));
      const { path } = await apiSend<{ path: string }>("/api/dating/voice", "POST", form);
      setVoice({ path, ms: Math.min(r.ms, MAX_VOICE_MS), prompt: voicePrompt, src: URL.createObjectURL(r.blob) });
      setVoiceChanged(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  }
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const verified = !!initial?.verified_at;

  function useMyLocation() {
    setLocError(null);
    if (!navigator.geolocation) return setLocError("This phone can't share its location. Choose your city instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Near where you are now (rounded to about 1 km)" });
        setLocChanged(true);
        setLocating(false);
      },
      () => {
        setLocError("Couldn't get your location. Allow location for Afriheart, or choose your city instead.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }
  const [maxBirth] = useState(() => new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of [...files].slice(0, 6 - photos.length)) {
        const blob = await shrink(file);
        const form = new FormData();
        form.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        // A small copy (about 30 KB) for people using data-light mode.
        form.set("small", new File([await shrink(file, 480, 0.6)], "small.jpg", { type: "image/jpeg" }));
        const { path } = await apiSend<{ path: string }>("/api/dating/photos", "POST", form);
        setPhotos((p) => [...p, { path, preview: URL.createObjectURL(blob) }]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/dating/profile", "POST", {
        display_name: String(form.get("display_name") ?? ""),
        birthdate: String(form.get("birthdate") ?? ""),
        gender: String(form.get("gender") ?? ""),
        interested_in: form.getAll("interested_in").map(String),
        age_min: Number(form.get("age_min")), age_max: Number(form.get("age_max")),
        area: String(form.get("area") ?? ""), bio: String(form.get("bio") ?? ""),
        photos: photos.map((p) => p.path), date_idea: idea, paused: form.get("paused") === "on",
        consent: form.get("consent") === "on",
        ...(locChanged ? { lat: loc?.lat ?? null, lng: loc?.lng ?? null } : {}),
        max_km: Number(form.get("max_km") ?? DEFAULT_MAX_KM), verified_only: form.get("verified_only") === "on",
        prompts: prompts.filter((p) => p.id && p.answer.trim()),
        ...(voiceChanged || (voice && voicePrompt !== voice.prompt) ? { voice: voice ? { path: voice.path, ms: voice.ms, prompt: voicePrompt } : null } : {}),
      });
      // A full load on purpose: the app may still remember Discover's earlier "make a profile first" redirect.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/discover");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }


  return (
    <main className="page">
      <div className="mb-4 flex items-center gap-1">
        {!isNew && <Link href="/you" className="icon-btn -ml-3" aria-label="Back"><IconBack /></Link>}
        <h1 className="display text-3xl">{isNew ? "Make your profile" : "Your dating profile"}</h1>
      </div>
      {isNew && <p className="mb-4 text-muted">Add a few photos, say who you&apos;d like to meet, and the kind of date you&apos;d actually enjoy. It takes two minutes.</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-warm-soft px-4 py-3 text-sm text-warm-ink">{error}</p>}

      <form action={save} className="flex flex-col gap-5">
        <section aria-labelledby="h-photos" className="card">
          <h2 id="h-photos" className="mb-1 font-semibold">Photos</h2>
          <p className="mb-3 text-sm text-muted">1 to 6 photos of you. The first one is your main photo. Your face should be clearly visible.</p>
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <li key={p.path} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt={i === 0 ? "Main photo" : `Photo ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[11px] text-white">Main</span>}
                <button type="button" onClick={() => setPhotos((all) => all.filter((x) => x.path !== p.path))}
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white" aria-label={`Remove photo ${i + 1}`}>
                  <IconClose size={16} />
                </button>
              </li>
            ))}
            {photos.length < 6 && (
              <li>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-sm text-muted">
                  <IconPlus /> {uploading ? "Uploading…" : "Add photo"}
                </button>
              </li>
            )}
          </ul>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} aria-label="Choose photos" />
        </section>

        <section aria-labelledby="h-basics" className="card flex flex-col gap-4">
          <h2 id="h-basics" className="font-semibold">The basics</h2>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">First name</span>
            <input className="field" name="display_name" required maxLength={40} defaultValue={initial?.display_name ?? fallbackName} autoComplete="given-name" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Date of birth</span>
            <span className="text-xs text-muted">Only your age is shown. You must be 18 or older.</span>
            <input className="field" name="birthdate" type="date" required max={maxBirth} defaultValue={initial?.birthdate ?? ""} />
          </label>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">I&apos;m a</legend>
            <div className="flex flex-wrap gap-2">
              {GENDERS.map(([v, l]) => (
                <label key={v} className={chip}><input type="radio" name="gender" value={v} required defaultChecked={initial?.gender === v} className="sr-only" />{l}</label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Area</span>
            <input className="field" name="area" maxLength={40} defaultValue={initial?.area ?? ""} placeholder="e.g. Morningside, Durban" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">About you</span>
            <textarea className="field min-h-24" name="bio" maxLength={300} defaultValue={initial?.bio ?? ""} placeholder="What you're into, what makes you laugh, what you're looking for." />
          </label>
        </section>

        <section aria-labelledby="h-meet" className="card flex flex-col gap-4">
          <h2 id="h-meet" className="font-semibold">Who you&apos;d like to meet</h2>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Show me</legend>
            <div className="flex flex-wrap gap-2">
              {SEEKING.map(([v, l]) => (
                <label key={v} className={chip}><input type="checkbox" name="interested_in" value={v} defaultChecked={initial?.interested_in.includes(v) ?? false} className="sr-only" />{l}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex items-end gap-3">
            <legend className="mb-1 text-sm font-semibold">Ages</legend>
            <label className="flex flex-col gap-1 text-sm">From
              <input className="field w-24" type="number" name="age_min" min={18} max={100} required defaultValue={initial?.age_min ?? 21} />
            </label>
            <label className="flex flex-col gap-1 text-sm">To
              <input className="field w-24" type="number" name="age_max" min={18} max={100} required defaultValue={initial?.age_max ?? 35} />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Where you are</legend>
            <p className="-mt-1 text-xs text-muted">Used to show people nearby. It&apos;s rounded to about 1 km and never shown: people only see a rough distance, like &ldquo;Less than 5 km away&rdquo;.</p>
            {loc && <p className="flex items-center gap-1.5 text-sm" role="status"><IconPin size={16} className="text-accent" /> {loc.label}</p>}
            {locError && <p role="alert" className="rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{locError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={useMyLocation} disabled={locating}><IconPin size={16} /> {locating ? "Finding you…" : loc ? "Update my location" : "Use my location"}</button>
              <label className="sr-only" htmlFor="city">Or choose your city</label>
              <select id="city" className="field min-h-11 py-2 text-sm" value="" onChange={(e) => {
                const c = CITIES.find((x) => x.name === e.target.value);
                if (!c) return;
                setLoc({ lat: c.lat, lng: c.lng, label: `In ${c.name}` });
                setLocChanged(true);
                setLocError(null);
              }}>
                <option value="">Or choose your city…</option>
                {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              {loc && <button type="button" className="text-sm font-semibold text-accent underline" onClick={() => { setLoc(null); setLocChanged(true); }}>Remove</button>}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">How far away</legend>
            <div className="flex flex-wrap gap-2">
              {DISTANCES.map((d) => (
                <label key={d} className={chip}>
                  <input type="radio" name="max_km" value={d} defaultChecked={(initial?.max_km ?? DEFAULT_MAX_KM) === d} className="sr-only" />
                  {d === 0 ? "Anywhere" : `${d} km`}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1">
            <label className={`flex items-start gap-3 text-sm ${verified ? "" : "opacity-60"}`}>
              <input type="checkbox" name="verified_only" disabled={!verified} defaultChecked={!!initial?.verified_only} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
              <span><strong>Only verified people.</strong> Show me only people who&apos;ve verified with a selfie, and only show me to them.</span>
            </label>
            {!verified && !isNew && <Link href="/dating/verify" className="ml-8 flex items-center gap-1 text-sm font-semibold text-accent underline"><IconShield size={16} /> Get verified first</Link>}
          </div>
        </section>

        <section aria-labelledby="h-prompts" className="card flex flex-col gap-4">
          <div>
            <h2 id="h-prompts" className="font-semibold">Prompts</h2>
            <p className="text-sm text-muted">Up to three. People can like or comment on an answer, which makes starting a chat easy.</p>
          </div>
          {prompts.map((p, i) => (
            <fieldset key={i} className="flex flex-col gap-1.5">
              <legend className="sr-only">Prompt {i + 1}</legend>
              <label className="sr-only" htmlFor={`prompt-${i}`}>Prompt {i + 1}</label>
              <select id={`prompt-${i}`} className="field min-h-11 py-2 text-sm" value={p.id}
                onChange={(e) => setPrompts((all) => all.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}>
                <option value="">Choose a prompt…</option>
                {PROMPTS.filter((o) => o.id === p.id || !prompts.some((x) => x.id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
              </select>
              {p.id && (
                <>
                  <label className="sr-only" htmlFor={`answer-${i}`}>Your answer to {promptText(p.id)}</label>
                  <textarea id={`answer-${i}`} className="field min-h-16" maxLength={MAX_ANSWER} value={p.answer} placeholder="Your answer"
                    onChange={(e) => setPrompts((all) => all.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
                </>
              )}
            </fieldset>
          ))}
          <fieldset className="flex flex-col gap-2 border-t border-line pt-3">
            <legend className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><IconMic size={16} /> Voice prompt <span className="font-normal text-muted">(optional, up to 30 seconds)</span></legend>
            <label className="sr-only" htmlFor="voice-prompt">Voice prompt question</label>
            <select id="voice-prompt" className="field min-h-11 py-2 text-sm" value={voicePrompt} onChange={(e) => setVoicePrompt(e.target.value)}>
              <option value="">Choose what you&apos;ll answer…</option>
              {PROMPTS.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
            </select>
            {voice && !rec.recording && <VoicePlayer src={voice.src} ms={voice.ms} />}
            <div className="flex flex-wrap items-center gap-2">
              {rec.recording ? (
                <button type="button" className="btn btn-sm" onClick={stopRecording}>Stop · {Math.floor(rec.ms / 1000)}s</button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled={!voicePrompt || voiceBusy}
                  onClick={() => rec.start().then(() => setTimeout(() => stopRecording(), MAX_VOICE_MS), (e) => setError((e as Error).message))}>
                  <IconMic size={16} /> {voiceBusy ? "Uploading…" : voice ? "Record again" : "Record"}
                </button>
              )}
              {voice && !rec.recording && <button type="button" className="text-sm font-semibold text-accent underline" onClick={() => { setVoice(null); setVoiceChanged(true); }}>Remove</button>}
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="h-idea" className="card flex flex-col gap-3">
          <h2 id="h-idea" className="flex items-center gap-2 font-semibold"><IconSparkle size={18} /> A date you&apos;d like to go on</h2>
          <p className="text-sm text-muted">This sits on your profile. People can say yes to it, and if you match, Afriheart turns it into a plan in your chat.</p>
          <label className="sr-only" htmlFor="date-idea">Your date idea</label>
          <input id="date-idea" className="field" value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={120} required placeholder="e.g. Sunrise walk on the promenade, then coffee" />
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((i) => <button key={i} type="button" className={`chip min-h-11 ${idea === i ? "chip-on" : ""}`} onClick={() => setIdea(i)}>{i}</button>)}
          </div>
        </section>

        <section className="card flex flex-col gap-3 text-sm">
          {!isNew && (
            <label className="flex items-start gap-3">
              <input type="checkbox" name="paused" defaultChecked={initial?.paused} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
              <span><strong>Pause my profile.</strong> You won&apos;t be shown to new people. Your matches and chats stay.</span>
            </label>
          )}
          {isNew && (
            <label className="flex items-start gap-3">
              <input type="checkbox" name="consent" required className="mt-1 h-5 w-5 accent-[var(--accent)]" />
              <span>I agree that Afriheart uses my profile, including who I&apos;d like to meet, to show me to people and suggest matches. I can pause or delete my profile at any time. <Link href="/privacy" className="font-semibold text-accent underline">Privacy policy</Link> · <Link href="/dating/safety" className="font-semibold text-accent underline">Dating safety</Link></span>
            </label>
          )}
        </section>

        <button className="btn" disabled={busy || uploading}>{busy ? "Saving…" : isNew ? "Start meeting people" : "Save profile"}</button>
      </form>

      {!isNew && (
        <button className="btn btn-ghost mt-6 self-start text-danger" onClick={async () => {
          if (!confirm("Delete your dating profile? Your photos and likes are removed. Your chats stay.")) return;
          await apiSend("/api/dating/profile", "DELETE").catch(() => undefined);
          router.replace("/you");
        }}>Delete dating profile</button>
      )}
    </main>
  );
}

async function shrink(file: File, side = 1200, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't open that photo."))), "image/jpeg", quality));
}
