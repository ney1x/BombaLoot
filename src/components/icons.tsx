import type { SVGProps } from "react";
import type { GameId } from "@/lib/products";

const base = {
  fill: "none",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function LightningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M12.5 3 5 13.2h5.3L10.8 21 19 10.3h-5.4L12.5 3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M12 3.5 5 6v5.2c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V6l-7-2.5Z" />
      <path d="m9 12 2.1 2.1L15.5 10" />
    </svg>
  );
}

export function PackageCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <path d="M3.7 7.3 12 12l8.3-4.7" />
      <path d="M12 12v9" />
      <path d="m15 6.5-6 3.4" />
    </svg>
  );
}

export function HistoryCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M4 4v4.4h4.4" />
      <path d="M12 8.5V12l2.6 1.6" />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m20 20-4.4-4.4" />
    </svg>
  );
}

export function CartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M4 5h2.2l1 11.2A2 2 0 0 0 9.2 18h8.6a2 2 0 0 0 2-1.7L21 8H7" />
      <circle cx="10" cy="21" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="21" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5 20c1.1-3.4 3.9-5.2 7-5.2s5.9 1.8 7 5.2" />
    </svg>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
    </svg>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function PictureIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17 5-5 3.5 3.5L17 11l3 3" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="m4 12.5 5.5 5.5L20 6.5" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M4.5 7h15M9.5 7V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3V7M18.5 7l-.7 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5.5 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.6A10.4 10.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-3.3 4M6.5 7.4C4 9.1 2.5 12 2.5 12S6 18.5 12 18.5c1.3 0 2.5-.3 3.6-.8" />
      <path d="M9.9 10a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5" />
    </svg>
  );
}

export function LogOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M9 20H5.5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M16 16.5 20.5 12 16 7.5" />
      <path d="M20.5 12h-11" />
    </svg>
  );
}

export function AwardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <circle cx="12" cy="9" r="5.5" />
      <path d="m8.3 13.8-1.6 6.7 5.3-2.8 5.3 2.8-1.6-6.7" />
    </svg>
  );
}

export function ReceiptIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M6 3.5h12v17l-2.5-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 20.5Z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" />
    </svg>
  );
}

export function CartEmptyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M4 5h2.2l1 11.2A2 2 0 0 0 9.2 18h8.6a2 2 0 0 0 2-1.7L21 8H7" />
      <circle cx="10" cy="21" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="21" r="1.2" fill="currentColor" stroke="none" />
      <path d="m10.5 10.5 3 3m0-3-3 3" />
    </svg>
  );
}

function ValorantMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M4 6h6l4 7.5L18 6h2l-8.5 15L4 6Z" strokeLinejoin="miter" />
    </svg>
  );
}

function RobloxMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" transform="rotate(-14 12 12)" />
    </svg>
  );
}

function LeagueMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8L12 3.5Z" />
      <path d="M12 8.5v7" />
      <path d="m8.7 10.3 6.6 3.4" />
      <path d="m15.3 10.3-6.6 3.4" />
    </svg>
  );
}

function OverwatchMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 4.5v3.2M12 16.3v3.2M4.5 12h3.2M16.3 12h3.2" />
    </svg>
  );
}

/** Marca real de Google (4 colores oficiales) — no un ícono de un solo trazo del sistema. */
export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.73l4-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.63l4 3.1c.94-2.85 3.6-4.96 6.73-4.96Z"
      />
    </svg>
  );
}

export function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <path d="M12 14.2v2.4" />
    </svg>
  );
}

export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function HeadsetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M4 13.5v-1a8 8 0 0 1 16 0v1" />
      <rect x="3" y="13" width="4" height="6" rx="1.4" />
      <rect x="17" y="13" width="4" height="6" rx="1.4" />
      <path d="M19 19.5a4 4 0 0 1-4 3h-2" />
    </svg>
  );
}

export function BankIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M4.5 9.5h15v1.6h-15z" strokeLinejoin="miter" />
      <path d="M6 11.5V18M10.2 11.5V18M13.8 11.5V18M18 11.5V18" />
      <path d="M3.5 19.5h17" />
    </svg>
  );
}

export function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5Z" />
    </svg>
  );
}

export function CardOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M3.5 6.5h13.8a2 2 0 0 1 2 2v1.3" />
      <path d="M19.3 14.2v2.1a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 .4-1.2" />
      <path d="M3.3 10.7h9" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.7-5.4L19 8.3" />
      <path d="M19 4.5v3.8h-3.8" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.7 5.4L5 15.7" />
      <path d="M5 19.5v-3.8h3.8" />
    </svg>
  );
}

export function HourglassIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M7.5 3.5v3.2c0 2 1.6 3.6 3.4 4.5.4.2.6.5.6.8s-.2.6-.6.8c-1.8.9-3.4 2.5-3.4 4.5v3.2" />
      <path d="M16.5 3.5v3.2c0 2-1.6 3.6-3.4 4.5-.4.2-.6.5-.6.8s.2.6.6.8c1.8.9 3.4 2.5 3.4 4.5v3.2" />
    </svg>
  );
}

export function ChevronUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...base} {...props}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export const GAME_MARKS: Record<GameId, (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  valorant: ValorantMark,
  roblox: RobloxMark,
  league: LeagueMark,
  overwatch: OverwatchMark,
};
