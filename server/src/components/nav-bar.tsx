"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnread } from "./sync-provider";
import { IconCalendar, IconChat, IconHeart, IconUser } from "./icons";

const ITEMS = [
  { href: "/discover", label: "Discover", Icon: IconHeart },
  { href: "/", label: "Chats", Icon: IconChat },
  { href: "/plans", label: "Plans", Icon: IconCalendar },
  { href: "/you", label: "You", Icon: IconUser },
];

/** Bottom tabs. Hidden inside a chat, a call, sign-in and the guest plan page. */
export function NavBar() {
  const path = usePathname();
  const unread = useUnread();
  if (path.startsWith("/signin") || path.startsWith("/quiz") || path.startsWith("/alphabet-dates") || path.startsWith("/dating/") || path.startsWith("/chats/") || path.startsWith("/call/") || path.startsWith("/p/")) return null;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-[color:var(--hair)] bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-4">
        {ITEMS.map((i) => {
          const on = active(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11.5px] tracking-[.02em] ${on ? "font-semibold text-ink" : "font-medium text-muted"}`}>
              {/* The current tab gets a fine gold marker, like a jeweller's hallmark. */}
              <span aria-hidden className={`absolute top-0 h-[2px] w-8 rounded-full transition-opacity ${on ? "bg-gold opacity-100" : "opacity-0"}`} />
              <span aria-hidden className={on ? "text-accent" : ""}><i.Icon size={22} /></span>
              {i.label}
              {i.href === "/" && unread > 0 && (
                <span className="absolute right-[calc(50%-24px)] top-1.5 min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-accent-ink ring-2 ring-card">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
