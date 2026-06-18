import { beforeEach, describe, expect, it } from 'vitest'
import { createStorage } from '../src/storage'

describe('createStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('namespaces keys in sessionStorage and round-trips values', () => {
    const storage = createStorage('session', 'ns')
    storage.setItem('foo', 'bar')
    expect(window.sessionStorage.getItem('ns.foo')).toBe('bar')
    expect(storage.getItem('foo')).toBe('bar')
    storage.removeItem('foo')
    expect(storage.getItem('foo')).toBeNull()
  })

  it('memory adapter is isolated per instance', () => {
    const a = createStorage('memory')
    const b = createStorage('memory')
    a.setItem('x', '1')
    expect(b.getItem('x')).toBeNull()
    expect(a.getItem('x')).toBe('1')
  })

  it('accepts a custom adapter', () => {
    const calls: string[] = []
    const adapter = createStorage({
      getItem: (k) => {
        calls.push(`get:${k}`)
        return null
      },
      setItem: (k) => calls.push(`set:${k}`),
      removeItem: (k) => calls.push(`del:${k}`),
    })
    adapter.setItem('a', 'b')
    adapter.getItem('a')
    adapter.removeItem('a')
    expect(calls).toEqual(['set:a', 'get:a', 'del:a'])
  })
})
