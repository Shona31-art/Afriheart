"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { ChatList } from "./chat-list";
import { AnnouncementBanner } from "./announcement-banner";
import { IconCalendar, IconChat, IconHeart, IconPlus, IconUser } from "./icons";
import { useMe, useUnread } from "./sync-provider";

const TABS = [
  { href: "/discover", label: "Discover", Icon: IconHeart },
  { href: "/", label: "Chats", Icon: IconChat },
  { href: "/plans", label: "Plans", Icon: IconCalendar },
  { href: "/you", label: "You", Icon: IconUser },
];

/**
 * On computers and tablets in landscape (1024px+), Afriheart shows two panes like
 * WhatsApp Web: chats on the left, the open chat or tab on the right. Phones are unchanged.
 */
const WIDE = "(min-width: 1024px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** Only computers get the sidebar, so phones don't load the chat list twice. */
const useWide = () => useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const wide = useWide();
  const path = usePathname();
  const unread = useUnread();
  // The admin area and the team queue get the whole screen.
  const show = wide && !!me && !path.startsWith("/signin") && !path.startsWith("/call/") && !path.startsWith("/p/") && !path.startsWith("/admin") && !path.startsWith("/team");
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/chats") || path.startsWith("/calls") : path.startsWith(href));
  return (
    <>
      {show && (
        <aside aria-label="Chats" className="fixed inset-y-0 left-0 z-20 hidden w-[380px] flex-col border-r border-line bg-paper lg:flex">
          <div className="flex items-center justify-between px-4 pb-2 pt-5">
            <p className="display flex items-center gap-2 text-2xl">{/* eslint-disable-next-line @next/next/no-img-element -- a tiny SVG logo */}
<img src="/afriheart-mark.svg" alt="" width={30} height={30} className="shrink-0" />Afriheart</p>
            <Link href="/chats/new" className="btn btn-sm"><IconPlus size={18} /> New chat</Link>
          </div>
          <nav aria-label="Main" className="mx-4 mb-3 grid grid-cols-4 rounded-xl bg-card p-1 shadow-sm">
            {TABS.map(({ href, label, Icon }) => (
              <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
                className={`relative flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${active(href) ? "bg-accent-soft text-accent" : "text-muted"}`}>
                <Icon size={18} /> {label}
                {href === "/" && unread > 0 && <span className="sr-only">({unread} unread)</span>}
              </Link>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatList initial={null} personId={me} />
          </div>
        </aside>
      )}
      <div className={`flex min-h-dvh flex-col ${show ? "lg:pl-[380px]" : ""}`}>
        {!path.startsWith("/call/") && <AnnouncementBanner />}
        <div className={`mx-auto flex w-full flex-1 flex-col ${path.startsWith("/admin") ? "" : "max-w-xl"}`}>{children}</div>
      </div>
    </>
  );
}
