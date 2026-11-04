import { useNavigate } from '@cormijs/react/client'
import { type FormEvent, useState } from 'react'

export default function Login() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = Object.fromEntries(new FormData(event.currentTarget))
    const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify(form) })
    if (!res.ok) return setError((await res.json()).error)
    // the loaders run again, with the new session
    navigate('/')
  }

  return (
    <form onSubmit={submit}>
      <input name="name" placeholder="Name (alice or bob)" required />
      <input name="password" type="password" placeholder="Password (cormi)" required />
      <button type="submit">Sign in</button>
      {error && <p id="error">{error}</p>}
    </form>
  )
}
