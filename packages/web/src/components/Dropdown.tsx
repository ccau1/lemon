import { useState, useEffect, useRef } from 'react'

// Single-select dropdown (replaces native <select> for consistent styling)
export function DropdownSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
}: {
  options: { value: string; label: string; disabled?: boolean }[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
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

  const selectedLabel = options.find((o) => o.value === value && !o.disabled)?.label || placeholder

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full border border-gray-300 px-3 py-2 rounded bg-white text-sm flex items-center justify-between gap-2 hover:bg-gray-50"
      >
        <span className="truncate">{selectedLabel}</span>
        <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full min-w-[160px] bg-white border border-gray-300 rounded shadow-lg py-1">
          <div className="max-h-60 overflow-y-auto">
            {options.map((opt) =>
              opt.disabled ? (
                <div
                  key={opt.value + opt.label}
                  className="w-full text-left text-xs px-3 py-1.5 text-gray-400 uppercase tracking-wider select-none"
                >
                  {opt.label}
                </div>
              ) : (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`w-full text-left text-sm px-3 py-2 hover:bg-gray-50 ${opt.value === value ? 'bg-indigo-50 text-indigo-700' : ''}`}
                >
                  {opt.label}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Multi-select dropdown filter with checkboxes
export function DropdownFilter({
  label,
  options,
  selected,
  onToggle,
  onAll,
  onNone,
  className = '',
}: {
  label: string
  options: { value: string; label: string }[]
  selected: Set<string>
  onToggle: (value: string) => void
  onAll: () => void
  onNone: () => void
  className?: string
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

  const countLabel = selected.size > 0 && selected.size < options.length ? ` (${selected.size})` : ''

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border border-gray-300 px-3 py-2 rounded bg-white text-sm flex items-center gap-2 hover:bg-gray-50"
      >
        <span>{label}{countLabel}</span>
        <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-56 bg-white border border-gray-300 rounded shadow-lg p-2">
          <div className="flex justify-between text-xs mb-2 px-1">
            <button className="text-indigo-600 hover:underline" onClick={onAll}>All</button>
            <button className="text-gray-500 hover:underline" onClick={onNone}>None</button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-sm px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={() => onToggle(opt.value)}
                />
                <span className="capitalize">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
