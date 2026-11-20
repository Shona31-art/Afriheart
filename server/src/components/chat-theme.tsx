"use client";

import { BUBBLES, setTheme, useTheme, WALLPAPERS } from "@/lib/wallpaper";

/** Chat theme: wallpaper and the colour of your own messages, with a little preview. */
export function ChatThemePicker({ chatId }: { chatId: string }) {
  const theme = useTheme(chatId);
  return (
    <div className="flex flex-col gap-3" data-theme-picker>
      <div className="chat-bg flex flex-col gap-1 rounded-xl p-3" data-wall={theme.wall} data-bubbles={theme.bubbles} aria-hidden>
        <span className="bubble bubble-them w-fit text-sm">Howzit! Braai on Saturday?</span>
        <span className="bubble bubble-me w-fit text-sm">Yes please 🔥</span>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Wallpaper</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Wallpaper">
          {WALLPAPERS.map((w) => (
            <button key={w.id} type="button" role="radio" aria-checked={theme.wall === w.id} aria-label={w.label} title={w.label}
              onClick={() => setTheme(chatId, { wall: w.id })}
              className={`chat-bg h-12 w-12 rounded-xl border-2 ${theme.wall === w.id ? "border-accent ring-2 ring-accent/40" : "border-line"}`} data-wall={w.id} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Your messages</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour of your messages">
          {BUBBLES.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={theme.bubbles === b.id} aria-label={b.label} title={b.label}
              onClick={() => setTheme(chatId, { bubbles: b.id })} data-bubbles={b.id}
              className={`h-10 w-10 rounded-full border-2 ${theme.bubbles === b.id ? "border-accent ring-2 ring-accent/40" : "border-line"}`} style={{ background: "var(--bubble-me)" }} />
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">Only on this phone. The other person keeps their own theme.</p>
    </div>
  );
}
