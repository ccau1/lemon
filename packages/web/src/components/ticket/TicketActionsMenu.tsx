import { useRef, useEffect, useState } from 'react'

export function TicketActionsMenu({
  isArchived,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  isArchived: boolean
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border border-gray-300 text-gray-600 px-2 py-2 rounded text-sm hover:bg-gray-50"
        aria-label="More actions"
        title="More actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="6" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="18" r="2" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 bg-white border border-gray-300 rounded shadow-lg py-1">
          {isArchived ? (
            <>
              <button
                className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50"
                onClick={() => {
                  setOpen(false)
                  onUnarchive?.()
                }}
              >
                Unarchive
              </button>
              <button
                className="w-full text-left text-sm px-3 py-2 text-red-700 hover:bg-red-50"
                onClick={() => {
                  setOpen(false)
                  if (window.confirm('Permanently delete this ticket?')) {
                    onDelete?.()
                  }
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50"
                onClick={() => {
                  setOpen(false)
                  onArchive?.()
                }}
              >
                Archive
              </button>
              <button
                className="w-full text-left text-sm px-3 py-2 text-red-700 hover:bg-red-50"
                onClick={() => {
                  setOpen(false)
                  if (window.confirm('Permanently delete this ticket?')) {
                    onDelete?.()
                  }
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
