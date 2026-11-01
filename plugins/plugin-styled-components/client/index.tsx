import { type Context, useServerInsertedHTML } from '@cormi/react/client'
import { type ReactNode, useState } from 'react'
import { ServerStyleSheet, StyleSheetManager, ThemeProvider } from 'styled-components'
import type { ClientConfig } from '../src/types.ts'

/** Collects the styles rendered on the server, and inserts them into `<head>`. */
function ServerStyles({ children }: { children: ReactNode }) {
  const [sheet] = useState(() => new ServerStyleSheet())
  useServerInsertedHTML(() => {
    const styles = sheet.getStyleElement()
    sheet.seal()
    return styles
  })
  return <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>
}

export default (ctx: Context, config: ClientConfig) => {
  ctx.wrap(({ children }) => {
    const content = <ThemeProvider theme={config.theme}>{children}</ThemeProvider>
    return import.meta.env.SSR ? <ServerStyles>{content}</ServerStyles> : content
  })
}
