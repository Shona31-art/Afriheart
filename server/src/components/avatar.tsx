import { avatarColor, initials } from "@/lib/client";
import { IconFriends } from "./icons";

/** Initials set in Bodoni on a jewel tone, with a faint sheen and a fine gold ring. */
export function Avatar({ name, seed, size = 44, group, className = "" }: { name: string; seed?: string; size?: number; group?: boolean; className?: string }) {
  return (
    <span aria-hidden className={`display inline-flex shrink-0 items-center justify-center rounded-full text-white ring-1 ring-[#d6b77e]/35 ${className}`}
      style={{ width: size, height: size, background: `linear-gradient(155deg, rgba(255,255,255,.16), rgba(255,255,255,0) 55%), ${avatarColor(seed ?? name)}`, fontSize: size * 0.4, letterSpacing: "0.02em" }}>
      {group ? <IconFriends size={Math.round(size * 0.5)} /> : initials(name)}
    </span>
  );
}
