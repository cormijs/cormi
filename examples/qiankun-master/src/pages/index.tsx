export default function MasterHome() {
  return (
    <div>
      <h1 id="master-title">qiankun master</h1>
      <p>
        <code>/app1/*</code> renders the micro app <code>app1</code>, configured in cormi.yml.
        It can also be rendered anywhere with <code>{'<MicroApp name="app1" />'}</code>.
      </p>
    </div>
  )
}
