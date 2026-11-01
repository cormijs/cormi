import { useCordis } from '@cormijs/react/client'
import type { ReactNode } from 'react'

/** The state lamp of a plugin, as on the website: green active, amber waiting, hollow off. */
export function Lamp(props: { state: string; title?: string }) {
  return <span className="cc-lamp" data-state={props.state} title={props.title ?? props.state} />
}

export function Tag(props: { children: ReactNode; tone?: 'leaf' | 'cord' | 'amber' | 'muted' }) {
  return <span className="cc-tag" data-tone={props.tone ?? 'muted'}>{props.children}</span>
}

/** A titled block of a page. */
export function Section(props: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="cc-section">
      <header className="cc-section-head">
        <h2>{props.title}</h2>
        {props.aside}
      </header>
      {props.children}
    </section>
  )
}

/** What a page shows when it has nothing to list: what to do next. */
export function Empty(props: { children: ReactNode }) {
  return <div className="cc-empty">{props.children}</div>
}

/** A registration or a call, with the jack its cord plugs into. */
export function CodeLine(props: { children: ReactNode }) {
  return (
    <li className="cc-codeline">
      <span className="cc-jack" />
      <code>{props.children}</code>
    </li>
  )
}

/** A link that opens a file of the app in the editor, through the console's dev server. */
export function FileLink(props: { file: string; cwd?: string }) {
  const { $router } = useCordis()
  const path = props.cwd ? `${props.cwd}/${props.file}` : props.file
  const href = `${$router.base}__open-in-editor?file=${encodeURIComponent(path)}`
  return (
    <a className="cc-file" href={href} target="_blank" rel="noreferrer" onClick={(event) => {
      // the editor opens; the page stays
      event.preventDefault()
      void fetch(href)
    }}>
      {props.file}
    </a>
  )
}
