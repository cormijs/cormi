import React, { type ReactNode } from 'react'

export type ServerInsertedHTMLHook = (callback: () => ReactNode) => void

/** Collects the markup CSS-in-JS libraries insert into `<head>` during server rendering. */
export const ServerInsertedHTMLContext = React.createContext<ServerInsertedHTMLHook | null>(null)

/** Insert markup into the server-rendered `<head>`; a no-op in the browser. */
export function useServerInsertedHTML(callback: () => ReactNode) {
  React.useContext(ServerInsertedHTMLContext)?.(callback)
}
