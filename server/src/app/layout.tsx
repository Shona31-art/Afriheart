import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { NavBar } from "@/components/nav-bar";
import { SyncProvider } from "@/components/sync-provider";
import { AppShell } from "@/components/app-shell";

// Both typefaces are open source (SIL Open Font License) and ship with the app: no requests to font services.
const bodoni = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz-normal.woff2", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz-italic.woff2", style: "italic" },
  ],
  weight: "400 900",
  variable: "--font-bodoni",
  display: "swap",
  fallback: ["Didot", "Georgia", "serif"],
});
const hanken = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-italic.woff2", style: "italic" },
  ],
  weight: "100 900",
  variable: "--font-hanken",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "Afriheart", template: "%s · Afriheart" },
  description: "Dating built around real dates: match, chat privately, and make the date happen.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Afriheart", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/afriheart-mark.svg", type: "image/svg+xml" }], apple: "/apple-icon.png" },
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0e3b34" }, { media: "(prefers-color-scheme: dark)", color: "#0e2e29" }], width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-ZA" className={`${bodoni.variable} ${hanken.variable}`}>
      <body className="min-h-dvh">
        <Suspense fallback={null}>
          <SyncProvider>
            <AppShell>{children}</AppShell>
            <NavBar />
          </SyncProvider>
        </Suspense>
      </body>
    </html>
  );
}
