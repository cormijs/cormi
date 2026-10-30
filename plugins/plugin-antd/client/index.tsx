import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs'
import locale from '@@/plugin-antd/locale'
import { App, ConfigProvider, theme } from 'antd'
import { type Context, useServerInsertedHTML } from 'cormi/client'
import { type ReactNode, useState } from 'react'
import type { ClientConfig } from '../src/types.ts'

/** Collects the styles rendered on the server, and inserts them into `<head>`. */
function ServerStyles({ children }: { children: ReactNode }) {
  const [cache] = useState(() => createCache())
  useServerInsertedHTML(() => (
    <style id="antd-cssinjs" dangerouslySetInnerHTML={{ __html: extractStyle(cache, true) }} />
  ))
  return <StyleProvider cache={cache}>{children}</StyleProvider>
}

export default (ctx: Context, config: ClientConfig) => {
  const algorithm = [config.dark ? theme.darkAlgorithm : theme.defaultAlgorithm]
  if (config.compact) algorithm.push(theme.compactAlgorithm)

  ctx.wrap(({ children }) => {
    const content = (
      <ConfigProvider theme={{ ...config.theme, algorithm }} locale={locale}>
        {config.app ? <App>{children}</App> : children}
      </ConfigProvider>
    )
    return import.meta.env.SSR ? <ServerStyles>{content}</ServerStyles> : content
  })
}
