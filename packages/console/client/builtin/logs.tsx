import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatTime, logs, useLogs } from '../hooks.ts'
import { Empty } from '../ui.tsx'

const LEVELS = [['all', '全部'], ['error', '错误'], ['warn', '警告'], ['info', '信息'], ['debug', '调试']] as const

export default function LogsPage() {
  const records = useLogs()
  const [level, setLevel] = useState<typeof LEVELS[number][0]>('all')
  const [query, setQuery] = useState('')
  const [follow, setFollow] = useState(true)
  const list = useRef<HTMLOListElement>(null)
  const shown = records.filter((record) => {
    if (level !== 'all' && record.type !== level) return false
    if (!query) return true
    return record.name.includes(query) || record.text.includes(query)
  })

  // stay at the bottom while following
  useLayoutEffect(() => {
    if (follow && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [shown.length, follow])

  useEffect(() => {
    const element = list.current
    if (!element) return
    const onScroll = () => setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 24)
    element.addEventListener('scroll', onScroll)
    return () => element.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="cc-page cc-page-fill">
      <header className="cc-page-head">
        <h1>日志</h1>
        <p>服务器进程的日志，实时更新。</p>
      </header>
      <div className="cc-toolbar">
        <div className="cc-segments" role="radiogroup" aria-label="级别">
          {LEVELS.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={level === key} className="cc-segment" onClick={() => setLevel(key)}>{label}</button>
          ))}
        </div>
        <input className="cc-input cc-input-search" type="search" placeholder="按插件名或内容筛选" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="button" className="cc-button" onClick={() => logs.clear()}>清空</button>
      </div>
      {shown.length
        ? (
            <ol className="cc-log-list cc-log-scroll" ref={list}>
              {shown.map(record => (
                <li key={record.sn} className="cc-log" data-type={record.type}>
                  <time>{formatTime(record.ts)}</time>
                  <span className="cc-log-name">{record.name}</span>
                  <pre>{record.text}</pre>
                </li>
              ))}
            </ol>
          )
        : <Empty>{records.length ? '没有符合筛选条件的日志。' : '还没有日志。'}</Empty>}
    </div>
  )
}
