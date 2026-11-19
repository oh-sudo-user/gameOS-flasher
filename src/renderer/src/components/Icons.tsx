import type { JSX, ReactNode } from 'react'

interface IconProps {
  size?: number
  className?: string
}

function Svg({ children, size = 20, className }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconLogo({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-grad" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7CF6C8" />
          <stop offset="1" stopColor="#6AA8FF" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.6l2.2 5.1 5.4 2.3-5.4 2.3L12 17.5l-2.2-5.2-5.4-2.3 5.4-2.3L12 2.6z"
        fill="url(#logo-grad)"
      />
      <circle cx="17.6" cy="17.4" r="3.1" fill="url(#logo-grad)" opacity="0.55" />
      <circle cx="5.4" cy="18.3" r="1.9" fill="url(#logo-grad)" opacity="0.35" />
    </svg>
  )
}

export function IconHandheld({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <rect x="4" y="2.8" width="16" height="18.4" rx="3.4" />
      <rect x="7" y="6.2" width="10" height="7.2" rx="1.4" />
      <path d="M8.2 17.2h2.1M9.25 16.15v2.1" />
      <circle cx="15.2" cy="17.2" r="1.1" />
      <path d="M11.4 10.6l1.2-1.9h-1.4" />
    </Svg>
  )
}

export function IconSdCard({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M7.2 2.8h7.9l3.7 3.8v14.6H7.2z" />
      <path d="M7.2 2.8v5.4h4.2v-5.4" />
      <path d="M15.4 13.2h1.4M15.4 16.2h1.4M11.6 13.2h1.4M11.6 16.2h1.4" />
    </Svg>
  )
}

export function IconDownload({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M12 3.5v10.2" />
      <path d="M8.2 10.1L12 13.9l3.8-3.8" />
      <path d="M4.5 16.5v2.2a1.8 1.8 0 001.8 1.8h11.4a1.8 1.8 0 001.8-1.8v-2.2" />
    </Svg>
  )
}

export function IconShield({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M12 2.8l7.2 2.6v6.1c0 4.3-2.9 7.6-7.2 9.7-4.3-2.1-7.2-5.4-7.2-9.7V5.4L12 2.8z" />
      <path d="M8.8 11.9l2.2 2.2 4.2-4.4" />
    </Svg>
  )
}

export function IconCheck({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M4.8 12.6l4.6 4.6L19.2 7" />
    </Svg>
  )
}

export function IconAlert({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M12 3.6l9 15.6H3L12 3.6z" />
      <path d="M12 9.4v4.2" />
      <path d="M12 17.1h.01" />
    </Svg>
  )
}

export function IconRefresh({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M20.2 12a8.2 8.2 0 10-2.6 6" />
      <path d="M20.4 6.6v5.2h-5.2" />
    </Svg>
  )
}

export function IconArrowRight({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M4.8 12h14.4" />
      <path d="M13.6 6.4L19.2 12l-5.6 5.6" />
    </Svg>
  )
}

export function IconArrowLeft({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M19.2 12H4.8" />
      <path d="M10.4 6.4L4.8 12l5.6 5.6" />
    </Svg>
  )
}

export function IconClose({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}

export function IconFolder({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M3.4 7.4a1.8 1.8 0 011.8-1.8h4l1.8 2.2h8.2a1.8 1.8 0 011.8 1.8v8.6a1.8 1.8 0 01-1.8 1.8H5.2a1.8 1.8 0 01-1.8-1.8V7.4z" />
    </Svg>
  )
}

export function IconCloud({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M7.2 18.6a4.2 4.2 0 01-.6-8.4 5.6 5.6 0 0110.8 1.2 3.6 3.6 0 01-.7 7.2H7.2z" />
      <path d="M12 15.6V9.9" />
      <path d="M9.8 12l2.2-2.2 2.2 2.2" />
    </Svg>
  )
}

export function IconGithub({ size = 20, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.2a9.9 9.9 0 00-3.1 19.3c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.8.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 015 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.8v2.7c0 .3.2.6.7.5A9.9 9.9 0 0012 2.2z" />
    </svg>
  )
}

export function IconWindows({ size = 20, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3.2 5.4l7.3-1v7.1H3.2V5.4zm8.6-1.2L20.8 3v8.5h-9V4.2zM3.2 12.7h7.3v7.2l-7.3-1v-6.2zm8.6 0h9V21l-9-1.3v-7z" />
    </svg>
  )
}

export function IconApple({ size = 20, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.3 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.2.8-.7 0-1.7-.8-2.8-.7-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.1.8-1.2 1.2-2.4 1.2-2.5 0 0-2.4-.9-2.4-3.5zM14.2 6.1c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.7 1.3-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.7-1.3z" />
    </svg>
  )
}

export function IconChip({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3" />
    </Svg>
  )
}

export function IconLock({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <rect x="4.8" y="10.2" width="14.4" height="10" rx="2.2" />
      <path d="M8.2 10.2V7.8a3.8 3.8 0 017.6 0v2.4" />
      <path d="M12 14.2v2.2" />
    </Svg>
  )
}

export function IconUsb({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M12 21V5.2" />
      <path d="M12 3.2l2 2.8h-4l2-2.8z" />
      <path d="M12 14.4l3.4-2.1V8.6M12 11.6L8.6 9.4V6.8" />
      <circle cx="15.4" cy="7.4" r="1.2" />
      <rect x="7.4" y="4.6" width="2.4" height="2.4" rx="0.5" />
    </Svg>
  )
}

export function IconHardDrive({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <rect x="3.2" y="4.8" width="17.6" height="14.4" rx="2.4" />
      <path d="M3.2 13.2h17.6" />
      <circle cx="16.6" cy="16.2" r="1" />
      <path d="M7 16.2h4" />
    </Svg>
  )
}

export function IconSparkles({ size = 20, className }: IconProps): JSX.Element {
  return (
    <Svg size={size} className={className}>
      <path d="M11 3.6l1.4 3.4 3.4 1.4-3.4 1.4L11 13.2 9.6 9.8 6.2 8.4l3.4-1.4L11 3.6z" />
      <path d="M17.4 14.4l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" />
      <path d="M5.2 16.2l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z" />
    </Svg>
  )
}
