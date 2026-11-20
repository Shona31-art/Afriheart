"use client";

import { formatBytes, setDataMode, useDataLight, useDataUsed, type DataMode } from "@/lib/data-light";

const MODES: [DataMode, string, string][] = [
  ["auto", "Automatic", "On when your phone's data saver is on"],
  ["on", "Always on", "Small photos, tap to load chat photos, lighter voice notes and video calls"],
  ["off", "Off", "Full-quality photos and video"],
];

/** Data-light mode switch and this phone's data meter, on the You tab. */
export function DataLightSettings() {
  const { mode, on } = useDataLight();
  const { thisWeek, lastWeek } = useDataUsed();
  return (
    <div className="card flex flex-col gap-3" data-light-settings>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold">Data-light mode {on && <span className="ml-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">On now</span>}</legend>
        {MODES.map(([id, label, hint]) => (
          <label key={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-1 py-1.5">
            <input type="radio" name="data-mode" value={id} checked={mode === id} onChange={() => setDataMode(id)} className="mt-1 h-5 w-5 accent-[color:var(--accent)]" />
            <span>
              <span className="block text-[15px] font-semibold">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="rounded-xl bg-line/40 px-3 py-2 text-sm" data-usage>
        <p><span className="font-semibold">{formatBytes(thisWeek)}</span> used by Afriheart on this phone this week{lastWeek ? ` (last week: ${formatBytes(lastWeek)})` : ""}.</p>
        <p className="text-xs text-muted">Counts photos, voice notes, messages and calls in Afriheart. Your network may count slightly differently.</p>
      </div>
    </div>
  );
}
