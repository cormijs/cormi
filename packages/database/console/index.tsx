import { Empty, Lamp, Section, Tag, useConsole, useData } from '@cormijs/cormi/console'
import type { Context } from '@cormijs/cormi/client'
import { useEffect, useState } from 'react'
import type { TableInfo } from '../src/index.ts'

const PAGE = 50

type Row = Record<string, unknown>

function format(value: unknown) {
  if (value === null || value === undefined) return <span className="cc-muted">null</span>
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

/** A value of a type, for a new row. */
function blankValue(type: string): unknown {
  if (['integer', 'unsigned', 'bigint', 'float', 'double', 'decimal'].includes(type)) return 0
  if (type === 'boolean') return false
  if (['timestamp', 'date', 'time'].includes(type)) return new Date().toISOString()
  if (type === 'list') return []
  if (type === 'json') return {}
  return ''
}

/** The JSON a new row starts from: the initial values, without an auto-increment key. */
function blankRow(table: TableInfo): Row {
  return Object.fromEntries(table.fields
    .filter(field => !(table.autoInc && table.primary.includes(field.name)))
    .map(field => [field.name, field.initial ?? (field.nullable ? null : blankValue(field.type))]))
}

function DatabasePage() {
  const tables = useData<TableInfo[]>('database/tables')
  const [name, setName] = useState<string>()
  const table = tables?.find(table => table.name === name) ?? tables?.[0]

  return (
    <div className="cc-page cc-page-split">
      <div className="cc-split-list">
        <header className="cc-page-head">
          <h1>数据库</h1>
          <p>ctx.model 中的表：字段、索引与数据。修改直接写入数据库。</p>
        </header>
        {!tables && <Empty>正在读取表…</Empty>}
        {tables && !tables.length && <Empty>还没有表。运行 <code>cormi g model todo</code>，在 server/models 中声明一张。</Empty>}
        {tables && tables.length > 0 && (
          <ul className="cc-entries" aria-label="tables">
            {tables.map(item => (
              <li key={item.name} className="cc-entry" data-selected={item === table || undefined}>
                <button type="button" className="cc-entry-main" onClick={() => setName(item.name)} aria-current={item === table || undefined}>
                  <Lamp state="active" />
                  <code>{item.name}</code>
                  <span className="cc-muted">{item.count ?? '?'} 行</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="cc-split-detail">
        {table ? <TableDetail key={table.name} table={table} /> : <Empty>选择一张表。</Empty>}
      </div>
    </div>
  )
}

function TableDetail(props: { table: TableInfo }) {
  const { table } = props
  const console = useConsole()
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<Row[]>()
  const [error, setError] = useState('')
  // the row being edited, by its index; -1 is a new one
  const [editing, setEditing] = useState<number>()
  const [draft, setDraft] = useState('')

  const load = async () => {
    try {
      setRows(await console.call<Row[]>('database/rows', table.name, { offset, limit: PAGE }))
      setError('')
    } catch (error) {
      setError(String((error as Error).message ?? error))
    }
  }
  useEffect(() => {
    void load()
  }, [table.name, offset, table.count])

  const run = async (task: () => Promise<unknown>) => {
    try {
      await task()
      setEditing(undefined)
      await load()
    } catch (error) {
      setError(String((error as Error).message ?? error))
    }
  }
  const keyOf = (row: Row) => Object.fromEntries(table.primary.map(name => [name, row[name]]))
  const edit = (index: number, row: Row) => {
    setEditing(index)
    setDraft(JSON.stringify(row, null, 2))
  }
  const save = () => run(async () => {
    const value = JSON.parse(draft)
    if (editing === -1) await console.call('database/create', table.name, value)
    else await console.call('database/update', table.name, keyOf(rows![editing!]), value)
  })

  return (
    <article className="cc-detail">
      <header className="cc-detail-head">
        <div className="cc-detail-title">
          <h2><code>{table.name}</code></h2>
          <Tag>{table.count ?? '?'} 行</Tag>
        </div>
      </header>

      <Section title={`字段 ${table.fields.length}`}>
        <table className="cc-table">
          <thead>
            <tr><th>字段</th><th>类型</th><th>约束</th></tr>
          </thead>
          <tbody>
            {table.fields.map(field => (
              <tr key={field.name}>
                <td><code>{field.name}</code></td>
                <td><code>{field.type}{field.length ? `(${field.length})` : ''}</code></td>
                <td>
                  {table.primary.includes(field.name) && <Tag tone="cord">主键</Tag>}
                  {table.autoInc && table.primary.includes(field.name) && <Tag tone="cord">自增</Tag>}
                  {table.unique.some(keys => keys.length === 1 && keys[0] === field.name) && <Tag tone="leaf">唯一</Tag>}
                  {field.nullable && <Tag>可为空</Tag>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(table.indexes.length > 0 || table.unique.some(keys => keys.length > 1)) && (
          <p className="cc-muted">
            索引：
            {table.unique.filter(keys => keys.length > 1).map(keys => <Tag key={keys.join()} tone="leaf">唯一 {keys.join(' + ')}</Tag>)}
            {table.indexes.map(index => <Tag key={index.name ?? index.keys.join()}>{index.unique ? '唯一 ' : ''}{index.keys.join(' + ')}</Tag>)}
          </p>
        )}
      </Section>

      <Section
        title="数据"
        aside={(
          <div className="cc-actions">
            <button type="button" className="cc-button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - PAGE))}>上一页</button>
            <span className="cc-muted">{rows?.length ? `${offset + 1}–${offset + rows.length}` : '0'} / {table.count ?? '?'}</span>
            <button type="button" className="cc-button" disabled={(rows?.length ?? 0) < PAGE} onClick={() => setOffset(offset + PAGE)}>下一页</button>
            <button type="button" className="cc-button cc-button-primary" onClick={() => edit(-1, blankRow(table))}>新建</button>
          </div>
        )}
      >
        {error && <p className="cc-row-error">{error}</p>}
        {editing === -1 && <Editor draft={draft} onChange={setDraft} onSave={save} onCancel={() => setEditing(undefined)} />}
        {!rows && <Empty>正在读取数据…</Empty>}
        {rows && !rows.length && editing !== -1 && <Empty>这张表还没有数据。</Empty>}
        {rows && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="cc-table" data-testid="rows">
              <thead>
                <tr>{table.fields.map(field => <th key={field.name}>{field.name}</th>)}<th /></tr>
              </thead>
              <tbody>
                {rows.map((row, index) => editing === index
                  ? (
                      <tr key={index}>
                        <td colSpan={table.fields.length + 1}>
                          <Editor draft={draft} onChange={setDraft} onSave={save} onCancel={() => setEditing(undefined)} />
                        </td>
                      </tr>
                    )
                  : (
                      <tr key={index}>
                        {table.fields.map(field => <td key={field.name}><code>{format(row[field.name])}</code></td>)}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="cc-button" onClick={() => edit(index, row)}>编辑</button>
                          {' '}
                          <button type="button" className="cc-button cc-button-danger" onClick={() => confirm(`删除 ${table.name} 的这一行？`) && run(() => console.call('database/remove', table.name, keyOf(row)))}>删除</button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </article>
  )
}

function Editor(props: { draft: string; onChange(value: string): void; onSave(): void; onCancel(): void }) {
  let valid = true
  try {
    JSON.parse(props.draft)
  } catch {
    valid = false
  }
  return (
    <form className="cc-form" onSubmit={(event) => {
      event.preventDefault()
      props.onSave()
    }}>
      <textarea className="cc-textarea" rows={Math.min(16, props.draft.split('\n').length + 1)} value={props.draft} aria-label="row" onChange={event => props.onChange(event.target.value)} />
      <div className="cc-actions">
        <button type="submit" className="cc-button cc-button-primary" disabled={!valid}>保存</button>
        <button type="button" className="cc-button" onClick={props.onCancel}>取消</button>
        {!valid && <span className="cc-row-error">不是有效的 JSON</span>}
      </div>
    </form>
  )
}

/** The page of the database in the console. */
export default (ctx: Context) => {
  const icon = (
    <svg className="cc-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <ellipse cx="10" cy="5.5" rx="6" ry="2.5" />
      <path d="M4 5.5v9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-9M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
    </svg>
  )
  ctx.$console.page({ path: '/database', name: '数据库', icon, order: 27, component: DatabasePage })
}
