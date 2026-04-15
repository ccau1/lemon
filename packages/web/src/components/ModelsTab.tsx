import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.ts'
import { useEffect, useState } from 'react'
import type { ModelConfig } from '@lemon/shared'
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

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  'openai-compatible': 'OpenAI Compatible',
  'claude-code-cli': 'Claude Code',
  'kimi-code-cli': 'Kimi Code',
  ollama: 'Ollama',
  qwen: 'Qwen',
  gemini: 'Gemini',
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
          {model.provider} / {model.modelId}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
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
  const [provider, setProvider] = useState<string>(editingModel?.provider || 'openai')
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
              className="w-full border border-gray-300 px-3 py-2 rounded"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(PROVIDER_LABELS)
                .filter(([id, label]) =>
                  label.toLowerCase().includes(providerSearch.trim().toLowerCase()) ||
                  id.toLowerCase().includes(providerSearch.trim().toLowerCase())
                )
                .map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setProvider(id)
                      setName(generateUniqueName(label, existingModels))
                      setStep(2)
                    }}
                    className="flex flex-col items-center justify-center gap-2 px-4 py-6 rounded border border-gray-200 hover:border-indigo-600 hover:bg-indigo-50 transition"
                  >
                {id === 'openai' && (
                  <svg className="w-8 h-8 text-gray-700" fill="currentColor" viewBox="0 0 24 24" role="img" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
                  </svg>
                )}
                {id === 'anthropic' && (
                  <svg className="w-8 h-8 text-gray-700" viewBox="0 0 92.2 65" fill="currentColor">
                    <path d="M66.5,0H52.4l25.7,65h14.1L66.5,0z M25.7,0L0,65h14.4l5.3-13.6h26.9L51.8,65h14.4L40.5,0C40.5,0,25.7,0,25.7,0z M24.3,39.3l8.8-22.8l8.8,22.8H24.3z" />
                  </svg>
                )}
                {id === 'openai-compatible' && (
                  <svg className="w-8 h-8 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {id === 'claude-code-cli' && (
                  <svg className="w-8 h-8 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c.6 0 1.1.4 1.2 1l.8 3.2c.1.4.5.7.9.6l3.3-.8c.6-.1 1.1.2 1.3.7l.3 1.1c.2.5-.1 1.1-.6 1.3l-3 1.3c-.4.2-.6.6-.4 1l1.3 3c.2.5 0 1.1-.5 1.3l-1 .5c-.5.2-1.1 0-1.3-.5l-1.3-3c-.2-.4-.6-.6-1-.4l-3 1.3c-.5.2-1.1-.1-1.3-.6l-.5-1c-.2-.5 0-1.1.5-1.3l3-1.3c.4-.2.6-.6.4-1l-1.3-3c-.2-.5 0-1.1.5-1.3l1-.5c.2-.1.4-.1.6-.1zM22.6 12c0 .6-.4 1.1-1 1.2l-3.2.8c-.4.1-.7.5-.6.9l.8 3.3c.1.6-.2 1.1-.7 1.3l-1.1.3c-.5.2-1.1-.1-1.3-.6l-1.3-3c-.2-.4-.6-.6-1-.4l-3 1.3c-.5.2-1.1 0-1.3-.5l-.5-1c-.2-.5 0-1.1.5-1.3l3-1.3c.4-.2.6-.6.4-1l-1.3-3c-.2-.5.1-1.1.6-1.3l1.1-.3c.5-.2 1.1.1 1.3.6l1.3 3c.2.4.6.6 1 .4l3-1.3c.5-.2 1.1 0 1.3.5l.5 1c0 .1.1.3.1.4zM1.4 12c0-.6.4-1.1 1-1.2l3.2-.8c.4-.1.7-.5.6-.9l-.8-3.3c-.1-.6.2-1.1.7-1.3l1.1-.3c.5-.2 1.1.1 1.3.6l1.3 3c.2.4.6.6 1 .4l3-1.3c.5-.2 1.1 0 1.3-.5l.5-1c.2-.5 0-1.1-.5-1.3l-3-1.3c-.4-.2-.6-.6-.4-1l1.3-3c.2-.5-.1-1.1-.6-1.3l-1.1-.3c-.5-.2-1.1.1-1.3-.6l-1.3 3c-.2-.4-.6-.6-1-.4l-3 1.3c-.5.2-1.1 0-1.3-.5l-.5-1c0-.1-.1-.3-.1-.4z" />
                  </svg>
                )}
                {id === 'kimi-code-cli' && (
                  <svg className="w-8 h-8 text-gray-700" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21.846 0a1.923 1.923 0 1 1 0 3.846H20.15a.226.226 0 0 1-.227-.226V1.923C19.923.861 20.784 0 21.846 0z" fill="currentColor" />
                    <path d="M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 0 0-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 0 1 .205-.023l6.484 4.772a7.677 7.677 0 0 0 3.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 0 1-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z" fill="currentColor" />
                  </svg>
                )}
                {id === 'ollama' && (
                  <svg className="w-8 h-8 text-gray-700" fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                    <path fillRule="evenodd" clipRule="evenodd" d="M168.64 23.253c4.608 1.814 8.768 4.8 12.544 8.747 6.293 6.528 11.605 15.872 15.659 26.944 4.074 11.136 6.72 23.467 7.722 35.84a107.824 107.824 0 0143.712-13.568l1.088-.085c18.56-1.494 36.907 1.856 52.907 10.112a103.091 103.091 0 016.336 3.626c1.067-12.138 3.669-24.192 7.68-35.072 4.053-11.093 9.365-20.416 15.637-26.965a35.628 35.628 0 0112.566-8.747c5.482-2.133 11.306-2.517 16.981-.896 8.555 2.432 15.893 7.851 21.675 15.723 5.29 7.19 9.258 16.405 11.968 27.456 4.906 19.925 5.76 46.144 2.453 77.76l1.131.853.554.406c16.15 12.288 27.392 29.802 33.344 50.133 9.28 31.723 4.608 67.307-11.392 87.211l-.384.448.043.064c8.896 16.256 14.293 33.429 15.445 51.2l.043.64c1.365 22.72-4.267 45.589-17.365 68.053l-.15.213.214.512c10.069 24.683 13.226 49.536 9.344 74.368l-.128.832a13.888 13.888 0 01-15.936 11.435 13.83 13.83 0 01-11.31-10.43 13.828 13.828 0 01-.21-5.399c3.562-22.038.213-44.139-10.24-66.624a13.713 13.713 0 01.853-13.163l.085-.128c12.886-19.712 18.219-39.04 17.067-58.027-.981-16.618-6.933-32.938-17.067-48.49a13.737 13.737 0 013.84-18.902l.192-.128c5.184-3.392 9.963-12.053 12.374-23.893a90.218 90.218 0 00-2.027-42.112c-4.373-14.933-12.373-27.392-23.573-35.904-12.694-9.685-29.504-14.357-50.774-13.013a13.93 13.93 0 01-13.482-7.915c-6.699-14.187-16.47-24.341-28.651-30.635a70.145 70.145 0 00-37.803-7.082c-26.56 2.112-49.984 17.088-56.96 35.968a13.91 13.91 0 01-13.013 9.066c-22.763.043-40.384 5.376-53.269 14.998-11.136 8.32-18.731 19.946-22.742 33.877a86.824 86.824 0 00-1.45 40.235c2.389 11.904 7.061 21.76 12.416 27.072l.17.149c4.523 4.416 5.483 11.307 2.326 16.747-7.68 13.269-13.419 33.045-14.358 52.053-1.066 21.717 3.968 40.576 15.339 54.101l.341.406a13.711 13.711 0 012.027 14.72c-12.288 26.368-16.064 48.042-11.989 65.109a13.91 13.91 0 01-27.072 6.357c-5.184-21.717-1.664-46.592 10.09-74.624l.299-.746-.17-.256a92.574 92.574 0 01-12.758-27.926l-.107-.405a122.965 122.965 0 01-3.776-38.08c.939-19.413 5.931-39.733 14.443-56.32 8.576-16.725 20.779-30.144 36.288-39.936 15.36-9.706 33.536-14.869 54.059-15.36 14.123-.32 27.648 2.176 40.363 7.445 12.928 5.354 24.448 13.525 34.389 24.448 10.005 10.944 17.707 24.277 22.997 39.851 5.717 16.853 8.171 35.499 7.339 55.381-.725 17.557-4.587 34.517-11.52 50.858-6.763 15.979-16.213 30.251-28.331 42.667-11.947 12.245-26.027 21.995-42.155 29.184-15.872 7.061-33.131 11.2-50.731 12.288-17.493 1.088-34.965-.832-51.84-5.717-16.747-4.864-32.341-12.949-46.464-24.064-14.037-11.072-25.856-24.96-35.115-41.301-9.237-16.32-15.595-34.752-18.901-54.826-3.307-20.096-2.965-40.725 1.024-60.843 3.968-20.011 11.456-38.549 22.251-55.147 10.795-16.619 24.491-30.72 40.725-41.941 16.277-11.243 35.029-18.987 55.808-23.04 20.779-4.032 42.667-4.245 64.107-.64 21.504 3.627 41.813 11.179 60.267 22.507 18.411 11.307 34.197 26.219 46.955 44.48 12.757 18.283 21.739 39.68 26.731 63.723 4.971 23.957 5.931 49.195 2.859 74.987l1.131.853.554.406c16.15 12.288 27.392 29.802 33.344 50.133 9.28 31.723 4.608 67.307-11.392 87.211l-.384.448.043.064c8.896 16.256 14.293 33.429 15.445 51.2l.043.64c1.365 22.72-4.267 45.589-17.365 68.053l-.15.213.214.512c10.069 24.683 13.226 49.536 9.344 74.368l-.128.832a13.888 13.888 0 01-15.936 11.435 13.83 13.83 0 01-11.31-10.43 13.828 13.828 0 01-.21-5.399c3.562-22.038.213-44.139-10.24-66.624a13.713 13.713 0 01.853-13.163l.085-.128c12.886-19.712 18.219-39.04 17.067-58.027-.981-16.618-6.933-32.938-17.067-48.49a13.737 13.737 0 013.84-18.902l.192-.128c5.184-3.392 9.963-12.053 12.374-23.893a90.218 90.218 0 00-2.027-42.112c-4.373-14.933-12.373-27.392-23.573-35.904-12.694-9.685-29.504-14.357-50.774-13.013a13.93 13.93 0 01-13.482-7.915c-6.699-14.187-16.47-24.341-28.651-30.635a70.145 70.145 0 00-37.803-7.082c-26.56 2.112-49.984 17.088-56.96 35.968a13.91 13.91 0 01-13.013 9.066c-22.763.043-40.384 5.376-53.269 14.998-11.136 8.32-18.731 19.946-22.742 33.877a86.824 86.824 0 00-1.45 40.235c2.389 11.904 7.061 21.76 12.416 27.072l.17.149c4.523 4.416 5.483 11.307 2.326 16.747-7.68 13.269-13.419 33.045-14.358 52.053-1.066 21.717 3.968 40.576 15.339 54.101l.341.406a13.711 13.711 0 012.027 14.72c-12.288 26.368-16.064 48.042-11.989 65.109a13.91 13.91 0 01-27.072 6.357c-5.184-21.717-1.664-46.592 10.09-74.624l.299-.746-.17-.256a92.574 92.574 0 01-12.758-27.926l-.107-.405a122.965 122.965 0 01-3.776-38.08c.939-19.413 5.931-39.733 14.443-56.32 8.576-16.725 20.779-30.144 36.288-39.936 15.36-9.706 33.536-14.869 54.059-15.36 14.123-.32 27.648 2.176 40.363 7.445 12.928 5.354 24.448 13.525 34.389 24.448 10.005 10.944 17.707 24.277 22.997 39.851 5.717 16.853 8.171 35.499 7.339 55.381-.725 17.557-4.587 34.517-11.52 50.858-6.763 15.979-16.213 30.251-28.331 42.667-11.947 12.245-26.027 21.995-42.155 29.184-15.872 7.061-33.131 11.2-50.731 12.288-17.493 1.088-34.965-.832-51.84-5.717-16.747-4.864-32.341-12.949-46.464-24.064-14.037-11.072-25.856-24.96-35.115-41.301-9.237-16.32-15.595-34.752-18.901-54.826-3.307-20.096-2.965-40.725 1.024-60.843 3.968-20.011 11.456-38.549 22.251-55.147 10.795-16.619 24.491-30.72 40.725-41.941 16.277-11.243 35.029-18.987 55.808-23.04 20.779-4.032 42.667-4.245 64.107-.64 21.504 3.627 41.813 11.179 60.267 22.507 18.411 11.307 34.197 26.219 46.955 44.48 12.757 18.283 21.739 39.68 26.731 63.723 4.971 23.957 5.931 49.195 2.859 74.987z" />
                  </svg>
                )}
                {id === 'qwen' && (
                  <svg className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                    <path d="M268.885 28.587a9886.443 9886.443 0 0125.046 44.266 3.833 3.833 0 003.349 1.942h118.443c3.712 0 6.869 2.346 9.514 6.976l31.019 54.826c4.053 7.19 5.12 10.198.512 17.856a1129.453 1129.453 0 00-16.213 27.734l-7.83 14.037c-2.261 4.181-4.757 5.973-.853 10.923l56.576 98.922c3.669 6.422 2.368 10.539-.917 16.427a2813.646 2813.646 0 01-28.48 49.92c-3.392 5.803-7.51 8-14.507 7.893a916.763 916.763 0 00-49.643.342 2.12 2.12 0 00-1.728 1.066 12257.343 12257.343 0 01-57.706 101.12c-3.606 6.251-8.107 7.744-15.467 7.766-21.269.064-42.709.085-64.363.042a11.45 11.45 0 01-9.92-5.781l-28.48-49.557a1.919 1.919 0 00-1.77-1.046H106.283c-6.08.64-11.798-.021-17.174-1.962l-34.197-59.094a11.58 11.58 0 01-.043-11.52l25.75-45.226a4.225 4.225 0 000-4.203 11754.482 11754.482 0 01-40-69.803l-16.854-29.76c-3.413-6.613-3.69-10.581 2.027-20.586 9.92-17.344 19.776-34.667 29.59-51.968 2.815-4.992 6.485-7.126 12.458-7.147 18.41-.078 36.821-.085 55.232-.021a2.651 2.651 0 002.283-1.344L185.216 27.2a10.412 10.412 0 019.003-5.248c11.178-.021 22.464 0 33.77-.128l21.696-.49c7.275-.065 15.446.682 19.2 7.253zm-73.216 8.597a1.281 1.281 0 00-1.109.64l-61.141 106.987a3.347 3.347 0 01-2.88 1.664H69.397c-1.194 0-1.493.533-.874 1.578l123.946 216.662c.534.896.278 1.322-.725 1.344l-59.627.32a4.647 4.647 0 00-4.266 2.474l-28.16 49.28c-.939 1.664-.448 2.518 1.45 2.518l121.942.17c.981 0 1.706.427 2.218 1.302l29.931 52.352c.981 1.728 1.963 1.749 2.965 0l106.795-186.88 16.704-29.483a1.169 1.169 0 011.024-.601 1.17 1.17 0 011.024.601l30.379 53.973a2.599 2.599 0 002.282 1.323l58.944-.427a.846.846 0 00.858-.853.877.877 0 00-.111-.427L414.229 203.2a2.31 2.31 0 010-2.411l6.251-10.816 23.893-42.176c.512-.874.256-1.322-.746-1.322h-247.36c-1.259 0-1.558-.555-.918-1.643l30.592-53.44a2.276 2.276 0 000-2.432L196.8 37.845a1.276 1.276 0 00-1.131-.661zm134.187 171.093c.981 0 1.237.427.725 1.28l-17.749 31.254-55.744 97.813a1.199 1.199 0 01-1.067.619 1.242 1.242 0 01-1.066-.619l-73.664-128.683c-.427-.725-.2-1.195.725-1.195h119.296zm-134.187 0c.981 0 1.237.427.725 1.28l-55.744 97.813a1.199 1.199 0 01-1.067.619 1.242 1.242 0 01-1.066-.619l-55.744-97.813c-.427-.725-.2-1.195.725-1.195h111.371zm67.093 0c.981 0 1.237.427.725 1.28l-55.744 97.813a1.199 1.199 0 01-1.067.619 1.242 1.242 0 01-1.066-.619l-55.744-97.813c-.427-.725-.2-1.195.725-1.195h111.371z" />
                    <defs>
                      <linearGradient id="qwen-gradient" x1="21.323" y1="21.33" x2="46955.3" y2="21.33" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#6336E7" stopOpacity=".84" />
                        <stop offset="1" stopColor="#6F69F7" stopOpacity=".84" />
                      </linearGradient>
                    </defs>
                  </svg>
                )}
                {id === 'gemini' && (
                  <svg className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 65">
                    <mask id="maskme" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="0" y="0" width="65" height="65">
                      <path d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" fill="#000" />
                      <path d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" fill="url(#prefix__paint0_linear_2001_67)" />
                    </mask>
                    <g mask="url(#maskme)">
                      <g filter="url(#prefix__filter0_f_2001_67)"><path d="M-5.859 50.734c7.498 2.663 16.116-2.33 19.249-11.152 3.133-8.821-.406-18.131-7.904-20.794-7.498-2.663-16.116 2.33-19.25 11.151-3.132 8.822.407 18.132 7.905 20.795z" fill="#FFE432" /></g>
                      <g filter="url(#prefix__filter1_f_2001_67)"><path d="M27.433 21.649c10.3 0 18.651-8.535 18.651-19.062 0-10.528-8.35-19.062-18.651-19.062S8.78-7.94 8.78 2.587c0 10.527 8.35 19.062 18.652 19.062z" fill="#FC413D" /></g>
                      <g filter="url(#prefix__filter2_f_2001_67)"><path d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z" fill="#00B95C" /></g>
                      <g filter="url(#prefix__filter3_f_2001_67)"><path d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z" fill="#00B95C" /></g>
                      <g filter="url(#prefix__filter4_f_2001_67)"><path d="M30.954 74.181c9.014-5.485 11.427-17.976 5.389-27.9-6.038-9.925-18.241-13.524-27.256-8.04-9.015 5.486-11.428 17.977-5.39 27.902 6.04 9.924 18.242 13.523 27.257 8.038z" fill="#00B95C" /></g>
                      <g filter="url(#prefix__filter5_f_2001_67)"><path d="M67.391 42.993c10.132 0 18.346-7.91 18.346-17.666 0-9.757-8.214-17.667-18.346-17.667s-18.346 7.91-18.346 17.667c0 9.757 8.214 17.666 18.346 17.666z" fill="#3186FF" /></g>
                      <g filter="url(#prefix__filter6_f_2001_67)"><path d="M-13.065 40.944c9.33 7.094 22.959 4.869 30.442-4.972 7.483-9.84 5.987-23.569-3.343-30.663C4.704-1.786-8.924.439-16.408 10.28c-7.483 9.84-5.986 23.57 3.343 30.664z" fill="#FBBC04" /></g>
                      <g filter="url(#prefix__filter7_f_2001_67)"><path d="M34.74 51.43c11.135 7.656 25.896 5.524 32.968-4.764 7.073-10.287 3.779-24.832-7.357-32.488C49.215 6.52 34.455 8.654 27.382 18.94c-7.072 10.288-3.779 24.833 7.357 32.49z" fill="#3186FF" /></g>
                      <g filter="url(#prefix__filter8_f_2001_67)"><path d="M54.984-2.336c2.833 3.852-.808 11.34-8.131 16.727-7.324 5.387-15.557 6.631-18.39 2.78-2.833-3.853.807-11.342 8.13-16.728 7.324-5.387 15.558-6.631 18.39-2.78z" fill="#749BFF" /></g>
                      <g filter="url(#prefix__filter9_f_2001_67)"><path d="M31.727 16.104C43.053 5.598 46.94-8.626 40.41-15.666c-6.53-7.04-21.006-4.232-32.332 6.274s-15.214 24.73-8.683 31.77c6.53 7.04 21.006 4.232 32.332-6.274z" fill="#FC413D" /></g>
                      <g filter="url(#prefix__filter10_f_2001_67)"><path d="M8.51 53.838c6.732 4.818 14.46 5.55 17.262 1.636 2.802-3.915-.384-10.994-7.116-15.812-6.731-4.818-14.46-5.55-17.261-1.636-2.802 3.915.383 10.994 7.115 15.812z" fill="#FFEE48" /></g>
                    </g>
                    <defs>
                      <filter id="prefix__filter0_f_2001_67" x="-19.824" y="13.152" width="39.274" height="43.217" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="2.46" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter1_f_2001_67" x="-15.001" y="-40.257" width="84.868" height="85.688" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="11.891" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter2_f_2001_67" x="-20.776" y="11.927" width="79.454" height="90.916" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter3_f_2001_67" x="-20.776" y="11.927" width="79.454" height="90.916" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter4_f_2001_67" x="-19.845" y="15.459" width="79.731" height="81.505" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter5_f_2001_67" x="29.832" y="-11.552" width="75.117" height="73.758" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="9.606" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter6_f_2001_67" x="-38.583" y="-16.253" width="78.135" height="78.758" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="8.706" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter7_f_2001_67" x="8.107" y="-5.966" width="78.877" height="77.539" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="7.775" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter8_f_2001_67" x="13.587" y="-18.488" width="56.272" height="51.81" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="6.957" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter9_f_2001_67" x="-15.526" y="-31.297" width="70.856" height="69.306" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="5.876" result="effect1_foregroundBlur_2001_67" /></filter>
                      <filter id="prefix__filter10_f_2001_67" x="-14.168" y="20.964" width="55.501" height="51.571" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="7.273" result="effect1_foregroundBlur_2001_67" /></filter>
                      <linearGradient id="prefix__paint0_linear_2001_67" x1="18.447" y1="43.42" x2="52.153" y2="15.004" gradientUnits="userSpaceOnUse"><stop stopColor="#4893FC" /><stop offset=".27" stopColor="#4893FC" /><stop offset=".777" stopColor="#969DFF" /><stop offset="1" stopColor="#BD99FE" /></linearGradient>
                    </defs>
                  </svg>
                )}
                <span className="text-sm font-medium">{label}</span>
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
                className={`border px-3 py-2 rounded w-full ${
                  error ? 'border-red-500' : 'border-gray-300'
                }`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {error && (
                <p className="text-red-500 text-xs mt-1">{error}</p>
              )}
            </div>
            {!provider.endsWith('-cli') && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    className="border px-3 py-2 rounded w-full border-gray-300"
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
                      className="border px-3 py-2 rounded w-full border-gray-300"
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
                className="border px-3 py-2 rounded w-full border-gray-300"
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
