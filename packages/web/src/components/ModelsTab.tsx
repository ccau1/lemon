import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.ts'
import { useEffect, useState } from 'react'
import type { ModelConfig } from '@lemon/shared'
import { providers, isCliProvider } from '@lemon/shared'
import type { ProviderId } from '@lemon/shared'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function getProviderLabel(id: ProviderId): string {
  const p = providers.find((p) => p.id === id)
  return p?.name ?? id
}

function getDefaultProviderId(): ProviderId {
  return providers[0]?.id ?? 'openai'
}

function generateUniqueName(base: string, existing: ModelConfig[]) {
  const names = new Set(existing.map((m) => m.name))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

function deriveModelId(name: string, existing: ModelConfig[], editingId?: string) {
  let base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!base) base = 'model'
  const ids = new Set(existing.filter((m) => m.id !== editingId).map((m) => m.modelId))
  if (!ids.has(base)) return base
  let i = 2
  while (ids.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

function SortableModelItem({
  model,
  onEdit,
  onDelete,
}: {
  model: ModelConfig
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: model.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : ('auto' as const),
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="bg-white p-4 rounded shadow flex items-center justify-between gap-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
        aria-label="Drag to reorder"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 8h16M4 16h16"
          />
        </svg>
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{model.name}</div>
        <div className="text-sm text-gray-500 truncate">
          {getProviderLabel(model.provider as ProviderId)} / {model.modelId}
        </div>
        {model.baseUrl && (
          <div className="text-xs text-gray-400 truncate">{model.baseUrl}</div>
        )}
        {model.temperature !== undefined && (
          <div className="text-xs text-gray-400">temp: {model.temperature}</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          className="text-indigo-600 hover:text-indigo-700 p-1"
          onClick={onEdit}
          aria-label="Edit"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>
        <button
          className="text-red-600 hover:text-red-700 p-1"
          onClick={onDelete}
          aria-label="Delete"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </li>
  )
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode
  onClose: () => void
  title: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function ModelWizard({
  existingModels,
  editingModel,
  onClose,
  onSave,
}: {
  existingModels: ModelConfig[]
  editingModel: ModelConfig | null
  onClose: () => void
  onSave: (body: Record<string, unknown>) => void
}) {
  const isEdit = !!editingModel
  const [step, setStep] = useState(isEdit ? 2 : 1)
  const [provider, setProvider] = useState<string>(editingModel?.provider || getDefaultProviderId())
  const [name, setName] = useState(editingModel?.name || '')
  const [baseUrl, setBaseUrl] = useState(editingModel?.baseUrl || '')
  const [apiKey, setApiKey] = useState(editingModel?.apiKey || '')
  const [temperature, setTemperature] = useState(
    editingModel?.temperature !== undefined ? String(editingModel.temperature) : ''
  )
  const [error, setError] = useState<string | null>(null)
  const [providerSearch, setProviderSearch] = useState('')

  useEffect(() => {
    const trimmedName = name.trim()
    if (trimmedName && existingModels.some((m) => m.name === trimmedName && m.id !== editingModel?.id)) {
      setError('Name already used')
    } else {
      setError(null)
    }
  }, [name, existingModels, editingModel])

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleSave = () => {
    if (error || !name.trim()) return
    const modelId = deriveModelId(name, existingModels, editingModel?.id)
    const body: Record<string, unknown> = {
      name: name.trim(),
      provider,
      modelId,
    }
    if (baseUrl.trim()) body.baseUrl = baseUrl.trim()
    if (apiKey.trim()) body.apiKey = apiKey.trim()
    if (temperature.trim()) body.temperature = Number(temperature.trim())
    onSave(body)
  }

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Model' : 'Add Model'}>
      <div className="space-y-6">
        {step === 1 && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Search providers..."
              value={providerSearch}
              onChange={(e) => setProviderSearch(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 rounded bg-white text-gray-900"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {providers
                .filter((p) =>
                  p.name.toLowerCase().includes(providerSearch.trim().toLowerCase()) ||
                  p.id.toLowerCase().includes(providerSearch.trim().toLowerCase())
                )
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setProvider(p.id)
                      setName(generateUniqueName(p.name, existingModels))
                      setStep(2)
                    }}
                    className="flex flex-col items-center justify-center gap-2 px-4 py-6 rounded border border-gray-200 hover:border-indigo-600 hover:bg-indigo-50 transition"
                  >
                    <img
                      src={p.icon}
                      alt={p.name}
                      className="w-8 h-8 object-contain"
                    />
                    <span className="text-sm font-medium">{p.name}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                className={`border px-3 py-2 rounded w-full bg-white text-gray-900 ${
                  error ? 'border-red-500' : 'border-gray-300'
                }`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {error && (
                <p className="text-red-500 text-xs mt-1">{error}</p>
              )}
            </div>
            {!isCliProvider(provider) && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    className="border px-3 py-2 rounded w-full border-gray-300 bg-white text-gray-900"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
                {provider === 'openai-compatible' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Base URL
                    </label>
                    <input
                      className="border px-3 py-2 rounded w-full border-gray-300 bg-white text-gray-900"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                )}
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature (optional)
              </label>
              <input
                type="number"
                step="0.1"
                className="border px-3 py-2 rounded w-full border-gray-300 bg-white text-gray-900"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <div>
            {step > 1 && !isEdit && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-2 py-1 rounded transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium">Providers</span>
              </button>
            )}
          </div>
          <div>
            {step === 2 && (
              <button
                onClick={handleSave}
                disabled={!!error || !name.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {isEdit ? 'Save Changes' : 'Add Model'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function ModelsTab() {
  const queryClient = useQueryClient()
  const { data: models } = useQuery({
    queryKey: ['models'],
    queryFn: api.getModels,
  })
  const [items, setItems] = useState<ModelConfig[]>([])
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null)

  useEffect(() => {
    if (models) setItems(models)
  }, [models])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  )

  const reorderMutation = useMutation({
    mutationFn: api.reorderModels,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
  })

  const create = useMutation({
    mutationFn: api.createModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
  })

  const update = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: Record<string, unknown>
    }) => api.updateModel(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
  })

  const remove = useMutation({
    mutationFn: api.deleteModel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setItems((current) => {
        const oldIndex = current.findIndex((i) => i.id === active.id)
        const newIndex = current.findIndex((i) => i.id === over.id)
        const next = arrayMove(current, oldIndex, newIndex)
        reorderMutation.mutate(next.map((i) => i.id))
        return next
      })
    }
  }

  const handleSave = (body: Record<string, unknown>) => {
    if (editingModel) {
      update.mutate({ id: editingModel.id, body })
    } else {
      create.mutate(body)
    }
    setIsWizardOpen(false)
    setEditingModel(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Models</h2>
        <button
          className="bg-indigo-600 text-white px-4 py-2 rounded"
          onClick={() => {
            setEditingModel(null)
            setIsWizardOpen(true)
          }}
        >
          Add Model
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {items.map((m) => (
              <SortableModelItem
                key={m.id}
                model={m}
                onEdit={() => {
                  setEditingModel(m)
                  setIsWizardOpen(true)
                }}
                onDelete={() => {
                  if (confirm(`Delete model "${m.name}"?`)) remove.mutate(m.id)
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {isWizardOpen && (
        <ModelWizard
          existingModels={models || []}
          editingModel={editingModel}
          onClose={() => {
            setIsWizardOpen(false)
            setEditingModel(null)
          }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
