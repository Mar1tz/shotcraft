import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// AGENTORA's typeface, self-hosted by next/font: no request to Google at run
// time, and a size-adjusted fallback so the swap causes no layout shift.
// Mono is only for timecodes and metadata -- not preloaded.
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap", preload: false });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "ShotCraft", template: "%s · ShotCraft" },
  description: "Product videos from your code — by AGENTORA.",
  applicationName: "ShotCraft",
};

// A dark studio, always -- like the editor it leads to.
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07070a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
