import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface ErrorItem {
  type: string
  message: string
  step?: string | null
  taskId?: string
}

export function ErrorIndicator({ errors, className = '' }: { errors: ErrorItem[]; className?: string }) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShow(true)
  }

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setShow(false), 150)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    })
  }, [])

  useEffect(() => {
    if (show) {
      updateCoords()
      window.addEventListener('scroll', updateCoords, true)
      window.addEventListener('resize', updateCoords)
      return () => {
        window.removeEventListener('scroll', updateCoords, true)
        window.removeEventListener('resize', updateCoords)
      }
    }
  }, [show, updateCoords])

  if (!errors || errors.length === 0) return null

  const tooltip = (
    <div
      className="fixed pointer-events-none"
      style={{ top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
    >
      <div className="relative bg-gray-900 text-white text-xs rounded px-3 py-2 shadow-lg min-w-[16rem] max-w-sm whitespace-pre-wrap">
        {errors.map((e, i) => (
          <div key={i} className={i > 0 ? 'mt-1 pt-1 border-t border-gray-700' : ''}>
            {e.message}
          </div>
        ))}
        <div className="absolute left-1/2 top-full -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
      </div>
    </div>
  )

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <svg
        className="w-4 h-4 text-red-600 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      {show && createPortal(tooltip, document.body)}
    </div>
  )
}
