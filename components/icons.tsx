import React from 'react';

type IconProps = {
  className?: string;
};

function Svg({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

export function NotesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3h8l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </Svg>
  );
}

export function MusicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="17" r="2.4" />
      <circle cx="17" cy="15" r="2.4" />
      <path d="M10.4 17V7.5l8.6-1.5V15" />
    </Svg>
  );
}

export function GalleryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m3.8 16.5 4.4-4.2 3.2 3 2.4-2.3 6.2 5.2" />
    </Svg>
  );
}

export function LettersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m4 7.5 8 6 8-6" />
    </Svg>
  );
}

export function PrevIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 10 12l8 6" />
      <path d="M6 6v12" />
    </Svg>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l8 6-8 6" />
      <path d="M18 6v12" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6.5v11l9-5.5z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 6h3.4v12H7zM13.6 6H17v12h-3.4z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export const navIcons = {
  home: HomeIcon,
  notes: NotesIcon,
  music: MusicIcon,
  gallery: GalleryIcon,
  letters: LettersIcon,
} as const;
