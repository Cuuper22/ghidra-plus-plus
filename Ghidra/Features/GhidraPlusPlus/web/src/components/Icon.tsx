import type { ReactNode } from "react";

type Name =
  | "import"
  | "play"
  | "pause"
  | "save"
  | "download"
  | "classic"
  | "settings"
  | "search"
  | "graph"
  | "source"
  | "close"
  | "chevron"
  | "check"
  | "undo"
  | "key"
  | "menu";
const paths: Record<Name, ReactNode> = {
  import: (
    <>
      <path d="M4 12V5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v5" />
      <path d="M12 10v10m-4-4 4 4 4-4" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h14l3 3v15H3V3h1Z" />
      <path d="M7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4" />
      <path d="M4 17v4h16v-4" />
    </>
  ),
  classic: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 9v11" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m16 16 5 5" />
    </>
  ),
  graph: (
    <>
      <rect x="9" y="2" width="6" height="5" rx="1" />
      <rect x="2" y="17" width="6" height="5" rx="1" />
      <rect x="16" y="17" width="6" height="5" rx="1" />
      <path d="M12 7v5M5 17v-5h14v5" />
    </>
  ),
  source: (
    <>
      <path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" />
    </>
  ),
  close: <path d="M5 5 19 19M19 5 5 19" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  check: <path d="m4 12 5 5L20 6" />,
  undo: (
    <>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h10a6 6 0 1 1 0 12" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="m11 12 10-10v5h-3v3h-3v3h-3" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};
export function Icon({ name, size = 16 }: { name: Name; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
