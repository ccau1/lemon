import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.ts'
import { useState, useMemo } from 'react'
import type { IntegrationConfig, IntegrationField } from '@lemon/shared'

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function PillToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function IntegrationFormFields({
  fields,
  config,
  onChange,
}: {
  fields: IntegrationField[]
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}) {
  const update = (name: string, value: unknown) => {
    onChange({ ...config, [name]: value })
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.name} className="space-y-1.5">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {field.helpText && <p className="text-xs text-gray-500 mt-0.5">{field.helpText}</p>}
          </div>
          {field.type === 'textarea' ? (
            <textarea
              className="border px-3 py-2 rounded w-full h-24 font-mono text-sm bg-white text-gray-900"
              value={String(config[field.name] ?? '')}
              placeholder={field.placeholder}
              onChange={(e) => update(field.name, e.target.value)}
            />
          ) : field.type === 'select' ? (
            <select
              className="border px-3 py-2 rounded w-full bg-white text-gray-900"
              value={String(config[field.name] ?? '')}
              onChange={(e) => update(field.name, e.target.value)}
            >
              <option value="">— Select —</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : field.type === 'multi-select' ? (
            <div className="space-y-2">
              {field.options?.map((opt) => {
                const selected = Array.isArray(config[field.name]) ? (config[field.name] as string[]) : []
                return (
                  <label key={opt.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                      checked={selected.includes(opt.value)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...selected, opt.value]
                          : selected.filter((v) => v !== opt.value)
                        update(field.name, next)
                      }}
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                )
              })}
            </div>
          ) : field.type === 'checkbox' ? (
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              checked={Boolean(config[field.name] ?? false)}
              onChange={(e) => update(field.name, e.target.checked)}
            />
          ) : field.type === 'number' ? (
            <input
              type="number"
              className="border px-3 py-2 rounded w-full bg-white text-gray-900"
              value={String(config[field.name] ?? '')}
              placeholder={field.placeholder}
              onChange={(e) => update(field.name, e.target.value ? Number(e.target.value) : '')}
            />
          ) : (
            <input
              type={field.type === 'secret' ? 'password' : 'text'}
              className="border px-3 py-2 rounded w-full bg-white text-gray-900"
              value={String(config[field.name] ?? '')}
              placeholder={field.placeholder}
              onChange={(e) => update(field.name, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default function IntegrationsTab() {
  const queryClient = useQueryClient()
  const { data: integrations } = useQuery({ queryKey: ['integrations'], queryFn: api.getIntegrations })
  const { data: types } = useQuery({ queryKey: ['integrationTypes'], queryFn: api.getIntegrationTypes })

  const [showAddModal, setShowAddModal] = useState(false)
  const [editing, setEditing] = useState<
    | { mode: 'create'; typeId: string }
    | { mode: 'edit'; integration: IntegrationConfig }
    | null
  >(null)

  const createMutation = useMutation({
    mutationFn: api.createIntegration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setEditing(null)
      setShowAddModal(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateIntegration>[1] }) =>
      api.updateIntegration(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteIntegration,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  })

  const typeMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; description?: string; form: { fields: IntegrationField[] }; ticketCreate: any }>()
    for (const t of types ?? []) map.set(t.id, t)
    return map
  }, [types])

  const handleSave = (name: string, enabled: boolean, config: Record<string, unknown>) => {
    if (editing?.mode === 'create') {
      createMutation.mutate({ type: editing.typeId, name, enabled, config })
    } else if (editing?.mode === 'edit') {
      updateMutation.mutate({ id: editing.integration.id, body: { name, enabled, config } })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold mb-1">Integrations</h2>
          <p className="text-sm text-gray-500">Connect external tools to sync tickets and automate workflows.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add integration
        </button>
      </div>

      <div className="space-y-4">
        {(integrations ?? []).length === 0 && (
          <div className="text-sm text-gray-500 bg-gray-50 border rounded-lg p-6 text-center">
            No integrations configured yet.
          </div>
        )}
        {(integrations ?? []).map((integration: IntegrationConfig) => {
          const type = typeMap.get(integration.type)
          return (
            <div key={integration.id} className="bg-white border rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{integration.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {type?.name ?? integration.type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {type?.description ?? ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PillToggle
                    value={integration.enabled}
                    onChange={(checked) =>
                      updateMutation.mutate({ id: integration.id, body: { enabled: checked } })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setEditing({ mode: 'edit', integration })}
                    className="text-indigo-600 hover:text-indigo-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove integration "${integration.name}"?`)) {
                        deleteMutation.mutate(integration.id)
                      }
                    }}
                    className="text-red-500 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                    title="Remove integration"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} title="Add integration">
          <div className="grid grid-cols-2 gap-4">
            {(types ?? []).map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  setShowAddModal(false)
                  setEditing({ mode: 'create', typeId: type.id })
                }}
                className="text-left border rounded-xl p-4 hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
              >
                <div className="font-semibold text-gray-900">{type.name}</div>
                <div className="text-sm text-gray-500 mt-1">{type.description}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {editing && (
        <IntegrationEditModal
          editing={editing}
          typeMap={typeMap}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

function IntegrationEditModal({
  editing,
  typeMap,
  onClose,
  onSave,
  isSaving,
}: {
  editing: { mode: 'create'; typeId: string } | { mode: 'edit'; integration: IntegrationConfig }
  typeMap: Map<string, any>
  onClose: () => void
  onSave: (name: string, enabled: boolean, config: Record<string, unknown>) => void
  isSaving: boolean
}) {
  const isCreate = editing.mode === 'create'
  const type = typeMap.get(isCreate ? editing.typeId : editing.integration.type)
  const fields: IntegrationField[] = type?.form?.fields ?? []

  const [name, setName] = useState(isCreate ? '' : editing.integration.name)
  const [enabled, setEnabled] = useState(isCreate ? true : editing.integration.enabled)
  const [config, setConfig] = useState<Record<string, unknown>>(() => {
    if (isCreate) {
      const defaults: Record<string, unknown> = {}
      for (const f of fields) {
        if (f.type === 'checkbox') defaults[f.name] = false
        else if (f.type === 'number') defaults[f.name] = ''
        else if (f.type === 'multi-select') defaults[f.name] = []
        else defaults[f.name] = ''
      }
      return defaults
    }
    return { ...editing.integration.config }
  })

  const canSave = name.trim() && fields.every((f) => !f.required || String(config[f.name] ?? '').trim())

  return (
    <Modal onClose={onClose} title={isCreate ? `Add ${type?.name}` : `Edit ${type?.name}`}>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            className="border px-3 py-2 rounded w-full bg-white text-gray-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Jira connection"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Enabled</span>
          <PillToggle value={enabled} onChange={setEnabled} />
        </div>

        <IntegrationFormFields fields={fields} config={config} onChange={setConfig} />

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || isSaving}
            onClick={() => onSave(name.trim(), enabled, config)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
