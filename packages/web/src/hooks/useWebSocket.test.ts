import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

describe('useWebSocketListener singleton', () => {
  let sockets: any[] = []
  let MockWebSocket: any
  let useWebSocketListener: typeof import('./useWebSocket.ts').useWebSocketListener

  beforeEach(async () => {
    vi.resetModules()
    sockets = []
    MockWebSocket = vi.fn(function (this: any, url: string) {
      const listeners: Record<string, ((ev: any) => void)[]> = {}
      const self = this as any
      self.url = url
      self.readyState = 0 // CONNECTING
      self.send = vi.fn()
      self.close = vi.fn(() => {
        self.readyState = 3 // CLOSED
        self.onclose?.({} as CloseEvent)
        listeners['close']?.forEach((fn) => fn({} as CloseEvent))
      })
      self.addEventListener = vi.fn((type: string, fn: (ev: any) => void) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(fn)
      })
      self.removeEventListener = vi.fn()
      sockets.push(self)
      // Simulate async open
      setTimeout(() => {
        self.readyState = 1 // OPEN
        self.onopen?.({} as Event)
        listeners['open']?.forEach((fn) => fn({} as Event))
      }, 0)
      return self
    })
    MockWebSocket.CONNECTING = 0
    MockWebSocket.OPEN = 1
    MockWebSocket.CLOSING = 2
    MockWebSocket.CLOSED = 3

    vi.stubGlobal('WebSocket', MockWebSocket)
    const mod = await import('./useWebSocket.ts')
    useWebSocketListener = mod.useWebSocketListener
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllTimers()
  })

  it('creates one WebSocket shared across multiple hook mounts', async () => {
    renderHook(() => useWebSocketListener(vi.fn()))
    renderHook(() => useWebSocketListener(vi.fn()))
    await new Promise((r) => setTimeout(r, 10))
    expect(sockets).toHaveLength(1)
  })

  it('keeps the socket alive after unmount (singleton)', async () => {
    const { unmount } = renderHook(() => useWebSocketListener(vi.fn()))
    await new Promise((r) => setTimeout(r, 10))
    expect(sockets).toHaveLength(1)
    expect(sockets[0].readyState).toBe(1)

    unmount()
    await new Promise((r) => setTimeout(r, 10))
    // Singleton intentionally does not close on unmount
    expect(sockets[0].readyState).toBe(1)
  })

  it('reconnects after an unexpected close', async () => {
    vi.useFakeTimers()
    renderHook(() => useWebSocketListener(vi.fn()))

    await vi.advanceTimersByTimeAsync(10)
    expect(sockets).toHaveLength(1)

    // Simulate server closing the connection
    sockets[0].close()

    await vi.advanceTimersByTimeAsync(10)
    // Reconnect timer should fire after 1s
    await vi.advanceTimersByTimeAsync(2000)
    expect(sockets).toHaveLength(2)

    vi.useRealTimers()
  })

  it('does not create duplicates while a socket is still open', async () => {
    renderHook(() => useWebSocketListener(vi.fn()))
    await new Promise((r) => setTimeout(r, 10))
    expect(sockets).toHaveLength(1)

    // Force another mount while socket is already open
    renderHook(() => useWebSocketListener(vi.fn()))
    await new Promise((r) => setTimeout(r, 10))
    expect(sockets).toHaveLength(1)
  })
})
