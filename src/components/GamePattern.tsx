import type { GameId } from "@/lib/products";

/**
 * Original geometric motifs, one per game — pure shape/line work, never
 * illustration or copyrighted marks. Tiled via SVG <pattern> so it scales
 * to any panel size without raster assets.
 */
export function GamePattern({ gameId, id }: { gameId: GameId; id: string }) {
  return (
    <svg className="game-pattern-svg" aria-hidden="true" focusable="false">
      <defs>{PATTERNS[gameId](id)}</defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

const STROKE = "#ffffff";

const PATTERNS: Record<GameId, (id: string) => React.ReactNode> = {
  valorant: (id) => (
    <pattern id={id} width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
      <line x1="0" y1="0" x2="0" y2="46" stroke={STROKE} strokeOpacity="0.14" strokeWidth="3" />
      <line x1="18" y1="0" x2="18" y2="46" stroke={STROKE} strokeOpacity="0.08" strokeWidth="1.5" />
    </pattern>
  ),
  roblox: (id) => (
    <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
      <rect x="4" y="4" width="14" height="14" fill="none" stroke={STROKE} strokeOpacity="0.14" strokeWidth="2" />
      <rect x="22" y="22" width="14" height="14" fill="none" stroke={STROKE} strokeOpacity="0.1" strokeWidth="2" />
    </pattern>
  ),
  league: (id) => (
    <pattern id={id} width="42" height="24.25" patternUnits="userSpaceOnUse">
      <polygon
        points="10.5,0 21,6.06 21,18.19 10.5,24.25 0,18.19 0,6.06"
        fill="none"
        stroke={STROKE}
        strokeOpacity="0.13"
        strokeWidth="1.6"
      />
      <polygon
        points="31.5,12.13 42,18.19 42,30.31 31.5,36.38 21,30.31 21,18.19"
        fill="none"
        stroke={STROKE}
        strokeOpacity="0.09"
        strokeWidth="1.6"
      />
    </pattern>
  ),
  overwatch: (id) => (
    <pattern id={id} width="60" height="60" patternUnits="userSpaceOnUse">
      <circle cx="30" cy="30" r="22" fill="none" stroke={STROKE} strokeOpacity="0.12" strokeWidth="1.6" />
      <circle cx="30" cy="30" r="3" fill={STROKE} fillOpacity="0.2" />
    </pattern>
  ),
};
