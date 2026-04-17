import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import ImportTicketModal, { type ImportTicketResult } from './ImportTicketModal.tsx'

export default function IntegrationImportButtons({
  onImport,
}: {
  onImport: (result: { title: string; description: string }) => void
}) {
  const { data: integrations } = useQuery({ queryKey: ['integrations'], queryFn: api.getIntegrations })
  const [active, setActive] = useState<{ id: string; name: string } | null>(null)

  const importable = (integrations ?? []).filter((i: any) => i.enabled && i.ticketImport?.enabled)

  if (importable.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Import:</span>
        {importable.map((i: any) => (
          <button
            key={i.id}
            type="button"
            onClick={() => setActive({ id: i.id, name: i.name })}
            className="text-xs px-2.5 py-1.5 rounded border border-gray-300 text-gray-700 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
          >
            {i.name}
          </button>
        ))}
      </div>
      {active && (
        <ImportTicketModal
          integrationId={active.id}
          integrationName={active.name}
          onClose={() => setActive(null)}
          onSelect={(result: ImportTicketResult) => {
            onImport({ title: result.title, description: result.description })
            setActive(null)
          }}
        />
      )}
    </>
  )
}
