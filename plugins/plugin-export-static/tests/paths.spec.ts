import { describe, expect, it } from 'vitest'
import { getOutputFile, getStaticPaths } from '../src/index.ts'

describe('export-static', () => {
  it('collects the paths of routes without parameters', () => {
    expect(getStaticPaths({
      layout: { id: 'layout', path: '/', absPath: '/', isLayout: true },
      index: { id: 'index', path: '/', absPath: '/' },
      about: { id: 'about', path: 'about', absPath: '/about' },
      users: { id: 'users/index', path: 'users', absPath: '/users/' },
      user: { id: 'users/$id', path: 'users/:id', absPath: '/users/:id' },
      notFound: { id: '404', path: '*', absPath: '/*' },
    })).toEqual(['/', '/about', '/users'])
  })

  it('maps paths to files', () => {
    expect(getOutputFile('/', false)).toBe('index.html')
    expect(getOutputFile('/about', false)).toBe('about/index.html')
    expect(getOutputFile('/users/1/', true)).toBe('users/1.html')
  })
})
