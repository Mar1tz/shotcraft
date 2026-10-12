// A handful of line icons, inline (no icon font, no extra request).
const PATHS = {
  film: "M4 5h16v14H4zM4 9h16M4 15h16M8 5v4M16 5v4M8 15v4M16 15v4",
  plus: "M12 5v14M5 12h14",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  back: "M15 5l-7 7 7 7",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  play: "M8 5v14l11-7z",
  folder: "M3 7h6l2 2h10v10H3z",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  send: "M5 12h14M13 6l6 6-6 6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
