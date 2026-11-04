import { describe, expect, it } from 'vitest'
import { getCookies, setCookie } from '../src/http.ts'

describe('cookies', () => {
  it('reads the cookies of a request', () => {
    const request = new Request('http://localhost/', { headers: { cookie: 'a=1; b="two%20words"; a=ignored; broken; c=%E4%BD%A0' } })
    expect(getCookies(request)).toEqual({ a: '1', b: 'two words', c: '你' })
    expect(getCookies(new Request('http://localhost/'))).toEqual({})
  })

  it('sets several cookies on a response', () => {
    const response = new Response(null)
    setCookie(response, 'sid', 'a b', { maxAge: 60.5, httpOnly: true, secure: true, sameSite: 'lax' })
    setCookie(response, 'theme', 'dark', { path: '/app', domain: 'example.com' })
    expect(response.headers.getSetCookie()).toEqual([
      'sid=a%20b; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax',
      'theme=dark; Path=/app; Domain=example.com',
    ])
  })
})
