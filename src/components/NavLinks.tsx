"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

// "New video" is the sidebar's big button; the phone top bar lists it as a link.
export const NAV: { href: string; label: string; icon: IconName; match: (p: string) => boolean; topOnly?: boolean }[] = [
  { href: "/videos", label: "Videos", icon: "film", match: (p) => p === "/videos" || (p.startsWith("/videos/") && p !== "/videos/new") },
  { href: "/videos/new", label: "New video", icon: "plus", match: (p) => p === "/videos/new", topOnly: true },
  { href: "/stats", label: "Stats", icon: "chart", match: (p) => p.startsWith("/stats") },
];
const linksFor = (variant: "side" | "top") => NAV.filter((l) => variant === "top" || !l.topOnly);

/** The nav links with the current page marked. `variant` picks the sidebar or the phone top bar. */
export function NavLinks({ variant = "side" }: { variant?: "side" | "top" }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className={variant === "side" ? "side-nav" : undefined}>
      {linksFor(variant).map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined} title={l.label}>
          {variant === "side" && <Icon name={l.icon} />}
          <span className="side-text">{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Same links, nothing marked: the Suspense fallback while the pathname is unknown. */
export function StaticNavLinks({ variant = "side" }: { variant?: "side" | "top" }) {
  return (
    <nav aria-label="Main" className={variant === "side" ? "side-nav" : undefined}>
      {linksFor(variant).map((l) => (
        <Link key={l.href} href={l.href} title={l.label}>
          {variant === "side" && <Icon name={l.icon} />}
          <span className="side-text">{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}
