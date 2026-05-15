import { createContext, useContext, useState, type ReactNode } from 'react'

interface ConnectedCtx {
  isConnected: boolean
}

const ConnectedContext = createContext<ConnectedCtx | null>(null)

export function ConnectedProvider({ children }: { children: ReactNode }) {
  const [isConnected] = useState(true)

  // Health loop paused for now

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
