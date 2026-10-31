import { useState } from 'react'

export default function Home() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <h1 id="title">Home page</h1>
      <button onClick={() => setCount(count => count + 1)}>clicked {count}</button>
    </div>
  )
}
