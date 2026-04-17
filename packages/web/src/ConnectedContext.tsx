import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api.ts'

interface ConnectedCtx {
  isConnected: boolean
}

const ConnectedContext = createContext<ConnectedCtx | null>(null)

const CHECK_INTERVAL_MS = 5000

export function ConnectedProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)
      try {
        await api.healthCheck({ signal: controller.signal, cache: 'no-store' })
        if (mounted) setIsConnected(true)
      } catch {
        if (mounted) setIsConnected(false)
      } finally {
        clearTimeout(timeoutId)
      }
    }

    // Health loop paused for now
    // check()
    // const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      mounted = false
      // clearInterval(id)
    }
  }, [])

  return (
    <ConnectedContext.Provider value={{ isConnected }}>
      {children}
    </ConnectedContext.Provider>
  )
}

export function useConnected() {
  const ctx = useContext(ConnectedContext)
  if (!ctx) throw new Error('useConnected must be used within ConnectedProvider')
  return ctx
}
