import { useState } from 'react'
import styled from 'styled-components'

// the theme comes from cormi.yml
const Button = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  color: white;
  background: ${props => props.theme.primary};
  cursor: pointer;
`

export default function HomePage() {
  const [count, setCount] = useState(0)
  return (
    <div className="mx-auto max-w-2xl p-10 font-sans">
      <h1 id="title" className="text-3xl font-bold text-blue-600">styled-components + UnoCSS</h1>
      <p className="text-gray-500">Server-rendered: both kinds of styles are in the document before it hydrates.</p>
      <Button id="styled" onClick={() => setCount(count => count + 1)}>clicked {count}</Button>
    </div>
  )
}
