"use client";

import Link from "next/link";
import { useState } from "react";
import { apiSend } from "@/lib/client";
import { IconBack } from "./icons";

const COMING = [
  ["Date deals", "2-for-1 coffees, cheaper cocktails and date-night specials at places near you, only for Afriheart couples."],
  ["Singles nights", "Relaxed, safe evenings out: games nights, comedy, salsa, and meeting people who are also on Afriheart."],
  ["Group braais and outings", "Bring a friend. Hikes, picnics, braais and markets where double dates happen naturally."],
];

/** Date deals and events: coming soon. People can ask to be told, and venues can put their hand up. */
export function DealsSoon({ city: initialCity, subscribed }: { city: string; subscribed: boolean }) {
  const [city, setCity] = useState(initialCity);
  const [done, setDone] = useState(subscribed);
  const [venue, setVenue] = useState({ venue: "", city: "", contact: "" });
  const [venueSent, setVenueSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(payload: Record<string, string>, ok: () => void) {
    setBusy(true);
    setError(null);
    try { await apiSend("/api/deals", "POST", payload); ok(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1">
        <Link href="/plans" className="icon-btn -ml-3" aria-label="Back to Plans"><IconBack /></Link>
        <div>
          <p className="label">Coming soon</p>
          <h1 className="display text-3xl leading-tight">Date deals and events</h1>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {COMING.map(([t, d]) => (
          <li key={t} className="card">
            <p className="font-semibold">{t}</p>
            <p className="text-sm text-muted">{d}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="notify" className="card flex flex-col gap-2">
        <h2 id="notify" className="font-semibold">Be first to know</h2>
        {done ? (
          <p role="status" className="text-sm">You&apos;re on the list for {city || "your city"}. We&apos;ll tell you here when deals and events open near you.</p>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send({ kind: "notify", city }, () => setDone(true)); }}>
            <label className="sr-only" htmlFor="deal-city">Your city or town</label>
            <input id="deal-city" className="field" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City or town, e.g. Durban" maxLength={60} />
            <button className="btn btn-sm shrink-0" disabled={busy || city.trim().length < 2}>Notify me</button>
          </form>
        )}
      </section>

      <section aria-labelledby="venues" className="card flex flex-col gap-2">
        <h2 id="venues" className="font-semibold">Own a restaurant, café or venue?</h2>
        <p className="text-sm text-muted">Get couples through your door on quiet nights. Tell us about your place and the team will be in touch before launch.</p>
        {venueSent ? (
          <p role="status" className="text-sm">Thanks! The Afriheart team will contact you.</p>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); send({ kind: "venue", ...venue }, () => setVenueSent(true)); }}>
            <label className="flex flex-col gap-1 text-sm font-semibold">Venue name<input className="field font-normal" value={venue.venue} onChange={(e) => setVenue({ ...venue, venue: e.target.value })} maxLength={80} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">City or town<input className="field font-normal" value={venue.city} onChange={(e) => setVenue({ ...venue, city: e.target.value })} maxLength={60} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Email or phone<input className="field font-normal" value={venue.contact} onChange={(e) => setVenue({ ...venue, contact: e.target.value })} maxLength={120} autoComplete="email" /></label>
            <button className="btn btn-ghost btn-sm self-start" disabled={busy}>Send</button>
          </form>
        )}
      </section>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
