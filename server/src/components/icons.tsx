// Afriheart's icon set: simple 24px line icons drawn for the app, in the current text colour.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const IconBack = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const IconPhone = (p: P) => (
  <Svg {...p}><path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 005.3 5.3l1.4-2.2L19 14.5V18a2 2 0 01-2 2A14 14 0 013 6a2 2 0 012-2z" /></Svg>
);
export const IconVideo = (p: P) => <Svg {...p}><rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10.5l6-3.5v10l-6-3.5" /></Svg>;
export const IconMic = (p: P) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" /></Svg>;
export const IconMicOff = (p: P) => <Svg {...p}><path d="M9 9v2a3 3 0 005 2.2M15 9.3V6a3 3 0 00-5.8-1M5.5 11a6.5 6.5 0 0010.3 5.3M18.5 11a6.4 6.4 0 01-.6 2.7M12 17.5V21M3 3l18 18" /></Svg>;
export const IconSend = (p: P) => <Svg {...p}><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconCamera = (p: P) => <Svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
export const IconCameraOff = (p: P) => <Svg {...p}><path d="M9 5h6l2 3h3v10M17 19H4V8h3M3 3l18 18" /><path d="M10 10.5a3.5 3.5 0 004.5 4.5" /></Svg>;
export const IconFlip = (p: P) => <Svg {...p}><path d="M20 7h-9a6 6 0 00-6 6v1M17 4l3 3-3 3M4 17h9a6 6 0 006-6v-1M7 20l-3-3 3-3" /></Svg>;
export const IconSpeaker = (p: P) => <Svg {...p}><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" /><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /></Svg>;
export const IconHangUp = (p: P) => (
  <Svg {...p}><path d="M3 13.5c5-4.5 13-4.5 18 0l-2 2.5-3.5-1.3V12a10 10 0 00-7 0v2.7L5 16z" /></Svg>
);
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Svg>;
export const IconChat = (p: P) => <Svg {...p}><path d="M5 5h14a1 1 0 011 1v10a1 1 0 01-1 1h-8l-5 4v-4H5a1 1 0 01-1-1V6a1 1 0 011-1z" /></Svg>;
export const IconCalendar = (p: P) => <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></Svg>;
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0114 0" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></Svg>;
export const IconImage = (p: P) => <Svg {...p}><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M20 16l-5-5-8 8" /></Svg>;
export const IconSparkle = (p: P) => <Svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></Svg>;
export const IconRetry = (p: P) => <Svg {...p}><path d="M4 12a8 8 0 0113.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 01-13.7 5.6L4 15.3M4 20v-4.7h4.7" /></Svg>;
export const IconOffline = (p: P) => <Svg {...p}><path d="M2 8.5a15 15 0 0120 0M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0M12 19h.01M3 3l18 18" /></Svg>;
export const IconHeart = (p: P) => <Svg {...p}><path d="M12 20s-7-4.4-8.6-9A4.6 4.6 0 0112 6.6 4.6 4.6 0 0120.6 11C19 15.6 12 20 12 20z" /></Svg>;
export const IconShield = (p: P) => <Svg {...p}><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z" /><path d="M9 12l2 2 4-4" /></Svg>;
export const IconMore = (p: P) => <Svg {...p}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></Svg>;
export const IconPin = (p: P) => <Svg {...p}><path d="M12 21s-6-5.6-6-11a6 6 0 0112 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></Svg>;
export const IconEdit = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></Svg>;
export const IconCards = (p: P) => <Svg {...p}><rect x="3" y="6" width="11" height="15" rx="2" transform="rotate(-8 8.5 13.5)" /><rect x="10" y="4" width="11" height="15" rx="2" transform="rotate(8 15.5 11.5)" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconFriends = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.3c2.3.1 4 1.6 4.6 4.2" /></Svg>;
export const IconReply = (p: P) => <Svg {...p}><path d="M10 8L5 12.5 10 17" /><path d="M5.5 12.5H14a5 5 0 015 5V19" /></Svg>;
export const IconForward = (p: P) => <Svg {...p}><path d="M14 8l5 4.5-5 4.5" /><path d="M18.5 12.5H10a5 5 0 00-5 5V19" /></Svg>;
export const IconStar = (p: P) => <Svg {...p}><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H7a2 2 0 00-2 2v9a2 2 0 002 2h1" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.01" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.7-4.7" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></Svg>;
export const IconPoll = (p: P) => <Svg {...p}><path d="M5 20V10M12 20V4M19 20v-7" /></Svg>;
export const IconTimer = (p: P) => <Svg {...p}><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2M10 2.5h4" /></Svg>;
export const IconMute = (p: P) => <Svg {...p}><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4zM16 9.5l5 5M21 9.5l-5 5" /></Svg>;
export const IconArchive = (p: P) => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="4" rx="1" /><path d="M5 8.5V19a1 1 0 001 1h12a1 1 0 001-1V8.5M10 12.5h4" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" /></Svg>;
export const IconOnce = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" strokeDasharray="3 2.4" /><path d="M10.5 9.5L12.5 8v8" /></Svg>;
export const IconLink = (p: P) => <Svg {...p}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Svg>;
export const IconUnread = (p: P) => <Svg {...p}><path d="M5 5h9M5 5a1 1 0 00-1 1v10a1 1 0 001 1h3v4l5-4h6a1 1 0 001-1v-5" /><circle cx="19" cy="6" r="2.5" /></Svg>;
export const IconPushPin = (p: P) => <Svg {...p}><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" /></Svg>;
export const IconSmile = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.2c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2" /><path d="M9 9.8h.01M15 9.8h.01" strokeWidth={2.6} /></Svg>;
export const IconClip = (p: P) => <Svg {...p}><path d="M16.5 7.5l-7.4 7.4a2 2 0 002.8 2.8l7.8-7.8a4 4 0 00-5.7-5.7L6.2 12a6 6 0 008.5 8.5l5.1-5.1" /></Svg>;
