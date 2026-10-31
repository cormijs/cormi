import Schema from 'schemastery'
import { type ReactNode, useEffect, useState } from 'react'

type Value = any

/** `{ __jsExpr }` is how the loader keeps an `!!js` expression of cormi.yml. */
function isExpression(value: Value): value is { __jsExpr: string } {
  return !!value && typeof value === 'object' && typeof value.__jsExpr === 'string'
}

function describe(schema: Schema) {
  const text = schema.meta?.description
  if (!text || typeof text === 'string') return text
  return text['zh-CN'] ?? text.zh ?? text.en ?? Object.values(text)[0]
}

const PRIMITIVES = ['string', 'number', 'natural', 'percent', 'boolean']
const isPrimitive = (schema?: Schema) => !!schema && PRIMITIVES.includes(schema.type)

/** Whether the form can edit the schema with its own controls, rather than as JSON. */
function isSimple(schema: Schema): boolean {
  if (isPrimitive(schema) || schema.type === 'const') return true
  if (schema.type === 'object') return true
  if (schema.type === 'intersect') return schema.list!.every(isSimple)
  if (schema.type === 'union') return schema.list!.every(item => item.type === 'const') || toInputUnion(schema) !== undefined
  if (schema.type === 'array' || schema.type === 'dict') return isPrimitive(schema.inner)
  return false
}

/** A union of one primitive and constants (`'side' | 'top'` written as strings, `false | string`…): an input with suggestions. */
function toInputUnion(schema: Schema) {
  const others = schema.list!.filter(item => item.type !== 'const')
  if (others.length === 1 && isPrimitive(others[0])) return { input: others[0], options: schema.list!.filter(item => item.type === 'const').map(item => item.value) }
}

export function SchemaForm(props: { schema: Schema; value: Value; onChange(value: Value): void }) {
  return (
    <div className="cc-form">
      <Field schema={props.schema} value={props.value} onChange={props.onChange} root />
    </div>
  )
}

function Field(props: { schema: Schema; value: Value; onChange(value: Value): void; name?: string; root?: boolean }) {
  const { schema, value, onChange } = props
  if (schema.meta?.hidden) return null

  if (isExpression(value)) {
    return (
      <Row name={props.name} schema={schema}>
        <code className="cc-expr" title="在 cormi.yml 中以 !!js 写成的表达式，在这里不可编辑">!!js {value.__jsExpr}</code>
      </Row>
    )
  }

  if (schema.type === 'object' || schema.type === 'intersect') {
    const fields = schema.type === 'object'
      ? Object.entries(schema.dict ?? {}).map(([key, inner]) => (
          <Field key={key} name={key} schema={inner} value={value?.[key]} onChange={(next) => {
            const result = { ...value }
            if (next === undefined) delete result[key]
            else result[key] = next
            onChange(result)
          }} />
        ))
      : schema.list!.map((inner, index) => <Field key={index} schema={inner} value={value} onChange={onChange} root={props.root} />)
    if (props.root || !props.name) return <>{fields}</>
    return (
      <fieldset className="cc-fieldset">
        <legend><code>{props.name}</code>{describe(schema) && <span>{describe(schema)}</span>}</legend>
        {fields}
      </fieldset>
    )
  }

  if (!isSimple(schema)) {
    return <Row name={props.name} schema={schema} value={value} onChange={onChange}><JsonInput value={value ?? schema.meta?.default} onChange={onChange} /></Row>
  }

  return <Row name={props.name} schema={schema} value={value} onChange={onChange}><Control schema={schema} value={value} onChange={onChange} /></Row>
}

function Row(props: { name?: string; schema: Schema; value?: Value; onChange?(value: Value): void; children: ReactNode }) {
  const description = describe(props.schema)
  const fallback = props.schema.meta?.default
  const resettable = props.value !== undefined && fallback !== undefined && props.onChange
  return (
    <div className="cc-row">
      <div className="cc-row-label">
        {props.name && <code>{props.name}</code>}
        {props.schema.meta?.required && <span className="cc-required">必填</span>}
        {resettable && <button type="button" className="cc-link" onClick={() => props.onChange!(undefined)}>恢复默认</button>}
      </div>
      <div className="cc-row-control">{props.children}</div>
      {description && <p className="cc-row-help">{description}</p>}
    </div>
  )
}

function Control(props: { schema: Schema; value: Value; onChange(value: Value): void; list?: string }) {
  const { schema, value, onChange } = props
  const fallback = schema.meta?.default

  switch (schema.type) {
    case 'boolean':
      return (
        <label className="cc-switch">
          <input type="checkbox" checked={value ?? fallback ?? false} onChange={event => onChange(event.target.checked)} />
          <span />
        </label>
      )
    case 'string':
      return (
        <input
          className="cc-input"
          type={schema.meta?.role === 'secret' ? 'password' : 'text'}
          list={props.list}
          value={value ?? ''}
          placeholder={fallback === undefined ? '' : String(fallback)}
          onChange={event => onChange(event.target.value === '' ? undefined : event.target.value)}
        />
      )
    case 'number':
    case 'natural':
    case 'percent':
      return (
        <input
          className="cc-input cc-input-number"
          type="number"
          value={value ?? ''}
          min={schema.meta?.min ?? (schema.type === 'natural' ? 0 : undefined)}
          max={schema.meta?.max}
          step={schema.meta?.step ?? (schema.type === 'number' ? 'any' : 1)}
          placeholder={fallback === undefined ? '' : String(fallback)}
          onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        />
      )
    case 'const':
      return <code className="cc-const">{JSON.stringify(schema.value)}</code>
    case 'union': {
      const input = toInputUnion(schema)
      if (input) {
        const id = `cc-options-${schema.uid}`
        return (
          <>
            <Control schema={input.input} value={value} onChange={onChange} list={input.options.length ? id : undefined} />
            {input.options.length > 0 && <datalist id={id}>{input.options.map(option => <option key={String(option)} value={String(option)} />)}</datalist>}
          </>
        )
      }
      const options = schema.list!.map(item => item.value)
      const current = value === undefined ? '' : JSON.stringify(value)
      return (
        <select className="cc-input" value={current} onChange={event => onChange(event.target.value === '' ? undefined : JSON.parse(event.target.value))}>
          <option value="">{fallback === undefined ? '（未设置）' : `默认：${String(fallback)}`}</option>
          {options.map(option => <option key={JSON.stringify(option)} value={JSON.stringify(option)}>{String(option)}</option>)}
        </select>
      )
    }
    case 'array': {
      const list: Value[] = value ?? fallback ?? []
      return (
        <div className="cc-list">
          {list.map((item, index) => (
            <div key={index} className="cc-list-item">
              <Control schema={schema.inner!} value={item} onChange={next => onChange(list.map((old, i) => i === index ? next : old))} />
              <button type="button" className="cc-icon-button" aria-label="删除这一项" onClick={() => onChange(list.filter((_, i) => i !== index))}>×</button>
            </div>
          ))}
          <button type="button" className="cc-link" onClick={() => onChange([...list, schema.inner!.type === 'boolean' ? false : schema.inner!.type === 'string' ? '' : 0])}>添加一项</button>
        </div>
      )
    }
    case 'dict': {
      const dict: Record<string, Value> = value ?? fallback ?? {}
      const entries = Object.entries(dict)
      const rename = (from: string, to: string) => onChange(Object.fromEntries(entries.map(([key, item]) => [key === from ? to : key, item])))
      return (
        <div className="cc-list">
          {entries.map(([key, item]) => (
            <div key={key} className="cc-list-item">
              <input className="cc-input cc-input-key" defaultValue={key} aria-label="键" onBlur={event => event.target.value !== key && rename(key, event.target.value)} />
              <Control schema={schema.inner!} value={item} onChange={next => onChange({ ...dict, [key]: next })} />
              <button type="button" className="cc-icon-button" aria-label={`删除 ${key}`} onClick={() => onChange(Object.fromEntries(entries.filter(([other]) => other !== key)))}>×</button>
            </div>
          ))}
          <button type="button" className="cc-link" onClick={() => {
            let key = 'key'
            for (let i = 2; key in dict; i++) key = `key${i}`
            onChange({ ...dict, [key]: schema.inner!.type === 'string' ? '' : undefined })
          }}>添加一项</button>
        </div>
      )
    }
    default:
      return <JsonInput value={value ?? fallback} onChange={onChange} />
  }
}

/** Values the form has no control for: edited as JSON, applied once valid. */
function JsonInput(props: { value: Value; onChange(value: Value): void }) {
  const serialize = (value: Value) => value === undefined ? '' : JSON.stringify(value, null, 2)
  const [text, setText] = useState(serialize(props.value))
  const [error, setError] = useState<string>()
  useEffect(() => setText(serialize(props.value)), [JSON.stringify(props.value)])
  return (
    <div className="cc-json">
      <textarea
        className="cc-input cc-textarea"
        value={text}
        spellCheck={false}
        rows={Math.min(12, Math.max(2, text.split('\n').length))}
        onChange={event => setText(event.target.value)}
        onBlur={() => {
          try {
            props.onChange(text.trim() ? JSON.parse(text) : undefined)
            setError(undefined)
          } catch {
            setError('不是有效的 JSON，修改未生效')
          }
        }}
      />
      {error && <p className="cc-row-error">{error}</p>}
    </div>
  )
}

/** Revive a schema serialized by the server. */
export function reviveSchema(json: unknown): Schema | undefined {
  if (!json) return
  try {
    return new Schema(json as any)
  } catch {
    return undefined
  }
}
