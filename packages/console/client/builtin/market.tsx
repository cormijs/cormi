import { Link } from '@cormijs/react/client'
import { useState } from 'react'
import type { MarketPackage, MarketResolution, PluginInfo } from '../../src/builtin.ts'
import { CompatReasons, CompatTags, label, StackSwitch } from '../compat.tsx'
import { useAction, useQuery } from '../hooks.ts'
import { useData } from '../index.tsx'
import { Empty, Tag } from '../ui.tsx'
import type { OverviewData } from './overview.tsx'

export default function MarketPage() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const search = useQuery<MarketPackage[]>('market/search', submitted)
  const stack = useData<OverviewData>('overview')?.stack
  const shown = search.data?.filter(pkg => !compatibleOnly || pkg.compat.result.status !== 'incompatible') ?? []
  const hidden = (search.data?.length ?? 0) - shown.length

  return (
    <div className="cc-page">
      <header className="cc-page-head">
        <h1>市场</h1>
        <p>
          npm 上带有 <code>cormi-plugin</code> 关键字的插件，由 Cormi registry 每天同步并检查兼容性。安装使用应用自己的包管理器，然后添加到 cormi.yml。
          {stack?.bundler && stack.renderer && <> 当前应用使用 {label(stack.bundler.name)} 与 {label(stack.renderer.name)}。</>}
        </p>
      </header>
      <form className="cc-toolbar" onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(query.trim())
      }}>
        <input className="cc-input cc-input-search" type="search" placeholder="搜索插件" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="submit" className="cc-button">搜索</button>
        <label className="cc-check">
          <input type="checkbox" checked={compatibleOnly} onChange={event => setCompatibleOnly(event.target.checked)} />
          只看与当前应用兼容的
        </label>
      </form>
      {search.loading && <Empty>正在搜索…</Empty>}
      {search.error && <Empty>无法访问 registry：{search.error}。检查网络，或在 preset 的 console 配置中更换 registry。</Empty>}
      {search.data && (shown.length
        ? <ul className="cc-packages">{shown.map(pkg => <MarketItem key={pkg.name} pkg={pkg} />)}</ul>
        : <Empty>{submitted ? `没有找到与“${submitted}”相关的插件。` : 'registry 上还没有 Cormi 插件。'}</Empty>)}
      {hidden > 0 && (
        <p className="cc-muted cc-hidden-note">
          另有 {hidden} 个插件与当前应用不兼容，
          <button type="button" className="cc-link" onClick={() => setCompatibleOnly(false)}>显示它们</button>
        </p>
      )}
    </div>
  )
}

function formatCount(count: number) {
  return count >= 10000 ? `${(count / 10000).toFixed(1)} 万` : String(count)
}

function MarketItem(props: { pkg: MarketPackage }) {
  const { pkg } = props
  const plugins = useData<PluginInfo[]>('plugins') ?? []
  const stack = useData<OverviewData>('overview')?.stack
  const [confirming, setConfirming] = useState(false)
  const install = useAction((console, version: string) => console.call('market/install', `${pkg.name}@${version}`))
  const add = useAction(console => console.call<string>('plugin/create', { name: pkg.name }))
  const resolve = useAction(console => console.call<MarketResolution>('market/resolve', pkg.name))
  const plugin = plugins.find(plugin => plugin.name === pkg.name)
  const installed = pkg.installed || install.done
  const incompatible = pkg.compat.result.status === 'incompatible'
  const compatible = resolve.result?.compatible

  return (
    <li className="cc-package" data-compat={pkg.compat.result.status}>
      <div>
        <code className="cc-package-name">{pkg.name}</code>
        <Tag>{pkg.version}</Tag>
        {' '}
        <CompatTags compat={pkg.compat} />
        {pkg.official && <Tag tone="leaf">官方</Tag>}
        {pkg.verified === 'matches' && <Tag tone="leaf">已验证</Tag>}
        {pkg.verified === 'differs' && <Tag tone="amber">声明与检查不一致</Tag>}
        {installed && <Tag tone="leaf">已安装</Tag>}
        <p className="cc-muted">
          {pkg.description}
          {pkg.downloads !== undefined && <> · 月下载 {formatCount(pkg.downloads)}</>}
        </p>
        <CompatReasons compat={pkg.compat} />
      </div>
      <div className="cc-actions">
        {pkg.links?.npm && <a className="cc-link" href={pkg.links.npm} target="_blank" rel="noreferrer">npm</a>}
        {plugin
          ? <Link to={`/plugins?id=${plugin.id}`} className="cc-button">查看</Link>
          : installed
            ? <button type="button" className="cc-button cc-button-primary" disabled={add.pending} onClick={() => add.run()}>添加到 cormi.yml</button>
            : incompatible
              ? (
                  <>
                    {!resolve.done && <button type="button" className="cc-link" disabled={resolve.pending} onClick={() => resolve.run()}>{resolve.pending ? '查找中…' : '查找兼容的版本'}</button>}
                    {compatible && <button type="button" className="cc-button cc-button-primary" disabled={install.pending} onClick={() => install.run(compatible.version)}>安装 {compatible.version}（兼容）</button>}
                    <button type="button" className="cc-button" disabled={install.pending} onClick={() => confirming ? install.run(pkg.version) : setConfirming(true)}>
                      {install.pending ? '安装中…' : confirming ? `确认安装 ${pkg.version}` : '仍要安装'}
                    </button>
                  </>
                )
              : <button type="button" className="cc-button cc-button-primary" disabled={install.pending} onClick={() => install.run(pkg.version)}>{install.pending ? '安装中…' : '安装'}</button>}
      </div>
      {!plugin && <StackSwitch compat={pkg.compat} name={pkg.name} plugins={plugins} stack={stack} />}
      {confirming && !installed && (
        <p className="cc-confirm">
          这个插件与当前应用不兼容。装上并添加到 cormi.yml 之后，它会停在等待依赖的状态，或者加载失败，直到应用换成它支持的打包器或 UI 框架。
        </p>
      )}
      {resolve.done && !compatible && <p className="cc-muted cc-row-note">没有与当前应用兼容的版本。</p>}
      {(install.error || add.error || resolve.error) && <p className="cc-row-error">{install.error ?? add.error ?? resolve.error}</p>}
    </li>
  )
}
