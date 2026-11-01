import { Link } from '@cormi/react/client'
import { useState } from 'react'
import type { MarketPackage, PluginInfo } from '../../src/builtin.ts'
import { useAction, useQuery } from '../hooks.ts'
import { useData } from '../index.tsx'
import { Empty, Tag } from '../ui.tsx'

export default function MarketPage() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const search = useQuery<MarketPackage[]>('market/search', submitted)

  return (
    <div className="cc-page">
      <header className="cc-page-head">
        <h1>市场</h1>
        <p>npm 上带有 <code>cormi-plugin</code> 关键字的插件。安装使用应用自己的包管理器，然后添加到 cormi.yml。</p>
      </header>
      <form className="cc-toolbar" onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(query.trim())
      }}>
        <input className="cc-input cc-input-search" type="search" placeholder="搜索插件" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="submit" className="cc-button">搜索</button>
      </form>
      {search.loading && <Empty>正在搜索…</Empty>}
      {search.error && <Empty>无法访问 registry：{search.error}。检查网络，或在 preset 的 console 配置中更换 registry。</Empty>}
      {search.data && (search.data.length
        ? <ul className="cc-packages">{search.data.map(pkg => <MarketItem key={pkg.name} pkg={pkg} />)}</ul>
        : <Empty>{submitted ? `没有找到与“${submitted}”相关的插件。` : 'registry 上还没有 Cormi 插件。'}</Empty>)}
    </div>
  )
}

function MarketItem(props: { pkg: MarketPackage }) {
  const { pkg } = props
  const plugins = useData<PluginInfo[]>('plugins') ?? []
  const install = useAction(console => console.call('market/install', `${pkg.name}@${pkg.version}`))
  const add = useAction(console => console.call<string>('plugin/create', { name: pkg.name }))
  const plugin = plugins.find(plugin => plugin.name === pkg.name)
  const installed = pkg.installed || install.done

  return (
    <li className="cc-package">
      <div>
        <code className="cc-package-name">{pkg.name}</code>
        <Tag>{pkg.version}</Tag>
        {installed && <Tag tone="leaf">已安装</Tag>}
        <p className="cc-muted">{pkg.description}</p>
      </div>
      <div className="cc-actions">
        {pkg.links?.npm && <a className="cc-link" href={pkg.links.npm} target="_blank" rel="noreferrer">npm</a>}
        {plugin
          ? <Link to={`/plugins?id=${plugin.id}`} className="cc-button">查看</Link>
          : installed
            ? <button type="button" className="cc-button cc-button-primary" disabled={add.pending} onClick={() => add.run()}>添加到 cormi.yml</button>
            : <button type="button" className="cc-button cc-button-primary" disabled={install.pending} onClick={() => install.run()}>{install.pending ? '安装中…' : '安装'}</button>}
      </div>
      {(install.error || add.error) && <p className="cc-row-error">{install.error ?? add.error}</p>}
    </li>
  )
}
