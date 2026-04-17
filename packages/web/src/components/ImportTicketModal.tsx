import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api.ts'

export interface ImportTicketResult {
  id: string
  title: string
  description: string
  url: string
}

export default function ImportTicketModal({
  integrationId,
  integrationName,
  onClose,
  onSelect,
}: {
  integrationId: string
  integrationName: string
  onClose: () => void
  onSelect: (result: ImportTicketResult) => void
}) {
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['integrationSearch', integrationId, q],
    queryFn: () => api.searchIntegrationTickets(integrationId, q || undefined),
    enabled: !!integrationId,
  })

  const results = data?.results ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Import from {integrationName}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">
            ×
          </button>
        </div>
        <div className="p-4 border-b">
          <input
            type="text"
            className="border px-3 py-2 rounded w-full bg-white text-gray-900"
            placeholder="Search tickets..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {isLoading && <div className="text-sm text-gray-500 text-center py-4">Loading...</div>}
          {!isLoading && results.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-4">No tickets found.</div>
          )}
          <div className="space-y-2">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r)}
                className="w-full text-left border rounded-lg p-3 hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
              >
                <div className="font-medium text-gray-900">{r.title}</div>
                <div className="text-sm text-gray-500 line-clamp-2">{r.description}</div>
                <div className="text-xs text-indigo-600 mt-1 truncate">{r.url}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
