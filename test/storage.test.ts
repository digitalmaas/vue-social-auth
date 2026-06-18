import { beforeEach, describe, expect, it } from 'vitest'
import { createStorage } from '../src/storage'

describe('createStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('defaults to sessionStorage and namespaces keys', () => {
    const storage = createStorage(undefined, 'ns')
    storage.setItem('foo', 'bar')
    expect(window.sessionStorage.getItem('ns.foo')).toBe('bar')
    expect(storage.getItem('foo')).toBe('bar')
    storage.removeItem('foo')
    expect(storage.getItem('foo')).toBeNull()
  })

  it('skips the prefix when namespace is empty', () => {
    const storage = createStorage(undefined, '')
    storage.setItem('foo', 'bar')
    expect(window.sessionStorage.getItem('foo')).toBe('bar')
  })

  it('returns the custom adapter unchanged', () => {
    const calls: string[] = []
    const adapter = {
      getItem: (k: string) => {
        calls.push(`get:${k}`)
        return null
      },
      setItem: (k: string) => calls.push(`set:${k}`),
      removeItem: (k: string) => calls.push(`del:${k}`),
    }
    const storage = createStorage(adapter)
    storage.setItem('a', 'b')
    storage.getItem('a')
    storage.removeItem('a')
    expect(calls).toEqual(['set:a', 'get:a', 'del:a'])
  })
})
