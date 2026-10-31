import { useState } from 'react'

export default function Greeting({ name }: { name: string }) {
  const [count, setCount] = useState(0)
  return (
    <div id="greeting" style={{ border: '2px dashed #0ea5e9', padding: 12, borderRadius: 8 }}>
      <p>Hello {name}, from the remote app.</p>
      <button id="remote-count" onClick={() => setCount(count => count + 1)}>clicked {count}</button>
    </div>
  )
}
