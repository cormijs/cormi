import type { CompatReason } from '@cormi/core'
import type { CompatInfo, PluginInfo } from '../src/builtin.ts'
import type { OverviewData } from './builtin/overview.tsx'
import { Tag } from './ui.tsx'

const LABELS: Record<string, string> = { vite: 'Vite', rsbuild: 'Rsbuild', react: 'React', vue: 'Vue' }

/** The display name of a bundler or a UI framework. */
export function label(name: string) {
  return LABELS[name] ?? name
}

/** Why a plugin does not work in the app. */
export function describeReason(reason: CompatReason) {
  if (reason.dimension === 'cormi') return `需要 Cormi ${reason.supported[0]}，当前是 ${reason.current}`
  const kind = reason.dimension === 'bundler' ? '的打包器' : '的 UI 框架'
  return `只支持 ${reason.supported.map(label).join('、')}，当前应用${kind}是 ${label(reason.current)}`
}

/** Whether a package supports a bundler or a UI framework. */
export function supports(compat: CompatInfo | undefined, dimension: 'bundler' | 'renderer', name: string) {
  const names = compat?.[dimension]
  return !names || names.includes(name)
}

/** The stacks a package supports, as tags: `Vite · Rsbuild`, `React`; `通用` when it declares no constraint. */
export function CompatTags(props: { compat?: CompatInfo }) {
  const { compat } = props
  if (!compat || compat.source === 'unknown') return <Tag tone="muted">未声明兼容性</Tag>
  const title = compat.source === 'inferred' ? '从 peer 依赖推断' : undefined
  const lists = [compat.bundler, compat.renderer].filter(Boolean) as string[][]
  return (
    <span className="cc-compat" title={title} data-source={compat.source}>
      {lists.length
        ? lists.map(names => <Tag key={names.join()}>{names.map(label).join(' · ')}</Tag>)
        : <Tag>通用</Tag>}
      {compat.result.status === 'incompatible' && <Tag tone="amber">不兼容</Tag>}
    </span>
  )
}

/** The reasons a package does not work in the app, one per line. */
export function CompatReasons(props: { compat?: CompatInfo }) {
  const reasons = props.compat?.result.reasons ?? []
  if (!reasons.length) return null
  return (
    <ul className="cc-compat-reasons">
      {reasons.map(reason => <li key={reason.dimension}>{describeReason(reason)}</li>)}
    </ul>
  )
}

const KINDS = { bundler: '打包器', renderer: ' UI 框架' }

/**
 * What enabling a bundler or a UI framework would change: the one in use
 * to disable first, and the enabled plugins that do not support it.
 */
export function StackSwitch(props: { compat?: CompatInfo; name: string; plugins: PluginInfo[]; stack?: OverviewData['stack'] }) {
  const { compat, plugins, stack } = props
  const target = Object.entries(compat?.provides ?? {}).filter(([dimension, name]) => stack?.[dimension as 'bundler' | 'renderer']?.name !== name) as ['bundler' | 'renderer', string][]
  if (!target.length) return null
  return (
    <div className="cc-confirm cc-switch-impact">
      {target.map(([dimension, name]) => {
        const kind = KINDS[dimension]
        const current = plugins.find(plugin => plugin.state === 'active' && plugin.name !== props.name && plugin.compat?.provides[dimension])
        const affected = plugins.filter(plugin => !plugin.disabled && !plugin.group && plugin.name !== props.name && plugin !== current && !supports(plugin.compat, dimension, name))
        return (
          <p key={dimension}>
            启用它会把{kind}换成 {label(name)}。
            {current && <> 当前的{kind}由 <code>{current.name}</code> 提供，需要先停用它。</>}
            {affected.length
              ? <> 这些已启用的插件不支持 {label(name)}：{affected.map(plugin => <code key={plugin.id}>{plugin.name}</code>)}</>
              : <> 已启用的插件都支持 {label(name)}。</>}
          </p>
        )
      })}
    </div>
  )
}
