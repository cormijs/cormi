import { useSearchParams } from '@cormijs/react/client'
import { useEffect, useMemo, useState } from 'react'
import type { PluginInfo } from '../../src/builtin.ts'
import { reviveSchema, SchemaForm } from '../form.tsx'
import { useAction, useQuery } from '../hooks.ts'
import { useData } from '../index.tsx'
import { CompatReasons, CompatTags, StackSwitch } from '../compat.tsx'
import { CodeLine, Empty, Lamp, Tag } from '../ui.tsx'
import type { OverviewData } from './overview.tsx'

const STATE_TEXT: Record<string, string> = {
  active: '运行中',
  pending: '等待依赖',
  loading: '加载中',
  failed: '加载失败',
  disposed: '已卸载',
  unloading: '卸载中',
  disabled: '已停用',
}

export default function PluginsPage() {
  const plugins = useData<PluginInfo[]>('plugins')
  const [params, setParams] = useSearchParams()
  const selected = plugins?.find(plugin => plugin.id === params.get('id')) ?? plugins?.find(plugin => plugin.name !== 'cordis:include')
  const select = (id: string) => setParams({ id }, { replace: true })

  return (
    <div className="cc-page cc-page-split">
      <div className="cc-split-list">
        <header className="cc-page-head">
          <h1>插件</h1>
          <p>cormi.yml 中的插件。启停和配置的修改会写回文件，并只重载对应的插件。</p>
        </header>
        <AddPlugin onAdded={select} />
        {plugins
          ? (
              <ul className="cc-entries" aria-label="cormi.yml">
                {plugins.map(plugin => <EntryRow key={plugin.id} plugin={plugin} selected={plugin.id === selected?.id} onSelect={() => select(plugin.id)} />)}
              </ul>
            )
          : <Empty>正在读取插件树…</Empty>}
      </div>
      <div className="cc-split-detail">
        {selected ? <PluginDetail key={selected.id} plugin={selected} /> : <Empty>选择一个插件查看它的配置与注册。</Empty>}
      </div>
    </div>
  )
}

function EntryRow(props: { plugin: PluginInfo; selected: boolean; onSelect(): void }) {
  const { plugin } = props
  const toggle = useAction((console, disabled: boolean) => console.call('plugin/update', plugin.id, { disabled }))
  return (
    <li className="cc-entry" data-selected={props.selected || undefined} data-state={plugin.state} style={{ paddingLeft: 12 + plugin.depth * 18 }}>
      <button type="button" className="cc-entry-main" onClick={props.onSelect} aria-current={props.selected || undefined}>
        <Lamp state={plugin.state} title={STATE_TEXT[plugin.state]} />
        <span className="cc-yaml"><span className="cc-yaml-key">- name: </span>{plugin.name}</span>
      </button>
      <label className="cc-switch" title={plugin.disabled ? '启用' : '停用'}>
        <input
          type="checkbox"
          checked={!plugin.disabled}
          disabled={toggle.pending}
          aria-label={`${plugin.disabled ? '启用' : '停用'} ${plugin.name}`}
          onChange={(event) => {
            if (!event.target.checked && plugin.name === '@cormijs/preset-react' && !confirm('停用 preset 会卸载应用的服务，控制台也会随之断开。确定停用吗？')) return
            void toggle.run(!event.target.checked)
          }}
        />
        <span />
      </label>
    </li>
  )
}

function AddPlugin(props: { onAdded(id: string): void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const candidates = useQuery<{ name: string; description?: string; local: boolean }[]>('plugin/candidates')
  const add = useAction((console, name: string) => console.call<string>('plugin/create', { name }))

  if (!open) return <button type="button" className="cc-button" onClick={() => setOpen(true)}>添加插件</button>
  return (
    <form className="cc-add" onSubmit={async (event) => {
      event.preventDefault()
      const id = await add.run(name.trim())
      if (!id) return
      setOpen(false)
      setName('')
      props.onAdded(id)
    }}>
      <input
        className="cc-input"
        list="cc-candidates"
        value={name}
        placeholder="包名或本地路径，如 @cormijs/plugin-mock"
        onChange={event => setName(event.target.value)}
        autoFocus
      />
      <datalist id="cc-candidates">
        {candidates.data?.map(item => <option key={item.name} value={item.name}>{item.local ? '工作区 · ' : ''}{item.description}</option>)}
      </datalist>
      <button type="submit" className="cc-button cc-button-primary" disabled={!name.trim() || add.pending}>添加</button>
      <button type="button" className="cc-button" onClick={() => setOpen(false)}>取消</button>
      {add.error && <p className="cc-row-error">{add.error}</p>}
    </form>
  )
}

type Tab = 'config' | 'effects' | 'deps'

function PluginDetail(props: { plugin: PluginInfo }) {
  const { plugin } = props
  const plugins = useData<PluginInfo[]>('plugins') ?? []
  const stack = useData<OverviewData>('overview')?.stack
  const [tab, setTab] = useState<Tab>('config')
  const toggle = useAction((console, disabled: boolean) => console.call('plugin/update', plugin.id, { disabled }))
  const remove = useAction(console => console.call('plugin/remove', plugin.id))

  return (
    <article className="cc-detail">
      <header className="cc-detail-head">
        <div className="cc-detail-title">
          <Lamp state={plugin.state} />
          <h2><code>{plugin.name}</code></h2>
          {plugin.package?.version && <Tag>{plugin.package.version}</Tag>}
          {plugin.package?.local && <Tag tone="leaf">工作区</Tag>}
          <Tag tone={plugin.state === 'active' ? 'leaf' : plugin.state === 'failed' ? 'cord' : plugin.state === 'pending' ? 'amber' : 'muted'}>{STATE_TEXT[plugin.state]}</Tag>
        </div>
        {plugin.package?.description && <p className="cc-muted">{plugin.package.description}</p>}
        {plugin.compat && (
          <div className="cc-detail-compat">
            <CompatTags compat={plugin.compat} />
            <CompatReasons compat={plugin.compat} />
          </div>
        )}
        {plugin.state !== 'active' && <StackSwitch compat={plugin.compat} name={plugin.name} plugins={plugins} stack={stack} />}
        <div className="cc-actions">
          <button type="button" className="cc-button" disabled={toggle.pending} onClick={() => toggle.run(!plugin.disabled)}>{plugin.disabled ? '启用' : '停用'}</button>
          <button type="button" className="cc-button cc-button-danger" disabled={remove.pending} onClick={() => confirm(`从 cormi.yml 中移除 ${plugin.name}？`) && remove.run()}>移除</button>
        </div>
        {(toggle.error || remove.error) && <p className="cc-row-error">{toggle.error ?? remove.error}</p>}
      </header>

      <div className="cc-tabs" role="tablist">
        {([['config', '配置'], ['effects', `注册 ${plugin.effects.length}`], ['deps', '依赖']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="cc-tab" onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'config' && <ConfigEditor plugin={plugin} />}
      {tab === 'effects' && (
        plugin.effects.length
          ? (
              <>
                <p className="cc-muted">这个插件和它的子插件在 ctx 上注册的东西。卸载插件时，它们会一起撤回。</p>
                <ul className="cc-codelines">{plugin.effects.map((label, index) => <CodeLine key={index}>{label}</CodeLine>)}</ul>
              </>
            )
          : <Empty>{plugin.state === 'active' ? '这个插件没有注册任何东西。' : '插件运行时才有注册。'}</Empty>
      )}
      {tab === 'deps' && (
        <dl className="cc-kv cc-kv-wide">
          <div>
            <dt>依赖的服务（inject）</dt>
            <dd>{plugin.inject.length ? plugin.inject.map(name => <Tag key={name}>{name}</Tag>) : <span className="cc-muted">无</span>}</dd>
          </div>
          <div>
            <dt>提供的服务</dt>
            <dd>{plugin.provides.length ? plugin.provides.map(name => <Tag key={name} tone="leaf">{name}</Tag>) : <span className="cc-muted">无</span>}</dd>
          </div>
        </dl>
      )}
    </article>
  )
}

function ConfigEditor(props: { plugin: PluginInfo }) {
  const { plugin } = props
  // a plugin that has not run yet has no schema at hand: ask its module
  const fetched = useQuery<unknown>('plugin/schema', plugin.name)
  const json = plugin.schema ?? fetched.data
  const schema = useMemo(() => reviveSchema(json), [JSON.stringify(json)])
  const [draft, setDraft] = useState<unknown>(plugin.config)
  const saved = JSON.stringify(plugin.config)
  useEffect(() => setDraft(plugin.config), [saved])
  const save = useAction((console, config: unknown) => console.call('plugin/update', plugin.id, { config }))
  const dirty = JSON.stringify(draft) !== saved

  if (!schema) {
    if (!plugin.schema && fetched.loading) return <Empty>正在读取配置项…</Empty>
    return <Empty>这个插件没有声明配置项（Config）。</Empty>
  }
  return (
    <form className="cc-config" onSubmit={(event) => {
      event.preventDefault()
      void save.run(draft)
    }}>
      <SchemaForm schema={schema} value={draft} onChange={setDraft} />
      <div className="cc-form-foot">
        <button type="submit" className="cc-button cc-button-primary" disabled={!dirty || save.pending}>保存</button>
        <button type="button" className="cc-button" disabled={!dirty} onClick={() => setDraft(plugin.config)}>还原</button>
        {save.error && <span className="cc-row-error">{save.error}</span>}
        {save.done && !dirty && <span className="cc-saved" role="status">已保存，插件已重载</span>}
      </div>
    </form>
  )
}
