import { useId } from "react";

/** Opsight mark: an open ring (the business at a glance) with a point of focus (what needs attention next). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c74ff" />
          <stop offset="1" stopColor="#4a43d4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <g transform="translate(0.6 -0.6)" fill="#fff">
        <path d="M14.61 9.51A7.5 7.5 0 1 0 22.49 17.39" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="20.6" cy="11.4" r="2.3" />
      </g>
    </svg>
  );
}
