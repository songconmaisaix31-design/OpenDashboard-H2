import type { ReactElement, SVGProps } from 'react'

export type H2IconName =
  | 'overview'
  | 'events'
  | 'diagnosis'
  | 'analysis'
  | 'assistant'
  | 'reports'
  | 'menu'
  | 'close'
  | 'activity'
  | 'database'
  | 'clock'
  | 'shield'
  | 'layers'
  | 'sparkles'
  | 'chevron-right'
  | 'arrow-up-right'

export interface H2IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'name'> {
  readonly name: H2IconName
  readonly size?: number
}

export function H2Icon({ name, size = 18, ...props }: H2IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {iconPaths[name]}
    </svg>
  )
}

const commonProps = {
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 1.8,
  vectorEffect: 'non-scaling-stroke' as const,
}

const iconPaths: Readonly<Record<H2IconName, ReactElement>> = {
  overview: (
    <g {...commonProps}>
      <rect height="7" rx="1.5" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" width="7" x="3" y="14" />
      <rect height="7" rx="1.5" width="7" x="14" y="14" />
    </g>
  ),
  events: (
    <g {...commonProps}>
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9v4" />
      <path d="M12 16.5h.01" />
    </g>
  ),
  diagnosis: (
    <g {...commonProps}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.3 15.3 5 5" />
      <path d="M7.8 10.5h5.4" />
      <path d="M10.5 7.8v5.4" />
    </g>
  ),
  analysis: (
    <g {...commonProps}>
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19V3" />
      <path d="M2 19h20" />
    </g>
  ),
  assistant: (
    <g {...commonProps}>
      <path d="M12 3.2 13.6 8l4.8 1.6-4.8 1.6L12 16l-1.6-4.8-4.8-1.6L10.4 8 12 3.2Z" />
      <path d="m18.5 14 .8 2.3 2.2.7-2.2.8-.8 2.2-.7-2.2-2.3-.8 2.3-.7.7-2.3Z" />
    </g>
  ),
  reports: (
    <g {...commonProps}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 12h5" />
      <path d="M10 16h5" />
    </g>
  ),
  menu: (
    <g {...commonProps}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </g>
  ),
  close: (
    <g {...commonProps}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </g>
  ),
  activity: (
    <g {...commonProps}>
      <path d="M3 12h4l2.2-6 4.2 12 2.3-6H21" />
    </g>
  ),
  database: (
    <g {...commonProps}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </g>
  ),
  clock: (
    <g {...commonProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </g>
  ),
  shield: (
    <g {...commonProps}>
      <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </g>
  ),
  layers: (
    <g {...commonProps}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </g>
  ),
  sparkles: (
    <g {...commonProps}>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
    </g>
  ),
  'chevron-right': (
    <path d="m9 5 7 7-7 7" {...commonProps} />
  ),
  'arrow-up-right': (
    <g {...commonProps}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </g>
  ),
}
