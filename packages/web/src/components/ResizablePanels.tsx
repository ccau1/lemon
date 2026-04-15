import { useRef, useState, useEffect, type ReactNode } from 'react'

interface ResizablePanelsProps {
  left: ReactNode
  right: ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  maxLeftWidth?: number
  className?: string
}

export default function ResizablePanels({
  left,
  right,
  defaultLeftWidth = 280,
  minLeftWidth = 160,
  maxLeftWidth = 600,
  className = '',
}: ResizablePanelsProps) {
  const storageKey = 'resizable-panels-width'
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
    return saved ? parseInt(saved, 10) : defaultLeftWidth
  })
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - rect.left
      const clamped = Math.max(minLeftWidth, Math.min(maxLeftWidth, newWidth))
      setLeftWidth(clamped)
      localStorage.setItem(storageKey, String(clamped))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging, minLeftWidth, maxLeftWidth])

  return (
    <div ref={containerRef} className={`flex ${className}`}>
      <div style={{ width: leftWidth }} className="overflow-auto">
        {left}
      </div>
      <div
        className={`w-1 flex-shrink-0 bg-gray-200 hover:bg-indigo-300 ${isDragging ? 'bg-indigo-400' : ''}`}
        onMouseDown={() => setIsDragging(true)}
        style={{ cursor: 'col-resize' }}
      />
      <div className="flex-1 min-w-0 overflow-auto">
        {right}
      </div>
    </div>
  )
}
