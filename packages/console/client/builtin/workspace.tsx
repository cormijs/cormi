import { Link } from '@cormijs/react/client'
import { useState } from 'react'
import type { PackageInfo, PluginInfo } from '../../src/builtin.ts'
import { useAction } from '../hooks.ts'
import { useData } from '../index.tsx'
import { CompatReasons, CompatTags } from '../compat.tsx'
import { Empty, Section, Tag } from '../ui.tsx'

export default function WorkspacePage() {
  const packages = useData<PackageInfo[]>('workspace')
  const plugins = useData<PluginInfo[]>('plugins') ?? []
  const enable = useAction((console, name: string) => console.call('plugin/create', { name }))

  return (
    <div className="cc-page">
      <header className="cc-page-head">
        <h1>工作区</h1>
        <p>plugins/ 下的插件包按包名加载，直接运行源码：不需要构建，也不需要安装。修改 Node 端代码只重载这个插件，浏览器端代码由应用的打包器热更新。</p>
      </header>

      <Section title="插件包">
        {!packages
          ? <Empty>正在读取工作区…</Empty>
          : packages.length
            ? (
                <ul className="cc-packages">
                  {packages.map((pkg) => {
                    const plugin = plugins.find(plugin => plugin.name === pkg.name)
                    return (
                      <li key={pkg.name} className="cc-package" data-compat={pkg.compat?.result.status}>
                        <div>
                          <code className="cc-package-name">{pkg.name}</code>
                          {pkg.version && <Tag>{pkg.version}</Tag>}
                          {' '}
                          <CompatTags compat={pkg.compat} />
                          <p className="cc-muted">{pkg.description} · <code>{pkg.path}</code></p>
                          <CompatReasons compat={pkg.compat} />
                        </div>
                        {plugin
                          ? <Link to={`/plugins?id=${plugin.id}`} className="cc-button">{plugin.disabled ? '已停用' : '已启用'} · 查看</Link>
                          : <button type="button" className="cc-button cc-button-primary" disabled={enable.pending} onClick={() => enable.run(pkg.name)}>添加到 cormi.yml</button>}
                      </li>
                    )
                  })}
                </ul>
              )
            : <Empty>plugins/ 下还没有插件包。在下面新建一个，或运行 <code>cormi g plugin &lt;name&gt;</code>。</Empty>}
        {enable.error && <p className="cc-row-error">{enable.error}</p>}
      </Section>

      <Section title="新建插件">
        <CreatePlugin />
      </Section>
    </div>
  )
}

function CreatePlugin() {
  const [name, setName] = useState('')
  const [client, setClient] = useState(true)
  const [withConsole, setConsole] = useState(false)
  const [enable, setEnable] = useState(true)
  const create = useAction((console, options: object) => console.call<string>('workspace/create', options))

  return (
    <form className="cc-create" onSubmit={async (event) => {
      event.preventDefault()
      const created = await create.run({ name: name.trim(), client, console: withConsole, enable })
      if (created) setName('')
    }}>
      <label className="cc-field">
        <span>名称</span>
        <input className="cc-input" value={name} placeholder="hello → cormi-plugin-hello" onChange={event => setName(event.target.value)} />
      </label>
      <label className="cc-check"><input type="checkbox" checked={client} onChange={event => setClient(event.target.checked)} /> 浏览器端（client/index.tsx）</label>
      <label className="cc-check"><input type="checkbox" checked={withConsole} onChange={event => setConsole(event.target.checked)} /> 控制台页面（console/index.tsx）</label>
      <label className="cc-check"><input type="checkbox" checked={enable} onChange={event => setEnable(event.target.checked)} /> 创建后添加到 cormi.yml</label>
      <div className="cc-form-foot">
        <button type="submit" className="cc-button cc-button-primary" disabled={!name.trim() || create.pending}>新建</button>
        {create.error && <span className="cc-row-error">{create.error}</span>}
        {create.done && create.result && <span className="cc-saved" role="status">已创建 {create.result}</span>}
      </div>
    </form>
  )
}
