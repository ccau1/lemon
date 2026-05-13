import type { ReactNode } from 'react'

export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="relative flex items-center justify-center group">
      {children}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs text-white bg-gray-800 rounded shadow whitespace-nowrap z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
        {label}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800" />
      </div>
    </div>
  )
}
