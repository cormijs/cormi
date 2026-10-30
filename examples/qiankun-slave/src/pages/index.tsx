import { useMasterProps } from '@cormi/plugin-qiankun/slave/client'
import { useState } from 'react'

export default function SlaveHome() {
  const props = useMasterProps<{ from?: string }>()
  const [count, setCount] = useState(0)
  return (
    <div>
      <h2 id="slave-title">Micro app home</h2>
      <p id="from">props from: {props.from ?? 'nobody'}</p>
      <button id="slave-count" onClick={() => setCount(count => count + 1)}>clicked {count}</button>
    </div>
  )
}
