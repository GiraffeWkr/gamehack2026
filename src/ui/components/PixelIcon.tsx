import type { CSSProperties, ReactNode } from 'react';
import type { IconName } from '../../game/types';

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  color?: string;
  style?: CSSProperties;
  title?: string;
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
  fill: 'none',
};

const solid = { fill: 'currentColor' };

function glyph(name: IconName): ReactNode {
  switch (name) {
    case 'skull':
    case 'skullSmall':
      return (
        <>
          <path d="M5 9a7 7 0 0 1 14 0v4l-2 1v4H7v-4L5 13V9Z" {...solid} />
          <rect x="8" y="10" width="3" height="3" fill="#0b0d0e" />
          <rect x="13" y="10" width="3" height="3" fill="#0b0d0e" />
          <path d="M10 16h1v3h-1zm3 0h1v3h-1z" fill="#0b0d0e" />
        </>
      );
    case 'aquila':
      return (
        <>
          <path d="M12 5v13" {...stroke} />
          <path d="M12 9 5 6l2 5-4 2 6 2 3-2 3 2 6-2-4-2 2-5-7 3Z" {...stroke} />
          <rect x="10" y="17" width="4" height="2" {...solid} />
        </>
      );
    case 'hammer':
      return (
        <>
          <path d="m13 5 6 6-7 7-6-6 7-7Z" {...solid} />
          <path d="m10 14 8 8" {...stroke} strokeWidth={3} />
          <path d="m4 20 4-4" {...stroke} />
        </>
      );
    case 'cog':
      return (
        <>
          <circle cx="12" cy="12" r="5" {...stroke} strokeWidth={2.5} />
          <path
            d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
            {...stroke}
            strokeWidth={2.5}
          />
          <circle cx="12" cy="12" r="1.5" {...solid} />
        </>
      );
    case 'eye':
      return (
        <>
          <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" {...stroke} />
          <circle cx="12" cy="12" r="3" {...solid} />
          <rect x="11" y="4" width="2" height="2" {...solid} />
        </>
      );
    case 'flame':
      return (
        <path
          d="M12 2c1 5-5 6-5 12a5 5 0 0 0 10 0c0-4-3-5-3-9-1 3-3 4-3 6-1-3 1-6 1-9Z"
          {...solid}
        />
      );
    case 'bolt':
      return <path d="M14 2 5 14h6l-1 8 9-12h-6l1-8Z" {...solid} />;
    case 'snow':
      return (
        <>
          <path d="M12 2v20M3 7l18 10M21 7 3 17" {...stroke} />
          <path d="m8 4 4 3 4-3M8 20l4-3 4 3" {...stroke} />
        </>
      );
    case 'scarab':
      return (
        <>
          <ellipse cx="12" cy="13" rx="4.5" ry="6" {...solid} />
          <path d="M8 9 4 6M16 9l4-3M8 13H3M16 13h5M8 17l-4 3M16 17l4 3" {...stroke} />
          <rect x="11" y="6" width="2" height="2" fill="#0b0d0e" />
        </>
      );
    case 'hound':
      return (
        <>
          <path d="M4 15h13l3-5 2 1-2 4v4h-3v-3H7v3H4v-4Z" {...solid} />
          <path d="M7 15V9l4-3 3 3" {...stroke} />
          <rect x="15" y="10" width="2" height="2" fill="#0b0d0e" />
        </>
      );
    case 'servitor':
      return (
        <>
          <rect x="8" y="8" width="8" height="8" {...solid} />
          <rect x="10" y="4" width="4" height="4" {...solid} />
          <path d="M8 12H4M16 12h4M10 16v4M14 16v4" {...stroke} />
          <rect x="10" y="10" width="4" height="2" fill="#0b0d0e" />
        </>
      );
    case 'star':
      return <path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z" {...solid} />;
    case 'lock':
      return (
        <>
          <path d="M7 10V7a5 5 0 0 1 10 0v3" {...stroke} />
          <rect x="5" y="10" width="14" height="11" {...solid} />
          <rect x="11" y="14" width="2" height="4" fill="#0b0d0e" />
        </>
      );
    case 'check':
      return <path d="m4 12 5 5L20 6" {...stroke} strokeWidth={3} />;
    case 'close':
      return <path d="M5 5l14 14M19 5 5 19" {...stroke} strokeWidth={3} />;
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3.5" {...stroke} />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" {...stroke} />
        </>
      );
    case 'sound':
      return (
        <>
          <path d="M4 9h4l5-4v14l-5-4H4V9Z" {...solid} />
          <path d="M16 8c2 2 2 6 0 8M19 5c4 4 4 10 0 14" {...stroke} />
        </>
      );
    case 'music':
      return (
        <>
          <path d="M9 18V5l11-2v11" {...stroke} />
          <circle cx="6" cy="18" r="3" {...solid} />
          <circle cx="17" cy="14" r="3" {...solid} />
        </>
      );
    case 'pause':
      return (
        <>
          <rect x="6" y="4" width="4" height="16" {...solid} />
          <rect x="14" y="4" width="4" height="16" {...solid} />
        </>
      );
    case 'play':
      return <path d="m7 4 13 8-13 8V4Z" {...solid} />;
    case 'arrow':
      return (
        <>
          <path d="M4 12h16M14 6l6 6-6 6" {...stroke} />
        </>
      );
    case 'shield':
      return (
        <>
          <path d="M12 2 4 5v7c0 5 4 8 8 10 4-2 8-5 8-10V5l-8-3Z" {...stroke} />
          <path d="M12 6v10" {...stroke} />
        </>
      );
    case 'sword':
      return (
        <>
          <path d="m5 19 3-3M6 16 18 4l2 2L8 18l-2-2Z" {...solid} />
          <path d="m4 15 5 5" {...stroke} strokeWidth={2.5} />
          <path d="m13 20 7-7" {...stroke} />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M12 7v6l4 2" {...stroke} />
        </>
      );
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <rect x="11" y="10" width="2" height="7" {...solid} />
          <rect x="11" y="6" width="2" height="2" {...solid} />
        </>
      );
    case 'helmet':
      return (
        <>
          <path d="M5 12a7 7 0 0 1 14 0v7h-4v-5H9v5H5v-7Z" {...solid} />
          <path d="M8 7c2-4 6-4 8 0" {...stroke} />
        </>
      );
    case 'target':
      return (
        <>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <circle cx="12" cy="12" r="4" {...stroke} />
          <path d="M12 1v4M12 19v4M1 12h4M19 12h4" {...stroke} />
        </>
      );
    case 'pickaxe':
      return (
        <>
          <path d="m4 20 12-12" {...stroke} strokeWidth={3} />
          <path d="M9 4c6-2 11 2 12 8-5-3-9-3-12 0-2-3-2-5 0-8Z" {...solid} />
        </>
      );
    case 'anvil':
      return (
        <>
          <path d="M4 10h15l-2 4h-4v4h3v3H8v-3h3v-4H6l-2-4Z" {...solid} />
          <path d="M4 10 2 8h3" {...stroke} />
        </>
      );
    case 'book':
      return (
        <>
          <path d="M4 4h7v16H4V4ZM13 4h7v16h-7V4Z" {...stroke} />
          <path d="M12 4v16" {...stroke} />
          <path d="M7 8h2M7 12h2M15 8h2M15 12h2" {...stroke} />
        </>
      );
    case 'chart':
      return (
        <>
          <path d="M4 20V4M4 20h16" {...stroke} />
          <path d="m7 15 4-5 3 3 5-7" {...stroke} />
          <rect x="14" y="5" width="4" height="4" {...solid} />
        </>
      );
    case 'trophy':
      return (
        <>
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" {...solid} />
          <path d="M7 5H3v3c0 3 3 4 5 4M17 5h4v3c0 3-3 4-5 4M12 14v4M8 21h8M9 18h6v3H9z" {...stroke} />
        </>
      );
    case 'chain':
      return (
        <>
          <path d="M9 15 15 9" {...stroke} />
          <path d="M7 17a4 4 0 0 1 0-6l2-2M17 7a4 4 0 0 1 0 6l-2 2" {...stroke} />
        </>
      );
    case 'diamond':
      return <path d="m12 2 8 8-8 12L4 10l8-8Z" {...solid} />;
    case 'drop':
      return <path d="M12 2S5 11 5 15a7 7 0 0 0 14 0c0-4-7-13-7-13Z" {...solid} />;
    case 'boltPistol':
      return (
        <>
          <path d="M3 7h14v5H9v4H5v-4H3V7Z" {...solid} />
          <path d="M17 8h4v3h-4M5 16v3" {...stroke} />
        </>
      );
    case 'gelt':
      return (
        <>
          <circle cx="12" cy="12" r="9" {...solid} />
          <circle cx="12" cy="12" r="6" fill="#0b0d0e" opacity=".25" />
          <path d="M9 9h6v2h-2v5h2v2H9v-2h2V11H9V9Z" fill="#0b0d0e" />
        </>
      );
    case 'teef':
      return (
        <>
          <path d="M6 4c5-2 8 1 8 5 0 3-2 4-2 7 0 2 1 4-1 4s-2-3-3-3-1 3-3 3-1-3-1-5c0-4 2-5 2-8V4Z" {...solid} />
          <path d="M6 6c3-1 5 1 5 3" stroke="#0b0d0e" strokeWidth="1.5" fill="none" />
        </>
      );
    case 'alloy':
    case 'plasteel':
    case 'ceramite':
      return (
        <>
          <path d="m3 9 9-5 9 5-9 5-9-5Z" {...solid} />
          <path d="m3 13 9 5 9-5M3 17l9 5 9-5" {...stroke} />
        </>
      );
    case 'relic':
      return (
        <>
          <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" {...solid} />
          <circle cx="12" cy="12" r="2" fill="#0b0d0e" />
        </>
      );
    case 'warpDust':
      return (
        <>
          <path d="M12 3c5 3 5 7 2 9s-2 5 1 7" {...stroke} />
          <path d="M7 6c-3 4-2 8 2 9" {...stroke} opacity=".6" />
          <circle cx="12" cy="12" r="1.5" {...solid} />
          <circle cx="8" cy="18" r="1" {...solid} />
          <circle cx="17" cy="7" r="1" {...solid} />
        </>
      );
    case 'biomass':
      return (
        <>
          <path d="M5 14c0-5 4-9 8-9 5 0 7 5 5 9-2 5-4 7-8 6-3-1-5-2-5-6Z" {...solid} />
          <circle cx="9" cy="10" r="1.5" fill="#0b0d0e" />
          <circle cx="15" cy="14" r="1" fill="#0b0d0e" />
        </>
      );
    case 'promethium':
      return (
        <>
          <rect x="5" y="7" width="14" height="14" rx="1" {...solid} />
          <path d="M8 7V4h8v3M9 11h6v3H9z" {...stroke} />
          <path d="M12 15c-2 2-3 3-3 4a3 3 0 0 0 6 0c0-1-1-2-3-4Z" fill="#0b0d0e" />
        </>
      );
    case 'adamantium':
      return (
        <>
          <path d="m12 2 7 6-3 14H8L5 8l7-6Z" {...solid} />
          <path d="M12 2v20M5 8h14" {...stroke} opacity=".55" />
        </>
      );
    case 'beacon':
      return (
        <>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <circle cx="12" cy="12" r="4" {...solid} />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" {...stroke} />
        </>
      );
    case 'daemonBlood':
      return (
        <>
          <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" {...solid} />
          <path d="M9 15c0 2 1 3 3 3" stroke="#0b0d0e" strokeWidth="1.5" fill="none" />
        </>
      );
    case 'spark':
      return (
        <>
          <path d="M12 2v6M12 16v6M2 12h6M16 12h6" {...stroke} />
          <path d="m5 5 4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" {...stroke} />
        </>
      );
    case 'chest':
      return (
        <>
          <rect x="3" y="8" width="18" height="13" {...solid} />
          <rect x="3" y="8" width="18" height="4" fill="#0b0d0e" opacity=".35" />
          <rect x="10" y="13" width="4" height="5" fill="#0b0d0e" />
        </>
      );
    case 'wrench':
      return (
        <>
          <path d="m4 20 8-8" {...stroke} strokeWidth={3} />
          <path d="M14 4a5 5 0 0 0-5 6l3 3a5 5 0 0 0 6-5l-3 1-2-2 1-3Z" {...solid} />
        </>
      );
    case 'tentacle':
      return (
        <>
          <path d="M6 3c7 4 4 8 3 12s3 6 9 6" {...stroke} strokeWidth={3} />
          <path d="M14 17c-4 0-4 4 0 4" {...stroke} />
        </>
      );
    case 'warning':
      return (
        <>
          <path d="M12 3 22 21H2L12 3Z" {...stroke} />
          <rect x="11" y="9" width="2" height="7" {...solid} />
          <rect x="11" y="17" width="2" height="2" {...solid} />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="8" {...stroke} />;
  }
}

export function PixelIcon({ name, size = 18, className, color, style, title }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ ...style, color }}
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {glyph(name)}
    </svg>
  );
}
