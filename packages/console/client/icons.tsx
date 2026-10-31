import type { ReactNode } from 'react'

// stroke icons of the console's menu, drawn on a 20px grid
function Icon(props: { children: ReactNode }) {
  return (
    <svg className="cc-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {props.children}
    </svg>
  )
}

export const icons = {
  overview: <Icon><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5V10l2.5 1.5" /></Icon>,
  plugins: <Icon><circle cx="5" cy="5" r="1.8" /><circle cx="5" cy="15" r="1.8" /><path d="M6.8 5c4 0 3.2 5 8.2 5M6.8 15c4 0 3.2-5 8.2-5" /><circle cx="15.5" cy="10" r="1.2" /></Icon>,
  app: <Icon><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M3 8h14M7 11.5h6" /></Icon>,
  services: <Icon><path d="M4 6h12M4 10h12M4 14h7" /><circle cx="15" cy="14" r="1.6" /></Icon>,
  logs: <Icon><path d="M5 5l3 3-3 3M10 13h5" /></Icon>,
  workspace: <Icon><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l1.5 2h6A1.5 1.5 0 0 1 17 8.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" /></Icon>,
  market: <Icon><path d="M4 8h12l-1 8H5zM7 8V6.5a3 3 0 0 1 6 0V8" /></Icon>,
  external: <Icon><path d="M8 5H5v10h10v-3M11 5h4v4M15 5l-6 6" /></Icon>,
}
